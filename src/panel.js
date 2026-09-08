// ═══════════════════════════════════════════════════════════════════
//  پنل مدیریت تحت وب — ورود با رمز اجباری ۱۰ رقمی
//  داشبورد • محصولات • سرورها • کاربران • سفارش‌ها • فیش‌ها • گروه‌ها •
//  تنظیمات • متن‌ها • تشخیص هوش مصنوعی
//  مسیرها: /panel  و  /api/panel/*
//
//  🔒 قواعد امنیتی:
//   • همهٔ APIها (به‌جز login) نیازمند سشن معتبرند.
//   • توکن ربات هرگز در HTML یا پاسخ API برنمی‌گردد.
//   • کلیدهای حساس در allowlist تنظیمات نیستند.
// ═══════════════════════════════════════════════════════════════════
import { getSetting, setSetting, fmtDate, fmtToman, realActiveServerCount } from './db.js';
import { getSettingValue, isEnabled, DEFAULT_TEXTS } from './texts.js';
import { html, json, isValidPanelPassword, randomPanelPassword, hmacSha256, toHex, clamp } from './util.js';
import { postAdToGroup, postAdsNow } from './group.js';
import { tg, send } from './tg.js';
import { serverIssues, isServerDeliverable, isValidMtprotoSecret, isValidHost } from './proxy.js';
import { defaultTemplate, defaultPort } from './subs.js';
import { approveReceipt, sendDelivery } from './pay.js';
import { aiDiagnostics, TEXT_MODELS } from './ai.js';

const now = () => Math.floor(Date.now() / 1000);
const SESSION_TTL = 6 * 3600;
const PAGE_SIZE = 20;

/** کلیدهایی که هرگز از طریق پنل قابل خواندن/نوشتن نیستند */
const FORBIDDEN_SETTINGS = new Set(['telegram_bot_token', 'panel_password']);

/** تنظیمات قابل ویرایش از پنل وب */
const EDITABLE_SETTINGS = [
  'group_ai_enabled', 'group_welcome_enabled', 'ad_interval_hours', 'ad_text',
  'shop_enabled', 'trial_enabled', 'referral_enabled', 'ai_enabled', 'game_enabled',
  'card_pay_enabled', 'wallet_enabled', 'auto_verify', 'panel_enabled',
  'usd_rate_manual', 'margin', 'referral_percent', 'referral_goal',
  'ai_price_coins', 'ai_model', 'league_prize_coins', 'reminder_hours',
  'inactive_days', 'inactive_discount', 'group_ai_cooldown',
  'card_number', 'card_holder', 'channel_id', 'channel_url',
];

/** متن‌های قابل ویرایش از پنل وب */
const EDITABLE_TEXTS = [
  'start_welcome', 'shop_welcome', 'product_info', 'support_text', 'referral_intro',
  'pay_intro', 'receipt_pending', 'order_paid', 'trial_ok', 'group_welcome', 'reminder_text',
];

/** رمز فعلی پنل — اگر تنظیم نشده باشد، یک رمز ۱۰ رقمی ساخته و ذخیره می‌شود */
export async function ensurePanelPassword(db) {
  let pw = await getSetting(db, 'panel_password', '');
  if (!isValidPanelPassword(pw)) {
    pw = randomPanelPassword();
    await setSetting(db, 'panel_password', pw);
  }
  return pw;
}

async function makeToken(env, pw) {
  const sig = await hmacSha256(new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN || 'nova'), `panel:${pw}:${now()}:${Math.random()}`);
  const tok = toHex(sig).slice(0, 32);
  await env.KV.put(`panel_sess:${tok}`, String(now()), { expirationTtl: SESSION_TTL });
  return tok;
}

function sessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/nova_panel=([a-f0-9]{32})/);
  return m?.[1] || request.headers.get('X-Panel-Token') || '';
}

async function checkAuth(env, request) {
  const tok = sessionToken(request);
  if (!/^[a-f0-9]{32}$/.test(tok)) return false;
  const v = await env.KV.get(`panel_sess:${tok}`);
  return !!v;
}

// ─────────────────────────── کمکی‌ها ───────────────────────────
const pageOf = (b) => Math.max(0, Math.floor(Number(b?.page) || 0));
const likeOf = (b) => `%${String(b?.q || '').trim().slice(0, 60)}%`;

async function countOf(DB, sql, ...args) {
  const r = await DB.prepare(sql).bind(...args).first();
  return Number(r?.c || 0);
}

/** خلاصهٔ امن یک سرور برای پنل — سکرت هرگز کامل برنمی‌گردد */
function serverDto(s) {
  const issues = serverIssues(s);
  return {
    id: s.id,
    name: s.name,
    country: s.country || '',
    protocol: s.protocol,
    ip: s.ip || '',
    port: s.port || 0,
    hasSecret: !!String(s.secret || '').trim(),
    secretMask: s.secret ? String(s.secret).slice(0, 4) + '…' + String(s.secret).slice(-4) : '',
    template: s.template || '',
    health_url: s.health_url || '',
    speed_rank: s.speed_rank,
    active: !!s.active,
    healthy: !!s.healthy,
    last_check: s.last_check ? fmtDate(s.last_check) : '—',
    issues,
    ready: isServerDeliverable(s),
  };
}

// ─────────────────────────── API ───────────────────────────
export async function handlePanelApi(env, request, path) {
  const { DB } = env;

  if (path === '/api/panel/login') {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const given = String(body.password || '').trim();
    if (!isValidPanelPassword(given)) {
      return json({ ok: false, error: 'رمز باید دقیقاً ۱۰ رقم عددی باشد.' }, 400);
    }
    const real = await ensurePanelPassword(DB);
    if (given !== real) return json({ ok: false, error: 'رمز نادرست است.' }, 401);
    const tok = await makeToken(env, real);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `nova_panel=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`,
      },
    });
  }

  if (!(await checkAuth(env, request))) return json({ ok: false, error: 'unauthorized' }, 401);

  let body = {};
  try {
    body = await request.json();
  } catch {}

  if (path === '/api/panel/logout') {
    const tok = sessionToken(request);
    if (tok) await env.KV.delete(`panel_sess:${tok}`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': 'nova_panel=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' },
    });
  }

  // ═══════════ داشبورد ═══════════
  if (path === '/api/panel/state') {
    const d = now();
    const num = async (sql, ...a) => Number((await DB.prepare(sql).bind(...a).first())?.v || 0);
    const groups = (await DB.prepare('SELECT * FROM groups ORDER BY created_at DESC LIMIT 200').all()).results;
    const realServers = await realActiveServerCount(DB);
    const allServers = (await DB.prepare('SELECT * FROM servers').all()).results;
    const readyServers = allServers.filter(isServerDeliverable).length;
    const stats = {
      users: await num('SELECT COUNT(*) v FROM users'),
      usersNew7: await num('SELECT COUNT(*) v FROM users WHERE created_at>=?', d - 7 * 86400),
      usersActive7: await num('SELECT COUNT(*) v FROM users WHERE last_seen>=?', d - 7 * 86400),
      banned: await num('SELECT COUNT(*) v FROM users WHERE banned=1'),
      orders: await num('SELECT COUNT(*) v FROM orders'),
      ordersPaid: await num("SELECT COUNT(*) v FROM orders WHERE status='paid'"),
      ordersPending: await num("SELECT COUNT(*) v FROM orders WHERE status='pending'"),
      receiptsPending: await num("SELECT COUNT(*) v FROM receipts WHERE status='pending'"),
      revenueDay: await num("SELECT COALESCE(SUM(amount_toman),0) v FROM orders WHERE status='paid' AND paid_at>=?", d - 86400),
      revenueWeek: await num("SELECT COALESCE(SUM(amount_toman),0) v FROM orders WHERE status='paid' AND paid_at>=?", d - 7 * 86400),
      revenueMonth: await num("SELECT COALESCE(SUM(amount_toman),0) v FROM orders WHERE status='paid' AND paid_at>=?", d - 30 * 86400),
      revenueTotal: await num("SELECT COALESCE(SUM(amount_toman),0) v FROM orders WHERE status='paid'"),
      subsActive: await num('SELECT COUNT(*) v FROM subscriptions WHERE active=1 AND expire_at>?', d),
      subsExpiring: await num('SELECT COUNT(*) v FROM subscriptions WHERE active=1 AND expire_at>? AND expire_at<?', d, d + 3 * 86400),
      subsTotal: await num('SELECT COUNT(*) v FROM subscriptions'),
      products: await num('SELECT COUNT(*) v FROM products'),
      productsOn: await num('SELECT COUNT(*) v FROM products WHERE enabled=1'),
      servers: allServers.length,
      serversReady: readyServers,
      serversReal: realServers,
      groups: groups.length,
      groupsActive: groups.filter((g) => g.enabled).length,
      coins: await num('SELECT COALESCE(SUM(coins),0) v FROM users'),
      wallet: await num('SELECT COALESCE(SUM(balance),0) v FROM users'),
    };
    const warnings = [];
    if (readyServers === 0) {
      warnings.push('⛔ هیچ سرور واقعیِ آماده‌ای ثبت نشده است؛ خرید و تحویل کانفیگ متوقف است. از تب «سرورها» یک سرور با host/IP، port و secret واقعی اضافه کنید.');
    }
    const placeholders = allServers.filter((s) => serverIssues(s).length && s.active).length;
    if (placeholders) warnings.push(`⚠️ ${placeholders} سرور فعال پیکربندی ناقص دارد و نادیده گرفته می‌شود.`);
    if (stats.receiptsPending) warnings.push(`🧾 ${stats.receiptsPending} فیش در صف بررسی است.`);

    return json({
      ok: true,
      stats,
      warnings,
      models: TEXT_MODELS,
      settings: await readSettings(DB),
      groups: groups.map((g) => ({
        chat_id: String(g.chat_id),
        title: g.title || String(g.chat_id),
        enabled: !!g.enabled,
        last_post: g.last_post ? fmtDate(g.last_post) : '—',
        created_at: g.created_at ? fmtDate(g.created_at) : '—',
      })),
    });
  }

  // ═══════════ محصولات ═══════════
  if (path === '/api/panel/products/list') {
    const page = pageOf(body);
    const q = likeOf(body);
    const total = await countOf(DB, 'SELECT COUNT(*) c FROM products WHERE title LIKE ?', q);
    const rows = (await DB.prepare('SELECT * FROM products WHERE title LIKE ? ORDER BY category, sort, id LIMIT ? OFFSET ?').bind(q, PAGE_SIZE, page * PAGE_SIZE).all()).results;
    return json({ ok: true, total, page, pageSize: PAGE_SIZE, items: rows });
  }

  if (path === '/api/panel/products/save') {
    const id = Number(body.id) || 0;
    const title = String(body.title || '').trim().slice(0, 120);
    if (!title) return json({ ok: false, error: 'عنوان محصول الزامی است.' }, 400);
    const f = {
      title,
      category: String(body.category || 'vless').slice(0, 20),
      protocol: String(body.protocol || body.category || 'vless').slice(0, 20),
      days: clamp(Number(body.days) || 30, 1, 3650),
      traffic_gb: Math.max(0, Number(body.traffic_gb) || 0),
      price_usd: Math.max(0, Number(body.price_usd) || 0),
      coin_price: Math.max(0, Number(body.coin_price) || 0),
      server_count: clamp(Number(body.server_count) || 10, 1, 50),
      enabled: body.enabled ? 1 : 0,
      sort: Number(body.sort) || 0,
    };
    if (id) {
      await DB.prepare('UPDATE products SET title=?, category=?, protocol=?, days=?, traffic_gb=?, price_usd=?, coin_price=?, server_count=?, enabled=?, sort=? WHERE id=?')
        .bind(f.title, f.category, f.protocol, f.days, f.traffic_gb, f.price_usd, f.coin_price, f.server_count, f.enabled, f.sort, id).run();
    } else {
      await DB.prepare('INSERT INTO products (title, category, protocol, days, traffic_gb, price_usd, coin_price, server_count, enabled, sort) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(f.title, f.category, f.protocol, f.days, f.traffic_gb, f.price_usd, f.coin_price, f.server_count, f.enabled, f.sort).run();
    }
    return json({ ok: true });
  }

  if (path === '/api/panel/products/toggle') {
    await DB.prepare('UPDATE products SET enabled = 1 - enabled WHERE id=?').bind(Number(body.id)).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/products/delete') {
    if (body.confirm !== true) return json({ ok: false, error: 'برای حذف باید تایید ارسال شود.' }, 400);
    await DB.prepare('DELETE FROM products WHERE id=?').bind(Number(body.id)).run();
    return json({ ok: true });
  }

  // ═══════════ سرورها ═══════════
  if (path === '/api/panel/servers/list') {
    const page = pageOf(body);
    const q = likeOf(body);
    const total = await countOf(DB, 'SELECT COUNT(*) c FROM servers WHERE name LIKE ? OR ip LIKE ?', q, q);
    const rows = (await DB.prepare('SELECT * FROM servers WHERE name LIKE ? OR ip LIKE ? ORDER BY active DESC, speed_rank ASC, id ASC LIMIT ? OFFSET ?').bind(q, q, PAGE_SIZE, page * PAGE_SIZE).all()).results;
    return json({ ok: true, total, page, pageSize: PAGE_SIZE, items: rows.map(serverDto) });
  }

  if (path === '/api/panel/servers/save') {
    const id = Number(body.id) || 0;
    const protocol = String(body.protocol || 'vless').toLowerCase().slice(0, 20);
    const name = String(body.name || '').trim().slice(0, 80);
    const ip = String(body.ip || '').trim().slice(0, 120);
    const port = Number(body.port) || 0;
    let secret = String(body.secret ?? '').trim();
    // اگر سکرت خالی فرستاده شد و سرور موجود است، مقدار قبلی حفظ می‌شود
    if (id && secret === '') {
      const old = await DB.prepare('SELECT secret FROM servers WHERE id=?').bind(id).first();
      secret = String(old?.secret || '');
    }
    if (!name) return json({ ok: false, error: 'نام سرور الزامی است.' }, 400);
    if (!isValidHost(ip)) return json({ ok: false, error: 'هاست/IP معتبر نیست (دامنه‌های نمونه مثل example.com پذیرفته نمی‌شوند).' }, 400);
    const candidate = {
      name, protocol, ip, port: port || defaultPort(protocol), secret,
      template: String(body.template || '').trim(),
    };
    if (!candidate.template && protocol !== 'mtproto' && protocol !== 'socks5') {
      candidate.template = defaultTemplate(protocol, ip, candidate.port);
    }
    const issues = serverIssues(candidate);
    const wantActive = body.active ? 1 : 0;
    // ⛔ سرور ناقص هرگز فعال نمی‌شود
    if (wantActive && issues.length) {
      return json({ ok: false, error: 'برای فعال‌سازی، این مشکلات باید رفع شوند:', issues }, 400);
    }
    const f = [
      name, String(body.country || '').slice(0, 40), protocol, ip, candidate.port, secret,
      candidate.template, String(body.health_url || '').trim().slice(0, 200),
      clamp(Number(body.speed_rank) || 3, 1, 5), wantActive,
    ];
    if (id) {
      await DB.prepare('UPDATE servers SET name=?, country=?, protocol=?, ip=?, port=?, secret=?, template=?, health_url=?, speed_rank=?, active=? WHERE id=?').bind(...f, id).run();
    } else {
      await DB.prepare('INSERT INTO servers (name, country, protocol, ip, port, secret, template, health_url, speed_rank, active, healthy) VALUES (?,?,?,?,?,?,?,?,?,?,1)').bind(...f).run();
    }
    return json({ ok: true, issues });
  }

  if (path === '/api/panel/servers/toggle') {
    const id = Number(body.id);
    const s = await DB.prepare('SELECT * FROM servers WHERE id=?').bind(id).first();
    if (!s) return json({ ok: false, error: 'سرور یافت نشد.' }, 404);
    if (!s.active) {
      const issues = serverIssues(s);
      if (issues.length) return json({ ok: false, error: 'این سرور پیکربندی کامل ندارد و قابل فعال‌سازی نیست:', issues }, 400);
    }
    await DB.prepare('UPDATE servers SET active = 1 - active WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/servers/delete') {
    if (body.confirm !== true) return json({ ok: false, error: 'برای حذف باید تایید ارسال شود.' }, 400);
    await DB.prepare('DELETE FROM servers WHERE id=?').bind(Number(body.id)).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/servers/health') {
    const s = await DB.prepare('SELECT * FROM servers WHERE id=?').bind(Number(body.id)).first();
    if (!s) return json({ ok: false, error: 'سرور یافت نشد.' }, 404);
    if (!s.health_url) return json({ ok: false, error: 'آدرس تست سلامت برای این سرور تنظیم نشده است.' }, 400);
    let ok = false;
    let status = 0;
    try {
      const res = await fetch(s.health_url, { signal: AbortSignal.timeout(6000) });
      status = res.status;
      ok = res.status < 500;
    } catch {
      ok = false;
    }
    await DB.prepare('UPDATE servers SET healthy=?, last_check=? WHERE id=?').bind(ok ? 1 : 0, now(), s.id).run();
    return json({
      ok: true,
      healthy: ok,
      status,
      // ⚠️ صادقانه: این فقط دسترسی HTTP از شبکهٔ کلادفلر است، نه پینگ واقعی از ایران
      note: 'این تست فقط دسترسی HTTP از شبکهٔ Cloudflare را می‌سنجد و معادل پینگ واقعی از داخل ایران نیست.',
    });
  }

  // ═══════════ کاربران ═══════════
  if (path === '/api/panel/users/list') {
    const page = pageOf(body);
    const raw = String(body.q || '').trim();
    const q = `%${raw.slice(0, 60)}%`;
    const idq = Number(raw) || 0;
    const total = await countOf(DB, 'SELECT COUNT(*) c FROM users WHERE first_name LIKE ? OR username LIKE ? OR id=?', q, q, idq);
    const rows = (await DB.prepare('SELECT id, username, first_name, role, banned, balance, coins, total_paid, invited_count, created_at, last_seen FROM users WHERE first_name LIKE ? OR username LIKE ? OR id=? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(q, q, idq, PAGE_SIZE, page * PAGE_SIZE).all()).results;
    return json({
      ok: true, total, page, pageSize: PAGE_SIZE,
      items: rows.map((u) => ({ ...u, created_at: u.created_at ? fmtDate(u.created_at) : '—', last_seen: u.last_seen ? fmtDate(u.last_seen) : '—' })),
    });
  }

  if (path === '/api/panel/users/action') {
    const id = Number(body.id);
    const u = await DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
    if (!u) return json({ ok: false, error: 'کاربر یافت نشد.' }, 404);
    const a = String(body.action || '');
    if (a === 'ban') {
      if (u.role !== 'user') return json({ ok: false, error: 'ادمین‌ها را نمی‌توان از پنل وب بن کرد.' }, 400);
      await DB.prepare('UPDATE users SET banned = 1 - banned WHERE id=?').bind(id).run();
    } else if (a === 'balance') {
      await DB.prepare('UPDATE users SET balance = MAX(0, balance + ?) WHERE id=?').bind(Math.round(Number(body.value) || 0), id).run();
    } else if (a === 'coins') {
      await DB.prepare('UPDATE users SET coins = MAX(0, coins + ?) WHERE id=?').bind(Math.round(Number(body.value) || 0), id).run();
    } else if (a === 'message') {
      const t = String(body.value || '').trim();
      if (!t) return json({ ok: false, error: 'متن پیام خالی است.' }, 400);
      const r = await send(env.TELEGRAM_BOT_TOKEN, id, t);
      return json({ ok: !!r?.ok, error: r?.ok ? undefined : 'ارسال پیام ناموفق بود.' });
    } else {
      return json({ ok: false, error: 'عملیات ناشناخته.' }, 400);
    }
    return json({ ok: true });
  }

  if (path === '/api/panel/users/detail') {
    const id = Number(body.id);
    const u = await DB.prepare('SELECT id, username, first_name, role, banned, balance, coins, total_paid, invited_count, referrer_id, trial_used, created_at FROM users WHERE id=?').bind(id).first();
    if (!u) return json({ ok: false, error: 'کاربر یافت نشد.' }, 404);
    const subs = (await DB.prepare('SELECT id, title, token, expire_at, active, is_trial FROM subscriptions WHERE user_id=? ORDER BY id DESC LIMIT 20').bind(id).all()).results;
    const orders = (await DB.prepare('SELECT id, title, amount_toman, method, status, created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 20').bind(id).all()).results;
    return json({
      ok: true,
      user: { ...u, created_at: u.created_at ? fmtDate(u.created_at) : '—' },
      subs: subs.map((s) => ({ ...s, expire_at: fmtDate(s.expire_at) })),
      orders: orders.map((o) => ({ ...o, created_at: fmtDate(o.created_at) })),
    });
  }

  // ═══════════ سفارش‌ها ═══════════
  if (path === '/api/panel/orders/list') {
    const page = pageOf(body);
    const status = ['paid', 'pending', 'rejected'].includes(String(body.status)) ? String(body.status) : '';
    const where = status ? 'WHERE o.status=?' : '';
    const args = status ? [status] : [];
    const total = await countOf(DB, `SELECT COUNT(*) c FROM orders o ${where}`, ...args);
    const rows = (await DB.prepare(`SELECT o.*, u.first_name, u.username FROM orders o LEFT JOIN users u ON u.id=o.user_id ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`)
      .bind(...args, PAGE_SIZE, page * PAGE_SIZE).all()).results;
    return json({
      ok: true, total, page, pageSize: PAGE_SIZE,
      items: rows.map((o) => ({
        id: o.id, user_id: o.user_id, who: o.first_name || o.username || String(o.user_id),
        title: o.title, amount: o.amount_toman, method: o.method, status: o.status,
        created_at: o.created_at ? fmtDate(o.created_at) : '—',
        paid_at: o.paid_at ? fmtDate(o.paid_at) : '—',
        sub_token: o.sub_token || '',
      })),
    });
  }

  // ═══════════ فیش‌ها ═══════════
  if (path === '/api/panel/receipts/list') {
    const page = pageOf(body);
    const status = ['pending', 'approved', 'rejected'].includes(String(body.status)) ? String(body.status) : 'pending';
    const total = await countOf(DB, 'SELECT COUNT(*) c FROM receipts WHERE status=?', status);
    const rows = (await DB.prepare('SELECT r.*, o.title, o.amount_toman, u.first_name, u.username FROM receipts r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN users u ON u.id=r.user_id WHERE r.status=? ORDER BY r.id DESC LIMIT ? OFFSET ?')
      .bind(status, PAGE_SIZE, page * PAGE_SIZE).all()).results;
    return json({
      ok: true, total, page, pageSize: PAGE_SIZE,
      items: rows.map((r) => ({
        id: r.id, order_id: r.order_id, user_id: r.user_id,
        who: r.first_name || r.username || String(r.user_id),
        title: r.title || 'شارژ کیف پول', amount: r.amount_toman || 0,
        status: r.status, ai_report: (r.ai_report || '').slice(0, 400),
        created_at: r.created_at ? fmtDate(r.created_at) : '—',
      })),
    });
  }

  if (path === '/api/panel/receipts/approve') {
    const r = await DB.prepare('SELECT * FROM receipts WHERE id=?').bind(Number(body.id)).first();
    if (!r) return json({ ok: false, error: 'فیش یافت نشد.' }, 404);
    if (r.status !== 'pending') return json({ ok: false, error: 'این فیش قبلاً رسیدگی شده است.' }, 400);
    let res;
    try {
      res = await approveReceipt(env, r);
    } catch (e) {
      return json({ ok: false, error: `تایید ناموفق بود: ${String(e?.message || e).slice(0, 160)}` }, 500);
    }
    if (!res) return json({ ok: false, error: 'سفارش مربوطه قبلاً پرداخت‌شده علامت خورده است.' }, 400);
    if (res.error === 'no_real_server') return json({ ok: false, error: res.message, issues: ['ابتدا از تب «سرورها» یک سرور واقعی و فعال ثبت کنید.'] }, 400);
    if (res.charge) {
      await send(env.TELEGRAM_BOT_TOKEN, res.user.id, `✅ <b>پرداخت تایید شد</b>\n\n👛 کیف پول شما با ${fmtToman(res.order.amount_toman)} شارژ شد.`);
      return json({ ok: true, kind: 'charge' });
    }
    await send(env.TELEGRAM_BOT_TOKEN, res.user.id, '✅ <b>پرداخت شما تایید شد</b>\n\n⏳ کانفیگ در پیام بعدی ارسال می‌شود.');
    const d = await sendDelivery(env, res.user, res.order.title || 'اشتراک', res.sub, { protocol: res.product?.protocol });
    return json({ ok: true, kind: 'order', delivered: !!d?.sent, deliveryReason: d?.reason || null });
  }

  if (path === '/api/panel/receipts/reject') {
    const r = await DB.prepare('SELECT * FROM receipts WHERE id=?').bind(Number(body.id)).first();
    if (!r) return json({ ok: false, error: 'فیش یافت نشد.' }, 404);
    if (r.status !== 'pending') return json({ ok: false, error: 'این فیش قبلاً رسیدگی شده است.' }, 400);
    await DB.prepare("UPDATE receipts SET status='rejected' WHERE id=?").bind(r.id).run();
    await DB.prepare("UPDATE orders SET status='rejected' WHERE id=? AND status='pending'").bind(r.order_id).run();
    await send(env.TELEGRAM_BOT_TOKEN, r.user_id, '❌ متاسفانه فیش شما تایید نشد. در صورت واریز، با پشتیبانی در ارتباط باشید. 📞');
    return json({ ok: true });
  }

  // ═══════════ گروه‌ها (سازگار با نسخهٔ قبل) ═══════════
  const chatId = Number(body.chat_id);

  if (path === '/api/panel/group/add') {
    if (!chatId) return json({ ok: false, error: 'آیدی گروه معتبر نیست.' }, 400);
    let title = String(body.title || '').trim();
    if (!title) {
      const info = await tg(env.TELEGRAM_BOT_TOKEN, 'getChat', { chat_id: chatId });
      title = info?.result?.title || `گروه ${chatId}`;
    }
    await DB.prepare('INSERT OR REPLACE INTO groups (chat_id, title, enabled, created_at) VALUES (?,?,1,?)').bind(chatId, title, now()).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/group/toggle') {
    await DB.prepare('UPDATE groups SET enabled = 1 - enabled WHERE chat_id=?').bind(chatId).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/group/rename') {
    await DB.prepare('UPDATE groups SET title=? WHERE chat_id=?').bind(String(body.title || '').slice(0, 120), chatId).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/group/delete') {
    await DB.prepare('DELETE FROM groups WHERE chat_id=?').bind(chatId).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/group/post') {
    const ok = await postAdToGroup(env, chatId);
    return json({ ok, error: ok ? undefined : 'ارسال ناموفق بود (بات در گروه عضو است؟).' });
  }

  if (path === '/api/panel/group/postall') {
    const n = await postAdsNow(env);
    return json({ ok: true, count: n });
  }

  if (path === '/api/panel/group/message') {
    const txt = String(body.text || '').trim();
    if (!txt) return json({ ok: false, error: 'متن خالی است.' }, 400);
    if (chatId) {
      const r = await send(env.TELEGRAM_BOT_TOKEN, chatId, txt);
      return json({ ok: !!r?.ok });
    }
    const gs = (await DB.prepare('SELECT chat_id FROM groups WHERE enabled=1').all()).results;
    let n = 0;
    for (const g of gs) {
      const r = await send(env.TELEGRAM_BOT_TOKEN, g.chat_id, txt);
      if (r?.ok) n++;
    }
    return json({ ok: true, count: n });
  }

  // ═══════════ تنظیمات و متن‌ها ═══════════
  if (path === '/api/panel/settings') {
    let saved = 0;
    for (const k of EDITABLE_SETTINGS) {
      if (FORBIDDEN_SETTINGS.has(k)) continue;
      if (k in body) {
        await setSetting(DB, k, String(body[k]));
        saved++;
      }
    }
    return json({ ok: true, saved, settings: await readSettings(DB) });
  }

  if (path === '/api/panel/texts') {
    if (body.save) {
      const k = String(body.key || '');
      if (!EDITABLE_TEXTS.includes(k)) return json({ ok: false, error: 'این متن قابل ویرایش نیست.' }, 400);
      await setSetting(DB, `text:${k}`, String(body.value || '').slice(0, 4000));
      return json({ ok: true });
    }
    const out = [];
    for (const k of EDITABLE_TEXTS) {
      out.push({ key: k, value: (await getSetting(DB, `text:${k}`, '')) || DEFAULT_TEXTS[k] || '' });
    }
    return json({ ok: true, items: out });
  }

  if (path === '/api/panel/ai/test') {
    const diag = await aiDiagnostics(env);
    return json({ ok: true, diag });
  }

  if (path === '/api/panel/password') {
    const pw = String(body.password || '').trim();
    if (!isValidPanelPassword(pw)) return json({ ok: false, error: 'رمز جدید باید دقیقاً ۱۰ رقم عددی باشد.' }, 400);
    await setSetting(DB, 'panel_password', pw);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'not found' }, 404);
}

/** تنظیمات قابل نمایش — هیچ کلید حساسی برنمی‌گردد */
async function readSettings(DB) {
  const out = {};
  for (const k of EDITABLE_SETTINGS) {
    if (FORBIDDEN_SETTINGS.has(k)) continue;
    out[k] = await getSettingValue(DB, k);
  }
  return out;
}

// ─────────────────────────── UI ───────────────────────────
export async function panelHtml(env) {
  if (!(await isEnabled(env.DB, 'panel_enabled'))) return html('<h3 dir="rtl">🚫 پنل تحت وب غیرفعال است.</h3>', 403);
  await ensurePanelPassword(env.DB);
  return html(PANEL_HTML);
}

const PANEL_HTML = `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>AMINCK Nova — پنل مدیریت</title>
<style>
:root{--bg:#0b1220;--card:#152037;--line:#243352;--gold:#f5b31e;--txt:#eaf1ff;--mut:#8fa3c8;--ok:#38d39f;--bad:#ff6b8a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font-family:Vazirmatn,Segoe UI,Tahoma,sans-serif;font-size:14px;padding-bottom:70px}
.wrap{max-width:1000px;margin:0 auto;padding:14px}
h1{font-size:19px;margin:6px 0 14px}h2{font-size:15px;margin:0 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px}
input,textarea,select{width:100%;background:#0f1a2e;border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:10px;font-family:inherit;font-size:14px}
button{background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#171305;font-weight:800;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;font-family:inherit;font-size:13px}
button:disabled{opacity:.5;cursor:not-allowed}
button.gh{background:#243352;color:var(--txt)}button.rd{background:#63223a;color:#ffd9e4}button.gn{background:#14513c;color:#b8f5df}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.g{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;background:#0f1a2e}
.mut{color:var(--mut);font-size:12px}
.hint{color:var(--gold);font-size:12px;margin-top:6px}
.err{color:var(--bad);font-size:13px;min-height:18px;white-space:pre-wrap}
.okmsg{color:var(--ok);font-size:13px;min-height:18px}
.st{display:flex;gap:8px;flex-wrap:wrap}
.st div{flex:1 1 120px;text-align:center;background:#0f1a2e;border:1px solid var(--line);border-radius:12px;padding:10px}
.st b{display:block;font-size:18px;color:var(--gold)}
label{display:block;margin:9px 0 4px;font-size:12px;color:var(--mut)}
.hidden{display:none!important}
.tabs{position:fixed;bottom:0;left:0;right:0;display:flex;overflow-x:auto;background:#101b33;border-top:1px solid var(--line);z-index:20}
.tabs button{flex:1 0 auto;background:none;border:0;color:var(--mut);padding:9px 10px;font-size:11px;border-radius:0;font-weight:600}
.tabs button.on{color:var(--gold);box-shadow:inset 0 2px 0 var(--gold)}
.pill{display:inline-block;border-radius:20px;padding:2px 9px;font-size:11px;background:#243352}
.pill.ok{background:#14513c;color:#b8f5df}.pill.bad{background:#63223a;color:#ffd9e4}.pill.warn{background:#5a4610;color:#ffe9ad}
.warn{background:#3a2a0c;border:1px solid #7a5c14;color:#ffe1a3;border-radius:12px;padding:10px;margin-bottom:10px;font-size:13px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:520px){.grid2{grid-template-columns:1fr}}
.spin{display:inline-block;width:14px;height:14px;border:2px solid #ffffff55;border-top-color:var(--gold);border-radius:50%;animation:rot .8s linear infinite;vertical-align:-2px}
@keyframes rot{to{transform:rotate(360deg)}}
table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:7px 4px;border-bottom:1px solid var(--line);text-align:right}
.pager{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px}
.modal{position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:50;padding:14px}
.modal .card{max-width:520px;width:100%;max-height:88vh;overflow:auto;margin:0}
</style></head><body><div class="wrap">

<div id="login" class="card">
  <h1>🔐 ورود به پنل AMINCK Nova</h1>
  <label>رمز عبور (دقیقاً ۱۰ رقم عددی)</label>
  <input id="pw" type="password" inputmode="numeric" maxlength="10" placeholder="۱۰ رقم عددی">
  <div class="hint">⚠️ رمز پنل الزاماً باید ۱۰ رقم عددی باشد. رمز اولیه از پنل تلگرام: تنظیمات → 🔐 رمز پنل وب</div>
  <div class="err" id="lerr"></div>
  <div class="row" style="margin-top:10px"><button id="loginBtn" onclick="login()">ورود</button></div>
</div>

<div id="app" class="hidden">
  <div class="row" style="justify-content:space-between">
    <h1 style="margin:0">⚡ پنل مدیریت AMINCK Nova</h1>
    <button class="gh" onclick="logout()">🚪 خروج</button>
  </div>
  <div id="warns"></div>
  <div id="pages"></div>
</div>
</div>

<div class="tabs hidden" id="tabs">
  <button data-p="dash" class="on">📊 داشبورد</button>
  <button data-p="prod">📦 محصولات</button>
  <button data-p="srv">🖥 سرورها</button>
  <button data-p="usr">👥 کاربران</button>
  <button data-p="ord">🧾 سفارش‌ها</button>
  <button data-p="rcp">💳 فیش‌ها</button>
  <button data-p="grp">📢 گروه‌ها</button>
  <button data-p="set">⚙️ تنظیمات</button>
</div>

<script>
var $=function(id){return document.getElementById(id)};
var STATE=null,CUR='dash',busy=false;
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fa(n){return Number(n||0).toLocaleString('fa-IR')}
function toman(n){return fa(Math.round(Number(n)||0))+' تومان'}
async function api(p,b){
  var r;
  try{ r=await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}); }
  catch(e){ return {ok:false,error:'⛔ ارتباط با سرور برقرار نشد.'}; }
  if(r.status===401){ showLogin(); return {ok:false,error:'نشست منقضی شد؛ دوباره وارد شوید.'}; }
  try{ return await r.json(); }catch(e){ return {ok:false,error:'پاسخ نامعتبر از سرور.'}; }
}
function showLogin(){ $('app').classList.add('hidden'); $('tabs').classList.add('hidden'); $('login').classList.remove('hidden'); }
function loading(msg){ $('pages').innerHTML='<div class="card"><span class="spin"></span> '+(msg||'در حال بارگذاری…')+'</div>'; }
function errBox(m){ return '<div class="card"><div class="err">⛔ '+esc(m)+'</div></div>'; }
function flash(m,bad){ var d=document.createElement('div'); d.className='warn'; d.style.position='fixed'; d.style.top='10px'; d.style.left='50%'; d.style.transform='translateX(-50%)'; d.style.zIndex='99';
  if(bad){d.style.background='#3d1420';d.style.borderColor='#7a2440';d.style.color='#ffd9e4'} d.textContent=m; document.body.appendChild(d); setTimeout(function(){d.remove()},3200); }
function confirmAsk(msg){ return window.confirm(msg); }

async function login(){
  var pw=$('pw').value.trim();
  if(!/^[0-9]{10}$/.test(pw)){$('lerr').textContent='⛔ رمز باید دقیقاً ۱۰ رقم عددی باشد.';return}
  $('loginBtn').disabled=true;$('lerr').textContent='';
  var r=await api('/api/panel/login',{password:pw});
  $('loginBtn').disabled=false;
  if(!r.ok){$('lerr').textContent='⛔ '+(r.error||'خطا');return}
  $('login').classList.add('hidden');$('app').classList.remove('hidden');$('tabs').classList.remove('hidden');
  go('dash');
}
async function logout(){ await api('/api/panel/logout'); showLogin(); }

function go(p){
  CUR=p;
  var bs=document.querySelectorAll('.tabs button');
  for(var i=0;i<bs.length;i++){ bs[i].classList.toggle('on', bs[i].dataset.p===p); }
  render();
}
async function render(){
  loading();
  if(CUR==='dash')return pgDash();
  if(CUR==='prod')return pgProducts(0);
  if(CUR==='srv')return pgServers(0);
  if(CUR==='usr')return pgUsers(0,'');
  if(CUR==='ord')return pgOrders(0,'');
  if(CUR==='rcp')return pgReceipts(0,'pending');
  if(CUR==='grp')return pgGroups();
  if(CUR==='set')return pgSettings();
}

/* ═════ داشبورد ═════ */
async function pgDash(){
  var r=await api('/api/panel/state');
  if(!r.ok){$('pages').innerHTML=errBox(r.error||'خطا');return}
  STATE=r;
  $('warns').innerHTML=(r.warnings||[]).map(function(w){return '<div class="warn">'+esc(w)+'</div>'}).join('');
  var s=r.stats;
  function box(t,v){return '<div><b>'+v+'</b><span class="mut">'+t+'</span></div>'}
  $('pages').innerHTML=
   '<div class="card"><h2>💰 فروش</h2><div class="st">'+
    box('امروز',toman(s.revenueDay))+box('۷ روز',toman(s.revenueWeek))+box('۳۰ روز',toman(s.revenueMonth))+box('کل',toman(s.revenueTotal))+
   '</div></div>'+
   '<div class="card"><h2>👥 کاربران</h2><div class="st">'+
    box('کل',fa(s.users))+box('جدید ۷ روز',fa(s.usersNew7))+box('فعال ۷ روز',fa(s.usersActive7))+box('بن‌شده',fa(s.banned))+
   '</div></div>'+
   '<div class="card"><h2>🧾 سفارش‌ها و فیش‌ها</h2><div class="st">'+
    box('کل سفارش',fa(s.orders))+box('پرداخت‌شده',fa(s.ordersPaid))+box('در انتظار',fa(s.ordersPending))+box('فیش در صف',fa(s.receiptsPending))+
   '</div></div>'+
   '<div class="card"><h2>📦 اشتراک‌ها و زیرساخت</h2><div class="st">'+
    box('اشتراک فعال',fa(s.subsActive))+box('نزدیک انقضا',fa(s.subsExpiring))+box('محصول فعال',fa(s.productsOn)+'/'+fa(s.products))+
    box('سرور آمادهٔ تحویل',fa(s.serversReady)+'/'+fa(s.servers))+box('گروه فعال',fa(s.groupsActive)+'/'+fa(s.groups))+
   '</div></div>'+
   '<div class="card"><h2>🪙 اقتصاد</h2><div class="st">'+
    box('مجموع سکه',fa(s.coins))+box('مجموع کیف پول',toman(s.wallet))+
   '</div></div>';
}

/* ═════ محصولات ═════ */
async function pgProducts(page,q){
  var r=await api('/api/panel/products/list',{page:page||0,q:q||''});
  if(!r.ok){$('pages').innerHTML=errBox(r.error);return}
  var h='<div class="card"><h2>📦 مدیریت محصولات ('+fa(r.total)+')</h2>'+
   '<div class="row"><input id="pq" placeholder="جست‌وجوی عنوان" value="'+esc(q||'')+'" style="flex:2;min-width:160px">'+
   '<button onclick="pgProducts(0,$(\\'pq\\').value)">🔍 جست‌وجو</button>'+
   '<button class="gn" onclick="prodForm(null)">➕ محصول جدید</button></div></div>';
  h+='<div class="card">';
  if(!r.items.length)h+='<div class="mut">محصولی یافت نشد.</div>';
  for(var i=0;i<r.items.length;i++){var p=r.items[i];
   h+='<div class="g"><div class="row" style="justify-content:space-between"><b>'+(p.enabled?'🟢':'🔴')+' '+esc(p.title)+'</b><span class="pill">'+esc(p.category)+'</span></div>'+
    '<div class="mut">⏱ '+fa(p.days)+' روز | 📊 '+(p.traffic_gb?fa(p.traffic_gb)+' گیگ':'نامحدود')+' | 💵 $'+p.price_usd+(p.coin_price?' | 🪙 '+fa(p.coin_price):'')+' | 🖥 '+fa(p.server_count)+' سرور</div>'+
    '<div class="row" style="margin-top:8px"><button class="gh" onclick="prodForm('+p.id+')">✏️ ویرایش</button>'+
    '<button class="gh" onclick="prodToggle('+p.id+')">'+(p.enabled?'🔴 غیرفعال':'🟢 فعال')+'</button>'+
    '<button class="rd" onclick="prodDel('+p.id+',\\''+esc(p.title).replace(/'/g,"")+'\\')">🗑 حذف</button></div></div>';
  }
  h+='</div>'+pager(r,'pgProducts',q||'');
  $('pages').innerHTML=h; window.__prods=r.items;
}
function pager(r,fn,q){
  var pages=Math.ceil(r.total/r.pageSize)||1;
  if(pages<=1)return '';
  return '<div class="pager"><button class="gh" '+(r.page<=0?'disabled':'')+' onclick="'+fn+'('+(r.page-1)+',\\''+esc(q)+'\\')">قبلی</button>'+
   '<span class="mut">صفحه '+fa(r.page+1)+' از '+fa(pages)+'</span>'+
   '<button class="gh" '+(r.page+1>=pages?'disabled':'')+' onclick="'+fn+'('+(r.page+1)+',\\''+esc(q)+'\\')">بعدی</button></div>';
}
function prodForm(id){
  var p=(window.__prods||[]).filter(function(x){return x.id===id})[0]||{title:'',category:'vless',protocol:'vless',days:30,traffic_gb:0,price_usd:1,coin_price:0,server_count:10,enabled:1,sort:0};
  var cats=['vless','vmess','trojan','ss','openvpn','mtproto','socks5','coin'];
  var opts=cats.map(function(c){return '<option value="'+c+'"'+(p.category===c?' selected':'')+'>'+c+'</option>'}).join('');
  modal('<h2>'+(id?'✏️ ویرایش محصول':'➕ محصول جدید')+'</h2>'+
   '<label>عنوان</label><input id="f_title" value="'+esc(p.title)+'">'+
   '<div class="grid2"><div><label>دسته/پروتکل</label><select id="f_cat">'+opts+'</select></div>'+
   '<div><label>روز</label><input id="f_days" type="number" value="'+p.days+'"></div></div>'+
   '<div class="grid2"><div><label>حجم (گیگ، ۰=نامحدود)</label><input id="f_gb" type="number" value="'+p.traffic_gb+'"></div>'+
   '<div><label>قیمت دلاری</label><input id="f_usd" type="number" step="0.1" value="'+p.price_usd+'"></div></div>'+
   '<div class="grid2"><div><label>قیمت سکه‌ای</label><input id="f_coin" type="number" value="'+p.coin_price+'"></div>'+
   '<div><label>تعداد سرور</label><input id="f_sc" type="number" value="'+p.server_count+'"></div></div>'+
   '<label><input type="checkbox" id="f_en" '+(p.enabled?'checked':'')+' style="width:auto"> فعال باشد</label>'+
   '<div class="err" id="f_err"></div>'+
   '<div class="row" style="margin-top:10px"><button id="f_save" onclick="prodSave('+(id||0)+')">💾 ذخیره</button><button class="gh" onclick="closeModal()">انصراف</button></div>');
}
async function prodSave(id){
  var b=$('f_save');b.disabled=true;$('f_err').textContent='';
  var cat=$('f_cat').value;
  var r=await api('/api/panel/products/save',{id:id,title:$('f_title').value,category:cat,protocol:cat==='coin'?'vless':cat,
   days:$('f_days').value,traffic_gb:$('f_gb').value,price_usd:$('f_usd').value,coin_price:$('f_coin').value,
   server_count:$('f_sc').value,enabled:$('f_en').checked});
  b.disabled=false;
  if(!r.ok){$('f_err').textContent='⛔ '+(r.error||'خطا');return}
  closeModal();flash('✅ ذخیره شد');pgProducts(0);
}
async function prodToggle(id){var r=await api('/api/panel/products/toggle',{id:id});if(!r.ok)return flash(r.error||'خطا',1);pgProducts(0)}
async function prodDel(id,t){if(!confirmAsk('حذف محصول «'+t+'»؟ این کار برگشت‌پذیر نیست.'))return;var r=await api('/api/panel/products/delete',{id:id,confirm:true});if(!r.ok)return flash(r.error||'خطا',1);flash('🗑 حذف شد');pgProducts(0)}

/* ═════ سرورها ═════ */
async function pgServers(page,q){
  var r=await api('/api/panel/servers/list',{page:page||0,q:q||''});
  if(!r.ok){$('pages').innerHTML=errBox(r.error);return}
  window.__srvs=r.items;
  var ready=r.items.filter(function(s){return s.ready&&s.active}).length;
  var h='';
  if(!r.items.filter(function(s){return s.ready&&s.active}).length)
    h+='<div class="warn">⛔ هیچ سرور واقعیِ فعالی وجود ندارد. تا ثبت host/IP، port و secret واقعی، خرید و تحویل کانفیگ متوقف است.</div>';
  h+='<div class="card"><h2>🖥 مدیریت سرورها ('+fa(r.total)+') — آمادهٔ تحویل: '+fa(ready)+'</h2>'+
   '<div class="row"><input id="sq" placeholder="جست‌وجوی نام یا هاست" value="'+esc(q||'')+'" style="flex:2;min-width:160px">'+
   '<button onclick="pgServers(0,$(\\'sq\\').value)">🔍 جست‌وجو</button>'+
   '<button class="gn" onclick="srvForm(null)">➕ سرور جدید</button></div>'+
   '<div class="hint">🧪 تست سلامت فقط دسترسی HTTP از شبکهٔ Cloudflare را می‌سنجد و معادل پینگ واقعی از داخل ایران نیست.</div></div>';
  h+='<div class="card">';
  if(!r.items.length)h+='<div class="mut">سروری ثبت نشده است.</div>';
  for(var i=0;i<r.items.length;i++){var s=r.items[i];
   var badge=s.ready?(s.active?(s.healthy?'<span class="pill ok">آماده</span>':'<span class="pill warn">ناسالم</span>'):'<span class="pill">غیرفعال</span>'):'<span class="pill bad">پیکربندی ناقص</span>';
   h+='<div class="g"><div class="row" style="justify-content:space-between"><b>'+esc(s.name)+' '+esc(s.country)+'</b>'+badge+'</div>'+
    '<div class="mut" style="direction:ltr;text-align:left">'+esc(s.protocol)+' · '+esc(s.ip||'—')+':'+(s.port||'—')+' · secret: '+(s.hasSecret?esc(s.secretMask):'—')+'</div>'+
    '<div class="mut">🚀 رتبه '+fa(s.speed_rank)+' | 🩺 '+esc(s.last_check)+'</div>'+
    (s.issues.length?'<div class="err">'+s.issues.map(function(x){return '• '+esc(x)}).join('\\n')+'</div>':'')+
    '<div class="row" style="margin-top:8px"><button class="gh" onclick="srvForm('+s.id+')">✏️ ویرایش</button>'+
    '<button class="gh" onclick="srvToggle('+s.id+')">'+(s.active?'🔴 غیرفعال':'🟢 فعال')+'</button>'+
    '<button class="gh" onclick="srvHealth('+s.id+')">🩺 تست</button>'+
    '<button class="rd" onclick="srvDel('+s.id+')">🗑 حذف</button></div></div>';
  }
  h+='</div>'+pager(r,'pgServers',q||'');
  $('pages').innerHTML=h;
}
function srvForm(id){
  var s=(window.__srvs||[]).filter(function(x){return x.id===id})[0]||{name:'',country:'',protocol:'vless',ip:'',port:443,template:'',health_url:'',speed_rank:3,active:false,hasSecret:false};
  var protos=['vless','vmess','trojan','ss','mtproto','socks5','openvpn'];
  var opts=protos.map(function(p){return '<option value="'+p+'"'+(s.protocol===p?' selected':'')+'>'+p+'</option>'}).join('');
  modal('<h2>'+(id?'✏️ ویرایش سرور':'➕ سرور جدید')+'</h2>'+
   '<div class="grid2"><div><label>نام سرور</label><input id="s_name" value="'+esc(s.name)+'"></div>'+
   '<div><label>کشور</label><input id="s_country" value="'+esc(s.country)+'" placeholder="🇩🇪 آلمان"></div></div>'+
   '<div class="grid2"><div><label>پروتکل</label><select id="s_proto">'+opts+'</select></div>'+
   '<div><label>پورت</label><input id="s_port" type="number" value="'+(s.port||443)+'"></div></div>'+
   '<label>هاست یا IP واقعی</label><input id="s_ip" value="'+esc(s.ip)+'" placeholder="mtp.mydomain.com" style="direction:ltr;text-align:left">'+
   '<label>Secret / Password / UUID '+(s.hasSecret?'(خالی = بدون تغییر)':'')+'</label>'+
   '<input id="s_secret" value="" placeholder="'+(s.hasSecret?'بدون تغییر':'برای MTProto: ۳۲ هگز یا dd/ee+هگز')+'" style="direction:ltr;text-align:left">'+
   '<label>قالب کانفیگ (خالی = پیش‌فرض)</label><textarea id="s_tpl" rows="2" style="direction:ltr;text-align:left">'+esc(s.template)+'</textarea>'+
   '<div class="grid2"><div><label>آدرس تست سلامت</label><input id="s_health" value="'+esc(s.health_url)+'" style="direction:ltr;text-align:left"></div>'+
   '<div><label>رتبه سرعت (۱=بهترین)</label><input id="s_rank" type="number" min="1" max="5" value="'+(s.speed_rank||3)+'"></div></div>'+
   '<label><input type="checkbox" id="s_active" '+(s.active?'checked':'')+' style="width:auto"> فعال باشد (فقط با پیکربندی کامل)</label>'+
   '<div class="err" id="s_err"></div>'+
   '<div class="row" style="margin-top:10px"><button id="s_save" onclick="srvSave('+(id||0)+')">💾 ذخیره</button><button class="gh" onclick="closeModal()">انصراف</button></div>');
}
async function srvSave(id){
  var b=$('s_save');b.disabled=true;$('s_err').textContent='';
  var r=await api('/api/panel/servers/save',{id:id,name:$('s_name').value,country:$('s_country').value,protocol:$('s_proto').value,
   ip:$('s_ip').value,port:$('s_port').value,secret:$('s_secret').value,template:$('s_tpl').value,
   health_url:$('s_health').value,speed_rank:$('s_rank').value,active:$('s_active').checked});
  b.disabled=false;
  if(!r.ok){$('s_err').textContent='⛔ '+(r.error||'خطا')+(r.issues?'\\n'+r.issues.map(function(x){return '• '+x}).join('\\n'):'');return}
  closeModal();flash('✅ ذخیره شد');pgServers(0);
}
async function srvToggle(id){var r=await api('/api/panel/servers/toggle',{id:id});
  if(!r.ok)return flash((r.error||'خطا')+(r.issues?' '+r.issues.join(' '):''),1); pgServers(0)}
async function srvDel(id){if(!confirmAsk('حذف این سرور؟ این کار برگشت‌پذیر نیست.'))return;var r=await api('/api/panel/servers/delete',{id:id,confirm:true});if(!r.ok)return flash(r.error||'خطا',1);flash('🗑 حذف شد');pgServers(0)}
async function srvHealth(id){flash('⏳ در حال تست…');var r=await api('/api/panel/servers/health',{id:id});
  if(!r.ok)return flash(r.error||'خطا',1); flash(r.healthy?'✅ سالم (HTTP '+r.status+') — این پینگ واقعی از ایران نیست':'⛔ ناسالم',!r.healthy); pgServers(0)}

/* ═════ کاربران ═════ */
async function pgUsers(page,q){
  var r=await api('/api/panel/users/list',{page:page||0,q:q||''});
  if(!r.ok){$('pages').innerHTML=errBox(r.error);return}
  var h='<div class="card"><h2>👥 کاربران ('+fa(r.total)+')</h2>'+
   '<div class="row"><input id="uq" placeholder="نام، یوزرنیم یا آیدی عددی" value="'+esc(q||'')+'" style="flex:2;min-width:160px">'+
   '<button onclick="pgUsers(0,$(\\'uq\\').value)">🔍 جست‌وجو</button></div></div><div class="card">';
  if(!r.items.length)h+='<div class="mut">کاربری یافت نشد.</div>';
  for(var i=0;i<r.items.length;i++){var u=r.items[i];
   h+='<div class="g"><div class="row" style="justify-content:space-between"><b>'+(u.banned?'⛔ ':'')+esc(u.first_name||u.username||u.id)+'</b>'+
    '<span class="pill'+(u.role==='super'?' ok':'')+'">'+esc(u.role)+'</span></div>'+
    '<div class="mut" style="direction:ltr;text-align:left">ID '+u.id+(u.username?' · @'+esc(u.username):'')+'</div>'+
    '<div class="mut">👛 '+toman(u.balance)+' | 🪙 '+fa(u.coins)+' | 💵 خرید: '+toman(u.total_paid)+' | 👥 '+fa(u.invited_count)+'</div>'+
    '<div class="mut">🕐 عضویت: '+esc(u.created_at)+' | آخرین بازدید: '+esc(u.last_seen)+'</div>'+
    '<div class="row" style="margin-top:8px"><button class="gh" onclick="usrDetail('+u.id+')">👁 جزئیات</button>'+
    '<button class="gh" onclick="usrAct('+u.id+',\\'balance\\')">💳 کیف پول</button>'+
    '<button class="gh" onclick="usrAct('+u.id+',\\'coins\\')">🪙 سکه</button>'+
    '<button class="gh" onclick="usrAct('+u.id+',\\'message\\')">✉️ پیام</button>'+
    (u.role==='user'?'<button class="rd" onclick="usrBan('+u.id+')">'+(u.banned?'🟢 رفع بن':'⛔ بن')+'</button>':'')+
    '</div></div>';
  }
  h+='</div>'+pager(r,'pgUsers',q||'');
  $('pages').innerHTML=h;
}
async function usrDetail(id){
  var r=await api('/api/panel/users/detail',{id:id});
  if(!r.ok)return flash(r.error||'خطا',1);
  var u=r.user;
  var h='<h2>👤 '+esc(u.first_name||u.id)+'</h2><div class="mut" style="direction:ltr;text-align:left">ID '+u.id+'</div>'+
   '<div class="g">👛 '+toman(u.balance)+' · 🪙 '+fa(u.coins)+' · 💵 '+toman(u.total_paid)+'<br>👥 دعوت: '+fa(u.invited_count)+' · معرف: '+(u.referrer_id||'—')+' · تست رایگان: '+(u.trial_used?'مصرف‌شده':'نشده')+'</div>'+
   '<h2>📦 اشتراک‌ها</h2><div class="g">'+(r.subs.length?r.subs.map(function(s){return '• '+esc(s.title)+' — تا '+esc(s.expire_at)+(s.active?' 🟢':' 🔴')}).join('<br>'):'<span class="mut">ندارد</span>')+'</div>'+
   '<h2>🧾 سفارش‌ها</h2><div class="g">'+(r.orders.length?r.orders.map(function(o){return '#'+o.id+' '+esc(o.title)+' — '+toman(o.amount_toman)+' — '+esc(o.status)}).join('<br>'):'<span class="mut">ندارد</span>')+'</div>'+
   '<div class="row"><button class="gh" onclick="closeModal()">بستن</button></div>';
  modal(h);
}
async function usrAct(id,action){
  var v;
  if(action==='message'){v=prompt('متن پیام به کاربر:');if(!v)return}
  else{v=prompt(action==='coins'?'تعداد سکه (منفی = کسر):':'مبلغ تومان (منفی = کسر):');if(v===null)return;
       if(!confirmAsk('اعمال '+v+' برای کاربر '+id+'؟'))return}
  var r=await api('/api/panel/users/action',{id:id,action:action,value:v});
  if(!r.ok)return flash(r.error||'خطا',1);
  flash('✅ انجام شد');pgUsers(0);
}
async function usrBan(id){if(!confirmAsk('تغییر وضعیت بن این کاربر؟'))return;var r=await api('/api/panel/users/action',{id:id,action:'ban'});if(!r.ok)return flash(r.error||'خطا',1);pgUsers(0)}

/* ═════ سفارش‌ها ═════ */
async function pgOrders(page,status){
  var r=await api('/api/panel/orders/list',{page:page||0,status:status||''});
  if(!r.ok){$('pages').innerHTML=errBox(r.error);return}
  var f=['','paid','pending','rejected'],lab={'':'همه',paid:'پرداخت‌شده',pending:'در انتظار',rejected:'ردشده'};
  var h='<div class="card"><h2>🧾 سفارش‌ها ('+fa(r.total)+')</h2><div class="row">'+
   f.map(function(x){return '<button class="'+(x===(status||'')?'':'gh')+'" onclick="pgOrders(0,\\''+x+'\\')">'+lab[x]+'</button>'}).join('')+'</div></div>';
  h+='<div class="card"><table><tr><th>#</th><th>کاربر</th><th>عنوان</th><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th></tr>';
  for(var i=0;i<r.items.length;i++){var o=r.items[i];
   h+='<tr><td>'+o.id+'</td><td>'+esc(o.who)+'</td><td>'+esc(o.title)+'</td><td>'+toman(o.amount)+'</td>'+
    '<td>'+(o.status==='paid'?'🟢':o.status==='pending'?'🟡':'🔴')+'</td><td class="mut">'+esc(o.created_at)+'</td></tr>';
  }
  if(!r.items.length)h+='<tr><td colspan="6" class="mut">سفارشی یافت نشد.</td></tr>';
  h+='</table></div>'+pager(r,'pgOrders',status||'');
  $('pages').innerHTML=h;
}

/* ═════ فیش‌ها ═════ */
async function pgReceipts(page,status){
  status=status||'pending';
  var r=await api('/api/panel/receipts/list',{page:page||0,status:status});
  if(!r.ok){$('pages').innerHTML=errBox(r.error);return}
  var f=['pending','approved','rejected'],lab={pending:'در صف',approved:'تاییدشده',rejected:'ردشده'};
  var h='<div class="card"><h2>💳 فیش‌ها ('+fa(r.total)+')</h2><div class="row">'+
   f.map(function(x){return '<button class="'+(x===status?'':'gh')+'" onclick="pgReceipts(0,\\''+x+'\\')">'+lab[x]+'</button>'}).join('')+'</div></div><div class="card">';
  if(!r.items.length)h+='<div class="mut">فیشی در این وضعیت نیست.</div>';
  for(var i=0;i<r.items.length;i++){var c=r.items[i];
   h+='<div class="g"><div class="row" style="justify-content:space-between"><b>#'+c.id+' — '+esc(c.who)+'</b><span class="pill">'+toman(c.amount)+'</span></div>'+
    '<div class="mut">'+esc(c.title)+' · '+esc(c.created_at)+'</div>'+
    '<div class="mut" style="white-space:pre-wrap">🤖 '+esc(c.ai_report||'—')+'</div>'+
    (status==='pending'?'<div class="row" style="margin-top:8px"><button class="gn" onclick="rcpAct('+c.id+',\\'approve\\')">✅ تایید و تحویل</button>'+
     '<button class="rd" onclick="rcpAct('+c.id+',\\'reject\\')">❌ رد</button></div>':'')+'</div>';
  }
  h+='</div>'+pager(r,'pgReceipts',status);
  $('pages').innerHTML=h;
}
async function rcpAct(id,act){
  if(!confirmAsk(act==='approve'?'فیش #'+id+' تایید و سفارش تحویل شود؟':'فیش #'+id+' رد شود؟'))return;
  flash('⏳ در حال پردازش…');
  var r=await api('/api/panel/receipts/'+act,{id:id});
  if(!r.ok)return flash('⛔ '+(r.error||'خطا')+(r.issues?' '+r.issues.join(' '):''),1);
  if(act==='approve'&&r.kind==='order'&&!r.delivered)flash('⚠️ تایید شد اما تحویل خودکار انجام نشد: '+(r.deliveryReason||'نامشخص'),1);
  else flash('✅ انجام شد');
  pgReceipts(0,'pending');
}

/* ═════ گروه‌ها ═════ */
async function pgGroups(){
  var r=await api('/api/panel/state');
  if(!r.ok){$('pages').innerHTML=errBox(r.error);return}
  var h='<div class="card"><h2>➕ افزودن گروه</h2><div class="row">'+
   '<input id="ng_id" placeholder="آیدی عددی (مثل -1001234567890)" style="flex:2;min-width:180px">'+
   '<input id="ng_title" placeholder="نام (اختیاری)" style="flex:1;min-width:130px">'+
   '<button onclick="addGroup()">افزودن</button></div>'+
   '<div class="hint">گروه‌هایی که بات در آن‌ها عضو شود، خودکار ثبت می‌شوند.</div></div>';
  h+='<div class="card"><h2>📢 گروه‌ها ('+fa(r.groups.length)+')</h2>';
  if(!r.groups.length)h+='<div class="mut">هنوز گروهی ثبت نشده است.</div>';
  for(var i=0;i<r.groups.length;i++){var g=r.groups[i];
   h+='<div class="g"><b>'+(g.enabled?'🟢':'🔴')+' '+esc(g.title)+'</b>'+
    '<div class="mut" style="direction:ltr;text-align:left">'+esc(g.chat_id)+' · '+esc(g.last_post)+'</div>'+
    '<div class="row" style="margin-top:8px">'+
    '<button class="gh" onclick="grpAct(\\'toggle\\',\\''+g.chat_id+'\\')">'+(g.enabled?'غیرفعال':'فعال')+'</button>'+
    '<button class="gh" onclick="grpAct(\\'post\\',\\''+g.chat_id+'\\')">📣 پست فوری</button>'+
    '<button class="gh" onclick="grpRename(\\''+g.chat_id+'\\')">✏️ نام</button>'+
    '<button class="gh" onclick="grpMsg(\\''+g.chat_id+'\\')">✉️ پیام</button>'+
    '<button class="rd" onclick="grpDel(\\''+g.chat_id+'\\')">🗑 حذف</button></div></div>';
  }
  h+='<div class="row"><button onclick="postAll()">📣 پست در همه گروه‌ها</button><button class="gh" onclick="pgGroups()">🔄 بروزرسانی</button></div></div>';
  h+='<div class="card"><h2>✉️ پیام همگانی به گروه‌ها</h2><textarea id="bmsg" rows="3" placeholder="متن (HTML مجاز)"></textarea>'+
   '<div class="row" style="margin-top:8px"><button onclick="bcast()">ارسال به همه گروه‌های فعال</button></div></div>';
  $('pages').innerHTML=h;
}
async function addGroup(){var r=await api('/api/panel/group/add',{chat_id:$('ng_id').value.trim(),title:$('ng_title').value.trim()});if(!r.ok)return flash(r.error||'خطا',1);flash('✅ افزوده شد');pgGroups()}
async function grpAct(a,id){var r=await api('/api/panel/group/'+a,{chat_id:id});if(!r.ok)return flash(r.error||'خطا',1);pgGroups()}
async function grpRename(id){var t=prompt('نام جدید گروه:');if(!t)return;await api('/api/panel/group/rename',{chat_id:id,title:t});pgGroups()}
async function grpDel(id){if(!confirmAsk('حذف این گروه؟'))return;await api('/api/panel/group/delete',{chat_id:id});flash('🗑 حذف شد');pgGroups()}
async function grpMsg(id){var t=prompt('متن پیام به این گروه:');if(!t)return;var r=await api('/api/panel/group/message',{chat_id:id,text:t});flash(r.ok?'✅ ارسال شد':'⛔ ناموفق',!r.ok)}
async function postAll(){var r=await api('/api/panel/group/postall');flash('✅ ارسال به '+fa(r.count||0)+' گروه');pgGroups()}
async function bcast(){var t=$('bmsg').value.trim();if(!t)return;if(!confirmAsk('ارسال به همهٔ گروه‌های فعال؟'))return;var r=await api('/api/panel/group/message',{text:t});flash('✅ ارسال به '+fa(r.count||0)+' گروه');$('bmsg').value=''}

/* ═════ تنظیمات ═════ */
async function pgSettings(){
  var r=await api('/api/panel/state');
  if(!r.ok){$('pages').innerHTML=errBox(r.error);return}
  var s=r.settings;
  function tog(k,l){return '<label>'+l+'</label><select id="c_'+k+'"><option value="1"'+(s[k]==='1'?' selected':'')+'>فعال</option><option value="0"'+(s[k]!=='1'?' selected':'')+'>غیرفعال</option></select>'}
  function num(k,l){return '<label>'+l+'</label><input id="c_'+k+'" value="'+esc(s[k])+'">'}
  var models=(r.models||[]).map(function(m){return '<option value="'+esc(m)+'"'+(s.ai_model===m?' selected':'')+'>'+esc(m)+'</option>'}).join('');
  var h='<div class="card"><h2>🤖 هوش مصنوعی</h2>'+
   tog('ai_enabled','چت هوش مصنوعی')+
   '<label>مدل Workers AI (خالی = زنجیرهٔ پیش‌فرض)</label><select id="c_ai_model"><option value="">پیش‌فرض (خودکار)</option>'+models+'</select>'+
   num('ai_price_coins','هزینهٔ هر پیام (سکه)')+
   '<div class="row" style="margin-top:10px"><button class="gh" id="aiTestBtn" onclick="aiTest()">🧪 تست اتصال هوش مصنوعی</button></div>'+
   '<div id="aiRes" class="mut" style="margin-top:8px;white-space:pre-wrap"></div></div>';
  h+='<div class="card"><h2>💰 قیمت‌گذاری</h2>'+num('usd_rate_manual','نرخ دلار دستی (۰ = خودکار)')+num('margin','ضریب سود')+
   num('referral_percent','درصد پاداش رفرال')+num('referral_goal','هدف تعداد دعوت')+
   num('card_number','شماره کارت')+num('card_holder','نام صاحب کارت')+'</div>';
  h+='<div class="card"><h2>🔀 فعال/غیرفعال</h2><div class="grid2">'+
   '<div>'+tog('shop_enabled','فروشگاه')+tog('trial_enabled','تست رایگان')+tog('card_pay_enabled','پرداخت کارتی')+tog('wallet_enabled','کیف پول')+'</div>'+
   '<div>'+tog('game_enabled','مینی‌اپ')+tog('referral_enabled','رفرال')+tog('auto_verify','تایید خودکار فیش')+tog('group_ai_enabled','AI در گروه')+'</div>'+
   '</div></div>';
  h+='<div class="card"><h2>📢 تبلیغات گروه</h2>'+tog('group_welcome_enabled','خوش‌آمدگویی')+num('ad_interval_hours','فاصله پست (ساعت)')+
   '<label>متن تبلیغ</label><textarea id="c_ad_text" rows="3">'+esc(s.ad_text)+'</textarea></div>';
  h+='<div class="row"><button id="setSave" onclick="saveSettings()">💾 ذخیره تنظیمات</button></div>'+
   '<div class="okmsg" id="setOk"></div><div class="err" id="setErr"></div>';
  h+='<div class="card" style="margin-top:14px"><h2>✍️ متن‌های بات</h2><div id="textsBox" class="mut">در حال بارگذاری…</div></div>';
  h+='<div class="card"><h2>🔐 تغییر رمز پنل</h2><input id="npw" inputmode="numeric" maxlength="10" placeholder="رمز جدید — دقیقاً ۱۰ رقم">'+
   '<div class="hint">رمز باید دقیقاً ۱۰ رقم عددی باشد.</div><div class="err" id="perr"></div>'+
   '<div class="row" style="margin-top:8px"><button onclick="chpw()">تغییر رمز</button></div></div>';
  $('pages').innerHTML=h;
  loadTexts();
}
var SETTING_KEYS=['ai_enabled','ai_model','ai_price_coins','usd_rate_manual','margin','referral_percent','referral_goal','card_number','card_holder','shop_enabled','trial_enabled','card_pay_enabled','wallet_enabled','game_enabled','referral_enabled','auto_verify','group_ai_enabled','group_welcome_enabled','ad_interval_hours','ad_text'];
async function saveSettings(){
  var b=$('setSave');b.disabled=true;$('setErr').textContent='';$('setOk').textContent='';
  var payload={};
  for(var i=0;i<SETTING_KEYS.length;i++){var el=$('c_'+SETTING_KEYS[i]);if(el)payload[SETTING_KEYS[i]]=el.value}
  var r=await api('/api/panel/settings',payload);
  b.disabled=false;
  if(!r.ok){$('setErr').textContent='⛔ '+(r.error||'خطا');return}
  $('setOk').textContent='✅ ذخیره شد ('+fa(r.saved)+' مورد)';
}
async function loadTexts(){
  var r=await api('/api/panel/texts',{});
  var box=$('textsBox');if(!box)return;
  if(!r.ok){box.innerHTML='<span class="err">'+esc(r.error||'خطا')+'</span>';return}
  box.innerHTML=r.items.map(function(t){
    return '<div class="g"><label>'+esc(t.key)+'</label><textarea id="t_'+t.key+'" rows="3">'+esc(t.value)+'</textarea>'+
     '<div class="row" style="margin-top:6px"><button class="gh" onclick="saveText(\\''+t.key+'\\')">💾 ذخیره</button></div></div>';
  }).join('');
}
async function saveText(k){var r=await api('/api/panel/texts',{save:true,key:k,value:$('t_'+k).value});flash(r.ok?'✅ ذخیره شد':'⛔ '+(r.error||'خطا'),!r.ok)}
async function aiTest(){
  var b=$('aiTestBtn');b.disabled=true;$('aiRes').innerHTML='<span class="spin"></span> در حال تست…';
  var r=await api('/api/panel/ai/test');
  b.disabled=false;
  if(!r.ok){$('aiRes').textContent='⛔ '+(r.error||'خطا');return}
  var d=r.diag;
  $('aiRes').textContent=(d.ok?'✅ ':'⛔ ')+d.message+'\\nbinding: '+(d.bound?'موجود':'موجود نیست')+
   (d.model?'\\nمدل پاسخ‌گو: '+d.model:'')+(d.tried&&d.tried.length?'\\nمدل‌های آزمایش‌شده: '+d.tried.join(', '):'')+
   (d.ms?'\\nزمان: '+d.ms+'ms':'')+(d.error?'\\nکد خطا: '+d.error:'')+(d.sample?'\\nنمونه پاسخ: '+d.sample:'');
}
async function chpw(){var pw=$('npw').value.trim();if(!/^[0-9]{10}$/.test(pw)){$('perr').textContent='⛔ رمز باید دقیقاً ۱۰ رقم عددی باشد.';return}
 if(!confirmAsk('رمز پنل تغییر کند؟'))return;
 var r=await api('/api/panel/password',{password:pw});$('perr').textContent=r.ok?'':'⛔ '+(r.error||'خطا');if(r.ok){flash('✅ رمز تغییر کرد');$('npw').value=''}}

/* ═════ مودال ═════ */
function modal(inner){closeModal();var d=document.createElement('div');d.className='modal';d.id='modalBox';
 d.innerHTML='<div class="card">'+inner+'</div>';d.onclick=function(e){if(e.target===d)closeModal()};document.body.appendChild(d)}
function closeModal(){var m=$('modalBox');if(m)m.remove()}

var tb=document.querySelectorAll('.tabs button');
for(var i=0;i<tb.length;i++){tb[i].onclick=function(){go(this.dataset.p)}}
$('pw').addEventListener('keydown',function(e){if(e.key==='Enter')login()});
(async function(){var r=await api('/api/panel/state');if(r.ok){$('login').classList.add('hidden');$('app').classList.remove('hidden');$('tabs').classList.remove('hidden');go('dash')}})();
</script></body></html>`;
