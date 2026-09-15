// ═══════════════════════════════════════════════════════════════════
//  Nova Edge (Minecraft God Server) — لایهٔ دیتابیس
//  همان Durable Object SQLite پروژه (بدون نیاز به ساخت D1/KV دستی).
//  همهٔ جدول‌های دامنه با پیشوند mc_ هستند؛ جدول‌های عمومی settings/kv
//  فقط برای تنظیمات و کش سبک خود Worker استفاده می‌شوند.
// ═══════════════════════════════════════════════════════════════════
import { getSetting, setSetting } from '../db.js';
import { toHex, hmacSha256 } from '../util.js';

export const MC_SCHEMA_VERSION = 7;

export const MC_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT DEFAULT ''
   )`,
  `CREATE TABLE IF NOT EXISTS kv (
     key   TEXT PRIMARY KEY,
     value TEXT DEFAULT '',
     exp   INTEGER DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_kv_exp ON kv(exp)`,

  `CREATE TABLE IF NOT EXISTS mc_players (
     id            TEXT PRIMARY KEY,        -- uuid یا نام‌کاربری کوچک‌شده
     username      TEXT NOT NULL,
     username_lc   TEXT NOT NULL,
     platform      TEXT DEFAULT 'java',     -- java | bedrock
     rank_id       TEXT DEFAULT 'free',     -- رنک کسب‌شده
     rank_bought   TEXT DEFAULT '',         -- رنک خریداری‌شده
     rating        INTEGER DEFAULT 1000,    -- ELO شبکه
     rating_modes  TEXT DEFAULT '{}',       -- JSON: {mode: rating}
     level         INTEGER DEFAULT 1,
     xp            INTEGER DEFAULT 0,
     rp            INTEGER DEFAULT 0,       -- Rank Points
     coins         INTEGER DEFAULT 500,
     gems          INTEGER DEFAULT 0,
     dust          INTEGER DEFAULT 0,
     wins          INTEGER DEFAULT 0,
     losses        INTEGER DEFAULT 0,
     kills         INTEGER DEFAULT 0,
     deaths        INTEGER DEFAULT 0,
     games         INTEGER DEFAULT 0,
     score_total   INTEGER DEFAULT 0,
     coins_week    INTEGER DEFAULT 0,
     win_streak    INTEGER DEFAULT 0,
     transfers_today INTEGER DEFAULT 0,
     transfers_date TEXT DEFAULT '',
     week_key      TEXT DEFAULT '',
     cosmetics     TEXT DEFAULT '[]',       -- JSON آرایهٔ شناسه‌های owned
     equipped      TEXT DEFAULT '{}',       -- JSON {slot: itemId}
     nick_color    TEXT DEFAULT '',
     chat_tag      TEXT DEFAULT '',
     phone_key     TEXT DEFAULT '',         -- hash شمارهٔ تأییدشده
     email         TEXT DEFAULT '',
     tg_id         INTEGER DEFAULT 0,
     referral_code TEXT DEFAULT '',
     referred_by   TEXT DEFAULT '',
     referrals     INTEGER DEFAULT 0,
     total_paid_usd REAL DEFAULT 0,
     party_id      TEXT DEFAULT '',
     banned        INTEGER DEFAULT 0,
     ban_reason    TEXT DEFAULT '',
     ban_until     INTEGER DEFAULT 0,
     cheat_score   INTEGER DEFAULT 0,
     reported      INTEGER DEFAULT 0,
     last_seen     INTEGER DEFAULT 0,
     last_ip_key   TEXT DEFAULT '',
     created_at    INTEGER DEFAULT 0,
     season_id     TEXT DEFAULT '',
     season_xp     INTEGER DEFAULT 0,
     battlepass    INTEGER DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_players_rating ON mc_players(rating DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_mc_players_seen ON mc_players(last_seen DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_mc_players_name ON mc_players(username_lc)`,

  `CREATE TABLE IF NOT EXISTS mc_matches (
     id            TEXT PRIMARY KEY,
     mode          TEXT NOT NULL,
     map           TEXT DEFAULT '',
     server_id     TEXT DEFAULT '',
     started_at    INTEGER DEFAULT 0,
     ended_at      INTEGER DEFAULT 0,
     duration_sec  INTEGER DEFAULT 0,
     humans        INTEGER DEFAULT 0,
     bots          INTEGER DEFAULT 0,
     tier_start    TEXT DEFAULT '',
     tier_end      TEXT DEFAULT '',
     model         TEXT DEFAULT '',
     ai_calls      INTEGER DEFAULT 0,
     ai_latency_ms INTEGER DEFAULT 0,
     winner_team   INTEGER DEFAULT -1,
     result_json   TEXT DEFAULT '{}',
     reported_by   TEXT DEFAULT '',
     created_at    INTEGER DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_matches_mode ON mc_matches(mode, ended_at DESC)`,

  `CREATE TABLE IF NOT EXISTS mc_match_players (
     match_id      TEXT NOT NULL,
     player_id     TEXT NOT NULL,
     is_bot        INTEGER DEFAULT 0,
     bot_tier      TEXT DEFAULT '',
     team          INTEGER DEFAULT 0,
     placement     INTEGER DEFAULT 0,
     points        INTEGER DEFAULT 0,
     coins         INTEGER DEFAULT 0,
     xp            INTEGER DEFAULT 0,
     rp            INTEGER DEFAULT 0,
     kills         INTEGER DEFAULT 0,
     deaths        INTEGER DEFAULT 0,
     elo_before    INTEGER DEFAULT 1000,
     elo_after     INTEGER DEFAULT 1000,
     elo_delta     INTEGER DEFAULT 0,
     mvp           INTEGER DEFAULT 0,
     won           INTEGER DEFAULT 0,
     flags         TEXT DEFAULT '',
     PRIMARY KEY (match_id, player_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_mp_player ON mc_match_players(player_id, points DESC)`,

  `CREATE TABLE IF NOT EXISTS mc_auth (
     phone_key     TEXT PRIMARY KEY,        -- sha256(phone)
     phone_masked  TEXT NOT NULL,
     code_hash     TEXT NOT NULL,
     expires_at    INTEGER NOT NULL,
     attempts      INTEGER DEFAULT 0,
     sends         INTEGER DEFAULT 1,
     verified      INTEGER DEFAULT 0,
     verified_at   INTEGER DEFAULT 0,
     ip_key        TEXT DEFAULT '',
     ip_count      INTEGER DEFAULT 1,
     provider      TEXT DEFAULT '',
     created_at    INTEGER DEFAULT 0,
     player_id     TEXT DEFAULT '',
     suspicious    INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS mc_sessions (
     token_key     TEXT PRIMARY KEY,        -- sha256(token)
     phone_key     TEXT DEFAULT '',
     player_id     TEXT DEFAULT '',
     created_at    INTEGER DEFAULT 0,
     expires_at    INTEGER DEFAULT 0,
     ip_key        TEXT DEFAULT '',
     agent         TEXT DEFAULT '',
     revoked       INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS mc_orders (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     ref           TEXT NOT NULL,
     phone_key     TEXT DEFAULT '',
     player_id     TEXT DEFAULT '',
     username      TEXT DEFAULT '',
     item_id       TEXT NOT NULL,
     item_type     TEXT DEFAULT 'rank',     -- rank | cosmetic | bundle | gems | config | booster
     item_title    TEXT DEFAULT '',
     list_usd      REAL DEFAULT 0,
     discount_pct  INTEGER DEFAULT 0,
     amount_usd    REAL DEFAULT 0,
     amount_toman  INTEGER DEFAULT 0,
     usd_rate      INTEGER DEFAULT 0,
     method        TEXT DEFAULT 'gateway',  -- gateway | card | gems | coins | free
     provider      TEXT DEFAULT '',
     gateway_ref   TEXT DEFAULT '',
     status        TEXT DEFAULT 'pending',  -- pending | paid | manual | rejected | cancelled | expired
     receipt_id    INTEGER DEFAULT 0,
     ip_key        TEXT DEFAULT '',
     discount_json TEXT DEFAULT '{}',
     created_at    INTEGER DEFAULT 0,
     paid_at       INTEGER DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_orders_status ON mc_orders(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_mc_orders_phone ON mc_orders(phone_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS mc_receipts (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id      INTEGER DEFAULT 0,
     sha256        TEXT NOT NULL,
     bytes         INTEGER DEFAULT 0,
     amount_claimed INTEGER DEFAULT 0,
     tracking      TEXT DEFAULT '',
     ai_verdict    TEXT DEFAULT 'manual',   -- auto | manual | reject
     ai_json       TEXT DEFAULT '{}',
     ai_reasons    TEXT DEFAULT '[]',
     status        TEXT DEFAULT 'pending',  -- pending | approved | rejected
     reused        INTEGER DEFAULT 0,
     ip_key        TEXT DEFAULT '',
     created_at    INTEGER DEFAULT 0,
     reviewed_at   INTEGER DEFAULT 0,
     reviewer      TEXT DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_receipts_sha ON mc_receipts(sha256)`,

  `CREATE TABLE IF NOT EXISTS mc_fraud (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     kind          TEXT NOT NULL,           -- dup_phone | ip_cluster | receipt_reuse | velocity | amount_mismatch | tampered | chargeback
     severity      INTEGER DEFAULT 1,       -- 1..3
     subject       TEXT DEFAULT '',
     detail        TEXT DEFAULT '{}',
     status        TEXT DEFAULT 'open',     -- open | resolved | dismissed
     notified      INTEGER DEFAULT 0,
     created_at    INTEGER DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_fraud_open ON mc_fraud(status, severity DESC)`,

  `CREATE TABLE IF NOT EXISTS mc_configs (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     name          TEXT NOT NULL,
     protocol      TEXT DEFAULT 'vless',    -- vless | vmess | trojan | ss | xray-reality | wireguard
     uri           TEXT NOT NULL,
     country       TEXT DEFAULT '',
     tier          TEXT DEFAULT 'free',     -- free | special
     unlimited     INTEGER DEFAULT 1,
     active        INTEGER DEFAULT 1,
     healthy       INTEGER DEFAULT 1,
     last_check    INTEGER DEFAULT 0,
     latency_ms    INTEGER DEFAULT 0,
     uses          INTEGER DEFAULT 0,
     fb_up         INTEGER DEFAULT 0,
     fb_down       INTEGER DEFAULT 0,
     sort          INTEGER DEFAULT 0,
     note          TEXT DEFAULT '',
     created_at    INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS mc_servers (
     id            TEXT PRIMARY KEY,
     name          TEXT DEFAULT '',
     address       TEXT DEFAULT '',         -- IP یا دامنهٔ نمایشی
     port_java     INTEGER DEFAULT 25565,
     port_bedrock  INTEGER DEFAULT 19132,
     version       TEXT DEFAULT '',
     software      TEXT DEFAULT 'paper',    -- paper | spigot | pocketmine | nukkit | velocity
     online        INTEGER DEFAULT 0,
     max_slots     INTEGER DEFAULT 100,
     players_now   INTEGER DEFAULT 0,
     java_now      INTEGER DEFAULT 0,
     bedrock_now   INTEGER DEFAULT 0,
     tps           REAL DEFAULT 20,
     mspt          REAL DEFAULT 0,
     ram_used_mb   INTEGER DEFAULT 0,
     modes_json    TEXT DEFAULT '[]',
     bots_active   INTEGER DEFAULT 0,
     bot_tier      TEXT DEFAULT '',
     geo           TEXT DEFAULT '',
     last_seen     INTEGER DEFAULT 0,
     created_at    INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS mc_reports (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     reporter      TEXT DEFAULT '',
     target        TEXT NOT NULL,
     reason        TEXT NOT NULL,
     mode          TEXT DEFAULT '',
     evidence      TEXT DEFAULT '{}',
     status        TEXT DEFAULT 'open',     -- open | actioned | rejected
     admin_note    TEXT DEFAULT '',
     reward_paid   INTEGER DEFAULT 0,
     created_at    INTEGER DEFAULT 0,
     closed_at     INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS mc_behavior (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     user_key      TEXT DEFAULT '',         -- phone_key یا شناسهٔ نشست
     item_id       TEXT NOT NULL,
     event         TEXT NOT NULL,           -- view | cart | abandon | purchase
     discount_pct  INTEGER DEFAULT 0,
     amount_usd    REAL DEFAULT 0,
     ip_key        TEXT DEFAULT '',
     ts            INTEGER DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_behavior_item ON mc_behavior(item_id, ts DESC)`,

  `CREATE TABLE IF NOT EXISTS mc_seasons (
     id            TEXT PRIMARY KEY,
     name          TEXT DEFAULT '',
     starts_at     INTEGER DEFAULT 0,
     ends_at       INTEGER DEFAULT 0,
     active        INTEGER DEFAULT 0,
     rewards_json  TEXT DEFAULT '[]',
     pass_price_usd REAL DEFAULT 4.99,
     created_at    INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS mc_assets (
     key           TEXT PRIMARY KEY,        -- logo | banner | splash | icon | og
     mime          TEXT DEFAULT 'image/png',
     data_b64      TEXT NOT NULL,
     bytes         INTEGER DEFAULT 0,
     prompt        TEXT DEFAULT '',
     model         TEXT DEFAULT '',
     generated_at  INTEGER DEFAULT 0,
     manual        INTEGER DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS mc_grants (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     player_key    TEXT DEFAULT '',         -- name:<username_lc> یا uuid
     username      TEXT DEFAULT '',
     phone_key     TEXT DEFAULT '',
     item_id       TEXT DEFAULT '',
     type          TEXT NOT NULL,           -- rank | cosmetic | gems | battlepass | config | coins | custom
     payload       TEXT DEFAULT '{}',
     status        TEXT DEFAULT 'pending',  -- pending | delivered | failed
     order_ref     TEXT DEFAULT '',
     attempts      INTEGER DEFAULT 0,
     created_at    INTEGER DEFAULT 0,
     delivered_at  INTEGER DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mc_grants_pending ON mc_grants(status, player_key)`,

  `CREATE TABLE IF NOT EXISTS mc_alerts (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     kind          TEXT DEFAULT '',
     text          TEXT DEFAULT '',
     severity      INTEGER DEFAULT 1,
     created_at    INTEGER DEFAULT 0
   )`
];

let lastSchemaCheck = 0;

/** ساخت جدول‌ها (idempotent) — با کش زمانی تا هر درخواست سنگین نشود */
export async function initMcDb(db) {
  const t = Date.now();
  if (t - lastSchemaCheck < 30000) return;
  lastSchemaCheck = t;
  await db.batch(MC_SCHEMA.map((sql) => db.prepare(sql)));
}

export const mcGet = async (db, key, fallback = '') => getSetting(db, `mc_${key}`, fallback);
export const mcSet = async (db, key, value) => setSetting(db, `mc_${key}`, String(value ?? ''));
export const mcNum = async (db, key, fallback = 0) => {
  const v = await mcGet(db, key, '');
  const n = Number(v);
  return v === '' || !Number.isFinite(n) ? fallback : n;
};
export const mcBool = async (db, key, fallback = false) => {
  const v = await mcGet(db, key, '');
  if (v === '') return fallback;
  return v === '1' || v === 'true' || v === 'on';
};

/** تنظیمات کل سرور (برای پنل ادمین و سایت) */
export async function serverConfig(db) {
  return {
    name: await mcGet(db, 'server_name', 'Nova Edge'),
    tagline: await mcGet(db, 'server_tagline', 'سرور خدای ماینکرفت — ۱۴ گیم‌مود، بات‌های هوشمند تطبیقی'),
    address: await mcGet(db, 'server_address', ''),
    portJava: await mcNum(db, 'server_port_java', 25565),
    portBedrock: await mcNum(db, 'server_port_bedrock', 19132),
    discord: await mcGet(db, 'discord_url', ''),
    telegram: await mcGet(db, 'telegram_url', ''),
    setupDone: (await mcGet(db, 'setup_done', '')) === '1',
    brandDone: (await mcGet(db, 'brand_done', '')) === '1',
    brandPrompt: await mcGet(db, 'brand_prompt', ''),
    crossplay: (await mcGet(db, 'crossplay', '1')) === '1',
    iranMode: (await mcGet(db, 'iran_mode', '1')) === '1',
    maintenance: (await mcGet(db, 'maintenance', '0')) === '1',
  };
}

/** کلید HMAC برای ارتباط پلاگین ↔ ورکر */
export async function bridgeKey(db) {
  let k = await mcGet(db, 'bridge_key', '');
  if (!k) {
    const buf = new Uint8Array(24);
    crypto.getRandomValues(buf);
    k = toHex(buf);
    await mcSet(db, 'bridge_key', k);
  }
  return k;
}

export async function hashSecret(secret, msg) {
  return toHex(await hmacSha256(new TextEncoder().encode(String(secret)), String(msg)));
}

export const sha256Hex = async (str) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return toHex(new Uint8Array(buf));
};

/** هش IP بدون ذخیرهٔ خود IP (حریم خصوصی + همچنان قابل شمارش) */
export async function ipKey(ip, salt = 'nova-edge') {
  if (!ip) return '';
  const v6 = String(ip).includes(':');
  // برای IPv6 فقط /64 اول (چون اپراتورهای ایران آدرس را مدام عوض می‌کنند)
  const normalized = v6 ? String(ip).split(':').slice(0, 4).join(':') : String(ip);
  return (await sha256Hex(`${salt}|${normalized}`)).slice(0, 24);
}

export async function playerById(db, id) {
  return db.prepare('SELECT * FROM mc_players WHERE id=?').bind(String(id)).first();
}
export async function playerByName(db, username) {
  return db.prepare('SELECT * FROM mc_players WHERE username_lc=?').bind(String(username || '').toLowerCase()).first();
}

/** رنک مؤثر بازیکن (بیشینهٔ کسب‌شده و خریداری‌شده) */
export function effectiveRankId(player, ranks) {
  const idx = (id) => ranks.find((r) => r.id === id)?.index ?? 0;
  const earned = idx(player?.rank_id);
  const bought = idx(player?.rank_bought);
  const best = Math.max(earned, bought);
  return (ranks.find((r) => r.index === best) || ranks[0]).id;
}

export async function ensurePlayer(db, { username, platform = 'java', id = '', phoneKey = '', ipKey = '' }) {
  const name = String(username || '').trim();
  if (!name) return null;
  const lc = name.toLowerCase();
  const pid = id || `name:${lc}`;
  let p = await db.prepare('SELECT * FROM mc_players WHERE id=?').bind(pid).first();
  if (!p) p = await db.prepare('SELECT * FROM mc_players WHERE username_lc=?').bind(lc).first();
  const now = Math.floor(Date.now() / 1000);
  if (!p) {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    const code = `NE${toHex(buf).slice(0, 6).toUpperCase()}`;
    await db
      .prepare(
        `INSERT INTO mc_players (id, username, username_lc, platform, coins, referral_code, phone_key, last_ip_key, last_seen, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(pid, name, lc, platform, 500, code, phoneKey, ipKey, now, now)
      .run();
    p = await db.prepare('SELECT * FROM mc_players WHERE id=?').bind(pid).first();
    return { player: p, isNew: true };
  }
  const updates = [];
  const args = [];
  if (p.username_lc !== lc) {
    updates.push('username=?', 'username_lc=?');
    args.push(name, lc);
  }
  if (platform && p.platform !== platform) {
    updates.push('platform=?');
    args.push(platform);
  }
  if (phoneKey && p.phone_key !== phoneKey) {
    updates.push('phone_key=?');
    args.push(phoneKey);
  }
  updates.push('last_seen=?');
  args.push(now);
  if (ipKey) {
    updates.push('last_ip_key=?');
    args.push(ipKey);
  }
  args.push(p.id);
  await db.prepare(`UPDATE mc_players SET ${updates.join(', ')} WHERE id=?`).bind(...args).run();
  return { player: await db.prepare('SELECT * FROM mc_players WHERE id=?').bind(p.id).first(), isNew: false };
}

/** هشدار/رویداد برای پنل ادمین */
export async function pushAlert(db, kind, text, severity = 1) {
  await db.prepare('INSERT INTO mc_alerts (kind, text, severity, created_at) VALUES (?,?,?,?)').bind(kind, String(text).slice(0, 500), severity, Math.floor(Date.now() / 1000)).run();
  await db.prepare('DELETE FROM mc_alerts WHERE id NOT IN (SELECT id FROM mc_alerts ORDER BY id DESC LIMIT 200)').run();
}

export async function recentMcAlerts(db, limit = 30) {
  const rows = await db.prepare('SELECT * FROM mc_alerts ORDER BY id DESC LIMIT ?').bind(limit).all();
  return rows.results || [];
}

export const MC_SETTINGS_EDITABLE = [
  // سرور و سایت
  'server_name', 'server_tagline', 'server_address', 'server_port_java', 'server_port_bedrock',
  'discord_url', 'telegram_url', 'crossplay', 'iran_mode', 'maintenance',
  'shop_enabled', 'configs_enabled', 'leaderboard_enabled', 'reports_enabled', 'referral_enabled',
  // احراز هویت
  'otp_provider', 'otp_ttl_sec', 'otp_max_attempts', 'otp_rate_limit_hour', 'otp_dev_show',
  'otp_resend_cooldown', 'otp_sms_api_url', 'otp_sms_api_key', 'otp_sms_sender', 'otp_sms_template',
  'otp_sms_method', 'otp_sms_body', 'otp_sms_success_path', 'otp_tg_chat_id', 'otp_tg_linked_only',
  'fraud_ip_max_accounts', 'fraud_velocity_hour', 'fraud_phone_regex',
  // پرداخت
  'gateway_enabled', 'gateway_provider', 'gateway_url', 'gateway_merchant_id', 'gateway_api_key',
  'gateway_currency', 'gateway_sandbox', 'gateway_custom_request', 'gateway_custom_verify',
  'card_enabled', 'card_number', 'card_holder', 'card_bank', 'card_auto_verify', 'usd_rate_manual',
  // قیمت‌گذاری
  'price_ai_enabled', 'price_ai_interval_min', 'price_max_discount', 'price_configs',
  // بات‌ها
  'bot_llm_enabled', 'bot_tier_offset', 'bot_max_tier', 'bot_force_tier', 'bot_names_visible', 'bot_model_override',
  // آنتی‌چیت
  'ac_warn_at', 'ac_kick_at', 'ac_tempban_at', 'ac_ban_at', 'ac_auto_ban',
  // برند و فصل
  'brand_style', 'brand_prompt', 'brand_generated_at', 'brand_theme', 'brand_theme_name',
  'season_active', 'season_name', 'season_ends', 'season_promo_pct', 'season_promo_items', 'season_id', 'season_rewards',
];
