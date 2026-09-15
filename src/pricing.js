// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — نرخ USD/TMN برای فروشگاه Minecraft-only
//  قیمت محصولات در spec دلاری است؛ اگر نرخ زنده در دسترس نبود، خرید درگاه
//  بسته می‌ماند و مالک می‌تواند نرخ دستی را از پنل وارد کند.
// ═══════════════════════════════════════════════════════════════════
import { getSettingValue, setSetting } from './db.js';

const RATE_KEY = 'cache:usd_rate';
const FRESH_SECONDS = 15 * 60;
const CACHE_TTL = 7 * 86400;
const MIN_RATE = 10000;

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
];

function median(nums) {
  const a = (nums || []).filter((n) => Number.isFinite(n) && n >= MIN_RATE).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

async function readCache(env) {
  try { return JSON.parse((await env.KV.get(RATE_KEY)) || 'null'); } catch { return null; }
}

async function writeCache(env, info) {
  try { await env.KV.put(RATE_KEY, JSON.stringify(info), { expirationTtl: CACHE_TTL }); } catch {}
}

export async function getRateInfo(env, force = false) {
  const manual = Number(await getSettingValue(env.DB, 'usd_rate_manual', '0'));
  if (manual >= MIN_RATE) return { rate: manual, source: 'manual', ts: 0, manual: true, cached: false, stale: false, unavailable: false };

  const cached = await readCache(env);
  const now = Math.floor(Date.now() / 1000);
  if (!force && cached?.rate && now - Number(cached.ts || 0) < FRESH_SECONDS) {
    return { ...cached, cached: true, stale: false, unavailable: false };
  }

  const rates = [];
  const sources = [];
  for (const src of RATE_SOURCES) {
    try {
      const v = await src.fetch();
      if (v >= MIN_RATE) { rates.push(v); sources.push(src.name); }
    } catch {}
  }
  const rate = median(rates);
  if (rate) {
    const info = { rate, source: sources.join('+') || 'live', ts: now, manual: false, cached: false, stale: false, unavailable: false };
    await writeCache(env, info);
    await setSetting(env.DB, 'usd_rate_last', String(rate));
    return info;
  }

  if (cached?.rate) return { ...cached, cached: true, stale: true, unavailable: false };
  return { rate: 0, source: 'unavailable', ts: now, manual: false, cached: false, stale: false, unavailable: true };
}

export async function getUsdRate(env, force = false) {
  return (await getRateInfo(env, force)).rate || 0;
}
