// ═══════════════════════════════════════════════════════════════════
//  قیمت‌گذاری — نرخ لحظه‌ای تتر (USDT/TMN) + موتور قیمت پویا
//
//  بخش ۷ (رفع باگ نرخ دلار):
//   • منبع‌های قبلی حذف شدند: open.er-api.com فقط نرخ رسمی/دولتی IRR
//     می‌داد و api.frankfurter.dev اصلاً IRR ندارد (همیشه throw می‌کرد).
//   • نتیجهٔ آن باگ: fallback ثابت 100000 و قیمت‌های کاملاً غلط.
//   • منبع جدید: قیمت تتر USDT به ریال/تومان از صرافی‌های داخلی
//     (نوبیتکس، والکس، بیت‌پین، رمزینکس) با زنجیرهٔ fallback.
//   • چند منبع گرفته می‌شود و میانه (median) استفاده می‌شود — نه اولی.
//   • اگر نرخ جدید با کش قبلی بیش از ۲۰٪ فاصله داشته باشد هشدار ثبت می‌شود.
//   • اگر همهٔ منابع شکست بخورند: آخرین کش؛ اگر کش هم نبود، عدد جعلی
//     برنمی‌گردانیم بلکه rate=0 و پیام «نرخ آنلاین در دسترس نیست» می‌دهیم.
//
//  ⚠️ صادقانه: این endpointها از دیتاسنتر Cloudflare صدا زده می‌شوند و
//     ممکن است برخی صرافی‌های ایرانی درخواست از IP دیتاسنتر را بلاک کنند
//     (geo-block یا تحریم دسترسی دیتاسنترها). این لایه فقط بعد از دیپلوی
//     روی حساب واقعی Cloudflare و با دکمهٔ «🔄 بروزرسانی فوری» قابل تایید
//     نهایی است. راه جایگزین: تنظیم نرخ دستی از پنل.
// ═══════════════════════════════════════════════════════════════════
import { faDigits } from './db.js';
import { getSetting, setSetting } from './db.js';
import { getSettingValue, getNum } from './texts.js';

const RATE_KEY = 'cache:usd_rate';
const FRESH_SECONDS = 15 * 60; // کش تازه = ۱۵ دقیقه
const CACHE_TTL = 7 * 86400;   // کش برای fallback تا ۷ روز نگه داشته می‌شود
const OUTLIER_RATIO = 0.2;     // آستانهٔ هشدار انحراف نرخ
const MIN_RATE = 10000;        // نرخ زیر این مقدار (تومان) نامعتبر است

/** میانهٔ یک آرایه — مقاوم در برابر مقادیر پرت تک‌منبعی */
export function median(nums) {
  const a = (nums || []).filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

// ─── منابع قیمت تتر (هرکدام «تومان» برمی‌گردانند یا throw) ───
const RATE_SOURCES = [
  {
    name: 'nobitex',
    fetch: async () => {
      const r = await fetch('https://api.nobitex.ir/market/stats', { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const irr = Number(d?.stats?.['usdt-rls']?.latest);
      if (!irr) throw new Error('no rate');
      return Math.round(irr / 10);
    },
  },
  {
    name: 'wallex',
    fetch: async () => {
      const r = await fetch('https://api.wallex.ir/v1/markets', { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const irr = Number(d?.result?.symbols?.USDTIRT?.stats?.latestPrice);
      if (!irr) throw new Error('no rate');
      return Math.round(irr / 10);
    },
  },
  {
    name: 'bitpin',
    fetch: async () => {
      const r = await fetch('https://api.bitpin.ir/v2/market', { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d?.results || d?.data || []);
      const t = list.find((x) => String(x?.symbol || x?.s || '').toUpperCase() === 'USDTIRT');
      const irr = Number(t?.price ?? t?.last ?? t?.ticker?.price ?? 0);
      if (!irr) throw new Error('no rate');
      return Math.round(irr / 10);
    },
  },
  {
    name: 'ramzinex',
    fetch: async () => {
      const r = await fetch('https://publicapi.ramzinex.com/exchange/api/v1.0/exchange/prices', {
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      const p = d?.data?.usdtirr;
      const irr = Number(p?.buy || p?.sell || 0);
      if (!irr) throw new Error('no rate');
      return Math.round(irr / 10);
    },
  },
];

async function readCache(env) {
  try {
    return JSON.parse((await env.KV.get(RATE_KEY)) || 'null');
  } catch {
    return null;
  }
}

/**
 * نرخ کامل با جزئیات منبع/زمان.
 * @returns {Promise<{rate:number, source:string, ts:number, manual:boolean,
 *   cached:boolean, stale:boolean, unavailable:boolean, alert:boolean}>}
 */
export async function getRateInfo(env, force = false) {
  const manual = Number(await getSettingValue(env.DB, 'usd_rate_manual'));
  if (manual > 0) {
    return { rate: manual, source: 'manual', ts: 0, manual: true, cached: false, stale: false, unavailable: false, alert: false };
  }

  const cached = await readCache(env);
  if (!force && cached?.rate && Date.now() / 1000 - cached.ts < FRESH_SECONDS) {
    return {
      rate: cached.rate,
      source: cached.source || 'cache',
      ts: cached.ts,
      manual: false,
      cached: true,
      stale: false,
      unavailable: false,
      alert: false,
    };
  }

  // چند منبع به‌صورت موازی — میانه به‌جای «اولین موفق»
  const settled = await Promise.allSettled(RATE_SOURCES.map((s) => s.fetch()));
  const ok = [];
  let lastSource = '';
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled' && Number.isFinite(r.value) && r.value > MIN_RATE) {
      ok.push({ rate: Math.round(r.value), name: RATE_SOURCES[i].name });
    }
  }

  if (ok.length) {
    const rate = median(ok.map((o) => o.rate));
    const source = ok.map((o) => o.name).join(',');
    lastSource = source;
    const ts = Math.floor(Date.now() / 1000);
    // هشدار انحراف بزرگ نسبت به کش قبلی (فقط هشدار؛ نرخ میانه اعمال می‌شود)
    let alert = false;
    if (cached?.rate && Math.abs(rate - cached.rate) / cached.rate > OUTLIER_RATIO) {
      alert = true;
      await setSetting(env.DB, 'rate_alert', `نرخ جدید ${rate} با کش قبلی ${cached.rate} بیش از ۲۰٪ فاصله دارد (${source})`);
    }
    await env.KV.put(RATE_KEY, JSON.stringify({ rate, source, ts }), { expirationTtl: CACHE_TTL });
    return { rate, source, ts, manual: false, cached: false, stale: false, unavailable: false, alert };
  }

  // همهٔ منابع شکست خوردند → آخرین کش (حتی کهنه)؛ نه عدد جعلی
  if (cached?.rate) {
    return {
      rate: cached.rate,
      source: cached.source || 'cache',
      ts: cached.ts,
      manual: false,
      cached: true,
      stale: true,
      unavailable: false,
      alert: false,
    };
  }

  return { rate: 0, source: '', ts: 0, manual: false, cached: false, stale: false, unavailable: true, alert: false };
}

/** نرخ دلار/تتر به تومان — ۰ یعنی «در دسترس نیست» (نه عدد جعلی) */
export async function getUsdRate(env, force = false) {
  const info = await getRateInfo(env, force);
  return info.rate;
}

export const RATE_UNAVAILABLE_MESSAGE =
  '⚠️ نرخ آنلاین در دسترس نیست. لطفاً از پنل، نرخ دستی تنظیم کنید تا خریدها با قیمت درست انجام شوند.';

// ─── نرخ طلای ۱۸ عیار (تومان / گرم) — اختیاری، برای محصولات با لنگر طلا ───
const GOLD_KEY = 'cache:gold_rate';
const GOLD_FRESH = 20 * 60;

/**
 * استخراج مقدار از JSON با مسیر «data.18k.fields.price»
 */
export function pickJson(obj, path) {
  let cur = obj;
  for (const part of String(path || '').split('.')) {
    if (!part) continue;
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

export async function getGoldRateInfo(env, force = false) {
  const db = env.DB;
  const manual = Number(await getSettingValue(db, 'gold_rate_manual'));
  if (manual > 0) return { rate: manual, source: 'manual', ts: 0, manual: true, unavailable: false, stale: false };
  let cached = null;
  try {
    cached = JSON.parse((await env.KV.get(GOLD_KEY)) || 'null');
  } catch {}
  if (!force && cached?.rate && Date.now() / 1000 - cached.ts < GOLD_FRESH) {
    return { rate: cached.rate, source: cached.source || 'cache', ts: cached.ts, manual: false, unavailable: false, stale: false };
  }
  const url = String(await getSettingValue(db, 'gold_rate_url') || '').trim();
  const path = String(await getSettingValue(db, 'gold_rate_path') || 'price').trim();
  if (url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const n = Number(pickJson(d, path));
      if (Number.isFinite(n) && n > 1000) {
        const ts = Math.floor(Date.now() / 1000);
        await env.KV.put(GOLD_KEY, JSON.stringify({ rate: Math.round(n), source: 'custom', ts }), { expirationTtl: 7 * 86400 });
        return { rate: Math.round(n), source: 'custom', ts, manual: false, unavailable: false, stale: false };
      }
    } catch (e) {
      console.error('gold rate failed', e);
    }
  }
  if (cached?.rate) {
    return { rate: cached.rate, source: cached.source || 'cache', ts: cached.ts, manual: false, unavailable: false, stale: true };
  }
  // ⚠️ عدد جعلی برنمی‌گردانیم: نرخ طلا تنظیم نشده = «در دسترس نیست»
  return { rate: 0, source: '', ts: 0, manual: false, unavailable: true, stale: false };
}

export async function getGoldRate(env, force = false) {
  return (await getGoldRateInfo(env, force)).rate;
}

/** قیمت واحد لنگر محصول (usdt → نرخ دلار/تتر، gold → نرخ طلا) */
export async function pegRate(env, peg) {
  return String(peg || 'usdt').toLowerCase() === 'gold' ? getGoldRate(env) : getUsdRate(env);
}

const round1000 = (n) => Math.round((Number(n) || 0) / 1000) * 1000;

/**
 * قیمت نهایی محصول به تومان.
 *   • price_mode='fixed' → قیمت ثابت ادمین (بدون نرخ ارز)
 *   • price_mode='fx'    → دلارِ محصول × نرخ لنگر (تتر یا طلا) × مارجین
 *   • کف قیمت: max(product.min_toman, price_floor_toman) — ضد دامپینگ
 * @returns {Promise<number>} ۰ یعنی «نرخ لازم در دسترس نیست»
 */
export async function productPriceToman(env, product) {
  const floor = Math.max(Number(product?.min_toman) || 0, await getNum(env.DB, 'price_floor_toman', 0));
  if (String(product?.price_mode || 'fx') === 'fixed') {
    let t = round1000(product?.price_toman || 0);
    if (floor && t) t = Math.max(t, round1000(floor));
    return t;
  }
  const rate = await pegRate(env, product?.peg);
  if (!rate) return 0;
  let margin = await getNum(env.DB, 'margin', 1.3);
  // ضریب اضافی برای محصولات لنگرطلا (طلا حباب/کارمزد مبادله دارد) — پیش‌فرض ۱ = بدون تغییر
  if (String(product?.peg || 'usdt') === 'gold') margin = margin * (await getNum(env.DB, 'gold_margin', 1) || 1);
  let t = round1000((Number(product?.price_usd) || 0) * rate * margin);
  if (floor && t) t = Math.max(t, round1000(floor));
  return t;
}

/** خط قیمت محصول با ذکر لنگر/حالت */
export async function priceModeLine(env, product) {
  if (String(product?.price_mode || 'fx') === 'fixed') return 'قیمت ثابت (بدون نوسان ارز) ✅';
  if (String(product?.peg || 'usdt') === 'gold') {
    const g = await getGoldRate(env);
    return g ? `💛 قیمت وابسته به نرخ طلا (گرم ۱۸k): ${faDigits(g.toLocaleString('en-US'))} تومان` : '💛 قیمت وابسته به نرخ طلا — نرخ تنظیم نشده است ⚠️';
  }
  return await priceLine(env);
}

export async function priceLine(env) {
  const info = await getRateInfo(env);
  if (info.unavailable || !info.rate) return `💵 نرخ لحظه‌ای دلار: <b>${RATE_UNAVAILABLE_MESSAGE}</b>`;
  const src = info.manual ? 'دستی' : info.source;
  return `💵 نرخ لحظه‌ای دلار: <b>${faDigits(info.rate.toLocaleString('en-US'))} تومان</b> (منبع: ${src})`;
}

// ═══════════════════════════════════════════════════════════════════
//  بخش ۵ — قیمت‌گذاری پویا (فرمول قابل تنظیم از پنل)
//
//  price = (base + gb×price_per_gb + days×price_per_day + devices×price_per_device)
//          × protocol_multiplier × location_multiplier × tier_multiplier
//          × usd_rate × margin
//  سپس: تخفیف پلکانی حجم/مدت، تخفیف وفاداری، کد تخفیف، رند به نزدیک‌ترین ۱۰۰۰ تومان
// ═══════════════════════════════════════════════════════════════════

function jsonSetting(v, fallback) {
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' ? o : fallback;
  } catch {
    return fallback;
  }
}

/** جدول تخفیف پلکانی — مرتب‌شده از بیشترین آستانه به کمترین */
export async function discountTiers(env) {
  const raw = await getSettingValue(env.DB, 'discount_tiers');
  const tiers = Array.isArray(jsonSetting(raw, [])) ? jsonSetting(raw, []) : [];
  return tiers.sort((a, b) => (b.days || 0) - (a.days || 0) || (b.gb || 0) - (a.gb || 0));
}

/** تخفیف پلکانی: اولین ردیفی که هم در شرط مدت و هم در شرط حجم صدق کند */
export function tierDiscount(tiers, days, gb) {
  for (const t of tiers || []) {
    const okDays = !t.days || days >= Number(t.days);
    const okGb = !t.gb || gb >= Number(t.gb);
    if (okDays && okGb) return Number(t.percent) || 0;
  }
  return 0;
}

/**
 * محاسبهٔ قیمت پویا.
 * @param {object} env
 * @param {object} o {days, traffic_gb, devices, protocol, location, tier, code, userId}
 * @returns {Promise<{ok:boolean, usd:number, toman:number, breakdown:object, error?:string}>}
 */
export async function computeDynamicPrice(env, o = {}) {
  const days = Math.max(1, Number(o.days) || 30);
  const gb = Math.max(0, Number(o.traffic_gb) || 0);
  const devices = Math.max(1, Number(o.devices) || 1);
  const protocol = String(o.protocol || 'vless').toLowerCase();
  const location = String(o.location || 'default').toLowerCase();
  const tier = String(o.tier || 'standard').toLowerCase();

  const base = await getNum(env.DB, 'price_base', 0.2);
  const perGb = await getNum(env.DB, 'price_per_gb', 0.02);
  const perDay = await getNum(env.DB, 'price_per_day', 0.03);
  const perDevice = await getNum(env.DB, 'price_per_device', 0.1);

  const protoMult = jsonSetting(await getSettingValue(env.DB, 'price_protocol_mult'), {});
  const locMult = jsonSetting(await getSettingValue(env.DB, 'price_location_mult'), {});
  const tierMult = jsonSetting(await getSettingValue(env.DB, 'price_tier_mult'), {});

  const rawUsd =
    (base + gb * perGb + days * perDay + devices * perDevice) *
    (Number(protoMult[protocol]) || 1) *
    (Number(locMult[location]) || 1) *
    (Number(tierMult[tier]) || 1);

  const rate = await pegRate(env, o.peg);
  const margin = await getNum(env.DB, 'margin', 1.3);
  let toman = rate ? rawUsd * rate * margin : 0;
  const floor = Math.max(Number(o.min_toman) || 0, await getNum(env.DB, 'price_floor_toman', 0));
  if (floor && toman) toman = Math.max(toman, floor);

  // تخفیف پلکانی حجم/مدت
  const tiers = await discountTiers(env);
  const tierPct = tierDiscount(tiers, days, gb);

  // تخفیف وفاداری
  let loyaltyPct = 0;
  if (o.userId) {
    const loyal = await getNum(env.DB, 'loyalty_discount_percent', 0);
    const minPaid = await getNum(env.DB, 'loyalty_min_paid', 500000);
    if (loyal > 0) {
      const u = await env.DB.prepare('SELECT total_paid FROM users WHERE id=?').bind(Number(o.userId)).first();
      if (u && Number(u.total_paid || 0) >= minPaid) loyaltyPct = loyal;
    }
  }

  const breakdown = {
    base,
    perGb,
    perDay,
    perDevice,
    protocolMultiplier: Number(protoMult[protocol]) || 1,
    locationMultiplier: Number(locMult[location]) || 1,
    tierMultiplier: Number(tierMult[tier]) || 1,
    rawUsd: Math.round(rawUsd * 100) / 100,
    rate,
    margin,
    tierDiscountPercent: tierPct,
    loyaltyDiscountPercent: loyaltyPct,
    discountPercent: 0,
    discountAmount: 0,
  };

  // کد تخفیف (پس از تخفیف پلکانی و وفاداری)
  if (o.code) {
    const d = await applyDiscountCode(env, o.code, o.userId, Math.round(toman));
    if (!d.ok) return { ok: false, usd: 0, toman: 0, breakdown, error: d.error };
    breakdown.discountPercent = d.percent || 0;
    breakdown.discountAmount = d.amount || 0;
  }

  const totalPct = Math.min(100, tierPct + loyaltyPct + breakdown.discountPercent);
  let finalToman = toman * (1 - totalPct / 100);
  if (breakdown.discountAmount) finalToman -= breakdown.discountAmount;
  finalToman = Math.max(0, Math.round(finalToman / 1000) * 1000);

  return {
    ok: true,
    usd: Math.round(rawUsd * 100) / 100,
    toman: finalToman,
    breakdown: { ...breakdown, totalDiscountPercent: totalPct, finalToman },
  };
}

/**
 * اعتبارسنجی و اعمال کد تخفیف.
 * @returns {Promise<{ok:boolean, percent?:number, amount?:number, error?:string, code?:string}>}
 */
export async function applyDiscountCode(env, code, userId, amountToman) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return { ok: false, error: 'کد تخفیف وارد نشده است.' };
  const row = await env.DB.prepare('SELECT * FROM discount_codes WHERE code=?').bind(c).first();
  if (!row || !row.active) return { ok: false, error: 'کد تخفیف نامعتبر است.' };
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at && row.expires_at < now) return { ok: false, error: 'کد تخفیف منقضی شده است.' };
  if (row.max_uses > 0 && row.used_count >= row.max_uses) return { ok: false, error: 'سقف استفاده از این کد پر شده است.' };
  if (row.user_id && Number(row.user_id) !== Number(userId)) return { ok: false, error: 'این کد برای حساب شما نیست.' };
  if (row.min_order > 0 && Number(amountToman) < Number(row.min_order)) {
    return { ok: false, error: `حداقل مبلغ سفارش برای این کد ${faDigits(Number(row.min_order).toLocaleString('en-US'))} تومان است.` };
  }
  const isPercent = row.kind === 'percent';
  return {
    ok: true,
    code: c,
    percent: isPercent ? Number(row.value) : 0,
    amount: isPercent ? 0 : Math.round(Number(row.value)),
    id: row.id,
  };
}

/** ثبت مصرف یک کد تخفیف (پس از پرداخت موفق) */
export async function consumeDiscountCode(env, id) {
  if (!id) return;
  await env.DB.prepare('UPDATE discount_codes SET used_count = used_count + 1 WHERE id=?').bind(Number(id)).run();
}
