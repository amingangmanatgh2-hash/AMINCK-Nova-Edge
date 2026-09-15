// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — کاتالوگ فروشگاه + قیمت‌گذاری هوشمند (USD)
//  محصول‌ها از shared/spec خوانده می‌شوند (یک منبع حقیقت با پلاگین‌ها).
//  ⚠️ محصولات فقط بعد از احراز هویت (OTP) برگردانده می‌شوند.
// ═══════════════════════════════════════════════════════════════════
import { listRanks, listCosmetics, listBundles, listGemPacks, economySpec, listModes } from '../../shared/engine/spec.js';
import { computeDiscount, demandStats, priceElasticity, intentStats, aiPricingDigest, aiPricingMessages, applyAiAdvice, PRICING_CONFIG } from '../../shared/engine/pricing.js';
import { mcGet, mcNum, mcBool, sha256Hex, ipKey } from './db.js';
import { getUsdRate } from '../pricing.js';
import { clamp } from '../util.js';

const now = () => Math.floor(Date.now() / 1000);

/** رویدادهای فصلی فعال (از پنل ادمین) */
export async function activeSeason(db) {
  if (!(await mcBool(db, 'season_active', false))) return null;
  const ends = await mcNum(db, 'season_ends', 0);
  if (ends && ends < now()) return null;
  return {
    id: await mcGet(db, 'season_id', 'season-1'),
    name: await mcGet(db, 'season_name', 'فصل ۱ — نبرد خدایان'),
    ends_at: ends,
    promo_pct: clamp(await mcNum(db, 'season_promo_pct', 10), 0, 30),
    promo_items: String(await mcGet(db, 'season_promo_items', '')).split(',').map((s) => s.trim()).filter(Boolean),
    rewards: JSON.parse((await mcGet(db, 'season_rewards', '[]')) || '[]'),
  };
}

/** نرخ دلار → تومان (واقعی از صرافی‌ها یا دستی از پنل) */
export async function usdRate(env) {
  const db = env.DB;
  const manual = await mcNum(db, 'usd_rate_manual', 0);
  if (manual > 1000) return { rate: Math.round(manual), source: 'manual' };
  try {
    const r = await getUsdRate(env);
    if (r && Number(r) > 1000) return { rate: Math.round(Number(r)), source: 'live' };
  } catch {}
  return { rate: 0, source: 'unavailable' };
}

/** تبدیل قیمت دلاری به تومان با نرخ واقعی؛ اگر نرخ نبود → خرید درگاه بسته */
export function toToman(priceUsd, rate) {
  if (!rate) return 0;
  return Math.max(1000, Math.round((Number(priceUsd) || 0) * Number(rate) / 100) * 100); // گرد به ۱۰۰ تومان
}

/** تاریخچهٔ سفارش‌ها برای موتور قیمت‌گذاری */
async function orderHistory(db, days = 35) {
  const rows = await db.prepare('SELECT item_id, status, amount_usd, discount_pct, created_at AS ts FROM mc_orders WHERE created_at>?').bind(now() - days * 86400).all();
  return rows.results || [];
}

async function behaviorRows(db, itemId) {
  const rows = await db.prepare('SELECT user_key, item_id, event, ts FROM mc_behavior WHERE item_id=? AND ts>?').bind(String(itemId), now() - 7 * 86400).all();
  return rows.results || [];
}

/** ثبت رویداد رفتار کاربر (برای قیمت‌گذاری هوشمند) */
export async function trackBehavior(db, { userKey, itemId, event, discountPct = 0, amountUsd = 0, ip = '' }) {
  if (!itemId || !event) return;
  const ik = await ipKey(ip);
  await db
    .prepare('INSERT INTO mc_behavior (user_key, item_id, event, discount_pct, amount_usd, ip_key, ts) VALUES (?,?,?,?,?,?,?)')
    .bind(String(userKey || '').slice(0, 64), String(itemId).slice(0, 48), String(event).slice(0, 16), Number(discountPct) || 0, Number(amountUsd) || 0, ik, now())
    .run();
  // نگهداری حجم کم
  if (event === 'view') await db.prepare('DELETE FROM mc_behavior WHERE ts<?').bind(now() - 30 * 86400).run();
}

/** پیشنهاد AI (با کش زمانی) — فقط وقتی ادمین روشن کرده باشد */
async function aiAdvice(env, db, items, history) {
  if (!(await mcBool(db, 'price_ai_enabled', false))) return null;
  if (!env.AI || typeof env.AI.run !== 'function') return null;
  const interval = clamp(await mcNum(db, 'price_ai_interval_min', 60), 5, 1440);
  const cached = await db.prepare("SELECT value FROM settings WHERE key='mc_price_ai_cache'").first();
  if (cached?.value) {
    try {
      const c = JSON.parse(cached.value);
      if (now() - Number(c.ts || 0) < interval * 60) return c.advice;
    } catch {}
  }
  try {
    const digest = aiPricingDigest(items, history, Date.now());
    const res = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: aiPricingMessages(digest), max_tokens: 700, temperature: 0.25 });
    const text = String(res?.response || res?.result?.response || '');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const advice = JSON.parse(m[0]);
    await db.prepare("INSERT INTO settings (key,value) VALUES ('mc_price_ai_cache',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({ ts: now(), advice })).run();
    return advice;
  } catch {
    return null;
  }
}

/** آیتم‌های خام کاتالوگ (بدون قیمت‌گذاری) */
export function rawCatalog(season) {
  const items = [];
  for (const r of listRanks()) {
    if (!r.purchasable) continue;
    items.push({
      id: `rank_${r.id}`,
      type: 'rank',
      title_fa: `رنک ${r.name_fa}`,
      title_en: `${r.name_en} Rank`,
      price_usd: r.price_usd,
      color: r.color,
      tag: r.tag,
      perks_fa: r.perks_fa,
      art: r.art?.icon ? `/mc/img/${r.art.icon}.jpg` : '',
      payload: { rank_id: r.id },
      featured: r.index >= 3,
      sort: r.index,
    });
  }
  for (const c of listCosmetics()) {
    items.push({
      id: `cos_${c.id}`,
      type: 'cosmetic',
      title_fa: c.name_fa,
      title_en: c.name_en,
      price_usd: c.price_usd,
      price_coins: c.price_coins,
      slot: c.slot,
      rank_min: c.rank_min,
      art: c.art ? `/mc/img/${c.art}.jpg` : '',
      payload: { cosmetic_id: c.id, slot: c.slot },
      sort: 50 + (c.price_usd || 0) * 10,
    });
  }
  for (const b of listBundles()) {
    items.push({
      id: `bundle_${b.id}`,
      type: 'bundle',
      title_fa: b.name_fa,
      title_en: b.name_en,
      price_usd: b.price_usd,
      compare_at_usd: b.compare_at_usd,
      items: b.items,
      art: b.art ? `/mc/img/${b.art}.jpg` : '',
      payload: { bundle_id: b.id, cosmetic_ids: b.items },
      featured: true,
      sort: 10,
    });
  }
  for (const g of listGemPacks()) {
    items.push({
      id: `gems_${g.id}`,
      type: 'gems',
      title_fa: `${g.gems.toLocaleString('en-US')} جم`,
      title_en: `${g.gems} Gems`,
      price_usd: g.price_usd,
      bonus_pct: g.bonus_pct || 0,
      art: '/mc/img/gems-pack.jpg',
      payload: { gems: g.gems, bonus_pct: g.bonus_pct || 0 },
      sort: 5,
    });
  }
  items.push({
    id: 'season_pass',
    type: 'season',
    title_fa: `بتل‌پس ${season?.name || 'فصل جاری'}`,
    title_en: 'Season Battle Pass',
    price_usd: Number(economySpec().battlepass_price_usd || 4.99),
    art: '/mc/img/season-pass.jpg',
    payload: { battlepass: 1, season_id: season?.id || '' },
    featured: !!season,
    sort: 8,
  });
  items.push({
    id: 'config_special',
    type: 'config',
    title_fa: 'کانفیگ ویژهٔ اتصال (نامحدود، پرسرعت)',
    title_en: 'Premium Connection Config',
    price_usd: 1.99,
    art: '/mc/img/config-special.jpg',
    payload: { config_tier: 'special', days: 30 },
    sort: 90,
  });
  if (season?.promo_pct) {
    for (const it of items) {
      if (!season.promo_items.length || season.promo_items.includes(it.id)) it.season_promo_pct = season.promo_pct;
    }
  }
  return items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
}

/**
 * ساخت کاتالوگ کامل با قیمت‌گذاری هوشمند
 * @param {object} o {env, db, userKey, userId, totalSpentUsd, ip, withPricing}
 */
export async function buildCatalog(o = {}) {
  const { env, db } = o;
  const season = await activeSeason(db);
  const items = rawCatalog(season);
  if (o.withPricing === false) {
    return { items: items.map((i) => ({ ...i, pct: 0, price_usd_final: i.price_usd })), season, rate: null, ai: null };
  }
  const history = await orderHistory(db);
  const cfg = { ...PRICING_CONFIG, max_discount_pct: clamp(await mcNum(db, 'price_max_discount', 30), 0, 30) };
  const behaviorCache = {};
  const priced = [];
  for (const it of items) {
    const stats = demandStats(history, it.id, Date.now(), cfg);
    if (!behaviorCache[it.id]) behaviorCache[it.id] = o.userKey ? await behaviorRows(db, it.id) : [];
    const intent = o.userKey ? intentStats(behaviorCache[it.id], it.id, o.userKey, Date.now(), cfg) : { interested: false };
    const elasticity = priceElasticity(history, it.id, cfg);
    let res = computeDiscount({
      item: { id: it.id, price_usd: it.price_usd, no_discount: it.type === 'config' && !(await mcBool(db, 'price_configs', true)) },
      stats,
      elasticity,
      intent,
      userId: o.userKey,
      totalSpentUsd: o.totalSpentUsd || 0,
      promo_pct: it.season_promo_pct || 0,
      config: cfg,
    });
    res = { ...res, item_id: it.id };
    priced.push({ ...it, stats: { p7: stats.purchases_7d, p30: stats.purchases_30d, cold: stats.cold, hot: stats.hot }, discount: res });
  }
  const advice = await aiAdvice(env, db, items, history);
  const final = priced.map((p) => {
    const base = p.discount;
    const d = advice ? applyAiAdvice({ ...base, item_id: p.id }, advice, cfg) : base;
    return { ...p, pct: d.pct, price_usd_final: d.price_usd, price_reasons: d.reasons, ai_delta: d.ai_delta || 0 };
  });
  const rate = await usdRate(env);
  for (const f of final) f.price_toman = toToman(f.price_usd_final, rate.rate);
  return { items: final, season, rate, ai: advice ? true : false, max_discount: cfg.max_discount_pct };
}

/** پیدا کردن یک آیتم با قیمت نهایی (برای ساخت سفارش) */
export async function findItem(env, db, itemId, o = {}) {
  const cat = await buildCatalog({ env, db, ...o });
  return cat.items.find((i) => i.id === String(itemId)) || null;
}

export function itemDto(i) {
  if (!i) return null;
  return {
    id: i.id,
    type: i.type,
    title_fa: i.title_fa,
    title_en: i.title_en,
    list_usd: i.price_usd,
    discount_pct: i.pct || 0,
    price_usd: i.price_usd_final ?? i.price_usd,
    price_coins: i.price_coins || 0,
    art: i.art || '',
    color: i.color,
    tag: i.tag,
    perks_fa: i.perks_fa || [],
    slot: i.slot,
    rank_min: i.rank_min,
    items: i.items,
    featured: !!i.featured,
    season_promo_pct: i.season_promo_pct || 0,
  };
}

/** آمار عمومی فروشگاه (بدون اطلاعات شخصی) برای داشبورد ادمین */
export async function shopStats(db) {
  const rows = await db.prepare('SELECT COUNT(*) c, SUM(CASE WHEN status=? THEN 1 ELSE 0 END) paid, ROUND(SUM(CASE WHEN status=? THEN amount_usd ELSE 0 END),2) revenue FROM mc_orders').bind('paid', 'paid').first();
  const byType = await db.prepare("SELECT item_type, COUNT(*) c, ROUND(SUM(amount_usd),2) usd FROM mc_orders WHERE status='paid' GROUP BY item_type ORDER BY usd DESC").all();
  const hours = await db.prepare("SELECT CAST((created_at+12600)/3600 % 24 AS INTEGER) h, COUNT(*) c FROM mc_orders WHERE status='paid' GROUP BY h ORDER BY c DESC LIMIT 6").all();
  return {
    orders: Number(rows?.c) || 0,
    paid: Number(rows?.paid) || 0,
    revenue_usd: Number(rows?.revenue) || 0,
    by_type: (byType.results || []).map((r) => ({ type: r.item_type, count: r.c, usd: r.usd })),
    hot_hours_local: (hours.results || []).map((r) => ({ hour: r.h, orders: r.c })),
  };
}
