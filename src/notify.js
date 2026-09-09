// ═══════════════════════════════════════════════════════════════════
//  سیستم اعلان (بخش ۲۴) — ارسال هوشمند به ادمین‌ها + ثبت در زنگ خطرها
//
//  • هر نوع اعلان از پنل قابل خاموش/روشن کردن است (کلید `notify:<type>`)
//  • `dedupe` از اسپم همان رویداد جلوگیری می‌کند (TTL = notify_throttle_seconds)
//  • آخرین رویدادها در حلقه‌ای ۳۰تایی نگه داشته می‌شوند تا در پنل دیده شوند
//  • هیچ اعلانی هرگز جریان خرید را نمی‌شکند (try/catch کامل)
// ═══════════════════════════════════════════════════════════════════
import { getSetting, setSetting } from './db.js';
import { send } from './tg.js';

export const NOTIFY_TYPES = {
  purchase: '🛍 خرید جدید',
  payment: '💳 پرداخت/واریز جدید',
  receipt: '🧾 فیش جدید در صف',
  suspicious: '🚨 فیش مشکوک یا جعلی',
  newUser: '🆕 کاربر جدید',
  referral: '👥 زیرمجموعه جدید',
  serviceError: '⚠️ خطای سرویس',
  outOfStock: '📦 پایان/کمبود موجودی',
  deadConfig: '💀 کانفیگ/سرور خراب',
  gateway: '🏦 رویداد درگاه بانکی',
  aiFlag: '🤖 پرچم هوش مصنوعی',
};

const ALERTS_KEY = 'alerts:ring';
const MAX_ALERTS = 30;

async function enabled(env, type) {
  const v = await getSetting(env.DB, `notify_${type}`, '');
  return v === '' ? true : v === '1'; // پیش‌فرض روشن
}

async function admins(env, limit = 25) {
  const rows = await env.DB.prepare(
    "SELECT id FROM users WHERE role IN ('super','admin') AND banned=0 ORDER BY CASE role WHEN 'super' THEN 0 ELSE 1 END LIMIT ?"
  )
    .bind(limit)
    .all();
  return (rows.results || []).map((r) => r.id);
}

/** ثبت در حلقهٔ زنگ خطرها (برای نمایش در پنل) */
async function pushAlert(env, type, text) {
  try {
    let list = [];
    try {
      list = JSON.parse((await env.KV.get(ALERTS_KEY)) || '[]');
    } catch {}
    list.unshift({ t: Math.floor(Date.now() / 1000), type, text: String(text).replace(/<[^>]+>/g, '').slice(0, 240) });
    await env.KV.put(ALERTS_KEY, JSON.stringify(list.slice(0, MAX_ALERTS)), { expirationTtl: 30 * 86400 });
  } catch {}
}

export async function recentAlerts(env) {
  try {
    return JSON.parse((await env.KV.get(ALERTS_KEY)) || '[]');
  } catch {
    return [];
  }
}

/**
 * ارسال اعلان به همهٔ ادمین‌ها.
 * @param {object} env
 * @param {string} type کلید NOTIFY_TYPES
 * @param {string} text متن HTML
 * @param {object} [kb] reply_markup اختیاری
 * @param {{dedupe?:string, ttl?:number, userIds?:number[]}} [opts]
 * @returns {Promise<{sent:number, skipped?:string}>}
 */
export async function notifyAdmins(env, type, text, kb = null, opts = {}) {
  try {
    if (!(await enabled(env, type))) return { sent: 0, skipped: 'disabled' };
    if (opts.dedupe) {
      const key = `notify:dd:${type}:${opts.dedupe}`;
      const hit = await env.KV.get(key);
      if (hit) return { sent: 0, skipped: 'throttled' };
      const ttl = Math.max(10, Number(opts.ttl) || Number(await getSetting(env.DB, 'notify_throttle_seconds', '0')) || 120);
      await env.KV.put(key, '1', { expirationTtl: ttl });
    }
    const ids = opts.userIds && opts.userIds.length ? opts.userIds : await admins(env);
    if (!ids.length) {
      // هنوز ادمینی در دیتابیس نیست: آخرین اعلان را در تنظیمات می‌گذاریم تا
      // سوپرادمینِ تازه‌ثبت‌شده در پنل ببیند (مثلاً هشدار خرابی سرویس).
      await setSetting(env.DB, `last_alert:${type}`, String(text).replace(/<[^>]+>/g, '').slice(0, 300));
      return { sent: 0, skipped: 'no_admins' };
    }
    let n = 0;
    for (const id of ids) {
      const r = await send(env.TELEGRAM_BOT_TOKEN, id, text, kb ? { reply_markup: kb } : {});
      if (r?.ok) n++;
    }
    if (n) await pushAlert(env, type, text);
    return { sent: n };
  } catch (e) {
    console.error('notifyAdmins failed', e);
    return { sent: 0, skipped: 'error' };
  }
}

/** خلاصهٔ وضعیت اعلان‌ها برای منوی تنظیمات پنل */
export async function notifyStates(db) {
  const out = {};
  for (const k of Object.keys(NOTIFY_TYPES)) {
    const v = await getSetting(db, `notify_${k}`, '');
    out[k] = v === '' || v === '1';
  }
  return out;
}
