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
  if (u.includes('cloudflare.com/ips-')) {
    return new Response('104.16.0.0/13\n104.24.0.0/14\n', { headers: { 'Content-Type': 'text/plain' } });
  }
  if (globalThis.__rateFail) throw new Error('rate source down');
  // ─── صرافی‌های داخلی (میلی‌ریال → تومان) — بخش ۷ ───
  const irr = globalThis.__rateIrr || { nobitex: 970000, wallex: 1000000, bitpin: 1000000, ramzinex: 1030000 };
  if (u.includes('nobitex.ir')) return jsonRes({ stats: { 'usdt-rls': { latest: String(irr.nobitex) } } });
  if (u.includes('wallex.ir')) return jsonRes({ result: { symbols: { USDTIRT: { stats: { latestPrice: String(irr.wallex) } } } } });
  if (u.includes('bitpin.ir')) return jsonRes([{ symbol: 'USDTIRT', price: String(irr.bitpin) }]);
  if (u.includes('ramzinex.com')) return jsonRes({ data: { usdtirr: { buy: String(irr.ramzinex), sell: String(irr.ramzinex) } } });
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
  // origin واقعی ورکر (در محیط واقعی هنگام اولین درخواست ذخیره می‌شود)
  await env.KV.put('worker_origin', 'https://bot.test');
  return env;
}

const lastText = () => [...sent].reverse().find((s) => s.method === 'sendMessage')?.payload?.text || '';
const textsSent = () => sent.filter((s) => s.method === 'sendMessage').map((s) => s.payload.text);
const allText = () => JSON.stringify(sent);

/**
 * سرور واقعی و آماده‌تحویل می‌سازد.
 * از آنجا که سرورهای نمونه دیگر غیرفعال‌اند، هر تستی که به تحویل نیاز دارد
 * باید صراحتاً یک سرور واقعی ثبت کند — دقیقاً مثل دنیای واقعی.
 */
async function addRealServer(env, o = {}) {
  const { defaultTemplate, defaultPort } = await import('../src/subs.js');
  const protocol = o.protocol || 'vless';
  const ip = o.ip || 'edge1.aminck-real.net';
  const port = o.port || defaultPort(protocol);
  const secret = o.secret ?? (protocol === 'mtproto' ? 'dd0123456789abcdef0123456789abcdef' : '');
  const template = o.template ?? (protocol === 'mtproto' || protocol === 'socks5' ? '' : defaultTemplate(protocol, ip, port));
  await env.DB.prepare(
    'INSERT INTO servers (name, country, protocol, ip, port, secret, template, health_url, speed_rank, active, healthy) VALUES (?,?,?,?,?,?,?,?,?,1,1)'
  )
    .bind(o.name || 'سرور واقعی', o.country || '🇩🇪', protocol, ip, port, secret, template, '', o.speed_rank || 1)
    .run();
  return await env.DB.prepare('SELECT * FROM servers ORDER BY id DESC LIMIT 1').first();
}

/** initData معتبر تلگرام برای تست‌های مینی‌اپ (همان الگوریتم رسمی HMAC) */
async function makeInitData(userId, token = 'TESTTOKEN', firstName = 'T') {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(token)));
  const authDate = Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify({ id: userId, first_name: firstName });
  const dcs = `auth_date=${authDate}\nuser=${userJson}`;
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc.encode(dcs)));
  const hash = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams({ auth_date: String(authDate), user: userJson, hash }).toString();
}

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
  // 🛡 هیچ سرور نمونه‌ای نباید فعال باشد — کانفیگ قلابی هرگز تحویل نمی‌شود
  const activeSeed = (await env.DB.prepare('SELECT COUNT(*) c FROM servers WHERE active=1').first()).c;
  check('هیچ سرور نمونه‌ای فعال نیست', activeSeed === 0, `active=${activeSeed}`);
  const { realActiveServerCount } = await import('../src/db.js');
  check('شمارش سرور واقعی روی دیتابیس تازه صفر است', (await realActiveServerCount(env.DB)) === 0);
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
  // بدون سرور واقعی، ساخت اشتراک باید صراحتاً شکست بخورد (نه کانفیگ قلابی)
  let noSrv = null;
  try {
    await createSubscription(env, user, { id: 1, title: 'محصول', protocol: 'vless', days: 30, server_count: 5 }, {});
  } catch (e) {
    noSrv = e;
  }
  check('بدون سرور واقعی، اشتراک ساخته نمی‌شود', noSrv?.code === 'no_real_server', String(noSrv && noSrv.message));

  await addRealServer(env);
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
  await addRealServer(env);

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
  await addRealServer(env);
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

// ── ۱۳) قیمت‌گذاری و نرخ ارز (بازنویسی‌شده — بخش ۷) ──
section('۱۳) قیمت‌گذاری و نرخ ارز');
{
  const env = await makeEnv();
  const { getUsdRate, getRateInfo, productPriceToman, median, RATE_UNAVAILABLE_MESSAGE } = await import('../src/pricing.js');

  check('میانهٔ چند منبع محاسبه می‌شود', median([97000, 100000, 100000, 103000]) === 100000, String(median([97000, 100000, 100000, 103000])));

  globalThis.__rateFail = false;
  globalThis.__rateIrr = { nobitex: 970000, wallex: 1000000, bitpin: 1000000, ramzinex: 1030000 };
  const info = await getRateInfo(env, true);
  check('نرخ از چند صرافی گرفته شد (میانه، نه اولی)', info.rate === 100000, String(info.rate));
  check('منبع نرخ گزارش می‌شود', typeof info.source === 'string' && info.source.length > 0, info.source);

  const { setSetting } = await import('../src/db.js');
  await setSetting(env.DB, 'usd_rate_manual', '50000');
  check('نرخ دستی اولویت دارد', (await getUsdRate(env)) === 50000);
  check('نرخ دستی manual علامت می‌خورد', (await getRateInfo(env)).manual === true);
  await setSetting(env.DB, 'usd_rate_manual', '0');

  const price = await productPriceToman(env, { price_usd: 2 });
  check('قیمت با نرخ ۱۰۰هزار و مارجین ۱٫۳ رند می‌شود', price === 260000, String(price));

  // هشدار انحراف بزرگ نسبت به کش
  globalThis.__rateIrr = { nobitex: 1300000, wallex: 1300000, bitpin: 1300000, ramzinex: 1300000 };
  const alertInfo = await getRateInfo(env, true);
  check('انحراف >۲۰٪ نسبت به کش هشدار ثبت می‌کند', alertInfo.alert === true, JSON.stringify(alertInfo));

  // همه منابع شکست → آخرین کش (کهنه)
  globalThis.__rateFail = true;
  const stale = await getRateInfo(env, true);
  check('وقتی همه منابع fail شوند آخرین کش برمی‌گردد', stale.rate === 130000 && stale.stale === true, JSON.stringify(stale));
  globalThis.__rateFail = false;

  // همه منابع شکست + بدون کش → عدد جعلی نه
  const empty = await makeEnv();
  globalThis.__rateFail = true;
  const none = await getRateInfo(empty, true);
  check('بدون کش و با شکست همه، عدد جعلی برنمی‌گردد', none.unavailable === true && none.rate === 0, JSON.stringify(none));
  check('پیام «نرخ در دسترس نیست» برای ادمین تعریف شده', RATE_UNAVAILABLE_MESSAGE.length > 10);
  globalThis.__rateFail = false;
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
section('۱۷) ویزارد افزودن سرور (رگرسیون بن‌بست + پورت/سکرت)');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { handleAdminText, handleWizardCallback } = await import('../src/admin.js');
  await ensureUser(env.DB, { id: 111, first_name: 'Admin' });
  const mk = async () => ({ env, db: env.DB, token: 'T', user: await getUser(env.DB, 111), update: { callback_query: { message: {} } }, cbId: '1', botUsername: 'b' });

  await env.DB.prepare(`UPDATE users SET state='admin:newsrv', state_data=? WHERE id=111`).bind(JSON.stringify({ step: 1, f: {} })).run();
  await handleAdminText(await mk(), 'سرور تست');            // → step 2 (انتخاب پروتکل)
  await handleWizardCallback(await mk(), 'nsw:proto:vless'); // → step 3 (هاست)
  await handleAdminText(await mk(), 'srv.test.com');         // → step 35 (پورت)
  await handleAdminText(await mk(), '443');                  // → step 36 (سکرت)
  await handleAdminText(await mk(), '-');                    // → step 4 (قالب)
  await handleAdminText(await mk(), 'پیش‌فرض');              // → step 5  (قبلاً اینجا بن‌بست بود)
  const midState = (await getUser(env.DB, 111)).state_data;
  check('ویزارد بعد از قالب کانفیگ پیش می‌رود (رگرسیون)', JSON.parse(midState).step === 5, midState);
  await handleAdminText(await mk(), '-');                    // → step 6
  await handleAdminText(await mk(), '2');                    // ذخیره
  const srv = await env.DB.prepare("SELECT * FROM servers WHERE name='سرور تست'").first();
  check('سرور جدید ذخیره شد', !!srv);
  check('قالب پیش‌فرض اعمال شد', !!srv && srv.template.includes('srv.test.com'), srv && srv.template);
  check('پورت ذخیره شد', !!srv && Number(srv.port) === 443, String(srv && srv.port));
  check('رتبه سرعت ذخیره شد', !!srv && srv.speed_rank === 2, String(srv && srv.speed_rank));
  check('سرور کامل فعال ذخیره می‌شود', !!srv && srv.active === 1, String(srv && srv.active));
  check('حالت ویزارد پاک شد', !(await getUser(env.DB, 111)).state);

  // ── ویزارد MTProto: سکرت واقعی الزامی است ──
  await env.DB.prepare(`UPDATE users SET state='admin:newsrv', state_data=? WHERE id=111`).bind(JSON.stringify({ step: 1, f: {} })).run();
  await handleAdminText(await mk(), 'ام‌تی تست');
  await handleWizardCallback(await mk(), 'nsw:proto:mtproto');
  await handleAdminText(await mk(), 'mtp.test.com');
  await handleAdminText(await mk(), '443');
  sent.length = 0;
  await handleAdminText(await mk(), 'not-a-secret');          // سکرت نامعتبر → باید رد شود
  const stillSecret = JSON.parse((await getUser(env.DB, 111)).state_data).step;
  check('سکرت نامعتبر MTProto رد می‌شود', stillSecret === 36, String(stillSecret));
  await handleAdminText(await mk(), 'dd0123456789abcdef0123456789abcdef');
  const afterSecret = JSON.parse((await getUser(env.DB, 111)).state_data).step;
  check('برای MTProto مرحلهٔ قالب رد می‌شود', afterSecret === 5, String(afterSecret));
  await handleAdminText(await mk(), '-');
  await handleAdminText(await mk(), '1');
  const mtp = await env.DB.prepare("SELECT * FROM servers WHERE name='ام‌تی تست'").first();
  check('سرور MTProto با سکرت ذخیره شد', !!mtp && mtp.secret === 'dd0123456789abcdef0123456789abcdef', String(mtp && mtp.secret));
  check('سرور MTProto کامل فعال است', !!mtp && mtp.active === 1, String(mtp && mtp.active));
}

// ── ۲۱) لینک مستقیم MTProto ──
section('۲۱) تحویل MTProto با لینک مستقیم تلگرام');
{
  const { buildMtprotoLinks, isValidMtprotoSecret, serverIssues, isServerDeliverable } = await import('../src/proxy.js');

  check('سکرت ۳۲ هگزی معتبر است', isValidMtprotoSecret('0123456789abcdef0123456789abcdef'));
  check('سکرت dd+هگز معتبر است', isValidMtprotoSecret('dd0123456789abcdef0123456789abcdef'));
  check('سکرت خالی نامعتبر است', !isValidMtprotoSecret(''));
  check('uuid تصادفی به‌عنوان سکرت رد می‌شود (رگرسیون)', !isValidMtprotoSecret('9f1c-4a2b-11ee-be56'));

  const links = buildMtprotoLinks({ host: 'mtp.realhost.net', port: 443, secret: 'dd0123456789abcdef0123456789abcdef' });
  check('لینک tg://proxy ساخته می‌شود', links.tg.startsWith('tg://proxy?'), links.tg);
  check('لینک t.me/proxy ساخته می‌شود', links.https.startsWith('https://t.me/proxy?'), links.https);
  check('لینک شامل هاست واقعی است', links.tg.includes('mtp.realhost.net'));
  check('لینک شامل پورت است', links.tg.includes('port=443'));
  check('لینک شامل سکرت ذخیره‌شده است', links.tg.includes('dd0123456789abcdef0123456789abcdef'), links.tg);

  let bad = null;
  try {
    buildMtprotoLinks({ host: 'mtp.example.com', port: 443, secret: 'dd0123456789abcdef0123456789abcdef' });
  } catch (e) {
    bad = e;
  }
  check('هاست نمونه (example.com) لینک نمی‌سازد', bad?.code === 'mtproto_host_invalid', String(bad && bad.code));

  let noSec = null;
  try {
    buildMtprotoLinks({ host: 'mtp.realhost.net', port: 443, secret: '' });
  } catch (e) {
    noSec = e;
  }
  check('بدون سکرت هیچ لینک قلابی ساخته نمی‌شود', noSec?.code === 'mtproto_secret_invalid', String(noSec && noSec.code));

  check('سرور MTProto بدون سکرت مشکل‌دار گزارش می‌شود', serverIssues({ protocol: 'mtproto', ip: 'a.realhost.net', port: 443, secret: '' }).length > 0);
  check('سرور MTProto کامل بدون مشکل است', serverIssues({ protocol: 'mtproto', ip: 'a.realhost.net', port: 443, secret: 'dd0123456789abcdef0123456789abcdef' }).length === 0);
  check('سرور غیرفعال آمادهٔ تحویل نیست', !isServerDeliverable({ protocol: 'mtproto', ip: 'a.realhost.net', port: 443, secret: 'dd0123456789abcdef0123456789abcdef', active: 0 }));

  // تحویل واقعی سرتاسری
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { createSubscription } = await import('../src/subs.js');
  const { sendDelivery } = await import('../src/pay.js');
  await addRealServer(env, { protocol: 'mtproto', ip: 'mtp.realhost.net', port: 443, secret: 'dd0123456789abcdef0123456789abcdef', name: 'MTP-DE' });
  const { user } = await ensureUser(env.DB, { id: 111, first_name: 'A' });
  const prod = { id: 9, title: 'پروکسی MTProto', protocol: 'mtproto', days: 30, server_count: 3 };
  const sub = await createSubscription(env, user, prod, {});
  sent.length = 0;
  const d1 = await sendDelivery(env, await getUser(env.DB, 111), prod.title, sub, { protocol: 'mtproto' });
  const body = allText();
  check('پیام تحویل MTProto ارسال شد', d1.sent === true, JSON.stringify(d1));
  check('پیام تحویل شامل tg://proxy است', body.includes('tg://proxy'), lastText().slice(0, 200));
  check('پیام تحویل شامل سکرت واقعی است', body.includes('dd0123456789abcdef0123456789abcdef'));
  check('دکمهٔ «اتصال مستقیم در تلگرام» وجود دارد', body.includes('اتصال مستقیم در تلگرام'));
  check('برای MTProto لینک /sub فرستاده نمی‌شود', !body.includes('/sub/'), body.slice(0, 300));

  // ضدتکرار
  sent.length = 0;
  const d2 = await sendDelivery(env, await getUser(env.DB, 111), prod.title, sub, { protocol: 'mtproto' });
  check('تحویل تکراری انجام نمی‌شود', d2.sent === false && d2.reason === 'already_delivered', JSON.stringify(d2));
  check('در تحویل تکراری هیچ پیامی ارسال نمی‌شود', sent.filter((x) => x.method === 'sendMessage').length === 0);

  // پروتکل اشتراکی همچنان لینک /sub می‌گیرد
  const env2 = await makeEnv();
  await addRealServer(env2, { protocol: 'vless', ip: 'edge.realhost.net' });
  const { user: u2 } = await ensureUser(env2.DB, { id: 222, first_name: 'B' });
  const p2 = { id: 1, title: 'وی‌لس', protocol: 'vless', days: 30, server_count: 3 };
  const s2 = await createSubscription(env2, u2, p2, {});
  sent.length = 0;
  const d3 = await sendDelivery(env2, await getUser(env2.DB, 222), p2.title, s2, { protocol: 'vless' });
  check('تحویل VLESS انجام شد (رگرسیون)', d3.sent === true);
  check('VLESS لینک اشتراک /sub می‌گیرد (رگرسیون)', allText().includes('/sub/' + s2.token), lastText().slice(0, 200));
}

// ── ۲۲) هیچ خروجی‌ای نباید example.com داشته باشد ──
section('۲۲) حذف کامل سرورهای نمونه');
{
  const env = await makeEnv();
  const { ensureUser, getUser, realActiveServerCount } = await import('../src/db.js');
  const { createSubscription, subLandingHtml } = await import('../src/subs.js');
  const { user } = await ensureUser(env.DB, { id: 111, first_name: 'A' });

  const seeded = (await env.DB.prepare("SELECT COUNT(*) c FROM servers WHERE ip LIKE '%example.com'").first()).c;
  check('سرورهای نمونه در سید وجود دارند اما غیرفعال‌اند', (await env.DB.prepare("SELECT COUNT(*) c FROM servers WHERE ip LIKE '%example.com' AND active=1").first()).c === 0, `seeded=${seeded}`);

  await addRealServer(env, { ip: 'edge.realhost.net' });
  const prod = { id: 1, title: 'تست', protocol: 'vless', days: 30, server_count: 10 };
  const sub = await createSubscription(env, user, prod, {});
  const { buildConfigs } = await import('../src/subs.js');
  const joined = buildConfigs(sub.servers, sub.uuid, prod, 'A').join('\n');
  check('خروجی اشتراک شامل example.com نیست', !joined.includes('example.com'), joined.slice(0, 200));
  check('خروجی اشتراک شامل server.example.com نیست', !joined.includes('server.example.com'));

  const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE token=?').bind(sub.token).first();
  const pageText = await subLandingHtml(env, row);
  check('صفحهٔ /sub شامل example.com نیست', !pageText.includes('example.com'));

  check('شمارش سرور واقعی درست است', (await realActiveServerCount(env.DB)) === 1);

  // مهاجرت: دیتابیس قدیمی که سرورهای نمونه در آن فعال بوده‌اند
  const old = await makeEnv();
  await old.DB.prepare("UPDATE servers SET active=1 WHERE ip LIKE '%example.com'").run();
  await old.DB.prepare("DELETE FROM kv WHERE key='migration:placeholder_servers_v1'").run();
  const { migrate } = await import('../src/db.js');
  await migrate(old.DB);
  const stillActive = (await old.DB.prepare("SELECT COUNT(*) c FROM servers WHERE ip LIKE '%example.com' AND active=1").first()).c;
  check('مهاجرت سرورهای نمونهٔ فعال را غیرفعال می‌کند', stillActive === 0, `active=${stillActive}`);
}

// ── ۲۳) گیت تحویل وقتی سرور واقعی نیست ──
section('۲۳) توقف خرید بدون سرور واقعی');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { payWithWallet, assertDeliverable } = await import('../src/pay.js');
  await ensureUser(env.DB, { id: 111, first_name: 'A' });
  await env.DB.prepare('UPDATE users SET balance=1000000 WHERE id=111').run();
  const prod = await env.DB.prepare("SELECT * FROM products WHERE category='vless' LIMIT 1").first();

  const gate = await assertDeliverable(env, prod);
  check('بدون سرور واقعی، تحویل مجاز نیست', gate.ok === false && gate.reason === 'no_real_server', JSON.stringify(gate));
  check('پیام فارسی صحیح برگردانده می‌شود', String(gate.message).includes('هنوز سرور واقعی تنظیم نشده است'), gate.message);

  const pay = await payWithWallet(env, await getUser(env.DB, 111), prod, 100000);
  check('پرداخت بدون سرور واقعی رد می‌شود', pay.ok === false, JSON.stringify(pay));
  const bal = (await getUser(env.DB, 111)).balance;
  check('پول کاربر کسر نمی‌شود', bal === 1000000, String(bal));

  await addRealServer(env);
  const gate2 = await assertDeliverable(env, prod);
  check('پس از ثبت سرور واقعی تحویل مجاز می‌شود', gate2.ok === true);
  const pay2 = await payWithWallet(env, await getUser(env.DB, 111), prod, 100000);
  check('پس از ثبت سرور واقعی پرداخت موفق است', pay2.ok === true, JSON.stringify(pay2));
}

// ── ۲۴) گردونه شانس ──
section('۲۴) گردونه شانس مینی‌اپ');
{
  const env = await makeEnv();
  const { ensureUser, getUser, todayStr } = await import('../src/db.js');
  const { handleGameApi, SPIN_PRIZES } = await import('../src/game.js');
  await ensureUser(env.DB, { id: 111, first_name: 'A' });

  check('جوایز گردونه تعریف شده‌اند', Array.isArray(SPIN_PRIZES) && SPIN_PRIZES.length > 1, String(SPIN_PRIZES?.length));

  const initData = await makeInitData(111);
  const call = async (p, body = {}) => {
    const req = new Request('https://x.test' + p, { method: 'POST', body: JSON.stringify({ initData, ...body }) });
    return await (await handleGameApi(env, req, p)).json();
  };

  // دسترسی بدون initData معتبر باید رد شود
  const anon = await handleGameApi(env, new Request('https://x.test/api/game/spin', { method: 'POST', body: '{}' }), '/api/game/spin');
  check('چرخش بدون initData معتبر رد می‌شود', anon.status === 403, String(anon.status));

  const initState = await call('/api/game/init');
  check('init جوایز گردونه را به فرانت می‌دهد', Array.isArray(initState.spinPrizes) && initState.spinPrizes.length === SPIN_PRIZES.length, JSON.stringify(initState.spinPrizes));

  const before = (await getUser(env.DB, 111)).coins;
  const r1 = await call('/api/game/spin');
  check('اولین چرخش موفق است', r1.ok === true, JSON.stringify(r1));
  check('جایزه عدد مثبت است', Number(r1.prize) > 0, String(r1.prize));
  check('ایندکس برش معتبر است', Number.isInteger(r1.index) && r1.index >= 0 && r1.index < SPIN_PRIZES.length, String(r1.index));
  check('تعداد برش‌ها برگردانده می‌شود', r1.segments === SPIN_PRIZES.length, String(r1.segments));
  check('جایزه با ایندکس برش می‌خواند', r1.prize === SPIN_PRIZES[r1.index][0], `${r1.prize} vs ${SPIN_PRIZES[r1.index]?.[0]}`);
  const after = (await getUser(env.DB, 111)).coins;
  check('سکه به کاربر اضافه شد', after === before + r1.prize, `${before} → ${after}`);
  check('coins برگشتی با دیتابیس یکی است', r1.coins === after, `${r1.coins} vs ${after}`);
  check('spinDone برگردانده می‌شود', r1.spinDone === true);

  const r2 = await call('/api/game/spin');
  check('چرخش دوم در همان روز رد می‌شود', r2.ok === false && r2.reason === 'already', JSON.stringify(r2));
  const after2 = (await getUser(env.DB, 111)).coins;
  check('چرخش تکراری سکه اضافه نمی‌کند (ضد دابل‌کلیک)', after2 === after, `${after} → ${after2}`);
  check('پاسخ تکراری هم spinDone را برمی‌گرداند', r2.spinDone === true);

  // چرخش‌های موازی (دابل‌کلیک واقعی)
  const env2 = await makeEnv();
  await ensureUser(env2.DB, { id: 222, first_name: 'B' });
  const u2 = await getUser(env2.DB, 222);
  const init2 = await makeInitData(222);
  const par = await Promise.all([0, 1, 2, 3].map(async () => {
    const req = new Request('https://x.test/api/game/spin', { method: 'POST', body: JSON.stringify({ initData: init2 }) });
    return await (await handleGameApi(env2, req, '/api/game/spin')).json();
  }));
  const wins = par.filter((x) => x.ok === true);
  check('در چهار درخواست هم‌زمان فقط یکی برنده می‌شود', wins.length === 1, JSON.stringify(par.map((x) => x.ok)));
  const coinsPar = (await getUser(env2.DB, 222)).coins;
  check('سکهٔ اضافه دقیقاً یک جایزه است', coinsPar === (u2.coins || 0) + wins[0].prize, String(coinsPar));

  // روز بعد دوباره مجاز است
  await env.DB.prepare("UPDATE users SET last_spin_date='2000-01-01', spin_claim='' WHERE id=111").run();
  const r3 = await call('/api/game/spin');
  check('روز بعد دوباره می‌توان چرخاند', r3.ok === true, JSON.stringify(r3));

  // فرانت‌اند: گردونه واقعاً چرخانده می‌شود
  const { gameHtml } = await import('../src/game.js');
  const gh = gameHtml(env);
  const ghText = typeof gh === 'string' ? gh : await gh.text();
  check('فرانت‌اند گردونه دارای اشاره‌گر ثابت است', ghText.includes('pointer') || ghText.includes('اشاره'), '');
  check('فرانت‌اند چرخش را با transform انجام می‌دهد', ghText.includes('rotate('));
  check('فرانت‌اند از transitionend برای پایان انیمیشن استفاده می‌کند', ghText.includes('transitionend'));
  check('فرانت‌اند گارد ضد ارسال دوباره دارد', ghText.includes('spinning'));
}

// ── ۲۵) هوش مصنوعی: مدل، خطا و کسر سکه ──
section('۲۵) لایه هوش مصنوعی — مدل معتبر و مدیریت خطا');
{
  const { TEXT_MODELS, DEPRECATED_MODELS, aiChatComplete, aiDiagnostics, AI_ERRORS, aiErrorMessage } = await import('../src/ai.js');

  check('مدل پیش‌فرض منسوخ نیست (ریشهٔ باگ)', !DEPRECATED_MODELS.has(TEXT_MODELS[0]), TEXT_MODELS[0]);
  check('مدل منسوخ llama-3.1-8b-instruct دیگر استفاده نمی‌شود', !TEXT_MODELS.includes('@cf/meta/llama-3.1-8b-instruct'));
  check('زنجیرهٔ چند مدلی تعریف شده', TEXT_MODELS.length >= 2, String(TEXT_MODELS.length));

  // موفقیت
  const okEnv = await makeEnv();
  const r1 = await aiChatComplete(okEnv, [{ role: 'user', content: 'سلام' }]);
  check('پاسخ موفق AI برگردانده می‌شود', r1.ok === true && r1.text.includes('آزمایشی'), JSON.stringify(r1).slice(0, 120));
  check('مدل پاسخ‌گو گزارش می‌شود', !!r1.model, r1.model);

  // نبود بایندینگ
  const noEnv = await makeEnv({ ai: false });
  const r2 = await aiChatComplete(noEnv, [{ role: 'user', content: 'x' }]);
  check('نبود بایندینگ AI تشخیص داده می‌شود', r2.ok === false && r2.error === AI_ERRORS.BINDING_MISSING, JSON.stringify(r2));
  check('پیام خطای نبود بایندینگ فارسی و قابل فهم است', aiErrorMessage(r2.error).length > 10);

  // خطای مدل
  const errEnv = await makeEnv();
  errEnv.AI = { run: async () => { throw new Error('No such model'); } };
  const r3 = await aiChatComplete(errEnv, [{ role: 'user', content: 'x' }]);
  check('خطای مدل تشخیص داده می‌شود', r3.ok === false && r3.error === AI_ERRORS.MODEL_ERROR, JSON.stringify(r3));
  check('همهٔ مدل‌های زنجیره امتحان می‌شوند', Array.isArray(r3.tried) && r3.tried.length === TEXT_MODELS.length, JSON.stringify(r3.tried));

  // خطای سهمیه
  const qEnv = await makeEnv();
  qEnv.AI = { run: async () => { throw new Error('Rate limit exceeded (quota)'); } };
  const r4 = await aiChatComplete(qEnv, [{ role: 'user', content: 'x' }]);
  check('خطای سهمیه از خطای مدل تفکیک می‌شود', r4.error === AI_ERRORS.QUOTA, JSON.stringify(r4));

  // پاسخ نامعتبر
  const bEnv = await makeEnv();
  bEnv.AI = { run: async () => ({ nothing: true }) };
  const r5 = await aiChatComplete(bEnv, [{ role: 'user', content: 'x' }]);
  check('پاسخ نامعتبر تشخیص داده می‌شود', r5.ok === false && r5.error === AI_ERRORS.INVALID_RESPONSE, JSON.stringify(r5));

  // شکل‌های مختلف پاسخ
  for (const [name, payload] of [
    ['response', { response: 'A' }],
    ['result.response', { result: { response: 'A' } }],
    ['choices', { choices: [{ message: { content: 'A' } }] }],
    ['رشتهٔ خام', 'A'],
  ]) {
    const e = await makeEnv();
    e.AI = { run: async () => payload };
    const r = await aiChatComplete(e, [{ role: 'user', content: 'x' }]);
    check(`شکل پاسخ «${name}» پارس می‌شود`, r.ok === true && r.text === 'A', JSON.stringify(r));
  }

  // تشخیص
  const diag = await aiDiagnostics(okEnv);
  check('تشخیص AI موفق گزارش می‌دهد', diag.ok === true && diag.bound === true, JSON.stringify(diag).slice(0, 160));
  const diagNo = await aiDiagnostics(noEnv);
  check('تشخیص AI نبود بایندینگ را گزارش می‌دهد', diagNo.ok === false && diagNo.bound === false);
  check('خروجی تشخیص هیچ توکنی افشا نمی‌کند', !JSON.stringify(diag).includes('TESTTOKEN'));

  // انتخاب مدل توسط ادمین
  const { resolveTextModels } = await import('../src/ai.js');
  const cEnv = await makeEnv();
  const { setSetting } = await import('../src/db.js');
  await setSetting(cEnv.DB, 'ai_model', '@cf/meta/llama-3.2-3b-instruct');
  const chain = await resolveTextModels(cEnv);
  check('مدل انتخابی ادمین اولویت دارد', chain[0] === '@cf/meta/llama-3.2-3b-instruct', chain[0]);
  await setSetting(cEnv.DB, 'ai_model', '@cf/meta/llama-3.1-8b-instruct');
  const chain2 = await resolveTextModels(cEnv);
  check('مدل منسوخِ انتخاب‌شده نادیده گرفته می‌شود', chain2[0] !== '@cf/meta/llama-3.1-8b-instruct', chain2[0]);
}

// ── ۲۶) پیام‌های خرید تکراری نباشند ──
section('۲۶) پیام‌های تحویل بدون تکرار');
{
  const env = await makeEnv();
  const { ensureUser, getUser } = await import('../src/db.js');
  const { payWithWallet } = await import('../src/pay.js');
  await addRealServer(env);
  await ensureUser(env.DB, { id: 111, first_name: 'A' });
  await env.DB.prepare('UPDATE users SET balance=5000000 WHERE id=111').run();
  const prod = await env.DB.prepare("SELECT * FROM products WHERE category='vless' LIMIT 1").first();

  sent.length = 0;
  const pay = await payWithWallet(env, await getUser(env.DB, 111), prod, 100000);
  check('پرداخت با کیف پول موفق است', pay.ok === true);
  const { sendDelivery } = await import('../src/pay.js');
  await sendDelivery(env, await getUser(env.DB, 111), prod.title, pay.sub, { protocol: prod.protocol });
  const msgs = textsSent();
  const subLinks = msgs.filter((t) => t.includes('/sub/'));
  check('لینک اشتراک فقط یک‌بار ارسال می‌شود', subLinks.length === 1, `count=${subLinks.length}`);
  check('پیام «تحویل شد» جدا از پیام پرداخت تکرار نمی‌شود', msgs.filter((t) => t.includes('تحویل شد')).length <= 1, JSON.stringify(msgs).slice(0, 300));

  // فراخوانی دوباره (retry تلگرام) نباید پیام دوم بفرستد
  sent.length = 0;
  const again = await sendDelivery(env, await getUser(env.DB, 111), prod.title, pay.sub, { protocol: prod.protocol });
  check('تحویل دوباره پیام تکراری نمی‌فرستد', again.sent === false && textsSent().length === 0, JSON.stringify(again));
}

// ── ۲۷) کنترل دسترسی و نشت اطلاعات در پنل وب ──
section('۲۷) امنیت پنل وب');
{
  const env = await makeEnv();
  const { handlePanelApi, ensurePanelPassword, panelHtml } = await import('../src/panel.js');
  const pw = await ensurePanelPassword(env.DB);
  const post = (p, body = {}, headers = {}) =>
    handlePanelApi(env, new Request('https://x.test' + p, { method: 'POST', body: JSON.stringify(body), headers }), p);

  for (const p of ['/api/panel/state', '/api/panel/products/list', '/api/panel/servers/list', '/api/panel/users/list', '/api/panel/orders/list', '/api/panel/receipts/list', '/api/panel/settings']) {
    check(`دسترسی بدون ورود به ${p} رد می‌شود`, (await post(p)).status === 401);
  }

  const login = await post('/api/panel/login', { password: pw });
  const tok = (login.headers.get('Set-Cookie') || '').match(/nova_panel=([a-f0-9]{32})/)?.[1];
  const auth = { Cookie: `nova_panel=${tok}` };
  check('ورود موفق و توکن سشن صادر شد', !!tok);

  const state = await (await post('/api/panel/state', {}, auth)).json();
  check('داشبورد آمار برمی‌گرداند', state.ok && typeof state.stats.users === 'number', JSON.stringify(state.stats || {}).slice(0, 120));
  check('داشبورد هشدار نبود سرور واقعی می‌دهد', (state.warnings || []).some((w) => w.includes('سرور واقعی')), JSON.stringify(state.warnings));
  check('توکن ربات در پاسخ داشبورد نیست', !JSON.stringify(state).includes('TESTTOKEN'));
  check('رمز پنل در پاسخ داشبورد نیست', !JSON.stringify(state).includes(pw));

  const htmlRes = await panelHtml(env);
  const htmlTxt = await htmlRes.text();
  check('توکن ربات در HTML پنل نیست', !htmlTxt.includes('TESTTOKEN'));
  check('رمز پنل در HTML پنل نیست', !htmlTxt.includes(pw));
  check('پنل RTL فارسی است', htmlTxt.includes('dir="rtl"') && htmlTxt.includes('lang="fa"'));
  check('پنل موبایل‌فرندلی است (viewport)', htmlTxt.includes('name="viewport"'));
  for (const tab of ['داشبورد', 'محصولات', 'سرورها', 'کاربران', 'سفارش‌ها', 'فیش‌ها', 'گروه‌ها', 'تنظیمات']) {
    check(`تب «${tab}» در پنل هست`, htmlTxt.includes(tab));
  }

  // تلاش برای نوشتن کلید حساس از طریق تنظیمات
  await post('/api/panel/settings', { telegram_bot_token: 'HACKED', panel_password: '9999999999' }, auth);
  const { getSetting } = await import('../src/db.js');
  check('توکن ربات از API تنظیمات قابل تغییر نیست', (await getSetting(env.DB, 'telegram_bot_token', '')) !== 'HACKED');
  check('رمز پنل از API تنظیمات قابل تغییر نیست', (await getSetting(env.DB, 'panel_password', '')) !== '9999999999');

  // مدیریت محصول
  const save = await (await post('/api/panel/products/save', { title: 'محصول پنلی', category: 'vless', days: 30, price_usd: 3 }, auth)).json();
  check('افزودن محصول از پنل کار می‌کند', save.ok === true, JSON.stringify(save));
  const plist = await (await post('/api/panel/products/list', { q: 'محصول پنلی' }, auth)).json();
  check('محصول جدید در لیست دیده می‌شود', plist.items.some((x) => x.title === 'محصول پنلی'));
  check('لیست محصولات صفحه‌بندی دارد', typeof plist.total === 'number' && typeof plist.pageSize === 'number');
  const delNoConfirm = await (await post('/api/panel/products/delete', { id: plist.items[0].id }, auth)).json();
  check('حذف بدون تایید رد می‌شود', delNoConfirm.ok === false);

  // مدیریت سرور
  const bad = await (await post('/api/panel/servers/save', { name: 'X', protocol: 'mtproto', ip: 'x.example.com', port: 443, secret: 'dd0123456789abcdef0123456789abcdef', active: true }, auth)).json();
  check('ثبت سرور با هاست نمونه رد می‌شود', bad.ok === false, JSON.stringify(bad));
  const noSecret = await (await post('/api/panel/servers/save', { name: 'MT', protocol: 'mtproto', ip: 'mtp.realhost.net', port: 443, secret: '', active: true }, auth)).json();
  check('فعال‌سازی سرور MTProto بدون سکرت رد می‌شود', noSecret.ok === false && Array.isArray(noSecret.issues), JSON.stringify(noSecret));
  const good = await (await post('/api/panel/servers/save', { name: 'MT', country: '🇩🇪', protocol: 'mtproto', ip: 'mtp.realhost.net', port: 443, secret: 'dd0123456789abcdef0123456789abcdef', active: true }, auth)).json();
  check('ثبت سرور MTProto کامل موفق است', good.ok === true, JSON.stringify(good));
  const slist = await (await post('/api/panel/servers/list', {}, auth)).json();
  const mt = slist.items.find((x) => x.name === 'MT');
  check('سرور جدید آمادهٔ تحویل علامت می‌خورد', mt?.ready === true, JSON.stringify(mt));
  check('سکرت کامل در API پنل برنمی‌گردد', !JSON.stringify(slist).includes('dd0123456789abcdef0123456789abcdef'), JSON.stringify(mt));

  // کاربران و سفارش‌ها
  const ulist = await (await post('/api/panel/users/list', {}, auth)).json();
  check('لیست کاربران کار می‌کند', ulist.ok === true && Array.isArray(ulist.items));
  const olist = await (await post('/api/panel/orders/list', {}, auth)).json();
  check('لیست سفارش‌ها کار می‌کند', olist.ok === true && Array.isArray(olist.items));
  const rlist = await (await post('/api/panel/receipts/list', {}, auth)).json();
  check('لیست فیش‌ها کار می‌کند', rlist.ok === true && Array.isArray(rlist.items));
  const missing = await (await post('/api/panel/receipts/approve', { id: 99999 }, auth)).json();
  check('تایید فیش ناموجود خطای روشن می‌دهد', missing.ok === false && missing.error.includes('یافت نشد'), JSON.stringify(missing));

  // خروج
  const out = await post('/api/panel/logout', {}, auth);
  check('خروج از پنل کار می‌کند', out.status === 200);
  check('پس از خروج سشن نامعتبر است', (await post('/api/panel/state', {}, auth)).status === 401);
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

// ── ۲۸) قیمت‌گذاری پویا و کد تخفیف (بخش ۵) ──
section('۲۸) قیمت‌گذاری پویا و کد تخفیف');
{
  const env = await makeEnv();
  const { setSetting } = await import('../src/db.js');
  const { computeDynamicPrice, applyDiscountCode, tierDiscount, discountTiers, consumeDiscountCode } = await import('../src/pricing.js');

  // تنظیمات تمیز برای محاسبهٔ قطعی
  await setSetting(env.DB, 'price_base', '1');
  await setSetting(env.DB, 'price_per_gb', '0');
  await setSetting(env.DB, 'price_per_day', '0');
  await setSetting(env.DB, 'price_per_device', '0');
  await setSetting(env.DB, 'margin', '1');
  await setSetting(env.DB, 'usd_rate_manual', '100000');
  await setSetting(env.DB, 'discount_tiers', '[{"days":30,"percent":10},{"gb":100,"percent":5}]');

  const tiers = await discountTiers(env);
  check('جدول تخفیف پلکانی خوانده می‌شود', Array.isArray(tiers) && tiers.length === 2);
  check('تخفیف پلکانی مدت اعمال می‌شود', tierDiscount(tiers, 30, 0) === 10, String(tierDiscount(tiers, 30, 0)));
  check('تخفیف پلکانی حجم اعمال می‌شود', tierDiscount(tiers, 30, 100) === 10, String(tierDiscount(tiers, 30, 100)));
  check('بدون تطبیق تخفیف صفر است', tierDiscount(tiers, 10, 0) === 0, String(tierDiscount(tiers, 10, 0)));

  const base = await computeDynamicPrice(env, { days: 30, traffic_gb: 0, devices: 1, protocol: 'vless', location: 'default', tier: 'standard' });
  check('فرمول پایه قیمت می‌دهد', base.ok === true && base.toman === 90000, JSON.stringify(base)); // 100000 × 0.9
  check('رند به نزدیک‌ترین ۱۰۰۰', base.toman % 1000 === 0);

  const withGb = await computeDynamicPrice(env, { days: 30, traffic_gb: 100, devices: 1, protocol: 'vless', location: 'default', tier: 'standard' });
  check('تخفیف حجم در محاسبه اعمال می‌شود', withGb.toman === 90000, String(withGb.toman));

  // کد تخفیف درصدی
  await env.DB.prepare("INSERT INTO discount_codes (code, kind, value, max_uses, active, created_at) VALUES ('NOVA10','percent',10,0,1,?)").bind(Math.floor(Date.now() / 1000)).run();
  const coded = await computeDynamicPrice(env, { days: 30, traffic_gb: 0, devices: 1, protocol: 'vless', location: 'default', tier: 'standard', code: 'nova10' });
  check('کد تخفیف درصدی روی قیمت اعمال می‌شود', coded.ok === true && coded.toman === 80000, JSON.stringify(coded)); // 100000 × (1−0.2)

  // کد تخفیف مبلغی
  await env.DB.prepare("INSERT INTO discount_codes (code, kind, value, max_uses, active, created_at) VALUES ('FLAT5K','amount',5000,0,1,?)").bind(Math.floor(Date.now() / 1000)).run();
  const flat = await computeDynamicPrice(env, { days: 30, traffic_gb: 0, devices: 1, protocol: 'vless', location: 'default', tier: 'standard', code: 'FLAT5K' });
  check('کد تخفیف مبلغی اعمال می‌شود', flat.toman === 85000, String(flat.toman)); // 90000 − 5000

  // کد نامعتبر / منقضی / سقف استفاده / حداقل سفارش / مخصوص کاربر
  const invalid = await applyDiscountCode(env, 'NOTEXIST', 111, 100000);
  check('کد نامعتبر رد می‌شود', invalid.ok === false);
  await env.DB.prepare("INSERT INTO discount_codes (code, kind, value, max_uses, active, expires_at, created_at) VALUES ('OLD','percent',10,0,1,1,?)").bind(Math.floor(Date.now() / 1000)).run();
  check('کد منقضی رد می‌شود', (await applyDiscountCode(env, 'OLD', 111, 100000)).ok === false);
  await env.DB.prepare("INSERT INTO discount_codes (code, kind, value, max_uses, used_count, active, created_at) VALUES ('LIMIT','percent',10,1,1,1,?)").bind(Math.floor(Date.now() / 1000)).run();
  check('کد با سقف استفادهٔ پر رد می‌شود', (await applyDiscountCode(env, 'LIMIT', 111, 100000)).ok === false);
  await env.DB.prepare("INSERT INTO discount_codes (code, kind, value, min_order, active, created_at) VALUES ('MIN','percent',10,500000,1,?)").bind(Math.floor(Date.now() / 1000)).run();
  check('کد با حداقل سفارش رد می‌شود', (await applyDiscountCode(env, 'MIN', 111, 100000)).ok === false);
  await env.DB.prepare("INSERT INTO discount_codes (code, kind, value, user_id, active, created_at) VALUES ('PRIVATE','percent',10,999,1,?)").bind(Math.floor(Date.now() / 1000)).run();
  check('کد مخصوص کاربر دیگر رد می‌شود', (await applyDiscountCode(env, 'PRIVATE', 111, 100000)).ok === false);

  // تخفیف وفاداری
  const { ensureUser } = await import('../src/db.js');
  await ensureUser(env.DB, { id: 111, first_name: 'A' });
  await env.DB.prepare('UPDATE users SET total_paid=200000 WHERE id=111').run();
  await setSetting(env.DB, 'loyalty_discount_percent', '5');
  await setSetting(env.DB, 'loyalty_min_paid', '100000');
  const loyal = await computeDynamicPrice(env, { days: 30, traffic_gb: 0, devices: 1, protocol: 'vless', location: 'default', tier: 'standard', userId: 111 });
  check('تخفیف وفاداری اعمال می‌شود', loyal.breakdown.loyaltyDiscountPercent === 5 && loyal.toman === 85000, JSON.stringify(loyal));

  const codeRow = await env.DB.prepare("SELECT id FROM discount_codes WHERE code='NOVA10'").first();
  await consumeDiscountCode(env, codeRow.id);
  const after = await env.DB.prepare("SELECT used_count FROM discount_codes WHERE code='NOVA10'").first();
  check('مصرف کد تخفیف شمارنده را زیاد می‌کند', after.used_count === 1, String(after.used_count));
}

// ── ۲۹) مخزن IP تمیز و پروب (بخش ۱) ──
section('۲۹) مخزن IP تمیز و پروب');
{
  const env = await makeEnv();
  const { setSetting } = await import('../src/db.js');
  const { ensureUser, getUser } = await import('../src/db.js');
  const {
    parseIpEntries, sampleCidr, scoreOf, iqrBounds, addCleanIps, probeTargets,
    applyProbeReport, applyBestCleanIps, importCloudflareRanges, probeReport,
  } = await import('../src/cleanip.js');

  check('parseIpEntries تجزیه می‌کند', JSON.stringify(parseIpEntries('104.16.0.1:443 104.16.0.2')) === JSON.stringify([{ ip: '104.16.0.1', port: 443 }, { ip: '104.16.0.2', port: 443 }]));
  const sample = sampleCidr('104.16.0.0/13', 5);
  check('نمونه‌برداری CIDR آدرس‌های داخل رنج می‌دهد', sample.length === 5 && sample.every((ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)), JSON.stringify(sample));
  check('scoreOf فرمول پایدار دارد', scoreOf({ samples: 10, avg_ms: 100, success_rate: 1, consecutive_fail: 0 }) === scoreOf({ samples: 10, avg_ms: 100, success_rate: 1, consecutive_fail: 0 }));
  check('scoreOf شکست پیاپی را جریمه می‌کند', scoreOf({ samples: 10, avg_ms: 100, success_rate: 1, consecutive_fail: 5 }) < scoreOf({ samples: 10, avg_ms: 100, success_rate: 1, consecutive_fail: 0 }));
  const bounds = iqrBounds([100, 110, 105, 108, 120, 115, 200, 112]);
  check('IQR مرز پرت می‌دهد', bounds && bounds.lo < bounds.hi);

  // پیش‌فرض خاموش
  check('پروب پیش‌فرض خاموش است', (await probeTargets(env, 6)).length === 0);
  await setSetting(env.DB, 'probe_enabled', '1');
  await setSetting(env.DB, 'probe_daily_cap', '1');
  await setSetting(env.DB, 'probe_reward_coins', '5');

  const n1 = await addCleanIps(env, [{ ip: '104.16.0.1', port: 443 }, { ip: '104.16.0.2' }]);
  check('افزودن IP تمیز', n1 === 2, String(n1));
  check('هاست نمونه در مخزن IP رد می‌شود', (await addCleanIps(env, [{ ip: 'x.example.com' }])) === 0);

  const targets = await probeTargets(env, 2);
  check('probeTargets کاندید می‌دهد', targets.length === 2, JSON.stringify(targets));

  const { user } = await ensureUser(env.DB, { id: 111, first_name: 'A' });
  const ip1 = await env.DB.prepare("SELECT * FROM clean_ips WHERE ip='104.16.0.1'").first();
  const r1 = await applyProbeReport(env, user, { ip_id: ip1.id, ms: 50, ok: true, operator: 'mci' });
  check('گزارش معتبر ثبت و سکه می‌گیرد', r1.ok === true && r1.reward === 5, JSON.stringify(r1));
  const ip1b = await env.DB.prepare('SELECT * FROM clean_ips WHERE id=?').bind(ip1.id).first();
  check('میانگین و تعداد نمونه ثبت شد', ip1b.samples === 1 && ip1b.avg_ms === 50, JSON.stringify(ip1b));
  check('سکه به کاربر افزوده شد', (await getUser(env.DB, 111)).coins === 5);

  // گزارش بدون initData معتبر رد می‌شود (route)
  const anon = await probeReport(env, new Request('https://x.test/api/probe/report', { method: 'POST', body: JSON.stringify({ ip_id: ip1.id, ms: 10 }) }));
  check('گزارش پروب بدون initData معتبر رد می‌شود', anon.status === 403, String(anon.status));

  // سقف روزانه
  const r2 = await applyProbeReport(env, user, { ip_id: ip1.id, ms: 60, ok: true });
  check('سقف روزانه اعمال می‌شود', r2.ok === false && r2.reason === 'daily_cap', JSON.stringify(r2));

  // مدارشکن: ۵ شکست پیاپی → غیرفعال موقت
  const env2 = await makeEnv();
  await setSetting(env2.DB, 'probe_enabled', '1');
  await setSetting(env2.DB, 'probe_daily_cap', '100');
  await addCleanIps(env2, [{ ip: '104.16.0.9' }]);
  const { user: u2 } = await ensureUser(env2.DB, { id: 222, first_name: 'B' });
  const ip9 = await env2.DB.prepare("SELECT * FROM clean_ips WHERE ip='104.16.0.9'").first();
  for (let i = 0; i < 5; i++) await applyProbeReport(env2, u2, { ip_id: ip9.id, ms: 300 + i * 10, ok: false });
  const ip9b = await env2.DB.prepare('SELECT * FROM clean_ips WHERE id=?').bind(ip9.id).first();
  check('شکست پیاپی IP را خودکار غیرفعال می‌کند (مدارشکن)', ip9b.active === 0 && Number(ip9b.blocked_until) > 0, JSON.stringify(ip9b));
  const afterBlock = await probeTargets(env2, 6);
  check('IP مدارشکن‌شده در کاندیدها نمی‌آید', !afterBlock.some((t) => t.id === ip9.id), JSON.stringify(afterBlock));

  // ایمپورت رنج کلادفلر (mock شده)
  const n3 = await importCloudflareRanges(env, 10);
  check('ایمپورت رنج کلادفلر نمونه می‌گیرد', n3 > 0, String(n3));

  // اعمال بهترین‌ها روی سرورها (فقط ستون clean_ip)
  await addRealServer(env, { protocol: 'vless', ip: 'edge.realhost.net' });
  const applied = await applyBestCleanIps(env, 'vless', 10);
  check('اعمال بهترین IP روی سرور vless', applied >= 1, String(applied));
}

// ── ۳۰) ساخت خودکار سکرت (بخش ۴) ──
section('۳۰) ساخت خودکار سکرت/کلید');
{
  const { randomUuid, randomSecurePassword, randomMtprotoSecret, generateSecretFor, MTPROTO_SECRET_WARNING } = await import('../src/secrets.js');
  const { isValidMtprotoSecret } = await import('../src/proxy.js');

  check('UUID معتبر ساخته می‌شود', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(randomUuid()));
  const pw = randomSecurePassword(32);
  check('پسورد امن حداقل ۲۴ کاراکتر base64url', pw.length >= 24 && /^[A-Za-z0-9_-]{24,}$/.test(pw));

  const raw = randomMtprotoSecret('raw');
  check('سکرت MTProto خام ۳۲ هگزی معتبر است', /^[0-9a-f]{32}$/i.test(raw) && isValidMtprotoSecret(raw));
  const dd = randomMtprotoSecret('dd');
  check('سکرت dd+هگز معتبر است', dd.startsWith('dd') && isValidMtprotoSecret(dd));
  const ee = randomMtprotoSecret('ee', 'www.microsoft.com');
  check('سکرت ee+هگز+FakeTLS معتبر است', ee.startsWith('ee') && isValidMtprotoSecret(ee), ee);

  const vless = generateSecretFor('vless');
  check('سکرت VLESS یک UUID است', /^[0-9a-f-]{36}$/i.test(vless.secret));
  const mtp = generateSecretFor('mtproto');
  check('سکرت MTProto معتبر و همراه هشدار است', isValidMtprotoSecret(mtp.secret) && mtp.note === MTPROTO_SECRET_WARNING);
  check('هشدار MTProto به محدودیت Worker اشاره دارد', MTPROTO_SECRET_WARNING.includes('TCP خام ورودی'));
  const reality = generateSecretFor('reality');
  check('Reality فقط راهنما می‌دهد (کلید جعلی نمی‌سازد)', !!reality.error && reality.error.includes('x25519'));
}

// ── ۳۱) بخش ۰ — ساب داینامیک، multi-IP و kill-switch ──
section('۳۱) ساب داینامیک، multi-IP و kill-switch');
{
  const { bestCleanIps, protocolHealth, checkDeliverable, setProductKillSwitch, killSwitchStatus, buildConfigsMulti, dynamicSubContent, createSubscription, subLandingHtml } = await import('../src/subs.js');
  const { applyConnectionFeedback, addCleanIps } = await import('../src/cleanip.js');
  const { ensureUser } = await import('../src/db.js');

  const env = await makeEnv();
  const { user } = await ensureUser(env.DB, { id: 333, first_name: 'K' });
  await addRealServer(env, { protocol: 'vless', ip: 'edge.realhost.net', name: 'سرور آلمان' });

  // ۱) bestCleanIps: فعال، خارج از مدارشکن و مرتب بر اساس امتیاز
  await addCleanIps(env, [{ ip: '104.16.0.10' }, { ip: '104.16.0.11' }, { ip: '104.16.0.12' }]);
  await env.DB.prepare("UPDATE clean_ips SET samples=5, score=40 WHERE ip='104.16.0.10'").run();
  await env.DB.prepare("UPDATE clean_ips SET samples=50, score=95 WHERE ip='104.16.0.11'").run();
  await env.DB.prepare("UPDATE clean_ips SET samples=20, score=70 WHERE ip='104.16.0.12'").run();
  const ips = await bestCleanIps(env.DB, 2);
  check('bestCleanIps بر اساس امتیاز مرتب است', ips[0] === '104.16.0.11', JSON.stringify(ips));
  check('bestCleanIps آی‌پی نمونه/مدارشکن را نمی‌آورد', ips.every((i) => !/example\.(com|net|org)/i.test(i)), JSON.stringify(ips));

  // ۲) buildConfigsMulti: چند کانفیگ برای هر سرور با IPهای تمیز
  const srv = await env.DB.prepare("SELECT * FROM servers WHERE protocol='vless' AND active=1 ORDER BY id DESC LIMIT 1").first();
  const multi = buildConfigsMulti([srv], 'UUIDM', { title: 'تست', days: 30, protocol: 'vless' }, '', { cleanIps: ips, perServer: 2 });
  check('buildConfigsMulti چند کانفیگ می‌سازد', multi.length >= 2, JSON.stringify(multi));
  check('کانفیگ multi حاوی IP تمیز است', multi.some((l) => l.includes(ips[0])), JSON.stringify(multi));
  check('کانفیگ multi هاست نمونه ندارد', !multi.some((l) => /example\.(com|net|org)/i.test(l)));

  // ۳) kill-switch دستی ادمین
  const ok0 = await checkDeliverable(env.DB, { protocol: 'vless', server_count: 5 });
  check('checkDeliverable با مسیر سالم ok است', ok0.ok === true, JSON.stringify(ok0));
  await setProductKillSwitch(env.DB, 'vless', '1');
  const off = await checkDeliverable(env.DB, { protocol: 'vless', server_count: 5 });
  check('kill-switch دستی خاموش مانع تحویل می‌شود', off.ok === false && off.reason === 'manual_killswitch', JSON.stringify(off));
  await setProductKillSwitch(env.DB, 'vless', '0');
  const on = await checkDeliverable(env.DB, { protocol: 'vless', server_count: 5 });
  check('kill-switch force_on تحویل می‌دهد', on.ok === true, JSON.stringify(on));
  await setProductKillSwitch(env.DB, 'vless', '');
  const st = await killSwitchStatus(env.DB);
  check('killSwitchStatus وضعیت vless را گزارش می‌کند', st.vless && st.vless.available === true, JSON.stringify(st.vless));
  check('killSwitchStatus پروتکل نامعتبر را رد می‌کند', (await setProductKillSwitch(env.DB, 'hack', '1')).ok === false);

  // ۴) kill-switch خودکار: هیچ مسیر سالمی نمانده
  await env.DB.prepare('UPDATE servers SET healthy=0').run();
  const auto = await checkDeliverable(env.DB, { protocol: 'vless', server_count: 5 });
  check('بدون مسیر سالم kill-switch خودکار ok=false', auto.ok === false && auto.reason === 'no_healthy_route', JSON.stringify(auto));
  await env.DB.prepare('UPDATE servers SET healthy=1').run();

  // ۵) dynamicSubContent در هر fetch بازسازی می‌شود
  const sub = await createSubscription(env, user, { id: 1, title: 'محصول', protocol: 'vless', days: 30, server_count: 5 }, {});
  const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE token=?').bind(sub.token).first();
  const dyn = await dynamicSubContent(env, row);
  check('dynamicSubContent ok با کانفیگ چندگانه', dyn.ok === true && dyn.lines.length >= 1, JSON.stringify({ ok: dyn.ok, n: dyn.lines.length }));
  check('dynamicSubContent IPهای تمیز را گزارش می‌کند', dyn.cleanIps.length >= 1, JSON.stringify(dyn.cleanIps));

  // ۶) subLandingHtml: تحویل واقعی + پیام صادقانه در kill-switch
  const html1 = await subLandingHtml(env, row);
  check('صفحه ساب کانفیگ واقعی دارد', html1.includes('vless://'));
  check('صفحه ساب دکمه تأیید IP تمیز دارد', html1.includes('connOk'));
  await setProductKillSwitch(env.DB, 'vless', '1');
  const html2 = await subLandingHtml(env, row);
  check('صفحه ساب در kill-switch پیام صادقانه می‌دهد', html2.includes('سرویس در دسترس نیست') && !html2.includes('vless://'));
  await setProductKillSwitch(env.DB, 'vless', '');

  // ۷) استخراج خودکار IP از اتصال موفق کاربر (applyConnectionFeedback)
  const fbBad = await applyConnectionFeedback(env, row.token, '1.2.3.4');
  check('بازخورد IP خارج از کانفیگ رد می‌شود', fbBad.ok === false && fbBad.reason === 'not_in_config', JSON.stringify(fbBad));
  const fbTok = await applyConnectionFeedback(env, 'BADTOKEN', ips[0]);
  check('بازخورد با توکن نامعتبر رد می‌شود', fbTok.ok === false && fbTok.reason === 'notfound', JSON.stringify(fbTok));
  const fbOk = await applyConnectionFeedback(env, row.token, ips[0]);
  check('بازخورد معتبر ثبت و به clean_ips می‌رود', fbOk.ok === true, JSON.stringify(fbOk));
  const added = await env.DB.prepare('SELECT * FROM clean_ips WHERE ip=?').bind(ips[0]).first();
  check('IP تأییدشده امتیاز و نمونه دارد', added && Number(added.samples) >= 1 && Number(added.score) >= 0, JSON.stringify(added && { samples: added.samples, score: added.score }));
  const fbDup = await applyConnectionFeedback(env, row.token, ips[0]);
  check('بازخورد تکراری در ساعت rate-limit می‌شود', fbDup.ok === false && fbDup.reason === 'rate_limited', JSON.stringify(fbDup));
}

// ── ۳۲) تانل VLESS-over-WS (بخش ۲) — منطق خالص ──
section('۳۲) تانل VLESS-over-WS داخل ورکر');
{
  const env = await makeEnv();
  const { setSetting, ensureUser, getUser } = await import('../src/db.js');
  const {
    parseVlessHeader, isBlockedLiteral, targetAllowed, tunnelGate, tunnelWsPath,
    findSubscriptionByUuid, subQuotaOk, recordTunnelTraffic, tunnelUsage,
    ensureTunnelUuid, randomUuidV4, buildTunnelConfig, logTunnelError,
  } = await import('../src/tunnel.js');

  // سازندهٔ بایت‌های سربرگ VLESS
  const hex = (uuid) => String(uuid).replace(/-/g, '');
  const u8 = (hexStr) => {
    const out = [];
    for (let i = 0; i < hexStr.length; i += 2) out.push(parseInt(hexStr.substr(i, 2), 16));
    return out;
  };
  const tcp = (host, port, atyp) => {
    let addr;
    if (atyp === 1) addr = host.split('.').map(Number);
    else if (atyp === 3) addr = hex(host).match(/.{2}/g).map((x) => parseInt(x, 16));
    else addr = [host.length, ...[...host].map((c) => c.charCodeAt(0))];
    return [0x00, ...u8(hex(uuid)), 0x00, 0x01, (port >> 8) & 0xff, port & 0xff, atyp, ...addr];
  };

  const uuid = randomUuidV4();
  const p1 = parseVlessHeader(tcp('104.16.0.1', 443, 1));
  check('پارس TCP IPv4 موفق است', p1.ok === true, JSON.stringify(p1));
  check('UUID از هدر خوانده می‌شود', p1.uuid === uuid, `${p1.uuid} vs ${uuid}`);
  check('هاست IPv4 خوانده می‌شود', p1.host === '104.16.0.1', p1.host);
  check('پورت ۴۴۳ خوانده می‌شود', p1.port === 443, String(p1.port));
  check('UDP نیست', p1.udp === false);

  const p2 = parseVlessHeader(tcp('www.google.com', 8443, 2));
  check('پارس دامنه موفق است', p2.ok === true && p2.host === 'www.google.com', p2.host);
  check('پورت دامنه ۸۴۴۳ است', p2.port === 8443, String(p2.port));

  // UDP صریحاً رد می‌شود
  const udpHdr = tcp('8.8.8.8', 53, 1);
  udpHdr[18] = 0x02; // تغییر کماند به UDP
  const pUdp = parseVlessHeader(udpHdr);
  check('UDP پشتیبانی نمی‌شود (مشخص می‌شود)', pUdp.udp === true, JSON.stringify(pUdp));

  // دادهٔ ناقص
  const short = parseVlessHeader([0x00, 0x01]);
  check('هدر ناقص needMore برمی‌گرداند', short.ok === false && short.needMore === true);
  const badVer = parseVlessHeader([0x99, 0, 0]);
  check('نسخهٔ نامعتبر رد می‌شود', badVer.ok === false && (badVer.error || '').startsWith('unsupported_version'));

  // آدرس‌های ممنوع
  check('loopback IPv4 بلاک است', isBlockedLiteral('127.0.0.1'));
  check('10/8 بلاک است', isBlockedLiteral('10.1.2.3'));
  check('172.16/12 بلاک است', isBlockedLiteral('172.31.0.1'));
  check('192.168/16 بلاک است', isBlockedLiteral('192.168.1.1'));
  check('multicast بلاک است', isBlockedLiteral('239.1.1.1'));
  check('IPv6 loopback بلاک است', isBlockedLiteral('::1'));
  check('IP عمومی Cloudflare بلاک نیست', !isBlockedLiteral('104.16.0.1'));
  check('IPv6 عمومی بلاک نیست', !isBlockedLiteral('2606:4700:4700::1111'));
  check('targetAllowed پورت بد را رد می‌کند', targetAllowed('8.8.8.8', 0).ok === false);
  check('targetAllowed مقصد بلاک را رد می‌کند', targetAllowed('10.0.0.1', 443).ok === false);
  check('targetAllowed مقصد عمومی را می‌پذیرد', targetAllowed('8.8.8.8', 443).ok === true);

  // گیت: پیش‌فرض خاموش
  const url = new URL('https://novabot-sample.workers.dev/wss-x');
  let g = await tunnelGate(env, new Request(url, { headers: { upgrade: 'websocket' } }), url);
  check('تانل پیش‌فرض خاموش است', g.ok === false && g.reason === 'not_enabled', JSON.stringify(g));
  await setSetting(env.DB, 'tunnel_enabled', '1');
  const path = await tunnelWsPath(env);
  check('مسیر WS رندوم ساخته و ذخیره می‌شود', path.startsWith('/wss-') && path.length > 6, path);
  const url2 = new URL('https://novabot-sample.workers.dev' + path);
  g = await tunnelGate(env, new Request(url2, { headers: { upgrade: 'websocket' } }), url2);
  check('در مسیر درست و با upgrade گیت باز می‌شود', g.ok === true, JSON.stringify(g));
  const urlBad = new URL('https://novabot-sample.workers.dev/other');
  g = await tunnelGate(env, new Request(urlBad, { headers: { upgrade: 'websocket' } }), urlBad);
  check('مسیر دیگر ۴۰۴ می‌گیرد', g.ok === false && g.reason === 'not_found');
  const urlNoWs = new URL('https://novabot-sample.workers.dev' + path);
  g = await tunnelGate(env, new Request(urlNoWs), urlNoWs);
  check('بدون upgrade رد می‌شود', g.ok === false && g.reason === 'not_ws');

  // اشتراک + UUID
  const { user } = await ensureUser(env.DB, { id: 7001, first_name: 'T' });
  await env.DB.prepare('INSERT INTO subscriptions (user_id, product_id, title, token, uuid, days, expire_at, active, created_at) VALUES (?,0,?,?,?,?,?,1,?)')
    .bind(user.id, 'تانل', 'tun1', uuid, 30, Math.floor(Date.now() / 1000) + 86400, Math.floor(Date.now() / 1000))
    .run();
  const found = await findSubscriptionByUuid(env, uuid);
  check('اشتراک با UUID تانل پیدا می‌شود', !!found && found.token === 'tun1');
  const none = await findSubscriptionByUuid(env, randomUuidV4());
  check('UUID نامعتبر پیدا نمی‌شود', none === null);

  // سقف/انقضا
  const okQ = await subQuotaOk(env, found);
  check('اشتراک سالم سقف را رد نمی‌کند', okQ.ok === true);
  await env.DB.prepare('UPDATE subscriptions SET expire_at=? WHERE token=?').bind(Math.floor(Date.now() / 1000) - 5, 'tun1').run();
  const exp = await subQuotaOk(env, await env.DB.prepare("SELECT * FROM subscriptions WHERE token='tun1'").first());
  check('اشتراک منقضی رد می‌شود', exp.ok === false && exp.reason === 'expired', JSON.stringify(exp));
  await setSetting(env.DB, 'tunnel_max_bytes', '10');
  const quota = await subQuotaOk(env, await env.DB.prepare("SELECT * FROM subscriptions WHERE token='tun1'").first());
  check('اشتراک منقضی همچنان رد است (سقف هم چک نمی‌شود)', quota.ok === false);
  await env.DB.prepare('UPDATE subscriptions SET expire_at=?, traffic_used=? WHERE token=?').bind(Math.floor(Date.now() / 1000) + 86400, 500, 'tun1').run();
  const rowNow = await env.DB.prepare("SELECT * FROM subscriptions WHERE token='tun1'").first();
  const q2 = await subQuotaOk(env, rowNow);
  check('اشتراک بالای سقف مصرف رد می‌شود', q2.ok === false && q2.reason === 'quota_exceeded', JSON.stringify(q2));
  await setSetting(env.DB, 'tunnel_max_bytes', '0');

  // شمارش مصرف
  await recordTunnelTraffic(env, found.id, 1000, 500);
  await recordTunnelTraffic(env, found.id, 2000, 400);
  const tu = await tunnelUsage(env, found.id);
  check('مصرف تانل شمارش می‌شود', tu.bytes_in === 3000 && tu.bytes_out === 900, JSON.stringify(tu));

  // ensureTunnelUuid
  const validKept = await ensureTunnelUuid(env, found);
  check('UUID معتبر تغییر نمی‌کند', validKept === uuid, validKept);

  // ساخت کانفیگ تانل — میزبان از origin واقعی Worker
  await env.KV.put('worker_origin', 'https://novabot-sample.workers.dev');
  const cfg = await buildTunnelConfig(env, found);
  check('کانفیگ تانل ساخته می‌شود', cfg.ok === true, JSON.stringify(cfg).slice(0, 160));
  check('کانفیگ شامل میزبان واقعی Worker است', cfg.uri.includes('novabot-sample.workers.dev'), cfg.uri);
  check('کانفیگ شامل UUID اشتراک است', cfg.uri.includes(uuid), cfg.uri);
  check('مسیر WS در کانفیگ هست', cfg.path === path && cfg.uri.includes(encodeURIComponent(path)), cfg.uri);

  // لاگ خطای امن uuid را ماسک می‌کند (بدنهٔ کامل هرگز لاگ نمی‌شود)
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  logTunnelError('conn', new Error('boom ' + uuid));
  console.warn = origWarn;
  check('لاگ خطا uuid/توکن لو نمی‌دهد', warns.length === 1 && !warns[0].includes(uuid) && warns[0].includes('[uuid]'), warns[0]);
}

// ── ۳۳) AI Agent مدیر (بخش ۶) ──
section('۳۳) AI Agent مدیر با Function Calling');
{
  const { setSetting, ensureUser, getUser } = await import('../src/db.js');
  const { runAgent, listAiActions, undoAction } = await import('../src/agent.js');

  // موک AI: فراخوانی اول ابزار، فراخوانی بعدی متن نهایی
  const mkScripted = (tool, args) => {
    let n = 0;
    return {
      async run(model, input) {
        n++;
        if (n === 1) {
          return { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'c' + n, type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] } }] };
        }
        return { choices: [{ message: { role: 'assistant', content: 'کار انجام شد.' } }] };
      },
    };
  };

  // ۱) پیش‌فرض خاموش
  const off = await makeEnv();
  const { user: adminOff } = await ensureUser(off.DB, { id: 111, first_name: 'A' });
  const r0 = await runAgent(off, { user: adminOff, input: 'آمار بده' });
  check('AI Agent پیش‌فرض خاموش است', r0.ok === false && r0.disabled === true);

  // ۲) فقط ادمین
  const envAdmin = await makeEnv();
  await setSetting(envAdmin.DB, 'ai_agent_enabled', '1');
  await ensureUser(envAdmin.DB, { id: 111, first_name: 'Super' }); // super
  await ensureUser(envAdmin.DB, { id: 222, first_name: 'User' }); // user
  const normalUser = await getUser(envAdmin.DB, 222);
  const rd = await runAgent(envAdmin, { user: normalUser, input: 'آمار بده' });
  check('کاربر عادی دسترسی ندارد', rd.ok === false && rd.denied === true);

  // ۳) ابزار خواندنی get_stats با ادمین
  const envStats = await makeEnv();
  await setSetting(envStats.DB, 'ai_agent_enabled', '1');
  await setSetting(envStats.DB, 'ai_agent_model', '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  envStats.AI = mkScripted('get_stats', {});
  const superUser = (await ensureUser(envStats.DB, { id: 111, first_name: 'Super' })).user;
  const rStats = await runAgent(envStats, { user: superUser, input: 'آمار بده', autoconfirm: true });
  check('get_stats اجرا می‌شود', rStats.ok === true && rStats.executed.some((x) => x.tool === 'get_stats'), JSON.stringify(rStats));
  const logStats = await listAiActions(envStats.DB, 10);
  check('اقدام خواندنی در ai_actions لاگ می‌شود', logStats.some((a) => a.tool === 'get_stats' && a.status === 'done'));

  // ۴) بدون مجوز (ادمینِ بدون perms) → toggle_server بلاک
  const envPerm = await makeEnv();
  await setSetting(envPerm.DB, 'ai_agent_enabled', '1');
  await setSetting(envPerm.DB, 'ai_agent_model', '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  envPerm.AI = mkScripted('toggle_server', { server_id: 1, active: false });
  const srvSeed = (await envPerm.DB.prepare('SELECT * FROM servers LIMIT 1').first());
  const { user: superP } = await ensureUser(envPerm.DB, { id: 111, first_name: 'S' });
  // ادمین بدون مجوز products
  await envPerm.DB.prepare("UPDATE users SET role='admin', perms='[]' WHERE id=? ").bind(111).run();
  const lowAdmin = await getUser(envPerm.DB, 111);
  const rPerm = await runAgent(envPerm, { user: lowAdmin, input: 'سرور را خاموش کن', autoconfirm: true });
  check('عملیات بدون مجوز رد می‌شود', rPerm.denied.some((d) => d.tool === 'toggle_server' && d.reason === 'no_permission'), JSON.stringify(rPerm));
  const logPerm = await listAiActions(envPerm.DB, 10);
  check('رد بدون مجوز لاگ blocked می‌شود', logPerm.some((a) => a.tool === 'toggle_server' && a.status === 'blocked'));

  // ۵) عملیات مالی بدون تأیید صریح → اجرا نمی‌شود
  const envFin = await makeEnv();
  await setSetting(envFin.DB, 'ai_agent_enabled', '1');
  await setSetting(envFin.DB, 'ai_agent_model', '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  await ensureUser(envFin.DB, { id: 111, first_name: 'Super' });
  await ensureUser(envFin.DB, { id: 333, first_name: 'Target' });
  await envFin.DB.prepare('UPDATE users SET balance=5000 WHERE id=333').run();
  const superFin = await getUser(envFin.DB, 111);
  envFin.AI = mkScripted('adjust_balance', { user_id: 333, delta: 3000 });
  const rNoConf = await runAgent(envFin, { user: superFin, input: 'به کاربر ۳۳۳ شارژ بده' });
  check('بدون تأیید، عملیات مالی اجرا نمی‌شود', rNoConf.ok === true && rNoConf.pendingConfirm.length === 1, JSON.stringify(rNoConf));
  check('موجودی تغییر نمی‌کند', (await getUser(envFin.DB, 333)).balance === 5000);
  const logPend = await listAiActions(envFin.DB, 10);
  check('نیاز به تأیید pending_confirm لاگ می‌شود', logPend.some((a) => a.tool === 'adjust_balance' && a.status === 'pending_confirm'));

  // ۶) با تأیید صریح + undo
  const envDo = await makeEnv();
  await setSetting(envDo.DB, 'ai_agent_enabled', '1');
  await setSetting(envDo.DB, 'ai_agent_model', '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  await ensureUser(envDo.DB, { id: 111, first_name: 'Super' });
  await ensureUser(envDo.DB, { id: 333, first_name: 'Target' });
  await envDo.DB.prepare('UPDATE users SET balance=5000 WHERE id=333').run();
  const superDo = await getUser(envDo.DB, 111);
  envDo.AI = mkScripted('adjust_balance', { user_id: 333, delta: 3000 });
  const rDo = await runAgent(envDo, { user: superDo, input: 'شارژ بده', autoconfirm: true });
  const did = rDo.executed.find((x) => x.tool === 'adjust_balance');
  check('با تأیید، موجودی شارژ می‌شود', did && (await getUser(envDo.DB, 333)).balance === 8000, JSON.stringify(did));
  const actions = await listAiActions(envDo.DB, 10);
  const action = actions.find((a) => a.tool === 'adjust_balance' && a.status === 'done');
  check('اقدام undoable ثبت می‌شود', action && action.undoable === true);

  // undo فقط سوپر
  const undoNo = await undoAction(envDo, { role: 'user', id: 333 }, action.id);
  check('undo توسط غیرسوپر رد می‌شود', undoNo.ok === false && undoNo.reason === 'super_only');
  const undoRes = await undoAction(envDo, superDo, action.id);
  check('undo موجودی را برمی‌گرداند', undoRes.ok === true && (await getUser(envDo.DB, 333)).balance === 5000, JSON.stringify(undoRes));
  const redo = await undoAction(envDo, superDo, action.id);
  check('undo دوباره رد می‌شود', redo.ok === false && redo.reason === 'already_undone');

  // ۷) تنظیم حساس هرگز قابل تغییر نیست
  const envSec = await makeEnv();
  await setSetting(envSec.DB, 'ai_agent_enabled', '1');
  await setSetting(envSec.DB, 'ai_agent_model', '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  const { user: superSec } = await ensureUser(envSec.DB, { id: 111, first_name: 'S' });
  envSec.AI = mkScripted('update_setting', { key: 'telegram_bot_token', value: 'HACKED' });
  const rSec = await runAgent(envSec, { user: superSec, input: 'توکن را عوض کن', autoconfirm: true });
  check('تغییر توکن توسط AI رد می‌شود', rSec.denied.some((d) => d.tool === 'update_setting'), JSON.stringify(rSec));
  const { getSetting } = await import('../src/db.js');
  check('توکن ربات دست‌نخورده می‌ماند', (await getSetting(envSec.DB, 'telegram_bot_token', '')) !== 'HACKED');

  // ۸) بدون بایندینگ AI → خطای تمیز
  const envNoAi = await makeEnv({ ai: false });
  await setSetting(envNoAi.DB, 'ai_agent_enabled', '1');
  const { user: s2 } = await ensureUser(envNoAi.DB, { id: 111, first_name: 'S' });
  const rNoAi = await runAgent(envNoAi, { user: s2, input: 'آمار' });
  check('بدون بایندینگ AI خطای تمیز برمی‌گردد', rNoAi.ok === false && /بایندینگ/.test(rNoAi.text));
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
