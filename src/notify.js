// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — اعلان داخلی Minecraft-only
//  بدون وابستگی به Telegram. هشدارها در KV/DO و settings ثبت می‌شوند تا
//  پنل ادمین بتواند آن‌ها را نمایش دهد؛ جریان خرید/بازی هرگز نمی‌شکند.
// ═══════════════════════════════════════════════════════════════════
import { getSetting, setSetting } from './db.js';

export const NOTIFY_TYPES = {
  purchase: '🛍 خرید جدید',
  payment: '💳 پرداخت/واریز جدید',
  receipt: '🧾 فیش جدید در صف',
  suspicious: '🚨 فیش مشکوک یا جعلی',
  newUser: '🆕 کاربر جدید',
  referral: '👥 زیرمجموعه جدید',
  serviceError: '⚠️ خطای سرویس',
  outOfStock: '📦 کمبود موجودی',
  deadConfig: '💀 کانفیگ خراب',
  gateway: '🏦 رویداد درگاه',
  aiFlag: '🤖 پرچم هوش مصنوعی',
};

const ALERTS_KEY = 'mc:alerts:ring';
const MAX_ALERTS = 60;

async function enabled(env, type) {
  const v = await getSetting(env.DB, `notify_${type}`, '');
  return v === '' ? true : v === '1';
}

async function pushRing(env, type, text) {
  let list = [];
  try { list = JSON.parse((await env.KV.get(ALERTS_KEY)) || '[]'); } catch {}
  list.unshift({ t: Math.floor(Date.now() / 1000), type, title: NOTIFY_TYPES[type] || type, text: String(text).replace(/<[^>]+>/g, '').slice(0, 400) });
  await env.KV.put(ALERTS_KEY, JSON.stringify(list.slice(0, MAX_ALERTS)), { expirationTtl: 30 * 86400 });
}

export async function recentAlerts(env) {
  try { return JSON.parse((await env.KV.get(ALERTS_KEY)) || '[]'); } catch { return []; }
}

/** ثبت اعلان برای پنل ادمین؛ عمداً هیچ ارسال خارجی انجام نمی‌دهد. */
export async function notifyAdmins(env, type, text, _kb = null, opts = {}) {
  try {
    if (!(await enabled(env, type))) return { sent: 0, skipped: 'disabled' };
    if (opts.dedupe) {
      const key = `notify:dd:${type}:${opts.dedupe}`;
      if (await env.KV.get(key)) return { sent: 0, skipped: 'throttled' };
      const ttl = Math.max(10, Number(opts.ttl) || Number(await getSetting(env.DB, 'notify_throttle_seconds', '120')) || 120);
      await env.KV.put(key, '1', { expirationTtl: ttl });
    }
    await pushRing(env, type, text);
    await setSetting(env.DB, `last_alert:${type}`, String(text).replace(/<[^>]+>/g, '').slice(0, 300));
    return { sent: 0, stored: true };
  } catch (e) {
    console.error('notifyAdmins failed', e);
    return { sent: 0, skipped: 'error' };
  }
}

export async function notifyStates(db) {
  const out = {};
  for (const k of Object.keys(NOTIFY_TYPES)) {
    const v = await getSetting(db, `notify_${k}`, '');
    out[k] = v === '' || v === '1';
  }
  return out;
}
