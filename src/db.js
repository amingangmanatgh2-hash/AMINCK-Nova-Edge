// ═══════════════════════════════════════════════════════════════════
//  لایه دیتابیس — D1 (SQLite) + تنظیمات و دسترسی‌های مشترک
// ═══════════════════════════════════════════════════════════════════

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL DEFAULT '',
     exp   INTEGER DEFAULT 0
   )`,

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
     missions_done   TEXT DEFAULT '[]',
     spin_claim      TEXT DEFAULT ''              -- قفل اتمیک چرخ شانس روزانه
   )`,

  `CREATE TABLE IF NOT EXISTS servers (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     name            TEXT NOT NULL,
     country         TEXT DEFAULT '',
     protocol        TEXT DEFAULT 'vless',         -- vless|vmess|trojan|ss|openvpn|mtproto|socks5
     ip              TEXT DEFAULT '',              -- hostname یا IP واقعی
     port            INTEGER DEFAULT 0,            -- پورت واقعی (برای MTProto/SOCKS5 الزامی)
     secret          TEXT DEFAULT '',              -- سکرت MTProto / پسورد SOCKS5
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
     delivered_at    INTEGER DEFAULT 0,            -- زمان ارسال پیام تحویل (ضدتکرار)
     delivery_claim  TEXT DEFAULT '',              -- شناسهٔ قفل تحویل (ضدتکرار اتمیک)
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
   )`,

  // ─── بخش ۱: مخزن IP تمیز (سنجش واقعی از داخل ایران) ───
  `CREATE TABLE IF NOT EXISTS clean_ips (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     ip              TEXT NOT NULL,
     port            INTEGER DEFAULT 443,
     family          TEXT DEFAULT 'v4',            -- v4 | v6
     source          TEXT DEFAULT 'manual',        -- manual | cloudflare_range | url_import | user_feedback
     sni             TEXT DEFAULT '',              -- SNI استتار اختیاری
     note            TEXT DEFAULT '',
     colo            TEXT DEFAULT '',              -- کولو/شهر کلادفلر
     score           REAL DEFAULT 0,               -- امتیاز نهایی (بالاتر = بهتر)
     samples         INTEGER DEFAULT 0,            -- تعداد نمونهٔ گزارش‌شده
     avg_ms          REAL DEFAULT 0,               -- میانگین متحرک نمایی
     p95_ms          REAL DEFAULT 0,
     success_rate    REAL DEFAULT 0,               -- 0..1
     last_ok_at      INTEGER DEFAULT 0,
     fail_count      INTEGER DEFAULT 0,
     consecutive_fail INTEGER DEFAULT 0,
     active          INTEGER DEFAULT 1,
     blocked_until   INTEGER DEFAULT 0,            -- مدارشکن (ثانیه)
     added_at        INTEGER DEFAULT 0
   )`,

  // گزارش‌های پروب کاربران (مینی‌اپ تلگرام — تنها جایی که کد ما داخل ایران اجرا می‌شود)
  `CREATE TABLE IF NOT EXISTS probe_reports (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id         INTEGER,
     ip_id           INTEGER,
     operator        TEXT DEFAULT '',              -- همراه اول | ایرانسل | مخابرات | رایتل | unknown
     ms              INTEGER DEFAULT 0,
     ok              INTEGER DEFAULT 1,
     day_key         TEXT DEFAULT '',              -- برای سقف روزانهٔ هر کاربر
     fp              TEXT DEFAULT '',              -- انگشت‌نگاشت ضد گزارش تکراری
     created_at      INTEGER DEFAULT 0
   )`,

  // ─── بخش ۳۲: دکمه‌های سفارشی منوی پایین (مدیریت کامل از پنل) ───
  `CREATE TABLE IF NOT EXISTS menu_buttons (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     label       TEXT NOT NULL,               -- متن دکمه (با ایموجی)
     action      TEXT DEFAULT 'url',          -- url | miniapp | callback | start
     value       TEXT DEFAULT '',             -- لینک / url مینی‌اپ / payload
     row_no      INTEGER DEFAULT 9,           -- ردیف در کیبورد
     col_no      INTEGER DEFAULT 1,
     admins_only INTEGER DEFAULT 0,
     active      INTEGER DEFAULT 1,
     sort        INTEGER DEFAULT 0,
     created_at  INTEGER DEFAULT 0
   )`,

  // ─── بخش ۳۳: تراکنش‌های درگاه بانکی ───
  `CREATE TABLE IF NOT EXISTS gateway_tx (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id      INTEGER NOT NULL,
     user_id       INTEGER NOT NULL,
     provider      TEXT DEFAULT '',
     authority     TEXT DEFAULT '',           -- شناسه درگاه (authority / id)
     signature     TEXT DEFAULT '',           -- امضای مسیر بازگشت (ضد جعل)
     amount_toman  INTEGER DEFAULT 0,
     fee_toman     INTEGER DEFAULT 0,
     total_toman   INTEGER DEFAULT 0,
     status        TEXT DEFAULT 'created',    -- created|redirected|verified|failed|error|refunded
     ref_id        TEXT DEFAULT '',
     card_masked   TEXT DEFAULT '',
     payload       TEXT DEFAULT '{}',         -- پاسخ خام درگاه (JSON)
     error         TEXT DEFAULT '',
     created_at    INTEGER DEFAULT 0,
     verified_at   INTEGER DEFAULT 0
   )`,

  // ─── بخش ۳۴: لایسنس «پنل کانفیگ‌ساز» (محصول قابل خرید) ───
  `CREATE TABLE IF NOT EXISTS creator_licenses (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id     INTEGER NOT NULL,
     token       TEXT UNIQUE,                 -- توکن آدرس /creator/<token>
     api_key     TEXT DEFAULT '',             -- کلید API (خروجی/اتصال اسکریپت)
     name        TEXT DEFAULT '',
     servers     INTEGER DEFAULT 10,          -- سقف سرورهای هم‌زمان
     quota       INTEGER DEFAULT 0,           -- سقف کانفیگ ساخته‌شده (۰ = نامحدود)
     used        INTEGER DEFAULT 0,
     expire_at   INTEGER DEFAULT 0,
     active      INTEGER DEFAULT 1,
     order_id    INTEGER DEFAULT 0,
     note        TEXT DEFAULT '',
     created_at  INTEGER DEFAULT 0
   )`,

  // ─── بخش ۳۵: پروفایل ضدسانسور → هر کانفیگ چند ترنسپورت/پورت/SNI ───
  `CREATE TABLE IF NOT EXISTS config_variants (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     server_id   INTEGER NOT NULL,
     label       TEXT DEFAULT '',
     transport   TEXT DEFAULT 'ws',           -- ws|grpc|xhttp|httpupgrade|tcp|ws-tls|reality
     port        INTEGER DEFAULT 443,
     security    TEXT DEFAULT 'tls',          -- tls | none | reality
     sni         TEXT DEFAULT '',             -- SNI / fake domain
     host        TEXT DEFAULT '',             -- Host header (CDN)
     path        TEXT DEFAULT '',
     service_name TEXT DEFAULT '',
     alpn        TEXT DEFAULT 'h2,http/1.1',
     fp          TEXT DEFAULT 'chrome',
     pbk         TEXT DEFAULT '',
     sid         TEXT DEFAULT '',
     spx         TEXT DEFAULT 'udp,xdg,report',
     public_key  TEXT DEFAULT '',             -- کلید عمومی پروتکل‌های need-pk (vmess/changeUserID)
     check_url   TEXT DEFAULT '',             -- پروب اختیاری (از خارج ایران — سیگنال نسبی)
     healthy     INTEGER DEFAULT 1,
     fail_count  INTEGER DEFAULT 0,
     ok_count    INTEGER DEFAULT 0,
     last_check  INTEGER DEFAULT 0,
     active      INTEGER DEFAULT 1,
     note        TEXT DEFAULT '',              -- دلیل آخرین حذف/خرابی (برای ادمین)
     sort        INTEGER DEFAULT 0,
     created_at  INTEGER DEFAULT 0
   )`,

  // ─── بخش ۳۴: کانفیگ‌های ساخته‌شده در پنل کانفیگ‌ساز ───
  `CREATE TABLE IF NOT EXISTS creator_configs (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     license_id  INTEGER NOT NULL,
     name        TEXT DEFAULT '',
     protocol    TEXT DEFAULT 'vless',
     host        TEXT DEFAULT '',
     port        INTEGER DEFAULT 443,
     line        TEXT DEFAULT '',
     created_at  INTEGER DEFAULT 0
   )`,

  // ─── بخش ۵: کدهای تخفیف ───
  `CREATE TABLE IF NOT EXISTS discount_codes (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     code            TEXT UNIQUE,
     kind            TEXT DEFAULT 'percent',       -- percent | amount
     value           REAL DEFAULT 0,               -- درصد یا مبلغ تومان
     max_uses        INTEGER DEFAULT 0,            -- ۰ = نامحدود
     used_count      INTEGER DEFAULT 0,
     expires_at      INTEGER DEFAULT 0,
     user_id         INTEGER DEFAULT 0,            -- ۰ = همه؛ وگرنه مخصوص یک کاربر
     min_order       INTEGER DEFAULT 0,            -- حداقل مبلغ سفارش
     active          INTEGER DEFAULT 1,
     created_at      INTEGER DEFAULT 0
   )`,

  // ─── 🧪 پست/متن شیشه‌ای (استودیو؛ کد ۵ رقمی برای انتشار در گروه) ───
  `CREATE TABLE IF NOT EXISTS glass_posts (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     code        TEXT UNIQUE NOT NULL,           -- کد ۵ رقمی: @BotName 31763
     user_id     INTEGER NOT NULL,
     title       TEXT DEFAULT '',
     body        TEXT NOT NULL DEFAULT '',
     buttons     TEXT DEFAULT '[]',              -- JSON: [{t,u}]
     photo       TEXT DEFAULT '',                -- file_id تصویر (اختیاری)
     style       TEXT DEFAULT 'aurora',
     ref_cta     INTEGER DEFAULT 0,              -- ۱ = دکمهٔ دعوت سازنده اضافه شود
     uses        INTEGER DEFAULT 0,              -- بارگذاری/انتشار
     views       INTEGER DEFAULT 0,              -- بازدید صفحهٔ وب
     active      INTEGER DEFAULT 1,
     origin      TEXT DEFAULT 'pv',              -- pv | ref | web | group | panel
     created_at  INTEGER DEFAULT 0
   )`,

  // ─── 🛍 خرید داخل گروه (چت‌بلاک در گروه، تحویل در پیوی) ───
  `CREATE TABLE IF NOT EXISTS group_orders (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     chat_id     INTEGER NOT NULL,
     message_id  INTEGER DEFAULT 0,              -- پیام راهنمای پرداخت در گروه
     order_id    INTEGER DEFAULT 0,
     user_id     INTEGER NOT NULL,
     product_id  INTEGER DEFAULT 0,
     amount      INTEGER DEFAULT 0,
     discount    INTEGER DEFAULT 0,
     status      TEXT DEFAULT 'await_receipt',   -- await_receipt | receipt_ok | paid | rejected,
     notified    INTEGER DEFAULT 0,              -- ۱ = اطلاع «تحویل در پیوی» در گروه فرستاده شد
     created_at  INTEGER DEFAULT 0,
     updated_at  INTEGER DEFAULT 0
   )`,

  // ─── ⭐ نظر و امتیاز محصول ───
  `CREATE TABLE IF NOT EXISTS product_reviews (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     product_id  INTEGER NOT NULL,
     user_id     INTEGER NOT NULL,
     rating      INTEGER DEFAULT 5,              -- ۱..۵
     text        TEXT DEFAULT '',
     created_at  INTEGER DEFAULT 0,
     UNIQUE(product_id, user_id)
   )`,

  // ─── ❤️ محصولات محبوب ───
  `CREATE TABLE IF NOT EXISTS favorites (
     user_id     INTEGER NOT NULL,
     product_id  INTEGER NOT NULL,
     created_at  INTEGER DEFAULT 0,
     PRIMARY KEY (user_id, product_id)
   )`,

  // ─── 📜 گزارش‌های زمان‌بندی‌شده (انضمین: صف ارسال) ───
  `CREATE TABLE IF NOT EXISTS broadcasts (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     text        TEXT NOT NULL,
     photo       TEXT DEFAULT '',
     at          INTEGER DEFAULT 0,              -- ۰ = فوری/در صف باز
     sent        INTEGER DEFAULT 0,
     total       INTEGER DEFAULT 0,
     done        INTEGER DEFAULT 0,              -- ۱ = تمام شد
     status      TEXT DEFAULT 'queued',          -- queued | running | done | failed | paused
     error       TEXT DEFAULT '',
     created_by  INTEGER DEFAULT 0,
     created_at  INTEGER DEFAULT 0
   )`,

  // ─── 🗒 لاگ اقدامات ادمین (بازرس) ───
  `CREATE TABLE IF NOT EXISTS audit_log (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     actor_id    INTEGER DEFAULT 0,
     actor       TEXT DEFAULT '',
     action      TEXT DEFAULT '',
     target      TEXT DEFAULT '',
     detail      TEXT DEFAULT '',
     created_at  INTEGER DEFAULT 0
   )`,

  // ─── 🎁 کارت خراش روزانه ───
  `CREATE TABLE IF NOT EXISTS scratch_cards (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id     INTEGER NOT NULL,
     day         TEXT NOT NULL,                   -- YYYY-MM-DD ( UTC )
     prize_kind  TEXT DEFAULT 'coins',            -- coins | amount | days | none
     prize_value INTEGER DEFAULT 0,
     won         INTEGER DEFAULT 0,
     created_at  INTEGER DEFAULT 0,
     UNIQUE(user_id, day)
   )`
];

export async function initDb(db) {
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  await migrate(db);
  try {
    await db.batch(INDEX_MIGRATIONS.map((sql) => db.prepare(sql)));
  } catch {
    /* ایندکس‌ها اختیاری‌اند؛ نبودنشان هیچ مسیری را نمی‌شکند */
  }
  await seedIfEmpty(db);
}

/**
 * ستون‌هایی که ممکن است در نصب‌های قدیمی وجود نداشته باشند.
 * `CREATE TABLE IF NOT EXISTS` جدول موجود را تغییر نمی‌دهد، پس اینجا
 * به‌صورت افزایشی اضافه می‌شوند.
 */
const COLUMN_MIGRATIONS = [
  ['servers', 'port', 'INTEGER DEFAULT 0'],
  ['servers', 'secret', "TEXT DEFAULT ''"],
  ['subscriptions', 'delivered_at', 'INTEGER DEFAULT 0'],
  ['subscriptions', 'delivery_claim', "TEXT DEFAULT ''"],
  ['users', 'spin_claim', "TEXT DEFAULT ''"],
  // بخش ۱: IP تمیز انتخابی برای یک سرور (فقط ستون جدید؛ ساختار قبلی دست‌نخورده)
  ['servers', 'clean_ip', "TEXT DEFAULT ''"],
  // ── بخش ۳۲-۳۵: ستون‌های جدید قابلیت‌ها ──
  // محصولات: حالت قیمت (ارزی/ثابت)، لنگر نرخ، سطح محصول (برای محدودیت سکه)،
  //           موجودی، قیمت کف، توضیح و برچسب
  ['products', 'price_mode', "TEXT DEFAULT 'fx'"],      // fx | fixed
  ['products', 'price_toman', 'INTEGER DEFAULT 0'],      // قیمت ثابت (وقتی price_mode=fixed)
  ['products', 'peg', "TEXT DEFAULT 'usdt'"],            // usdt | gold
  ['products', 'tier', "TEXT DEFAULT 'standard'"],       // economy | standard | premium
  ['products', 'min_toman', 'INTEGER DEFAULT 0'],        // کف قیمت (رقابتی/ضد دامپینگ)
  ['products', 'stock', 'INTEGER DEFAULT -1'],           // موجودی؛ ۱- = نامحدود
  ['products', 'sold', 'INTEGER DEFAULT 0'],
  ['products', 'description', "TEXT DEFAULT ''"],
  ['products', 'badge', "TEXT DEFAULT ''"],
  ['products', 'coin_lock_premium', 'INTEGER DEFAULT 1'],// ۱ = با سکه قابل خرید نیست (premium)
  ['orders', 'ref', "TEXT DEFAULT ''"],                   // ارجاع/کد رهگیری
  ['orders', 'updated_at', 'INTEGER DEFAULT 0'],
  ['orders', 'note', "TEXT DEFAULT ''"],
  ['config_variants', 'note', "TEXT DEFAULT ''"],          // دلیل خرابی/حذف مسیر
  ['users', 'owner_verified', 'INTEGER DEFAULT 0'],
  ['users', 'bio', "TEXT DEFAULT ''"],
  ['users', 'coins_spent', 'INTEGER DEFAULT 0'],
  ['subscriptions', 'creator_license_id', 'INTEGER DEFAULT 0'],
  ['servers', 'anti_block', "TEXT DEFAULT ''"],           // JSON پروفایل ضدسانسور سرور
  ['receipts', 'ai_score', 'INTEGER DEFAULT 0'],
  ['receipts', 'reviewed_by', 'INTEGER DEFAULT 0'],
  // ── 🌐 زبان کاربر (بخش جدید: انتخاب زبان در اولین /start) ──
  ['users', 'lang', "TEXT DEFAULT ''"],            // '' = هنوز انتخاب نکرده
  ['users', 'lang_set', 'INTEGER DEFAULT 0'],      // ۱ = صفحهٔ زبان را دیده
  // ─── 🎁 جوایز روزانه/هفتگی و ضدسوءاستفاده رفرال ───
  ['users', 'checkin_date', "TEXT DEFAULT ''"],
  ['users', 'checkin_streak', 'INTEGER DEFAULT 0'],
  ['users', 'checkin_mask', "TEXT DEFAULT ''"],      // ۷ رقم ۰/۱ برای ۷ روز
  ['users', 'ref_blocked', 'INTEGER DEFAULT 0'],    // ۱ = پاداش این زیرمجموعه به دلیل سوءاستفاده قطع شده
  ['products', 'max_devices', 'INTEGER DEFAULT 1'],  // سقف دستگاه‌های مجاز هر محصول
  ['products', 'review_count', 'INTEGER DEFAULT 0'],
  ['products', 'review_avg', 'REAL DEFAULT 0'],
  ['subscriptions', 'device_label', "TEXT DEFAULT ''"],
  ['groups', 'buy_enabled', 'INTEGER DEFAULT 1'],
  ['glass_posts', 'photo', "TEXT DEFAULT ''"],
  ['group_orders', 'notified', 'INTEGER DEFAULT 0'],
  ['menu_buttons', 'label_i18n', "TEXT DEFAULT '{}'"],   // JSON: {"en":"..","ar":"..","ru":"..","tr":".."}
];

/** جدول‌هایی که در نصب‌های قدیمی وجود ندارند — ایندکس‌های ایمن */
const INDEX_MIGRATIONS = [
  'CREATE INDEX IF NOT EXISTS ix_glass_code ON glass_posts(code)',
  'CREATE INDEX IF NOT EXISTS ix_glass_user ON glass_posts(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS ix_gorder_msg ON group_orders(chat_id, message_id)',
  'CREATE INDEX IF NOT EXISTS ix_gorder_order ON group_orders(order_id)',
  'CREATE INDEX IF NOT EXISTS ix_bcast_status ON broadcasts(status, at)',
  'CREATE INDEX IF NOT EXISTS ix_audit_time ON audit_log(created_at)',
];

/** الگوهای SQL هاست‌های نمونه که هرگز نباید تحویل داده شوند */
export const PLACEHOLDER_HOST_SQL =
  "(ip IS NULL OR TRIM(ip)='' OR LOWER(ip) LIKE '%example.com' OR LOWER(ip) LIKE '%example.net'" +
  " OR LOWER(ip) LIKE '%example.org' OR LOWER(ip) LIKE '%.test' OR LOWER(ip) LIKE '%.invalid'" +
  " OR LOWER(ip)='localhost')";

async function tableColumns(db, table) {
  try {
    const r = await db.prepare(`PRAGMA table_info(${table})`).all();
    return new Set((r.results || []).map((c) => c.name));
  } catch {
    return null;
  }
}

/** مهاجرت‌های افزایشی — روی دیتابیس‌های موجود هم اجرا می‌شوند */
export async function migrate(db) {
  const cache = {};
  for (const [table, column, type] of COLUMN_MIGRATIONS) {
    if (!(table in cache)) cache[table] = await tableColumns(db, table);
    const cols = cache[table];
    if (cols && cols.has(column)) continue;
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
      if (cols) cols.add(column);
    } catch {
      /* ستون از قبل وجود دارد */
    }
  }

  // مهاجرت داده‌ای: سرورهای نمونه (example.com و …) هرگز نباید فعال بمانند.
  // فقط تغییر seed کافی نیست چون flag «seeded» در نصب‌های قبلی ثبت شده است.
  const done = await db.prepare('SELECT value FROM kv WHERE key=?').bind('migration:placeholder_servers_v1').first();
  if (!done) {
    await db.prepare(`UPDATE servers SET active=0, healthy=0 WHERE ${PLACEHOLDER_HOST_SQL}`).run();
    await db
      .prepare('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind('migration:placeholder_servers_v1', '1')
      .run();
  }
}

/** تعداد سرورهای واقعیِ فعال (بدون هاست نمونه) */
export async function realActiveServerCount(db) {
  const row = await db.prepare(`SELECT COUNT(*) c FROM servers WHERE active=1 AND NOT ${PLACEHOLDER_HOST_SQL}`).first();
  return Number(row?.c || 0);
}


/** داده‌های اولیه — فقط یک‌بار، قابل ویرایش از پنل مدیریت */
async function seedIfEmpty(db) {
  const flag = await db.prepare('SELECT value FROM kv WHERE key=?').bind('seeded').first();
  if (flag) return;
  const stmts = [];
  const run = (sql, ...a) => stmts.push(db.prepare(sql).bind(...a));
  run(`INSERT OR IGNORE INTO settings (key,value) VALUES ('seed_note','داده نمونه — از پنل مدیریت قابل تغییر است')`);
  const products = [
    ['⚡ VLESS برنزی — ۱ ماهه', 'vless', 'vless', 30, 0, 0.9, 1],
    ['⚡ VLESS نقره‌ای — ۳ ماهه', 'vless', 'vless', 90, 0, 2.2, 2],
    ['⚡ VLESS طلایی — ۶ ماهه', 'vless', 'vless', 180, 0, 3.9, 3],
    ['⚡ VLESS الماس — ۱ ساله', 'vless', 'vless', 365, 0, 6.9, 4],
    ['🛰 V2ray VMess — ۱ ماهه', 'vmess', 'vmess', 30, 0, 0.9, 5],
    ['🐴 Trojan — ۱ ماهه', 'trojan', 'trojan', 30, 0, 1.1, 6],
    ['🧩 Shadowsocks — ۱ ماهه', 'ss', 'ss', 30, 0, 1.0, 7],
    ['🔐 OpenVPN — ۱ ماهه', 'openvpn', 'openvpn', 30, 0, 1.2, 8],
    ['📡 MTProto اختصاصی تلگرام — ۱ ماهه', 'mtproto', 'mtproto', 30, 0, 0.8, 9],
    ['🧦 SOCKS5 اختصاصی — ۱ ماهه', 'socks5', 'socks5', 30, 0, 0.8, 10],
    // 🛠 محصول «پنل کانفیگ‌ساز» — تحویلش به سرور VPN نیاز ندارد (بخش ۲۰)
    ['🛠 پنل کانفیگ‌ساز اختصاصی — ۳۰ روزه', 'creator', 'vless', 30, 0, 4.0, 11],
    ['🛠 پنل کانفیگ‌ساز — ۱ ساله (ویژه)', 'creator', 'vless', 365, 0, 29.0, 12],
    ['🪙 کانفیگ اقتصادی — ۱۰ روزه', 'coin', 'vless', 10, 5, 0, 100],
    ['🪙 کانفیگ اقتصادی — ۳۰ روزه', 'coin', 'vless', 30, 20, 0, 101],
  ];
  const coinPrices = { 100: 3000, 101: 8000 };
  // سطح محصول: economy|standard → با سکه قابل خرید؛ premium → فقط نقدی
  const tiers = { 1: 'economy', 2: 'standard', 3: 'premium', 4: 'premium', 11: 'premium', 12: 'premium' };
  for (const [title, cat, proto, days, gb, usd, sort] of products) {
    run(
      'INSERT INTO products (title, category, protocol, days, traffic_gb, price_usd, coin_price, sort, tier, stock) VALUES (?,?,?,?,?,?,?,?,?,?)',
      title,
      cat,
      proto,
      days,
      gb,
      usd,
      coinPrices[sort] || 0,
      sort,
      tiers[sort] || 'standard',
      -1
    );
  }
  // ⚠️ سرورهای زیر فقط «نمونهٔ قالب» هستند: با active=0 و healthy=0 ثبت می‌شوند
  //    تا هرگز به کاربر تحویل داده نشوند. ادمین باید سرور واقعی خودش را
  //    از پنل مدیریت ثبت کند (نام، کشور، پروتکل، host/IP، port، secret، قالب، health).
  const sampleServers = [
    ['نمونه آلمان (غیرفعال)', '🇩🇪 آلمان', 'vless', 'de1.example.com', 1],
    ['نمونه هلند (غیرفعال)', '🇳🇱 هلند', 'vmess', 'nl1.example.com', 2],
    ['نمونه انگلیس (غیرفعال)', '🇬🇧 انگلیس', 'trojan', 'uk1.example.com', 3],
    ['نمونه MTProto (غیرفعال)', '🇩🇪 آلمان', 'mtproto', 'mtp1.example.com', 3],
  ];
  for (const [name, country, proto, ip, rank] of sampleServers) {
    run(
      'INSERT INTO servers (name, country, protocol, ip, port, secret, template, speed_rank, active, healthy) VALUES (?,?,?,?,?,?,?,?,0,0)',
      name,
      country,
      proto,
      ip,
      0,
      '',
      '',
      rank
    );
  }
  await db.batch(stmts);
  await db.prepare('INSERT INTO kv (key,value) VALUES (?,?)').bind('seeded', '1').run();
  await db
    .prepare('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind('migration:placeholder_servers_v1', '1')
    .run();
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
  payments: '💳 درگاه، پرداخت‌ها و فیش‌ها',
  creator: '🛠 لایسنس پنل کانفیگ‌ساز',
  buttons: '🔘 دکمه‌های منو و مینی‌اپ',
};
export const ALL_PERMS = Object.keys(PERM_LABELS);

/**
 * آیا قفل «تایید مالک با رمز پنل» فعال است؟
 * true وقتی که /setup رمز گذاشته باشد (`owner_claim='1'`) و هنوز هیچ ادمینی ثبت نشده باشد.
 * تا زمان این تایید، هیچ کاربری (حتی اولین کاربر) نقش ادمین نمی‌گیرد.
 */
export async function requiresOwnerClaim(db) {
  if (String(await getSetting(db, 'owner_claim', '')) !== '1') return false;
  const row = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role IN ('super','admin')").first();
  return !(Number(row?.c || 0) > 0);
}

/** ثبت مالک نهایی (بعد از وارد کردن درست رمز) */
export async function bindOwner(db, userId) {
  await db.prepare("UPDATE users SET role='super', owner_verified=1 WHERE id=?").bind(Number(userId)).run();
  await setSetting(db, 'owner_id', String(userId));
  await setSetting(db, 'owner_claim', '0'); // قفل باز شد
}

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
  // اولین کاربر = سوپرادمین — مگر اینکه قفل تایید مالک فعال باشد (بخش ۱۷)
  const count = await db.prepare('SELECT COUNT(*) AS c FROM users').first();
  const isFirst = (count?.c || 0) === 0;
  const forcedOwner = Number((await getSetting(db, 'owner_id', '')) || 0);
  const isForced = forcedOwner > 0 && forcedOwner === Number(tgUser.id);
  const gate = await requiresOwnerClaim(db);
  const role = isForced ? 'super' : isFirst && !gate ? 'super' : 'user';
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
      `INSERT INTO users (id, username, first_name, role, owner_verified, referrer_id, created_at, last_seen, energy_left, energy_ts)
       VALUES (?,?,?,?,?,?,?,?,?, ?)`
    )
    .bind(
      tgUser.id,
      tgUser.username || '',
      tgUser.first_name || '',
      role,
      isForced || (isFirst && !gate) ? 1 : 0,
      referrer,
      now,
      now,
      500,
      now
    )
    .run();
  const user = await db.prepare('SELECT * FROM users WHERE id=?').bind(tgUser.id).first();
  return { user, isNew: true, isFirst, referrer, needsOwnerClaim: gate && isFirst && !isForced };
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

// ─── موجودی و انبار محصولات (بخش ۲۳) ───

/**
 * کم‌کردن یک واحد از موجودی محصول. `stock = -1` یعنی نامحدود.
 * اگر موجودی به صفر رسید، محصول خودکار از فروش خارج می‌شود (enabled=0).
 * @returns {Promise<{ok:boolean, stock:number, soldOut:boolean}>}
 */
export async function consumeStock(db, productId) {
  const id = Number(productId);
  if (!id) return { ok: true, stock: -1, soldOut: false }; // محصول سفارشی/ساخته‌شده؛ موجودی ندارد
  const row = await db.prepare('SELECT stock FROM products WHERE id=?').bind(id).first();
  if (!row) return { ok: true, stock: -1, soldOut: false };
  const stock = Number(row.stock ?? -1);
  if (stock < 0) {
    await db.prepare('UPDATE products SET sold = sold + 1 WHERE id=?').bind(id).run();
    return { ok: true, stock: -1, soldOut: false };
  }
  if (stock === 0) return { ok: false, stock: 0, soldOut: true };
  const left = stock - 1;
  await db.prepare('UPDATE products SET stock=?, sold = sold + 1, enabled=? WHERE id=?').bind(left, left > 0 ? 1 : 0, id).run();
  return { ok: true, stock: left, soldOut: left === 0 };
}

/** محصولاتی که موجودی‌شان رو به پایان است (برای اعلان ادمین) */
export async function lowStockProducts(db, threshold = 3) {
  const rows = await db
    .prepare('SELECT id, title, stock, enabled FROM products WHERE stock >= 0 AND stock <= ? ORDER BY stock ASC LIMIT 20')
    .bind(Number(threshold) || 3)
    .all();
  return rows.results || [];
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
