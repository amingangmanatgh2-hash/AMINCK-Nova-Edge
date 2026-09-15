// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — موتور قیمت‌گذاری هوشمند (USD) با سقف تخفیف ۳۰٪
//
//  تصمیم‌گیری «بر اساس دادهٔ واقعی» نه رندوم:
//   ۱) تقاضا: فروش ۷ روز اخیر در مقایسه با میانگین ۳۰ روز (سرد = تخفیف)
//   ۲) ساعت روز: ساعات مردهٔ ایران (۰۲:۰۰–۰۸:۰۰) تخفیف بیشتر، پیک شبانه کمتر
//   ۳) کشش قیمتی (elasticity): از تاریخچهٔ واقعی «تخفیف → نرخ تبدیل»
//      رگرسیون خطی ساده؛ فقط جایی تخفیف بالا می‌رود که پاسخ دیده‌ایم
//   ۴) رفتار کاربر: بازدید/سبد رها شده در ۴۸ ساعت → تخفیف شخصی
//   ۵) وفاداری: مجموع خرید قبلی کاربر
//   ۶) کف قیمت: هرگز زیر cost_floor_pct قیمت فهرست نمی‌رویم (ضد دامپینگ)
//  لایهٔ Workers AI فقط «پیشنهاد» می‌دهد؛ کد، پیشنهاد را اعتبارسنجی و
//  در همان سقف‌ها clamp می‌کند — یعنی AI هرگز نمی‌تواند قیمت را خراب کند.
// ═══════════════════════════════════════════════════════════════════
import { clamp } from './rng.js';

export const PRICING_CONFIG = {
  max_discount_pct: 30,
  quantize_pct: 1,
  cost_floor_pct: 60, // قیمت نهایی هرگز زیر ۶۰٪ فهرست نمی‌رود
  demand_window_days: 7,
  baseline_window_days: 30,
  cold_demand_ratio: 0.6, // فروش ۷ روز < ۶۰٪ انتظار → آیتم «سرد»
  hot_demand_ratio: 1.5, // فروش ۷ روز > ۱۵۰٪ انتظار → داغ (تخفیف صفر)
  max_demand_pct: 8,
  max_hour_pct: 7,
  max_elasticity_pct: 6,
  max_intent_pct: 12, // بازدید/سبد رها‌شده
  max_loyalty_pct: 5,
  iran_tz_offset_min: 210, // UTC+3:30
  dead_hours_local: [2, 8], // ۰۲:۰۰ تا ۰۸:۰۰ به وقت ایران
  peak_hours_local: [19, 23],
  intent_window_hours: 48,
  min_views_for_intent: 2,
};

export const hourLocal = (tsMs, tzOffsetMin = PRICING_CONFIG.iran_tz_offset_min) =>
  new Date(Number(tsMs) + tzOffsetMin * 60000).getUTCHours();

export function hourFactor(tsMs, cfg = PRICING_CONFIG) {
  const h = hourLocal(tsMs, cfg.iran_tz_offset_min);
  const [d0, d1] = cfg.dead_hours_local;
  const [p0, p1] = cfg.peak_hours_local;
  if (h >= d0 && h < d1) {
    // اوج ساعات مرده (۴–۶ صبح) بیشترین تخفیف
    const mid = (d0 + d1) / 2;
    const spread = (d1 - d0) / 2;
    return clamp(1 - Math.abs(h - mid) / Math.max(1, spread), 0.4, 1);
  }
  if (h >= p0 && h < p1) return 0; // پیک: تخفیف ساعتی نمی‌دهیم
  return 0.25; // ساعات عادی
}

/** آمار تقاضای یک آیتم از تاریخچهٔ سفارش‌ها */
export function demandStats(history = [], itemId, now = Date.now(), cfg = PRICING_CONFIG) {
  const day = 86400000;
  const rows = (history || []).filter((r) => String(r.item_id) === String(itemId) && r.status !== 'cancelled');
  const in7 = rows.filter((r) => now - Number(r.ts || 0) <= cfg.demand_window_days * day);
  const in30 = rows.filter((r) => now - Number(r.ts || 0) <= cfg.baseline_window_days * day);
  const rate7 = in7.length / cfg.demand_window_days;
  const rate30 = Math.max(in30.length, 0) / cfg.baseline_window_days;
  const expected = rate30 > 0 ? rate30 : 0.15; // اگر تاریخچه نیست، انتظار حداقلی
  const ratio = rate7 / expected;
  const revenue = in30.reduce((s, r) => s + (Number(r.amount_usd) || 0), 0);
  const views = (rows.view_count_total ?? rows.reduce((s, r) => s + (Number(r.views) || 0), 0));
  const conversions = in30.length;
  const convRate = views > 0 ? conversions / views : null;
  return {
    item_id: itemId,
    purchases_7d: in7.length,
    purchases_30d: in30.length,
    rate_7d: Math.round(rate7 * 1000) / 1000,
    rate_30d: Math.round(rate30 * 1000) / 1000,
    demand_ratio: Math.round(ratio * 1000) / 1000,
    cold: ratio < cfg.cold_demand_ratio,
    hot: ratio > cfg.hot_demand_ratio,
    revenue_30d: Math.round(revenue * 100) / 100,
    views: Number(views) || 0,
    conv_rate: convRate === null ? null : Math.round(convRate * 10000) / 10000,
  };
}

/**
 * کشش قیمتی: رگرسیون خطی سادهٔ «تخفیف٪ → نرخ تبدیل» روی سوابق واقعی
 * خروجی: slope (هر ۱٪ تخفیف چقدر تبدیل را بالا می‌برد) + n
 */
export function priceElasticity(history = [], itemId, cfg = PRICING_CONFIG) {
  const rows = (history || [])
    .filter((r) => String(r.item_id) === String(itemId) && Number(r.views) > 0)
    .map((r) => ({ x: Number(r.discount_pct) || 0, y: (Number(r.purchases) || 0) / Number(r.views) }));
  if (rows.length < 4) return { slope: 0, n: rows.length, confidence: 0 };
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.x, 0) / n;
  const my = rows.reduce((s, r) => s + r.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const r of rows) {
    num += (r.x - mx) * (r.y - my);
    den += (r.x - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  // ضریب تعیین ساده برای اطمینان
  const b0 = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (const r of rows) {
    const pred = b0 + slope * r.x;
    ssRes += (r.y - pred) ** 2;
    ssTot += (r.y - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope: Math.round(slope * 100000) / 100000, n, r2: Math.round(r2 * 100) / 100, confidence: Math.round(clamp(r2, 0, 1) * clamp(n / 12, 0, 1) * 100) / 100 };
}

/** رفتار کاربر روی این آیتم (بازدید، سبد رها شده) */
export function intentStats(behavior = [], itemId, userId, now = Date.now(), cfg = PRICING_CONFIG) {
  const since = now - cfg.intent_window_hours * 3600000;
  const rows = (behavior || []).filter((b) => String(b.user_id) === String(userId) && String(b.item_id) === String(itemId) && Number(b.ts) >= since);
  const views = rows.filter((b) => b.event === 'view').length;
  const carts = rows.filter((b) => b.event === 'cart').length;
  const abandons = rows.filter((b) => b.event === 'abandon').length;
  const bought = rows.filter((b) => b.event === 'purchase').length;
  return { views, carts, abandons, bought, interested: views >= cfg.min_views_for_intent && !bought };
}

export function loyaltyFactor(totalSpentUsd) {
  const s = Number(totalSpentUsd) || 0;
  if (s >= 60) return 1;
  if (s >= 30) return 0.8;
  if (s >= 15) return 0.6;
  if (s >= 5) return 0.35;
  return 0;
}

/**
 * محاسبهٔ تخفیف نهایی یک آیتم برای یک کاربر در یک لحظه
 * @returns {{pct:number, price_usd:number, list_price_usd:number, floor_hit:boolean, parts:object, reasons:string[]}}
 */
export function computeDiscount(o = {}) {
  const cfg = { ...PRICING_CONFIG, ...(o.config || {}) };
  const item = o.item || {};
  const list = Number(item.price_usd) || 0;
  const now = Number(o.now) || Date.now();
  const reasons = [];

  if (!list) return { pct: 0, price_usd: 0, list_price_usd: 0, floor_hit: false, parts: {}, reasons: ['no_price'] };
  if (item.no_discount) return { pct: 0, price_usd: list, list_price_usd: list, floor_hit: false, parts: {}, reasons: ['no_discount_flag'] };

  const stats = o.stats || demandStats(o.history || [], item.id, now, cfg);
  const parts = { demand: 0, hour: 0, elasticity: 0, intent: 0, loyalty: 0, promo: 0 };

  // ۱) تقاضا
  if (stats.hot) {
    parts.demand = 0;
    reasons.push(`تقاضا داغ (${stats.purchases_7d} فروش ۷ روز) → تخفیف تقاضا صفر`);
  } else if (stats.cold) {
    parts.demand = cfg.max_demand_pct;
    reasons.push(`تقاضا سرد (نسبت ${stats.demand_ratio}) → ${cfg.max_demand_pct}٪`);
  } else {
    const ratio = clamp((cfg.hot_demand_ratio - stats.demand_ratio) / (cfg.hot_demand_ratio - cfg.cold_demand_ratio), 0, 1);
    parts.demand = Math.round(cfg.max_demand_pct * ratio);
    if (parts.demand) reasons.push(`تقاضای میانه → ${parts.demand}٪`);
  }

  // ۲) ساعت روز
  const hf = hourFactor(now, cfg);
  parts.hour = Math.round(cfg.max_hour_pct * hf);
  if (parts.hour) reasons.push(`ساعت ${hourLocal(now, cfg.iran_tz_offset_min)} به وقت ایران → ${parts.hour}٪`);

  // ۳) کشش قیمتی (فقط وقتی دادهٔ کافی و مثبت داریم)
  const el = o.elasticity || priceElasticity(o.history || [], item.id, cfg);
  if (el.slope > 0 && el.confidence >= 0.35) {
    const normalized = clamp(el.slope * 400, 0, 1); // شیب ۰.۰۰۲۵ ≈ پاسخ کامل
    parts.elasticity = Math.round(cfg.max_elasticity_pct * normalized * el.confidence);
    if (parts.elasticity) reasons.push(`کشش قیمتی مثبت (شیب ${el.slope}, اطمینان ${el.confidence}) → ${parts.elasticity}٪`);
  } else {
    reasons.push('دادهٔ کشش کافی نیست → تخفیف کششی صفر');
  }

  // ۴) نیت کاربر
  const intent = o.intent || intentStats(o.behavior || [], item.id, o.userId, now, cfg);
  if (intent.interested) {
    const s = clamp((intent.views + intent.carts * 2 + intent.abandons * 3) / 8, 0, 1);
    parts.intent = Math.round(cfg.max_intent_pct * s);
    if (parts.intent) reasons.push(`کاربر ${intent.views} بازدید/${intent.abandons} سبد رها‌شده در ۴۸ ساعت → ${parts.intent}٪`);
  }

  // ۵) وفاداری
  const lf = loyaltyFactor(o.totalSpentUsd);
  parts.loyalty = Math.round(cfg.max_loyalty_pct * lf);
  if (parts.loyalty) reasons.push(`وفاداری (مجموع خرید ${Number(o.totalSpentUsd || 0).toFixed(2)}$) → ${parts.loyalty}٪`);

  // ۶) پروموی دستی ادمین / ایونت فصلی
  parts.promo = clamp(Number(o.promo_pct) || 0, 0, cfg.max_discount_pct);
  if (parts.promo) reasons.push(`پروموی فعال → ${parts.promo}٪`);

  let pct = parts.demand + parts.hour + parts.elasticity + parts.intent + parts.loyalty + parts.promo;
  pct = Math.min(cfg.max_discount_pct, pct);
  pct = Math.round(pct / cfg.quantize_pct) * cfg.quantize_pct;

  const floor = list * (cfg.cost_floor_pct / 100);
  let price = list * (1 - pct / 100);
  let floorHit = false;
  if (price < floor) {
    price = floor;
    floorHit = true;
    pct = Math.round(((list - price) / list) * 100);
    reasons.push(`کف قیمت (${cfg.cost_floor_pct}٪) اعمال شد`);
  }
  price = Math.round(price * 100) / 100;

  return { pct, price_usd: price, list_price_usd: list, floor_hit: floorHit, parts, reasons, stats, elasticity: el, intent };
}

/** خلاصهٔ داده برای پرامپت AI (بدون دادهٔ شخصی) */
export function aiPricingDigest(items = [], history = [], now = Date.now(), cfg = PRICING_CONFIG) {
  return {
    now_local_hour: hourLocal(now, cfg.iran_tz_offset_min),
    cap_pct: cfg.max_discount_pct,
    items: items.slice(0, 25).map((it) => {
      const s = demandStats(history, it.id, now, cfg);
      return { id: it.id, list_usd: it.price_usd, p7: s.purchases_7d, p30: s.purchases_30d, ratio: s.demand_ratio, conv: s.conv_rate, rev30: s.revenue_30d };
    }),
  };
}

export function aiPricingMessages(digest) {
  return [
    {
      role: 'system',
      content: [
        'تو موتور قیمت‌گذاری یک فروشگاه آیتم بازی هستی. خروجی فقط JSON:',
        '{"adjust":[{"id":"<شناسه آیتم>","delta_pct":<عدد بین -5 و 5>,"why":"<حداکثر ۱۰ کلمه>"}]}',
        'قانون‌ها: سقف کل تخفیف ۳۰٪ است. برای آیتم پرفروش delta منفی یا صفر بده. فقط بر اساس اعداد داده‌شده تصمیم بگیر، نه حدس.',
        'اگر دادهٔ یک آیتم کمتر از ۵ فروش در ۳۰ روز است، delta را صفر بگذار (دادهٔ کافی نیست).',
      ].join('\n'),
    },
    { role: 'user', content: `دادهٔ فروش:\n${JSON.stringify(digest)}` },
  ];
}

/** اعمال پیشنهاد AI با clamp سخت‌گیرانه — خروجی هرگز از سقف رد نمی‌شود */
export function applyAiAdvice(baseResult, advice, cfg = PRICING_CONFIG) {
  const reasons = (baseResult.reasons || []).slice();
  let delta = 0;
  const found = (advice?.adjust || []).find((a) => String(a.id) === String(baseResult.item_id));
  if (found) {
    delta = clamp(Number(found.delta_pct) || 0, -5, 5);
    if (delta) reasons.push(`پیشنهاد AI: ${delta > 0 ? '+' : ''}${delta}٪ (${String(found.why || '').slice(0, 60)})`);
  }
  let pct = clamp((baseResult.pct || 0) + delta, 0, cfg.max_discount_pct);
  pct = Math.round(pct / cfg.quantize_pct) * cfg.quantize_pct;
  const list = baseResult.list_price_usd || 0;
  const floor = list * (cfg.cost_floor_pct / 100);
  let price = list * (1 - pct / 100);
  if (price < floor) {
    price = floor;
    pct = Math.round(((list - price) / list) * 100);
  }
  return { ...baseResult, pct, price_usd: Math.round(price * 100) / 100, reasons, ai_delta: delta };
}

/** قیمت باندل (تخفیف ذاتی + هوشمند) */
export function bundlePrice(bundle, cfg = PRICING_CONFIG) {
  const compare = Number(bundle.compare_at_usd) || 0;
  const price = Number(bundle.price_usd) || compare;
  const inherent = compare > price ? Math.round(((compare - price) / compare) * 100) : 0;
  return { price_usd: price, compare_at_usd: compare, inherent_discount_pct: Math.min(inherent, cfg.max_discount_pct), save_usd: Math.round((compare - price) * 100) / 100 };
}
