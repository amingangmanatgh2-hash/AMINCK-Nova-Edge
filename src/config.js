// ═══════════════════════════════════════════════════════════════════
//  پیکربندی امن ربات — توکن از Durable Object و فقط برای توسعه از env
// ═══════════════════════════════════════════════════════════════════
import { getSetting } from './db.js';

/** نام تنظیمی که توکن بات را داخل SQLite Durable Object نگه می‌دارد. */
export const BOT_TOKEN_SETTING = 'telegram_bot_token';

/**
 * اول توکن ذخیره‌شده در دیتابیس را برمی‌گرداند؛ مقدار env فقط fallback است.
 * fallback برای .dev.vars و نصب‌های قدیمی که Secret داشته‌اند نگه داشته شده است.
 */
export async function getBotToken(db, fallback = '') {
  const stored = String(await getSetting(db, BOT_TOKEN_SETTING, '') || '').trim();
  return stored || String(fallback || '').trim();
}

/**
 * تمام ماژول‌های قدیمی از env.TELEGRAM_BOT_TOKEN می‌خوانند.
 * این Proxy باعث می‌شود بدون پخش‌کردن منطق توکن در همه فایل‌ها، مقدار DB
 * همیشه بر env مقدم باشد.
 */
export async function withBotToken(env) {
  const token = await getBotToken(env.DB, env.TELEGRAM_BOT_TOKEN);
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === 'TELEGRAM_BOT_TOKEN') return token;
      return Reflect.get(target, property, receiver);
    },
  });
}
