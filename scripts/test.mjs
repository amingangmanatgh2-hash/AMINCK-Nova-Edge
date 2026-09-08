// ═══════════════════════════════════════════════════════════════════
//  تست‌های یکپارچه — SQLite واقعی به‌جای Durable Object + تلگرام قلابی
//  اجرا:  npm test
// ═══════════════════════════════════════════════════════════════════
import { DatabaseSync } from 'node:sqlite';

// ─── ثبت نتایج ───
let pass = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`);
  }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// ─── تلگرام قلابی: همه فراخوانی‌ها ضبط می‌شوند ───
export const sent = [];
globalThis.__tgCalls = sent;

const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('api.telegram.org')) {
    const method = u.split('/').pop();
    let payload = {};
    try {
      payload = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    } catch {}
    sent.push({ method, payload });
    if (method === 'getMe') return jsonRes({ ok: true, result: { id: 1, username: 'aminck_test_bot', first_name: 'AMINCK' } });
    if (method === 'getFile') return jsonRes({ ok: true, result: { file_path: 'photo/x.jpg' } });
    if (method === 'getChat') return jsonRes({ ok: true, result: { id: payload.chat_id, title: 'گروه تست' } });
    return jsonRes({ ok: true, result: { message_id: sent.length } });
  }
  if (u.includes('api.telegram.org/file')) return new Response(new Uint8Array([1, 2, 3]));
  if (u.includes('er-api.com') || u.includes('frankfurter')) return jsonRes({ rates: { IRR: 1000000 } });
  return jsonRes({ ok: true });
};
const jsonRes = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });

// ─── شیم D1 روی SQLite واقعی ───
function makeDb() {
  const sq = new DatabaseSync(':memory:');
  const norm = (a) => a.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
  return {
    _sq: sq,
    prepare(sql) {
      const st = { __sql: sql, __args: [] };
      st.bind = (...a) => {
        st.__args = norm(a);
        return st;
      };
      const isRead = /^\s*select/i.test(sql) || /returning/i.test(sql);
      st.first = async () => {
        const r = sq.prepare(sql).all(...st.__args);
        return r[0] ?? null;
      };
      st.all = async () => ({ results: sq.prepare(sql).all(...st.__args) });
      st.run = async () => {
        if (isRead) return { results: sq.prepare(sql).all(...st.__args) };
        sq.prepare(sql).run(...st.__args);
        return { success: true };
      };
      return st;
    },
    async batch(stmts) {
      for (const s of stmts) {
        if (/^\s*select/i.test(s.__sql)) sq.prepare(s.__sql).all(...s.__args);
        else sq.prepare(s.__sql).run(...s.__args);
      }
      return { success: true };
    },
  };
}

function makeKv() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => void m.set(k, String(v)),
    delete: async (k) => void m.delete(k),
  };
}

// ─── محیط تست ───
async function makeEnv({ ai = true } = {}) {
  const { initDb } = await import('../src/db.js');
  const DB = makeDb();
  const env = {
    DB,
    KV: makeKv(),
    TELEGRAM_BOT_TOKEN: 'TESTTOKEN',
    AI: ai
      ? {
          run: async (model, input) => {
            if (String(model).includes('vision')) {
              return { response: JSON.stringify({ amount_toman: 100000, gregorian_date: new Date().toISOString().slice(0, 10), dest_card: '6219861958426461', tampering: '' }) };
            }
            return { response: 'پاسخ آزمایشی هوش مصنوعی 🤖' };
          },
        }
      : undefined,
  };
  await initDb(DB);
  return env;
}

const lastText = () => [...sent].reverse().find((s) => s.method === 'sendMessage')?.payload?.text || '';
const textsSent = () => sent.filter((s) => s.method === 'sendMessage').map((s) => s.payload.text);

// ═══════════════════ اجرای تست‌ها ═══════════════════
console.log('\n⚡ AMINCK Nova Bot — تست‌های یکپارچه\n' + '─'.repeat(50));

// ── ۱) اسکیما و سید ──
section('۱) دیتابیس، اسکیما و داده اولیه');
{
  const env = await makeEnv();
  const p = (await env.DB.prepare('SELECT COUNT(*) c FROM products').first()).c;
  const s = (await env.DB.prepare('SELECT COUNT(*) c FROM servers').first()).c;
  check('محصولات نمونه ساخته شد', p > 0, `count=${p}`);
  check('سرورهای نمونه ساخته شد', s > 0, `count=${s}`);
  const { initDb } = await import('../src/db.js');
  await initDb(env.DB); // اجرای دوباره نباید داده تکراری بسازد
  const p2 = (await env.DB.prepare('SELECT COUNT(*) c FROM products').first()).c;
  check('initDb تکرارپذیر است (بدون تکرار داده)', p2 === p, `${p} → ${p2}`);
}

// ── ۲) اولین کاربر = سوپرادمین ──
section('۲) کاربران و دسترسی‌ها');
{
  const env = await makeEnv();
  const { ensureUser, isAdmin, hasPerm } = await import('../src/db.js');
  const a = await ensureUser(env.DB, { id: 111, first_name: 'Amin' });
  const b = await ensureUser(env.DB, { id: 222, first_name: 'Ali' });
  check('اولین کاربر سوپرادمین می‌شود', a.user.role === 'super', a.user.role);
  check('کاربر دوم کاربر عادی است', b.user.role === 'user', b.user.role);
  check('isAdmin برای سوپر درست است', isAdmin(a.user));
  check('سوپرادمین همه دسترسی‌ها را دارد', hasPerm(a.user, 'settings') && hasPerm(a.user, 'groups'));
  check('کاربر عادی دسترسی ندارد', !hasPerm(b.user, 'settings'));
  const dup = await ensureUser(env.DB, { id: 111, first_name: 'Amin2' });
  check('ensureUser تکراری کاربر جدید نمی‌سازد', dup.isNew === false);
  // رفرال
  const c = await ensureUser(env.DB, { id: 333, first_name: 'Sara' }, 'ref_111');
  check('رفرر از دیپ‌لینک ثبت می‌شود', c.user.referrer_id === 111, String(c.user.referrer_id));
  const self = await ensureUser(env.DB, { id: 444, first_name: 'X' }, 'ref_444');
  check('رفرال به خود رد می‌شود', !self.user.referrer_id);
}

// ── ۳) رمز پنل ۱۰ رقمی ──
section('۳) اجبار رمز ۱۰ رقمی پنل وب');
{
  const { isValidPanelPassword, randomPanelPassword } = await import('../src/util.js');
  check('رد رمز ۹ رقمی', !isValidPanelPassword('123456789'));
  check('رد رمز ۱۱ رقمی', !isValidPanelPassword('12345678901'));
  check('رد رمز حرف‌دار', !isValidPanelPassword('12345abcde'));
  check('رد رمز خالی', !isValidPanelPassword(''));
  check('رد رمز با فاصله', !isValidPanelPassword('12345 6789'));
  check('پذیرش رمز دقیقاً ۱۰ رقمی', isValidPanelPassword('1234567890'));
  let allOk = true;
  for (let i = 0; i < 200; i++) if (!isValidPanelPassword(randomPanelPassword())) allOk = false;
  check('رمز تصادفی همیشه ۱۰ رقمی است (۲۰۰ نمونه)', allOk);
}

// ── ۴) API پنل وب ──
section('۴) احراز هویت و APIهای پنل وب');
{
  const env = await makeEnv();
  const { handlePanelApi, ensurePanelPassword } = await import('../src/panel.js');
  const pw = await ensurePanelPassword(env.DB);
  check('رمز اولیه خودکار ۱۰ رقمی ساخته شد', /^\d{10}$/.test(pw), pw);

  const post = (path, body, headers = {}) =>
    handlePanelApi(env, new Request('https://x.dev' + path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } }), path);

  let r = await post('/api/panel/login', { password: 'abc' });
  check('ورود با رمز نامعتبر → ۴۰۰', r.status === 400, String(r.status));
  r = await post('/api/panel/login', { password: '0000000000' });
  check('ورود با رمز اشتباه → ۴۰۱', r.status === 401, String(r.status));
  r = await post('/api/panel/state', {});
  check('دسترسی بدون سشن → ۴۰۱', r.status === 401, String(r.status));

  r = await post('/api/panel/login', { password: pw });
  check('ورود با رمز درست → ۲۰۰', r.status === 200, String(r.status));
  const cookie = r.headers.get('Set-Cookie') || '';
  check('کوکی سشن HttpOnly است', cookie.includes('HttpOnly'));
  check('کوکی سشن Secure است', cookie.includes('Secure'));
  const tok = (cookie.match(/nova_panel=([a-f0-9]{32})/) || [])[1];
  check('توکن سشن ۳۲ کاراکتری صادر شد', !!tok);
  const auth = { Cookie: `nova_panel=${tok}` };

  r = await post('/api/panel/state', {}, auth);
  const st = await r.json();
  check('دریافت وضعیت با سشن معتبر', st.ok === true);

  // مدیریت گروه‌ها
  r = await post('/api/panel/group/add', { chat_id: -100999 }, auth);
  check('افزودن گروه', (await r.json()).ok === true);
  r = await post('/api/panel/state', {}, auth);
  let s2 = await r.json();
  check('گروه در لیست ظاهر شد', s2.groups.some((g) => g.chat_id === '-100999'));
  check('نام گروه از تلگرام گرفته شد', s2.groups.find((g) => g.chat_id === '-100999').title === 'گروه تست');
  await post('/api/panel/group/toggle', { chat_id: -100999 }, auth);
  s2 = await (await post('/api/panel/state', {}, auth)).json();
  check('فعال/غیرفعال‌سازی گروه کار می‌کند', s2.groups.find((g) => g.chat_id === '-100999').enabled === false);
  await post('/api/panel/group/rename', { chat_id: -100999, title: 'نام جدید' }, auth);
  s2 = await (await post('/api/panel/state', {}, auth)).json();
  check('تغییر نام گروه کار می‌کند', s2.groups.find((g) => g.chat_id === '-100999').title === 'نام جدید');
  await post('/api/panel/group/delete', { chat_id: -100999 }, auth);
  s2 = await (await post('/api/panel/state', {}, auth)).json();
  check('حذف گروه کار می‌کند', !s2.groups.some((g) => g.chat_id === '-100999'));

  // تغییر رمز — اجبار ۱۰ رقم سمت سرور
  r = await post('/api/panel/password', { password: '123' }, auth);
  check('تغییر رمز به مقدار نامعتبر → ۴۰۰', r.status === 400, String(r.status));
  r = await post('/api/panel/password', { password: '9876543210' }, auth);
  check('تغییر رمز به ۱۰ رقم معتبر → ۲۰۰', r.status === 200, String(r.status));
  const { getSetting } = await import('../src/db.js');
  check('رمز جدید ذخیره شد', (await getSetting(env.DB, 'panel_password', '')) === '9876543210');
}

// ── ۵) لایه Workers AI ──
section('۵) هوش مصنوعی بومی کلادفلر');
{
  const { aiAvailable, aiChatComplete } = await import('../src/ai.js');
  const env = await makeEnv();
  check('در دسترس بودن AI تشخیص داده می‌شود', aiAvailable(env));
  const r = await aiChatComplete(env, [{ role: 'user', content: 'سلام' }]);
  check('چت AI پاسخ می‌دهد', r.ok && r.text.includes('آزمایشی'), r.text);

  const noAi = await makeEnv({ ai: false });
  check('نبود بایندینگ AI تشخیص داده می‌شود', !aiAvailable(noAi));
  const r2 = await aiChatComplete(noAi, [{ role: 'user', content: 'x' }]);
  check('بدون بایندینگ، خطای تمیز برمی‌گرداند (کرش نمی‌کند)', r2.ok === false && r2.error === 'binding_missing');

  // خطای مدل نباید استثنا پرتاب کند
  const boom = { ...(await makeEnv()), AI: { run: async () => { throw new Error('quota'); } } };
  const r3 = await aiChatComplete(boom, [{ role: 'user', content: 'x' }]);
  check('خطای مدل به‌صورت امن هندل می‌شود', r3.ok === false);
}

// ── ۶) چت AI و اقتصاد سکه ──
section('۶) چت AI کاربر و کسر سکه');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { aiChat } = await import('../src/user.js');
  await ensureUser(env.DB, { id: 111, first_name: 'Amin' });
  await env.DB.prepare('UPDATE users SET coins=100 WHERE id=111').run();
  const ctx = { env, db: env.DB, token: 'T', user: await getUser(env.DB, 111), update: {}, botUsername: 'b' };

  sent.length = 0;
  await aiChat(ctx, 'سلام چطوری؟');
  let u = await getUser(env.DB, 111);
  check('سکه بابت پاسخ موفق کسر شد', u.coins === 95, `coins=${u.coins}`);
  check('پاسخ AI برای کاربر ارسال شد', lastText().includes('آزمایشی'));

  // خطای AI نباید سکه کسر کند  ← رگرسیون مهم
  const envBad = await makeEnv();
  envBad.AI = { run: async () => { throw new Error('down'); } };
  await ensureUser(envBad.DB, { id: 111, first_name: 'Amin' });
  await envBad.DB.prepare('UPDATE users SET coins=100 WHERE id=111').run();
  const ctx2 = { env: envBad, db: envBad.DB, token: 'T', user: await getUser(envBad.DB, 111), update: {}, botUsername: 'b' };
  sent.length = 0;
  await aiChat(ctx2, 'سوال');
  u = await getUser(envBad.DB, 111);
  check('در خطای AI سکه کسر نمی‌شود', u.coins === 100, `coins=${u.coins}`);
  check('در خطا دکمه اتصال به اپراتور داده می‌شود', JSON.stringify(sent).includes('op:connect'));

  // کمبود سکه
  await envBad.DB.prepare('UPDATE users SET coins=0 WHERE id=111').run();
  const ctx3 = { ...ctx2, user: await getUser(envBad.DB, 111) };
  sent.length = 0;
  await aiChat(ctx3, 'سوال');
  check('کمبود سکه پیام مناسب می‌دهد', lastText().includes('سکه'));
}

// ── ۷) راهنما و دستورها ──
section('۷) دستورها و راهنمای /help');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { handleUserText } = await import('../src/user.js');
  await ensureUser(env.DB, { id: 111, first_name: 'Amin' });
  const mk = async () => ({ env, db: env.DB, token: 'T', user: await getUser(env.DB, 111), update: { message: {} }, botUsername: 'b' });

  sent.length = 0;
  await handleUserText(await mk(), '/help');
  const help = lastText();
  check('/help راهنما را می‌فرستد', help.includes('راهنمای کامل'));
  for (const c of ['/shop', '/account', '/ref', '/trial', '/ai', '/support', '/help', '/cancel'])
    check(`راهنما دستور ${c} را مستند کرده`, help.includes(c), '');
  check('راهنما به اپراتور اشاره دارد', help.includes('اپراتور'));

  sent.length = 0;
  await handleUserText(await mk(), '/ghalat');
  check('دستور ناشناس پیام راهنما می‌دهد', lastText().includes('/help'));

  sent.length = 0;
  await handleUserText(await mk(), '/support');
  check('/support منوی پشتیبانی می‌دهد', JSON.stringify(sent).includes('op:connect'));
  check('پشتیبانی گزینه AI هم دارد', JSON.stringify(sent).includes('sup:ai'));
}

// ── ۸) چت AI در گروه ──
section('۸) چت هوش مصنوعی داخل گروه');
{
  const { extractGroupQuestion, groupAiReply } = await import('../src/group.js');
  const B = 'aminck_test_bot';
  check('منشن بات تشخیص داده می‌شود', extractGroupQuestion({ text: '@aminck_test_bot قیمت چنده؟' }, B) === 'قیمت چنده؟');
  check('پیشوند «ربات» تشخیص داده می‌شود', extractGroupQuestion({ text: 'ربات: سلام' }, B) === 'سلام');
  check('دستور /ai تشخیص داده می‌شود', extractGroupQuestion({ text: '/ai سوال من' }, B) === 'سوال من');
  check('/ai@bot هم کار می‌کند', extractGroupQuestion({ text: '/ai@aminck_test_bot پرسش' }, B) === 'پرسش');
  check('ریپلای به بات تشخیص داده می‌شود',
    extractGroupQuestion({ text: 'ادامه بده', reply_to_message: { from: { is_bot: true, username: B } } }, B) === 'ادامه بده');
  check('پیام عادی گروه نادیده گرفته می‌شود', extractGroupQuestion({ text: 'سلام بچه‌ها چطورید' }, B) === null);
  check('ریپلای به کاربر عادی نادیده گرفته می‌شود',
    extractGroupQuestion({ text: 'آره', reply_to_message: { from: { is_bot: false, username: 'ali' } } }, B) === null);
  check('/start در گروه به AI نمی‌رود', extractGroupQuestion({ text: '/start' }, B) === null);

  // کول‌داون ضدهرزنامه
  const env = await makeEnv();
  const msg = { chat: { id: -100777, title: 'G' }, message_id: 5, text: '@aminck_test_bot سلام' };
  sent.length = 0;
  const first = await groupAiReply(env, msg, B);
  check('اولین پیام گروه پاسخ می‌گیرد', first === true);
  const second = await groupAiReply(env, msg, B);
  check('پیام دوم به‌خاطر کول‌داون رد می‌شود', second === false);
  check('گروه ناشناس خودکار ثبت شد', !!(await env.DB.prepare('SELECT 1 x FROM groups WHERE chat_id=-100777').first()));

  // گروه غیرفعال نباید پاسخ بگیرد
  await env.DB.prepare('UPDATE groups SET enabled=0 WHERE chat_id=-100777').run();
  await env.KV.delete('grpai:-100777');
  check('گروه غیرفعال پاسخ AI نمی‌گیرد', (await groupAiReply(env, msg, B)) === false);
}

// ── ۹) قالب کانفیگ و ساب ──
section('۹) ساخت کانفیگ و اشتراک');
{
  const { defaultTemplate, buildConfigs, createSubscription } = await import('../src/subs.js');
  for (const proto of ['vless', 'vmess', 'trojan', 'ss', 'mtproto', 'socks5', 'openvpn']) {
    let t = '';
    let threw = false;
    try {
      t = defaultTemplate(proto, 'srv.example.com');
    } catch (e) {
      threw = true;
    }
    check(`قالب پیش‌فرض ${proto} بدون خطا ساخته می‌شود`, !threw && !!t);
  }
  // رگرسیون: قبلاً شاخه پیش‌فرض به متغیر تعریف‌نشده name اشاره می‌کرد و ReferenceError می‌داد
  const d = defaultTemplate('unknown_proto', 'x.com');
  check('قالب پروتکل ناشناس جایگزین {name} دارد (رگرسیون)', d.includes('{name}') && !d.includes('undefined'), d);

  const lines = buildConfigs([{ protocol: 'vless', ip: 'a.com', name: 'آلمان', template: '' }], 'UUID1', { title: 'تست', days: 30 }, 'u');
  check('کانفیگ ساخته می‌شود', lines.length === 1);
  check('uuid در کانفیگ جایگزین شد', lines[0].includes('UUID1'));
  check('placeholder باقی‌مانده وجود ندارد', !lines[0].includes('{uuid}') && !lines[0].includes('{name}'), lines[0]);

  const env = await makeEnv();
  const { ensureUser } = await import('../src/db.js');
  const { user } = await ensureUser(env.DB, { id: 111, first_name: 'A' });
  const sub = await createSubscription(env, user, { id: 1, title: 'محصول', protocol: 'vless', days: 30, server_count: 5 }, {});
  check('اشتراک با توکن ساخته شد', !!sub.token && sub.token.length > 10);
  check('اشتراک سرور دارد', sub.servers.length > 0);
  check('تاریخ انقضا در آینده است', sub.expire > Math.floor(Date.now() / 1000));
  const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE token=?').bind(sub.token).first();
  check('اشتراک در دیتابیس ذخیره شد', !!row);
}

// ── ۱۰) پرداخت: شارژ کیف پول در برابر خرید کانفیگ ──
section('۱۰) پرداخت، تایید فیش و شارژ کیف پول');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { createOrder, approveReceipt, payWithWallet } = await import('../src/pay.js');
  const { user } = await ensureUser(env.DB, { id: 111, first_name: 'A' });

  // رگرسیون مهم: سفارش شارژ کیف پول باید موجودی را زیاد کند، نه کانفیگ بسازد
  const chargeOrder = await createOrder(env, 111, { id: 0, title: '💳 شارژ کیف پول' }, 250000, 'card');
  await env.DB.prepare('UPDATE orders SET meta=? WHERE id=?').bind(JSON.stringify({ charge: true }), chargeOrder.id).run();
  await env.DB.prepare('INSERT INTO receipts (user_id, order_id, status, created_at) VALUES (?,?,?,?)').bind(111, chargeOrder.id, 'pending', 1).run();
  const rec = await env.DB.prepare('SELECT * FROM receipts ORDER BY id DESC LIMIT 1').first();
  const res = await approveReceipt(env, rec);
  const after = await getUser(env.DB, 111);
  check('تایید فیش شارژ، کیف پول را شارژ می‌کند (رگرسیون)', res?.charge === true && after.balance === 250000, `balance=${after.balance}`);
  const subsCount = (await env.DB.prepare('SELECT COUNT(*) c FROM subscriptions').first()).c;
  check('برای شارژ کیف پول اشتراک ساخته نمی‌شود (رگرسیون)', subsCount === 0, `subs=${subsCount}`);

  // خرید واقعی با کیف پول
  const prod = await env.DB.prepare("SELECT * FROM products WHERE category='vless' LIMIT 1").first();
  const pay = await payWithWallet(env, await getUser(env.DB, 111), prod, 100000);
  check('پرداخت با کیف پول موفق است', pay.ok === true);
  const after2 = await getUser(env.DB, 111);
  check('موجودی کیف پول کم شد', after2.balance === 150000, `balance=${after2.balance}`);
  check('برای خرید محصول اشتراک ساخته شد', (await env.DB.prepare('SELECT COUNT(*) c FROM subscriptions').first()).c === 1);

  // موجودی ناکافی
  const poor = await payWithWallet(env, await getUser(env.DB, 111), prod, 99999999);
  check('پرداخت با موجودی ناکافی رد می‌شود', poor.ok === false);

  // تایید دوباره نباید دوباره پول اضافه کند
  const again = await approveReceipt(env, rec);
  check('تایید تکراری فیش بی‌اثر است', again === null);
}

// ── ۱۱) پاداش رفرال ──
section('۱۱) پاداش زیرمجموعه');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { payWithWallet } = await import('../src/pay.js');
  await ensureUser(env.DB, { id: 111, first_name: 'Ref' });
  const { user: buyer } = await ensureUser(env.DB, { id: 222, first_name: 'Buyer' }, 'ref_111');
  await env.DB.prepare('UPDATE users SET balance=1000000 WHERE id=222').run();
  const prod = await env.DB.prepare("SELECT * FROM products WHERE category='vless' LIMIT 1").first();
  await payWithWallet(env, await getUser(env.DB, 222), prod, 200000);
  const ref = await getUser(env.DB, 111);
  check('۱۰٪ پاداش به معرف رسید', ref.balance === 20000, `balance=${ref.balance}`);
  check('تعداد دعوت معرف زیاد شد', ref.invited_count === 1, String(ref.invited_count));
  // خرید دوم نباید دوباره پاداش بدهد
  await payWithWallet(env, await getUser(env.DB, 222), prod, 200000);
  const ref2 = await getUser(env.DB, 111);
  check('پاداش فقط برای اولین خرید است', ref2.balance === 20000, `balance=${ref2.balance}`);
}

// ── ۱۲) بررسی فیش با بینایی ──
section('۱۲) بررسی هوشمند فیش');
{
  const { analyzeReceipt } = await import('../src/verify.js');
  const env = await makeEnv();
  const bytes = new Uint8Array(64).fill(7);
  const ok = await analyzeReceipt(env, bytes, 100000);
  check('فیش منطبق تایید خودکار می‌شود', ok.verdict === 'auto', ok.verdict + ' ' + JSON.stringify(ok.reasons));
  const bad = await analyzeReceipt(env, bytes, 999999);
  check('فیش با مبلغ نامنطبق رد می‌شود', bad.verdict === 'reject', bad.verdict);
  const noAi = await makeEnv({ ai: false });
  const manual = await analyzeReceipt(noAi, bytes, 100000);
  check('بدون AI به بررسی دستی می‌رود (کرش نمی‌کند)', manual.verdict === 'manual', manual.verdict);
}

// ── ۱۳) قیمت‌گذاری ──
section('۱۳) قیمت‌گذاری و نرخ ارز');
{
  const env = await makeEnv();
  const { getUsdRate, productPriceToman } = await import('../src/pricing.js');
  const rate = await getUsdRate(env);
  check('نرخ دلار از API گرفته شد', rate === 100000, String(rate));
  const { setSetting } = await import('../src/db.js');
  await setSetting(env.DB, 'usd_rate_manual', '50000');
  check('نرخ دستی اولویت دارد', (await getUsdRate(env)) === 50000);
  const price = await productPriceToman(env, { price_usd: 2 });
  check('قیمت با مارجین محاسبه و رند می‌شود', price === 130000, String(price));
}

// ── ۱۴) اعلان‌های ادمین (رگرسیون .all()) ──
section('۱۴) اعلان به ادمین‌ها');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { handleSupportMsg } = await import('../src/user.js');
  await ensureUser(env.DB, { id: 111, first_name: 'Admin' }); // super
  await ensureUser(env.DB, { id: 222, first_name: 'User' });
  const ctx = { env, db: env.DB, token: 'T', user: await getUser(env.DB, 222), update: {}, botUsername: 'b' };
  sent.length = 0;
  let threw = null;
  try {
    await handleSupportMsg(ctx, { text: 'کمک می‌خواهم' });
  } catch (e) {
    threw = e;
  }
  check('پیام اپراتور بدون خطا ارسال می‌شود (رگرسیون .all())', threw === null, String(threw && threw.message));
  check('پیام به ادمین رسید', textsSent().some((t) => t.includes('کمک می‌خواهم')));
  check('به کاربر تاییدیه داده شد', textsSent().some((t) => t.includes('ارسال شد')));
}

// ── ۱۵) ثبت گروه و اعلان (رگرسیون .all()) ──
section('۱۵) عضویت بات در گروه');
{
  const env = await makeEnv();
  const { ensureUser } = await import('../src/db.js');
  const { onBotJoinedGroup } = await import('../src/group.js');
  await ensureUser(env.DB, { id: 111, first_name: 'Admin' });
  sent.length = 0;
  let threw = null;
  try {
    await onBotJoinedGroup(env, { id: -100555, title: 'گروه جدید', type: 'supergroup' });
  } catch (e) {
    threw = e;
  }
  check('ثبت گروه بدون خطا انجام می‌شود (رگرسیون .all())', threw === null, String(threw && threw.message));
  check('گروه در دیتابیس ثبت شد', !!(await env.DB.prepare('SELECT 1 x FROM groups WHERE chat_id=-100555').first()));
  check('به ادمین اطلاع داده شد', textsSent().some((t) => t.includes('گروه جدید')));
}

// ── ۱۶) لغو سراسری ادمین (رگرسیون) ──
section('۱۶) لغو ورودی ادمین با /cancel');
{
  const env = await makeEnv();
  const { ensureUser, getUser, getSetting } = await import('../src/db.js');
  const { handleAdminText } = await import('../src/admin.js');
  await ensureUser(env.DB, { id: 111, first_name: 'Admin' });
  await env.DB.prepare("UPDATE users SET state='admin:setv:card_number' WHERE id=111").run();
  const ctx = { env, db: env.DB, token: 'T', user: await getUser(env.DB, 111), update: {}, botUsername: 'b' };
  sent.length = 0;
  const handled = await handleAdminText(ctx, '/cancel');
  check('/cancel توسط لایه ادمین هندل می‌شود', handled === true);
  const saved = await getSetting(env.DB, 'card_number', '');
  check('مقدار «/cancel» به‌عنوان تنظیم ذخیره نمی‌شود (رگرسیون)', saved !== '/cancel', saved);
  const u = await getUser(env.DB, 111);
  check('حالت ادمین پاک شد', !u.state, u.state);
}

// ── ۱۷) ویزارد سرور تا انتها ──
section('۱۷) ویزارد افزودن سرور (رگرسیون بن‌بست)');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { handleAdminText, handleWizardCallback } = await import('../src/admin.js');
  await ensureUser(env.DB, { id: 111, first_name: 'Admin' });
  const mk = async () => ({ env, db: env.DB, token: 'T', user: await getUser(env.DB, 111), update: { callback_query: { message: {} } }, cbId: '1', botUsername: 'b' });

  await env.DB.prepare(`UPDATE users SET state='admin:newsrv', state_data=? WHERE id=111`).bind(JSON.stringify({ step: 1, f: {} })).run();
  await handleAdminText(await mk(), 'سرور تست');            // → step 2
  await handleWizardCallback(await mk(), 'nsw:proto:vless'); // → step 3
  await handleAdminText(await mk(), 'srv.test.com');         // → step 4
  await handleAdminText(await mk(), 'پیش‌فرض');              // → step 5  (قبلاً اینجا بن‌بست بود)
  const midState = (await getUser(env.DB, 111)).state_data;
  check('ویزارد بعد از قالب کانفیگ پیش می‌رود (رگرسیون)', JSON.parse(midState).step === 5, midState);
  await handleAdminText(await mk(), '-');                    // → step 6
  await handleAdminText(await mk(), '2');                    // ذخیره
  const srv = await env.DB.prepare("SELECT * FROM servers WHERE name='سرور تست'").first();
  check('سرور جدید ذخیره شد', !!srv);
  check('قالب پیش‌فرض اعمال شد', !!srv && srv.template.includes('srv.test.com'), srv && srv.template);
  check('رتبه سرعت ذخیره شد', !!srv && srv.speed_rank === 2, String(srv && srv.speed_rank));
  check('حالت ویزارد پاک شد', !(await getUser(env.DB, 111)).state);
}

// ── ۱۸) امنیت WebApp ──
section('۱۸) امنیت مینی‌اپ');
{
  const { verifyInitData } = await import('../src/util.js');
  check('initData جعلی رد می‌شود', (await verifyInitData('user=%7B%22id%22%3A1%7D&hash=deadbeef', 'TESTTOKEN')) === null);
  check('initData خالی رد می‌شود', (await verifyInitData('', 'TESTTOKEN')) === null);

  // امضای معتبر باید پذیرفته شود
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('TESTTOKEN')));
  const authDate = Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify({ id: 777, first_name: 'T' });
  const dcs = `auth_date=${authDate}\nuser=${userJson}`;
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc.encode(dcs)));
  const hash = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  const params = new URLSearchParams({ auth_date: String(authDate), user: userJson, hash });
  const okUser = await verifyInitData(params.toString(), 'TESTTOKEN');
  check('initData معتبر پذیرفته می‌شود', okUser?.id === 777, JSON.stringify(okUser));
}

// ── ۱۹) ابزارها ──
section('۱۹) ابزارهای کمکی');
{
  const { parseMoney, tmpl, clamp } = await import('../src/util.js');
  check('ارقام فارسی خوانده می‌شود', parseMoney('۱۲۳۴۵۶') === 123456);
  check('جداکننده هزارگان حذف می‌شود', parseMoney('1,500,000') === 1500000);
  check('ورودی بی‌معنی صفر می‌شود', parseMoney('abc') === 0);
  check('tmpl جایگزینی می‌کند', tmpl('سلام {name}', { name: 'امین' }) === 'سلام امین');
  check('tmpl متغیر ناموجود را خالی می‌گذارد', tmpl('x{y}z', {}) === 'xz');
  check('clamp کار می‌کند', clamp(15, 0, 10) === 10 && clamp(-5, 0, 10) === 0);
  const { faDigits, fmtToman, weekKey } = await import('../src/db.js');
  check('تبدیل به ارقام فارسی', faDigits('123') === '۱۲۳');
  check('قالب تومان', fmtToman(1500).includes('تومان'));
  check('کلید هفته پایدار است', weekKey(Date.parse('2026-09-08T00:00:00Z')) === weekKey(Date.parse('2026-09-09T00:00:00Z')));
}

// ── ۲۰) راه‌اندازی اولیه توکن و وب‌هوک ──
section('۲۰) ستاپ اولیه ربات');
{
  const env = await makeEnv();
  const { handleSetup } = await import('../src/setup.js');
  const { withBotToken } = await import('../src/config.js');
  const { getSetting } = await import('../src/db.js');
  const setupUrl = new URL('https://setup.test/setup');

  let r = await handleSetup(env, new Request(setupUrl), setupUrl);
  check('صفحه /setup بدون توکن باز می‌شود', r.status === 200);

  sent.length = 0;
  r = await handleSetup(
    env,
    new Request(setupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=TESTTOKEN',
    }),
    setupUrl
  );
  check('ستاپ با توکن معتبر موفق می‌شود', r.status === 200);
  check('توکن ستاپ در Durable Object ذخیره می‌شود', (await getSetting(env.DB, 'telegram_bot_token', '')) === 'TESTTOKEN');
  const hook = sent.find((x) => x.method === 'setWebhook');
  check('ستاپ setWebhook را با origin همان درخواست صدا می‌زند', hook?.payload?.url === 'https://setup.test/webhook');

  env.TELEGRAM_BOT_TOKEN = 'ENV_FALLBACK';
  const resolved = await withBotToken(env);
  check('توکن DB بر env fallback اولویت دارد', resolved.TELEGRAM_BOT_TOKEN === 'TESTTOKEN');

  r = await handleSetup(
    env,
    new Request(setupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=ANOTHER_TOKEN',
    }),
    setupUrl
  );
  check('ستاپ پس از پیکربندی دوباره توکن را عوض نمی‌کند', r.status === 409);
}

// ═══════════════════ نتیجه ═══════════════════
globalThis.fetch = origFetch;
console.log('\n' + '─'.repeat(50));
if (failures.length) {
  console.log(`\x1b[31m❌ ${failures.length} تست ناموفق\x1b[0m از ${pass + failures.length}`);
  for (const f of failures) console.log(`   • ${f}`);
  process.exit(1);
} else {
  console.log(`\x1b[32m✅ همه ${pass} تست با موفقیت پاس شد\x1b[0m`);
}
