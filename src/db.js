// ═══════════════════════════════════════════════════════════════════
//  لایه دیتابیس — D1 (SQLite) + تنظیمات و دسترسی‌های مشترک
// ═══════════════════════════════════════════════════════════════════

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL DEFAULT ''
   )`,

  `CREATE TABLE IF NOT EXISTS users (
     id              INTEGER PRIMARY KEY,          -- آیدی تلگرام
     username        TEXT DEFAULT '',
     first_name      TEXT DEFAULT '',
     role            TEXT DEFAULT 'user',          -- super | admin | user
     perms           TEXT DEFAULT '[]',            -- JSON: کلیدهای دسترسی ادمین
     banned          INTEGER DEFAULT 0,
     balance         INTEGER DEFAULT 0,            -- کیف پول (تومان)
     coins           INTEGER DEFAULT 0,            -- سکه مینی‌اپ
     referrer_id     INTEGER,
     ref_first_paid  INTEGER DEFAULT 0,            -- آیا اولین خرید زیرمجموعه انجام شده؟
     invited_count   INTEGER DEFAULT 0,            -- دعوت‌های موفق
     reward_claimed  INTEGER DEFAULT 0,            -- جایزه ۵ دعوت گرفته شده؟
     state           TEXT DEFAULT '',              -- حالت ورودی در انتظار
     state_data      TEXT DEFAULT '{}',
     trial_used      INTEGER DEFAULT 0,
     total_paid      INTEGER DEFAULT 0,
     last_seen       INTEGER DEFAULT 0,
     last_reminded   INTEGER DEFAULT 0,
     created_at      INTEGER DEFAULT 0,
     tap_level       INTEGER DEFAULT 1,
     energy_level    INTEGER DEFAULT 1,
     speed_level     INTEGER DEFAULT 1,
     total_taps      INTEGER DEFAULT 0,
     weekly_taps     INTEGER DEFAULT 0,
     week_key        TEXT DEFAULT '',
     energy_left     INTEGER DEFAULT 0,
     energy_ts       INTEGER DEFAULT 0,
     last_spin_date  TEXT DEFAULT '',
     streak          INTEGER DEFAULT 0,
     last_active_day TEXT DEFAULT '',
     missions_date   TEXT DEFAULT '',
     missions_done   TEXT DEFAULT '[]'
   )`,

  `CREATE TABLE IF NOT EXISTS servers (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     name            TEXT NOT NULL,
     country         TEXT DEFAULT '',
     protocol        TEXT DEFAULT 'vless',         -- vless|vmess|trojan|ss|openvpn|mtproto|socks5
     ip              TEXT DEFAULT '',
     template        TEXT DEFAULT '',              -- قالب کانفیگ با {uuid} {days}
     health_url      TEXT DEFAULT '',              -- آدرس تست سلامت (اختیاری)
     speed_rank      INTEGER DEFAULT 5,            -- ۱ = پرسرعت‌ترین (برای تست رایگان)
     active          INTEGER DEFAULT 1,
     healthy         INTEGER DEFAULT 1,
     last_check      INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS products (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     title           TEXT NOT NULL,
     category        TEXT DEFAULT 'vless',         -- vless|vmess|trojan|ss|openvpn|mtproto|socks5|custom|coin
     protocol        TEXT DEFAULT 'vless',
     days            INTEGER DEFAULT 30,
     traffic_gb      INTEGER DEFAULT 0,            -- ۰ = نامحدود
     price_usd       REAL DEFAULT 1,
     coin_price      INTEGER DEFAULT 0,            -- برای فروشگاه سکه‌ای
     server_count    INTEGER DEFAULT 10,
     enabled         INTEGER DEFAULT 1,
     sort            INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS orders (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id         INTEGER,
     product_id      INTEGER,
     title           TEXT DEFAULT '',
     amount_toman    INTEGER DEFAULT 0,
     method          TEXT DEFAULT 'wallet',        -- wallet|card|coins|admin|trial
     status          TEXT DEFAULT 'pending',       -- paid|pending|rejected
     meta            TEXT DEFAULT '{}',
     sub_token       TEXT DEFAULT '',
     expire_at       INTEGER DEFAULT 0,
     created_at      INTEGER DEFAULT 0,
     paid_at         INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS receipts (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id         INTEGER,
     order_id        INTEGER,
     file_id         TEXT DEFAULT '',
     claimed_amount  INTEGER DEFAULT 0,
     status          TEXT DEFAULT 'pending',       -- pending|approved|rejected
     ai_report       TEXT DEFAULT '',
     created_at      INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id         INTEGER,
     product_id      INTEGER,
     order_id        INTEGER,
     title           TEXT DEFAULT '',
     token           TEXT UNIQUE,
     uuid            TEXT DEFAULT '',
     server_ids      TEXT DEFAULT '[]',
     days            INTEGER DEFAULT 30,
     traffic_gb      INTEGER DEFAULT 0,
     expire_at       INTEGER DEFAULT 0,
     active          INTEGER DEFAULT 1,
     is_trial        INTEGER DEFAULT 0,
     reminder_sent   INTEGER DEFAULT 0,
     created_at      INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS groups (
     chat_id         INTEGER PRIMARY KEY,
     title           TEXT DEFAULT '',
     enabled         INTEGER DEFAULT 1,
     last_post       INTEGER DEFAULT 0,
     created_at      INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS ai_history (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id         INTEGER,
     role            TEXT DEFAULT 'user',          -- user|assistant
     content         TEXT DEFAULT '',
     created_at      INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS league (
     week            TEXT PRIMARY KEY,             -- مثل 2026-37
     winner_id       INTEGER DEFAULT 0,
     paid            INTEGER DEFAULT 0
   )`
];

export async function initDb(db) {
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
}

// ─── تنظیمات ───
export async function getSetting(db, key, fallback = '') {
  const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
  return row && row.value !== '' ? row.value : fallback;
}

export async function setSetting(db, key, value) {
  await db
    .prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(key, String(value))
    .run();
}

export async function getAllSettings(db) {
  const rows = await db.prepare('SELECT key,value FROM settings').all();
  const out = {};
  for (const r of rows.results) out[r.key] = r.value;
  return out;
}

export const PERM_LABELS = {
  receipts: '🧾 تایید فیش‌ها',
  products: '📦 مدیریت محصولات و سرورها',
  users: '👥 مدیریت کاربران',
  admins: '👮 مدیریت ادمین‌ها',
  groups: '📢 مدیریت گروه‌ها',
  settings: '⚙️ تنظیمات',
  stats: '📊 آمار',
  export: '📤 خروجی دیتابیس',
};
export const ALL_PERMS = Object.keys(PERM_LABELS);

export async function ensureUser(db, tgUser, deep) {
  const now = Math.floor(Date.now() / 1000);
  const existing = await db.prepare('SELECT * FROM users WHERE id=?').bind(tgUser.id).first();
  if (existing) {
    await db
      .prepare('UPDATE users SET username=?, first_name=?, last_seen=? WHERE id=?')
      .bind(tgUser.username || '', tgUser.first_name || '', now, tgUser.id)
      .run();
    return { user: existing, isNew: false };
  }
  // اولین کاربر = سوپرادمین
  const count = await db.prepare('SELECT COUNT(*) AS c FROM users').first();
  const isFirst = (count?.c || 0) === 0;
  let referrer = null;
  if (deep && /^ref_(\d+)$/.test(deep)) {
    const rid = Number(RegExp.$1);
    if (rid !== tgUser.id) {
      const r = await db.prepare('SELECT id FROM users WHERE id=?').bind(rid).first();
      if (r) referrer = rid;
    }
  }
  await db
    .prepare(
      `INSERT INTO users (id, username, first_name, role, referrer_id, created_at, last_seen, energy_left, energy_ts)
       VALUES (?,?,?,?,?,?,?, ?, ?)`
    )
    .bind(
      tgUser.id,
      tgUser.username || '',
      tgUser.first_name || '',
      isFirst ? 'super' : 'user',
      referrer,
      now,
      now,
      500,
      now
    )
    .run();
  const user = await db.prepare('SELECT * FROM users WHERE id=?').bind(tgUser.id).first();
  return { user, isNew: true, isFirst, referrer };
}

export async function getUser(db, id) {
  return db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
}

export function isAdmin(user) {
  return !!user && (user.role === 'super' || user.role === 'admin');
}

export function hasPerm(user, perm) {
  if (!user) return false;
  if (user.role === 'super') return true;
  try {
    return JSON.parse(user.perms || '[]').includes(perm);
  } catch {
    return false;
  }
}

export async function addBalance(db, userId, amount) {
  await db.prepare('UPDATE users SET balance = balance + ? WHERE id=?').bind(Math.round(amount), userId).run();
}

export async function addCoins(db, userId, amount) {
  await db.prepare('UPDATE users SET coins = coins + ? WHERE id=?').bind(Math.round(amount), userId).run();
}

// ─── ساعد‌ها ───
export const faDigits = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

export const fmtToman = (n) => faDigits(Math.round(Number(n) || 0).toLocaleString('en-US')) + ' تومان';

export function fmtDate(ts) {
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(ts * 1000));
  } catch {
    return new Date(ts * 1000).toLocaleString();
  }
}

export function fmtDays(sec) {
  const d = Math.ceil(sec / 86400);
  return faDigits(d) + ' روز';
}

export function randToken(len = 16) {
  const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

export function weekKey(ts = Date.now()) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const w1day = (week1.getUTCDay() + 6) % 7;
  week1.setUTCDate(week1.getUTCDate() - w1day);
  const week = Math.round((d - week1) / (7 * 86400000)) + 1;
  return `${d.getUTCFullYear()}-${week}`;
}

export function todayStr(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}
