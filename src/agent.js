// ═══════════════════════════════════════════════════════════════════
//  بخش ۶ — AI Agent «مدیر» با Function Calling (src/agent.js)
//
//  مدل پیش‌فرض از زنجیرهٔ معتبر src/ai.js گرفته می‌شود
//  (@cf/meta/llama-3.3-70b-instruct-fp8-fast) — همان لایهٔ ai.js با fallback.
//
//  قوانین امنیتی اجباری (سمت سرور، نه اعتماد به خروجی مدل):
//   • فقط ادمین (super/admin) می‌تواند دستور بدهد؛ سطح دسترسیِ هر ابزار
//     سمت سرور با hasPerm بررسی می‌شود.
//   • عملیات مخرب/مالی فقط با «autoconfirm» صریح اجرا می‌شود؛ در غیر این‌صورت
//     به‌صورت pending ثبت و متوقف می‌شود تا ادمین تأیید کند.
//   • هیچ ابزاری اجازهٔ خواندن/تغییر توکن بات یا رمز پنل را ندارد (allowlist).
//   • سقف عملیات در هر درخواست (ai_agent_max_ops).
//   • همهٔ اقدامات در جدول ai_actions لاگ می‌شوند؛ برخی undoable هستند.
//
//  ⚠️ صداقت فنی: منطق اجرا/اعتبارسنجی/لاگ/undo با موک AI لوکال تست شده است.
//  عملکرد واقعی مدلِ function-calling فقط روی Workers AI با همان مدل
//  مشخص می‌شود؛ بدون بایندینگ AI خطای تمیز برمی‌گردد (نه کرش و نه سکه کسر).
// ═══════════════════════════════════════════════════════════════════
import { getUser, isAdmin, hasPerm, addBalance, setSetting, getSetting, todayStr } from './db.js';
import { getNum, isEnabled, getSettingValue } from './texts.js';
import { aiChatComplete, aiAvailable } from './ai.js';

const now = () => Math.floor(Date.now() / 1000);

/** کلیدهایی که AI هرگز نمی‌تواند بخواند/تغییر دهد */
export const FORBIDDEN_SETTING_KEYS = new Set([
  'telegram_bot_token', 'panel_password', 'tunnel_ws_path',
  'session_sign_key', 'reality_private_key',
]);

/** اهداف مالی/مخرب — حتماً به تأیید صریح نیاز دارند */
const FINANCIAL_TOOLS = new Set(['adjust_balance', 'adjust_coins', 'create_discount_code']);
const DESTRUCTIVE_TOOLS = new Set([
  'toggle_server', 'update_product', 'scale_product_prices',
  'apply_clean_ip', 'ban_user', 'update_setting',
]);

function confirmRequired(tool) {
  return DESTRUCTIVE_TOOLS.has(tool) || FINANCIAL_TOOLS.has(tool);
}

/** ابزارهایی که داخل execTool خودشان لاگ می‌شوند (تا دوبار لاگ نشوند) */
const SELF_LOGGED = new Set([
  'adjust_balance', 'adjust_coins', 'toggle_server', 'update_product',
  'scale_product_prices', 'apply_clean_ip', 'update_setting',
]);

// ═══════════════════════ تعریف ابزارها ═══════════════════════
const TOOLS = [
  {
    name: 'get_stats',
    description: 'آمار کلی فروشگاه: تعداد کاربران، سفارش‌ها، پرداخت‌های موفق، فیش‌های در انتظار و موجودی کل.',
    perm: 'stats',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_products',
    description: 'لیست محصولات فعال فروشگاه (آیدی، عنوان، قیمت دلاری و زمان فعال‌بودن).',
    perm: 'products',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_servers',
    description: 'لیست سرورها (آیدی، نام، کشور، پروتکل، هاست و فعال/سالم بودن).',
    perm: 'products',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'find_user',
    description: 'یافتن کاربر با آیدی عددی تلگرام یا یوزرنیم و دیدن موجودی/سکه/سطح.',
    perm: 'users',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'آیدی عددی تلگرام (اختیاری)' },
        username: { type: 'string', description: 'یوزرنیم بدون @ (اختیاری)' },
      },
      required: [],
    },
  },
  {
    name: 'adjust_balance',
    description: 'افزایش/کاهش موجودی کیف پول یک کاربر به تومان. مقدار منفی یعنی کسر. فقط برای ادمین سطح بالا؛ نیاز به تأیید.',
    perm: null, financial: true,
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'integer' },
        delta: { type: 'integer', description: 'مقدار تومان (می‌تواند منفی باشد)' },
        note: { type: 'string' },
      },
      required: ['user_id', 'delta'],
    },
  },
  {
    name: 'adjust_coins',
    description: 'افزایش/کاهش سکهٔ مینی‌اپ کاربر. نیاز به تأیید.',
    perm: null, financial: true,
    parameters: {
      type: 'object',
      properties: { user_id: { type: 'integer' }, delta: { type: 'integer' }, note: { type: 'string' } },
      required: ['user_id', 'delta'],
    },
  },
  {
    name: 'toggle_server',
    description: 'فعال/غیرفعال کردن یک سرور با آیدی. خاموش‌کردن سرور مخرب است و تأیید می‌خواهد.',
    perm: 'products', destructive: true,
    parameters: {
      type: 'object',
      properties: { server_id: { type: 'integer' }, active: { type: 'boolean' } },
      required: ['server_id'],
    },
  },
  {
    name: 'update_product',
    description: 'به‌روزرسانی فیلدهای یک محصول (title, price_usd, days, traffic_gb, enabled). مخرب؛ نیاز به تأیید.',
    perm: 'products', destructive: true,
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'integer' },
        fields: { type: 'object', description: 'فیلدهای قابل تغییر: title, price_usd, days, traffic_gb, enabled' },
      },
      required: ['product_id', 'fields'],
    },
  },
  {
    name: 'scale_product_prices',
    description: 'ضرب درصدی قیمت همهٔ محصولات یک پروتکل یا همه (مثلاً کم‌کردن ۱۰٪). مخرب؛ نیاز به تأیید.',
    perm: 'products', destructive: true,
    parameters: {
      type: 'object',
      properties: {
        percent: { type: 'number', description: 'درصد تغییر؛ مثبت = گران‌تر، منفی = ارزان‌تر (مثلاً -10)' },
        protocol: { type: 'string', description: 'فقط این پروتکل (اختیاری؛ خالی = همه)' },
      },
      required: ['percent'],
    },
  },
  {
    name: 'apply_clean_ip',
    description: 'اعمال بهترین IP تمیز روی سرورهای یک پروتکل. مخرب (تغییر ستون clean_ip)؛ نیاز به تأیید.',
    perm: 'products', destructive: true,
    parameters: {
      type: 'object',
      properties: { protocol: { type: 'string', description: 'مثلاً vless' }, limit: { type: 'integer' } },
      required: ['protocol'],
    },
  },
  {
    name: 'get_clean_ip_report',
    description: 'گزارش مخزن IP تمیز: تعداد سالم، میانگین امتیاز، بهترین ۵ IP.',
    perm: 'settings',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_setting',
    description: 'به‌روزرسانی یک تنظیم غیرحساس (فهرست مجاز). هرگز توکن/رمز. مخرب؛ نیاز به تأیید.',
    perm: 'settings', destructive: true,
    parameters: {
      type: 'object',
      properties: { key: { type: 'string' }, value: { type: 'string' } },
      required: ['key', 'value'],
    },
  },
];

const TOOL_MAP = {};
for (const t of TOOLS) TOOL_MAP[t.name] = t;

export { TOOLS };

// ═══════════════════════ لاگ ai_actions ═══════════════════════
async function logAction(db, user, tool, args, summary, status, prev = null, undoable = 0) {
  const res = await db
    .prepare(
      'INSERT INTO ai_actions (user_id, role, tool, args, summary, status, prev, undoable, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    )
    .bind(user.id, user.role, tool, JSON.stringify(args || {}), String(summary || ''), status, prev === null ? 'null' : JSON.stringify(prev), undoable ? 1 : 0, now())
    .run();
  return res;
}

async function lastActionId(db, tool, user) {
  const r = await db
    .prepare("SELECT id FROM ai_actions WHERE user_id=? AND tool=? AND status='done' ORDER BY id DESC LIMIT 1")
    .bind(user.id, tool)
    .first();
  return r?.id || null;
}

/** فهرست اقدامات AI برای مرور (پنل/ادمین) */
export async function listAiActions(db, limit = 30) {
  const rows = await db.prepare('SELECT * FROM ai_actions ORDER BY id DESC LIMIT ?').bind(Math.min(200, Math.max(1, limit))).all();
  return (rows.results || []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    role: r.role,
    tool: r.tool,
    summary: r.summary,
    status: r.status,
    undoable: !!r.undoable,
    undid_at: r.undid_at,
    created_at: r.created_at,
    args: (() => { try { return JSON.parse(r.args || '{}'); } catch { return {}; } })(),
  }));
}

// ═══════════════════════ اجرای ابزارها ═══════════════════════
const EDITABLE_PRODUCT_FIELDS = ['title', 'price_usd', 'days', 'traffic_gb', 'enabled'];
const EDITABLE_SETTING_KEYS = new Set([
  'margin', 'usd_rate_manual', 'referral_percent', 'shop_enabled', 'trial_enabled',
  'ai_enabled', 'probe_enabled', 'probe_reward_coins', 'ai_agent_enabled',
  'card_number', 'card_holder', 'tunnel_enabled', 'auto_verify',
]);

async function execTool(env, user, tool, args) {
  const { DB } = env;
  const summary = tool.summary || `${tool.name}(${JSON.stringify(args)})`;

  switch (tool.name) {
    case 'get_stats': {
      const users = (await DB.prepare('SELECT COUNT(*) c FROM users').first())?.c || 0;
      const subs = (await DB.prepare('SELECT COUNT(*) c FROM subscriptions').first())?.c || 0;
      const orders = (await DB.prepare("SELECT COUNT(*) c FROM orders WHERE status='paid'").first())?.c || 0;
      const pendingReceipts = (await DB.prepare("SELECT COUNT(*) c FROM receipts WHERE status='pending'").first())?.c || 0;
      return { ok: true, users, subs, paidOrders: orders, pendingReceipts };
    }
    case 'list_products': {
      const rows = (await DB.prepare('SELECT id,title,category,days,traffic_gb,price_usd,enabled FROM products ORDER BY sort,id').all()).results;
      return { ok: true, products: rows };
    }
    case 'list_servers': {
      const rows = (await DB.prepare('SELECT id,name,country,protocol,ip,active,healthy FROM servers ORDER BY id').all()).results;
      return { ok: true, servers: rows };
    }
    case 'find_user': {
      let u = null;
      if (args.id) u = await getUser(DB, Number(args.id));
      if (!u && args.username) {
        const un = String(args.username).replace(/^@/, '');
        u = await DB.prepare('SELECT * FROM users WHERE lower(username)=?').bind(String(un).toLowerCase()).first();
      }
      if (!u) return { ok: false, error: 'کاربر یافت نشد' };
      return { ok: true, user: { id: u.id, username: u.username, role: u.role, balance: u.balance, coins: u.coins, banned: !!u.banned } };
    }
    case 'adjust_balance': {
      const uid = Number(args.user_id);
      const target = await getUser(DB, uid);
      if (!target) return { ok: false, error: 'کاربر یافت نشد' };
      const delta = Math.round(Number(args.delta) || 0);
      if (delta === 0) return { ok: false, error: 'مقدار تغییر صفر است' };
      const prevBal = Number(target.balance || 0);
      await addBalance(DB, uid, delta);
      await logAction(DB, user, 'adjust_balance', args, `موجودی کاربر ${uid}: ${prevBal} → ${prevBal + delta}`, 'done', { balance: prevBal }, 1);
      return { ok: true, userId: uid, from: prevBal, to: prevBal + delta, undoableAction: await lastActionId(DB, 'adjust_balance', user) };
    }
    case 'adjust_coins': {
      const uid = Number(args.user_id);
      const target = await getUser(DB, uid);
      if (!target) return { ok: false, error: 'کاربر یافت نشد' };
      const delta = Math.round(Number(args.delta) || 0);
      if (delta === 0) return { ok: false, error: 'مقدار تغییر صفر است' };
      const prevCoins = Number(target.coins || 0);
      await DB.prepare('UPDATE users SET coins = coins + ? WHERE id=?').bind(delta, uid).run();
      await logAction(DB, user, 'adjust_coins', args, `سکه کاربر ${uid}: ${prevCoins} → ${prevCoins + delta}`, 'done', { coins: prevCoins }, 1);
      return { ok: true, userId: uid, from: prevCoins, to: prevCoins + delta, undoableAction: await lastActionId(DB, 'adjust_coins', user) };
    }
    case 'toggle_server': {
      const sid = Number(args.server_id);
      const s = await DB.prepare('SELECT * FROM servers WHERE id=?').bind(sid).first();
      if (!s) return { ok: false, error: 'سرور یافت نشد' };
      const active = args.active === undefined ? !s.active : !!args.active;
      await DB.prepare('UPDATE servers SET active=? WHERE id=?').bind(active ? 1 : 0, sid).run();
      await logAction(DB, user, 'toggle_server', args, `سرور ${sid} (${s.name}) ${active ? 'فعال' : 'غیرفعال'} شد`, 'done', { active: s.active }, 1);
      return { ok: true, server_id: sid, active };
    }
    case 'update_product': {
      const pid = Number(args.product_id);
      const p = await DB.prepare('SELECT * FROM products WHERE id=?').bind(pid).first();
      if (!p) return { ok: false, error: 'محصول یافت نشد' };
      const f = args.fields || {};
      const sets = [];
      const vals = [];
      const applied = {};
      for (const k of Object.keys(f)) {
        if (!EDITABLE_PRODUCT_FIELDS.includes(k)) continue;
        sets.push(`${k}=?`);
        vals.push(String(f[k]));
        applied[k] = f[k];
      }
      if (!sets.length) return { ok: false, error: 'هیچ فیلد مجازی ارسال نشد' };
      vals.push(pid);
      await DB.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id=?`).bind(...vals).run();
      const prev = { id: p.id, title: p.title, price_usd: p.price_usd, days: p.days, traffic_gb: p.traffic_gb, enabled: p.enabled };
      await logAction(DB, user, 'update_product', args, `محصول ${pid} به‌روزرسانی شد`, 'done', prev, 1);
      return { ok: true, product_id: pid, applied };
    }
    case 'scale_product_prices': {
      const percent = Number(args.percent);
      if (!Number.isFinite(percent) || percent === 0) return { ok: false, error: 'درصد نامعتبر' };
      let rows;
      if (args.protocol) rows = (await DB.prepare('SELECT id,price_usd FROM products WHERE protocol=?').bind(args.protocol).all()).results;
      else rows = (await DB.prepare('SELECT id,price_usd FROM products').all()).results;
      if (!rows.length) return { ok: false, error: 'محصولی یافت نشد' };
      const factor = (100 + percent) / 100;
      const prev = {};
      for (const r of rows) {
        prev[r.id] = Number(r.price_usd || 0);
        await DB.prepare('UPDATE products SET price_usd=? WHERE id=?').bind(Math.max(0, Math.round(prev[r.id] * factor * 1000) / 1000), r.id).run();
      }
      await logAction(DB, user, 'scale_product_prices', args, `قیمت ${rows.length} محصول ${percent > 0 ? 'افزایش' : 'کاهش'} یافت (${percent}٪)`, 'done', prev, 1);
      return { ok: true, count: rows.length, factor };
    }
    case 'apply_clean_ip': {
      const { applyBestCleanIps } = await import('./cleanip.js');
      const n = await applyBestCleanIps(env, String(args.protocol), Number(args.limit) || 10);
      if (n === 0) return { ok: false, error: 'IP تمیز یا سرور فعالی برای اعمال یافت نشد' };
      await logAction(DB, user, 'apply_clean_ip', args, `بهترین IP تمیز روی ${n} سرور ${args.protocol} اعمال شد`, 'done', null, 0);
      return { ok: true, applied: n };
    }
    case 'get_clean_ip_report': {
      const healthy = (await DB.prepare('SELECT COUNT(*) c FROM clean_ips WHERE active=1').first())?.c || 0;
      const avg = (await DB.prepare('SELECT AVG(score) m FROM clean_ips WHERE active=1').first())?.m || 0;
      const best = (await DB.prepare('SELECT ip,score,samples FROM clean_ips WHERE active=1 ORDER BY score DESC LIMIT 5').all()).results;
      return { ok: true, healthy, avgScore: Math.round(avg * 10) / 10, best };
    }
    case 'update_setting': {
      const key = String(args.key || '');
      if (FORBIDDEN_SETTING_KEYS.has(key) || !EDITABLE_SETTING_KEYS.has(key)) {
        await logAction(DB, user, 'update_setting', args, `تلاش نامعتبر برای تغییر تنظیم «${key}»`, 'blocked', null, 0);
        return { ok: false, error: `تغییر تنظیم «${key}» مجاز نیست (کلید حساس یا خارج از allowlist)` };
      }
      const prev = await getSetting(DB, key, '');
      await setSetting(DB, key, String(args.value));
      await logAction(DB, user, 'update_setting', args, `تنظیم «${key}» تغییر کرد`, 'done', { value: prev }, 1);
      return { ok: true, key, to: String(args.value) };
    }
    default:
      return { ok: false, error: `ابزار «${tool.name}» پیاده نشده است` };
  }
}

// ═══════════════════════ استخراج خروجی مدل ═══════════════════════
function extractToolCalls(out) {
  if (!out || typeof out !== 'object') return [];
  const scan = (node) => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node.tool_calls)) return node.tool_calls;
    const out2 = [];
    for (const k of Object.keys(node)) {
      if (Array.isArray(node[k])) out2.push(...node[k].flatMap((x) => scan(x)));
    }
    return out2;
  };
  const calls = [];
  if (Array.isArray(out.tool_calls)) calls.push(...out.tool_calls);
  if (Array.isArray(out.choices)) for (const c of out.choices) calls.push(...scan(c.message));
  if (out.result && typeof out.result === 'object') {
    if (Array.isArray(out.result.choices)) for (const c of out.result.choices) calls.push(...scan(c.message));
    calls.push(...scan(out.result));
  }
  if (out.message) calls.push(...scan(out.message));
  return calls;
}

function extractText(out) {
  if (!out || typeof out !== 'object') return '';
  const t = (n) => {
    if (!n || typeof n !== 'object') return '';
    if (typeof n.content === 'string') return n.content;
    if (typeof n.response === 'string') return n.response;
    if (typeof n.text === 'string') return n.text;
    return '';
  };
  let s = t(out);
  if (!s && Array.isArray(out.choices) && out.choices[0]) s = t(out.choices[0].message) || t(out.choices[0]);
  if (!s && out.result) s = t(out.result);
  if (!s && Array.isArray(out.choices) && out.choices[0]?.message?.content && Array.isArray(out.choices[0].message.content)) {
    s = out.choices[0].message.content.map((p) => p?.text || p?.content || '').join('');
  }
  return String(s || '');
}

const AGENT_SYSTEM =
  'تو «مدیر هوشمند» فروشگاه کانفیگ AMINCK هستی و فقط با درخواست ادمین کار می‌کنی. ' +
  'وقتی ادمین درخواستی مثل «قیمت‌ها ۱۰٪ کم شود» یا «به کاربر X شارژ بده» دارد، ' +
  'ابزار مناسب را با آرگومان‌های دقیق صدا کن. اگر ابزاری نیاز به تأیید دارد خودت اجرا نمی‌کنی؛ ' +
  'خلاصه را برای تأیید ادمین بده. اگر مطمئن نیستی یا اطلاعات ناقص بود، سوال بپرس و حدس نزن. ' +
  'هرگز دربارهٔ توکن بات، رمز پنل یا دادهٔ حساس پاسخ نده. همیشه فارسی، کوتاه و دقیق جواب بده.';

/**
 * اجرای یک درخواست ادمین با موتور AI-Agent.
 * @param {object} env محیط (DB, KV, AI, TELEGRAM_BOT_TOKEN)
 * @param {object} opts { user, input, autoconfirm }
 */
export async function runAgent(env, opts = {}) {
  const user = opts.user;
  const { DB } = env;
  if (!(await isEnabled(DB, 'ai_agent_enabled'))) {
    return { ok: false, disabled: true, text: '🚫 AI Agent غیرفعال است (تنظیم ai_agent_enabled).' };
  }
  if (!isAdmin(user)) {
    return { ok: false, denied: true, text: '⛔ فقط ادمین می‌تواند از AI Agent استفاده کند.' };
  }
  if (!aiAvailable(env)) {
    return { ok: false, text: '🤖 بایندینگ AI روی این ورکر فعال نیست؛ AI Agent در دسترس نیست.' };
  }
  const input = String(opts.input || '').trim();
  if (!input) return { ok: false, text: 'درخواست خالی است.' };

  const model = await getSettingValue(DB, 'ai_agent_model');
  const chosenModel = model || undefined;
  const maxOps = Math.min(15, Math.max(1, await getNum(DB, 'ai_agent_max_ops', 6)));
  const autoconfirm = !!opts.autoconfirm;

  const messages = [
    { role: 'system', content: AGENT_SYSTEM },
    { role: 'user', content: input },
  ];
  const toolDefs = TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const executed = [];
  const denied = [];
  let pendingConfirm = [];
  let ops = 0;
  let finalText = '';

  for (let round = 0; round < maxOps + 2; round++) {
    let out;
    try {
      const models = chosenModel ? [chosenModel] : undefined;
      if (chosenModel) {
        out = await env.AI.run(chosenModel, { messages, tools: toolDefs, tool_choice: 'auto', max_tokens: 700 });
      } else {
        // fallback از لایهٔ ai.js؛ اگر از ابزار پشتیبانی نکند، پاسخ متنی برمی‌گردد
        const r = await aiChatComplete(env, messages, { max_tokens: 700, temperature: 0.2 });
        if (!r.ok) return { ok: false, text: '🤖 مدل AI پاسخ نداد؛ کمی بعد دوباره تلاش کنید.', error: r.error };
        out = { choices: [{ message: { role: 'assistant', content: r.text } }] };
      }
    } catch (e) {
      return { ok: false, text: '🤖 خطا در فراخوانی مدل AI Agent.', error: String((e && e.message) || e) };
    }

    const calls = extractToolCalls(out);
    const textPart = extractText(out).trim();

    if (!calls.length) {
      finalText = textPart || 'کار انجام شد.';
      break;
    }

    let anyCall = false;
    for (const call of calls) {
      if (ops >= maxOps) break;
      const fn = call?.function || call;
      const name = String(fn?.name || fn?.toolName || '');
      const tool = TOOL_MAP[name];
      if (!tool) {
        denied.push({ tool: name, reason: 'unknown_tool' });
        continue;
      }
      anyCall = true;
      let args = {};
      try {
        args = JSON.parse(typeof fn?.arguments === 'string' ? fn.arguments : JSON.stringify(fn?.arguments || {}));
      } catch {
        args = {};
      }
      // ۱) مجوز سمت سرور
      if (tool.perm && !hasPerm(user, tool.perm)) {
        denied.push({ tool: name, reason: 'no_permission' });
        await logAction(DB, user, name, args, `دسترسی رد شد (نیاز به مجوز ${tool.perm})`, 'blocked', null, 0);
        ops++;
        continue;
      }
      // عملیات مالی فقط برای سوپر
      if (FINANCIAL_TOOLS.has(name) && user.role !== 'super') {
        denied.push({ tool: name, reason: 'super_only' });
        await logAction(DB, user, name, args, 'عملیات مالی فقط برای سوپرادمین', 'blocked', null, 0);
        ops++;
        continue;
      }
      // ۲) تأیید عملیات مخرب/مالی
      if (confirmRequired(name) && !autoconfirm) {
        pendingConfirm.push({ tool: name, args });
        await logAction(DB, user, name, args, `نیازمند تأیید ادمین (${name})`, 'pending_confirm', null, 0);
        ops++;
        continue;
      }
      // ۳) اجرا
      const res = await execTool(env, user, tool, args);
      if (res.ok) {
        executed.push({ tool: name, ...res });
        // ابزارهای خواندنی که داخل خودشان لاگ نمی‌کنند اینجا لاگ می‌شوند
        if (!SELF_LOGGED.has(name)) {
          await logAction(DB, user, name, args, `اجرای ${name}`, 'done', null, 0);
        }
      } else {
        denied.push({ tool: name, reason: res.error });
        await logAction(DB, user, name, args, `خطا: ${res.error}`, 'blocked', null, 0);
      }
      ops++;
      messages.push({ role: 'assistant', content: null, tool_calls: [{ id: call?.id || `c${ops}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
      messages.push({ role: 'tool', tool_call_id: call?.id || `c${ops}`, content: JSON.stringify(res) });
    }
    // اگر عملیاتی در انتظار تأیید ادمین است، حلقه را متوقف کن
    if (pendingConfirm.length) {
      finalText = `درخواست شامل ${pendingConfirm.length} عملیاتِ نیازمندِ تأیید است؛ اجرا نشد. لطفاً تأیید صریح بدهید.`;
      break;
    }
    if (!anyCall) {
      finalText = textPart || 'کار انجام شد.';
      break;
    }
    if (ops >= maxOps) {
      finalText = 'به سقف عملیات در این درخواست رسیدم؛ برای ادامه، درخواست را کوتاه‌تر بفرستید.';
      break;
    }
  }

  return { ok: true, text: finalText, executed, denied, pendingConfirm };
}

// ═══════════════════════ Undo ═══════════════════════
const UNDO_HANDLERS = {
  adjust_balance: async (DB, prev, args) => {
    const target = await getUser(DB, Number(args.user_id));
    if (!target) return { ok: false, error: 'کاربر یافت نشد' };
    await DB.prepare('UPDATE users SET balance=? WHERE id=?').bind(Math.round(prev.balance), Number(args.user_id)).run();
    return { ok: true };
  },
  adjust_coins: async (DB, prev, args) => {
    const target = await getUser(DB, Number(args.user_id));
    if (!target) return { ok: false, error: 'کاربر یافت نشد' };
    await DB.prepare('UPDATE users SET coins=? WHERE id=?').bind(Math.round(prev.coins), Number(args.user_id)).run();
    return { ok: true };
  },
  toggle_server: async (DB, prev, args) => {
    await DB.prepare('UPDATE servers SET active=? WHERE id=?').bind(Number(prev.active) ? 1 : 0, Number(args.server_id)).run();
    return { ok: true };
  },
  update_product: async (DB, prev) => {
    await DB.prepare('UPDATE products SET title=?, price_usd=?, days=?, traffic_gb=?, enabled=? WHERE id=?')
      .bind(prev.title, prev.price_usd, prev.days, prev.traffic_gb, prev.enabled, prev.id)
      .run();
    return { ok: true };
  },
  scale_product_prices: async (DB, prev) => {
    for (const id of Object.keys(prev || {})) {
      await DB.prepare('UPDATE products SET price_usd=? WHERE id=?').bind(prev[id], Number(id)).run();
    }
    return { ok: true };
  },
  update_setting: async (DB, prev, args) => {
    await DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind(String(args.key), String(prev.value || ''))
      .run();
    return { ok: true };
  },
};

/** بازگردانی (undo) یک اقدام قابل بازگشت — فقط سوپر */
export async function undoAction(env, user, actionId) {
  if (!user || user.role !== 'super') return { ok: false, reason: 'super_only' };
  const a = await env.DB.prepare('SELECT * FROM ai_actions WHERE id=?').bind(Number(actionId)).first();
  if (!a) return { ok: false, reason: 'notfound' };
  if (Number(a.undid_at || 0) > 0) return { ok: false, reason: 'already_undone' };
  const handler = UNDO_HANDLERS[a.tool];
  if (!handler) return { ok: false, reason: 'not_undoable' };
  let prev = {};
  try { prev = JSON.parse(a.prev || 'null') || {}; } catch { prev = {}; }
  let args = {};
  try { args = JSON.parse(a.args || '{}') || {}; } catch {}
  const res = await handler(env.DB, prev, args);
  if (!res.ok) return { ok: false, reason: res.error };
  await env.DB.prepare('UPDATE ai_actions SET status=?, undid_at=? WHERE id=?').bind('undone', now(), actionId).run();
  return { ok: true };
}

/** تحلیل خودکار روزانه — نقطهٔ فراخوانی برای cron (خلاصهٔ فروش امروز) */
export async function dailyAgentAnalysis(env) {
  const { DB } = env;
  if (!(await isEnabled(DB, 'ai_agent_enabled'))) return { ok: false, reason: 'disabled' };
  if (!aiAvailable(env)) return { ok: false, reason: 'no_ai' };
  const today = todayStr();
  const dayStart = Math.floor(new Date(today + 'T00:00:00Z').getTime() / 1000);
  const paidToday = (await DB.prepare('SELECT COUNT(*) c, COALESCE(SUM(amount_toman),0) s FROM orders WHERE status=? AND paid_at>=?').bind('paid', dayStart).first());
  return {
    ok: true,
    summary: {
      todayOrders: Number(paidToday?.c || 0),
      todayToman: Number(paidToday?.s || 0),
      activeSubs: (await DB.prepare('SELECT COUNT(*) c FROM subscriptions WHERE active=1 AND expire_at>?').bind(now()).first())?.c || 0,
      reportDate: today,
    },
  };
}
