// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — helperهای مشترک دیتابیس برای نسخهٔ Minecraft-only
//  جدول اصلی تنظیمات توسط src/mc/db.js ساخته می‌شود؛ این فایل فقط API
//  کوچک سازگار با ماژول‌های MC را نگه می‌دارد تا کد قدیمی تلگرام حذف شود.
// ═══════════════════════════════════════════════════════════════════

/** خواندن تنظیمات عمومی از جدول settings */
export async function getSetting(db, key, def = '') {
  const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(String(key)).first();
  return row?.value ?? def;
}

/** ثبت/به‌روزرسانی تنظیمات عمومی */
export async function setSetting(db, key, value) {
  await db
    .prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(String(key), String(value ?? ''))
    .run();
  return true;
}

export async function getSettingValue(db, key, def = '') {
  return getSetting(db, key, def);
}

export async function getNum(db, key, def = 0) {
  const n = Number(await getSetting(db, key, String(def)));
  return Number.isFinite(n) ? n : def;
}

/** ارقام فارسی برای نمایش خواناتر در پنل */
export function faDigits(v) {
  return String(v ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
