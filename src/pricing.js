// ═══════════════════════════════════════════════════════════════════
//  قیمت‌گذاری هوشمند — نرخ لحظه‌ای دلار/تتر + مارجین + کش KV
// ═══════════════════════════════════════════════════════════════════
import { faDigits } from './db.js';
import { getSettingValue, getNum } from './texts.js';

const RATE_KEY = 'cache:usd_rate';
const FRESH_SECONDS = 15 * 60; // کش هر ۱۵ دقیقه

const RATE_SOURCES = [
  {
    // نرخ رسمی/بازار ریال از سرویس رایگان ارزی
    fetch: async () => {
      const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const irr = d?.rates?.IRR;
      if (!irr) throw new Error('no IRR');
      return Math.round(irr / 10); // تومان
    },
  },
  {
    // پشتیبان: فرانک‌فورتر بر پایه ریال نیست؛ فقط در صورت وجود دلار استفاده شود
    fetch: async () => {
      const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=IRR', {
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      const irr = d?.rates?.IRR;
      if (!irr) throw new Error('no IRR');
      return Math.round(irr / 10);
    },
  },
];

/** نرخ دلار (تومان) — با کش ۱۵ دقیقه‌ای در KV */
export async function getUsdRate(env, force = false) {
  const manual = Number(await getSettingValue(env.DB, 'usd_rate_manual'));
  if (manual > 0) return manual;

  const { KV } = env;
  if (!force) {
    try {
      const cached = JSON.parse((await KV.get(RATE_KEY)) || 'null');
      if (cached?.rate && Date.now() / 1000 - cached.ts < FRESH_SECONDS) return cached.rate;
    } catch {}
  }
  for (const src of RATE_SOURCES) {
    try {
      const rate = await src.fetch();
      if (rate > 10000) {
        await KV.put(RATE_KEY, JSON.stringify({ rate, ts: Math.floor(Date.now() / 1000) }), { expirationTtl: 86400 });
        return rate;
      }
    } catch {}
  }
  // در صورت شکست همه منابع، آخرین کش یا مقدار پیش‌فرض
  try {
    const cached = JSON.parse((await KV.get(RATE_KEY)) || 'null');
    if (cached?.rate) return cached.rate;
  } catch {}
  return 100000;
}

/** قیمت نهایی محصول به تومان = دلار × نرخ × مارجین */
export async function productPriceToman(env, product) {
  const rate = await getUsdRate(env);
  const margin = await getNum(env.DB, 'margin', 1.3);
  return Math.round(product.price_usd * rate * margin / 1000) * 1000;
}

export async function priceLine(env) {
  const rate = await getUsdRate(env);
  return `💵 نرخ لحظه‌ای دلار: <b>${faDigits(rate.toLocaleString('en-US'))} تومان</b>`;
}
