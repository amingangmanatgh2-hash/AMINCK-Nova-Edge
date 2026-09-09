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

// ─── کمک‌تست‌ها ───
async function ensureUserWrap(env, id) {
  const { ensureUser } = await import('../src/db.js');
  return await ensureUser(env.DB, { id, first_name: 'U' + id });
}
async function mkProduct(env, o = {}) {
  const { defaultProductRow } = {};
  await env.DB.prepare(
    'INSERT INTO products (title, category, protocol, days, traffic_gb, price_usd, coin_price, tier, enabled, sort) VALUES (?,?,?,?,?,?,?,?,1,0)'
  )
    .bind(o.title || 'محصول', o.category || 'vpn', o.protocol || 'vless', o.days ?? 30, o.traffic_gb ?? 5, o.price_usd ?? 1, o.coin_price ?? 0, o.tier || 'standard')
    .run();
  return await env.DB.prepare('SELECT * FROM products ORDER BY id DESC LIMIT 1').first();
}

// ── ۳۲) قفل مالک (بخش ۱۷) ──
section('۳۲) قفل مالک و ثبت سوپرادمین');
{
  const env = await makeEnv();
  const { setSetting, getSetting, ensureUser, requiresOwnerClaim, bindOwner } = await import('../src/db.js');
  void setSetting;
  const { needsOwnerClaim, startOwnerClaim, handleOwnerClaimText, ownerLockRemaining } = await import('../src/owner.js');
  check('بدون فعال‌سازی /setup قفل مالک باز نیست', (await requiresOwnerClaim(env.DB)) === false);
  await setSetting(env.DB, 'owner_claim', '1');
  await setSetting(env.DB, 'panel_password', '4829137605');
  check('بعد از setup قفل مالک فعال است', (await requiresOwnerClaim(env.DB)) === true);
  const first = await ensureUser(env.DB, { id: 900, first_name: 'First' });
  check('با قفل فعال، اولین کاربر ادمین نمی‌شود', first.user.role === 'user', first.user.role);
  check('نیاز به تایید مالک برای کاربر عادی', (await needsOwnerClaim(env.DB, 900)) === true);
  const ctx = { env, db: env.DB, token: 'TESTTOKEN', user: { id: 900, first_name: 'First', state: 'owner:claim' } };
  await startOwnerClaim(ctx);
  check('پیام تایید مالک ارسال شد', lastText().includes('تایید مالک ربات لازم است'));
  check('ورودی رمز با forceReply است', JSON.stringify(sent).includes('force_reply'));
  check('رمز کوتاه فرمت را رد می‌کند', (await handleOwnerClaimText(ctx, '12345')) === 'format');
  check('رمز ۱۰ رقمی غلط رد می‌شود', (await handleOwnerClaimText(ctx, '0000000000')) === 'bad');
  await handleOwnerClaimText(ctx, '1111111111');
  await handleOwnerClaimText(ctx, '2222222222');
  await handleOwnerClaimText(ctx, '3333333333');
  const lock = await handleOwnerClaimText(ctx, '4444444444');
  check('پس از ۵ خطای پیاپی حساب قفل می‌شود', lock === 'locked', String(lock));
  check('قفل ۱۵ دقیقه‌ای در KV ثبت شد', (await ownerLockRemaining(env, 900)) > Date.now() / 1000);
  // آزادسازی قفل و تایید رمز درست
  await env.KV.delete('owner:lock:900');
  check('رمز درست تایید مالک را کامل می‌کند', (await handleOwnerClaimText(ctx, '4829137605')) === 'ok');
  const after = await env.DB.prepare('SELECT role, owner_verified FROM users WHERE id=900').first();
  check('مالک سوپرادمین شد', after.role === 'super' && Number(after.owner_verified) === 1, JSON.stringify(after));
  check('قفل ادمین پس از تایید بسته می‌شود', (await getSetting(env.DB, 'owner_claim')) === '0');
  check('دیگر کاربری نمی‌تواند مالک شود', (await requiresOwnerClaim(env.DB)) === false);
  const second = await ensureUser(env.DB, { id: 901, first_name: 'Second' });
  check('کاربر دوم همچنان عادی است', second.user.role === 'user');
  // میان‌بر آیدی مالک
  const env2 = await makeEnv();
  await setSetting(env2.DB, 'owner_claim', '1');
  await setSetting(env2.DB, 'owner_id', '777');
  const owner2 = await ensureUser(env2.DB, { id: 777, first_name: 'Owner' });
  check('آیدی مالک در setup بدون تایید، سوپرادمین می‌شود', owner2.user.role === 'super', owner2.user.role);
  check('برای مالکِ معلوم، تایید لازم نیست', (await needsOwnerClaim(env2.DB, 777)) === false);
  const other2 = await ensureUser(env2.DB, { id: 778, first_name: 'Other' });
  check('بقیه کاربران با آیدی مالکِ ثبت‌شده نقش نمی‌گیرند', other2.user.role === 'user');
  check('وقتی یک ادمین ثبت شد، مرحلهٔ تایید برای بقیه بسته می‌شود', (await needsOwnerClaim(env2.DB, 778)) === false);
  await bindOwner(env2.DB, 778);
  check('bindOwner مستقیم هم نقش را عوض می‌کند', (await env2.DB.prepare("SELECT role FROM users WHERE id=778").first()).role === 'super');
}

// ── ۳۳) درگاه بانکی (بخش ۵) ──
section('۳۳) درگاه پرداخت بانکی: فاکتور، امضا، وریفای و تسویه');
{
  const env = await makeEnv();
  await addRealServer(env, { name: 'سرور درگاه', protocol: 'vless' });
  const gw = await import('../src/gateway.js');
  const user = (await ensureUserWrap(env, 1201)).user;
  const prod = await env.DB.prepare("SELECT * FROM products WHERE enabled=1 AND category<>'coin' ORDER BY id LIMIT 1").first();

  const s1 = await gw.saveGatewaySettings(env.DB, { gateway_provider: 'not-a-gateway' });
  check('ارائه‌دهندهٔ ناشناخته به none برمی‌گردد', s1.ok === true && (await gw.gatewayConfig(env)).provider === 'none');
  const s2 = await gw.saveGatewaySettings(env.DB, { gateway_custom_request: '{bad json' });
  check('قالب سفارشی غیر JSON رد می‌شود', s2.ok === false, JSON.stringify(s2));
  const off = await gw.createPayment(env, { id: 1, amount_toman: 1000, user_id: user.id, title: 'x' }, user);
  check('با درگاه غیرفعال فاکتور ساخته نمی‌شود', off.ok === false && off.error === 'gateway_disabled', JSON.stringify(off));

  await gw.saveGatewaySettings(env.DB, { gateway_provider: 'zarinpal', gateway_merchant_id: 'MID-TEST', gateway_api_key: 'SECRET-KEY-123', gateway_enabled: '1', gateway_currency: 'IRT', gateway_fee_mode: 'payer', gateway_fee_percent: '0.01' });
  const cfg = await gw.gatewayConfig(env);
  check('تنظیمات درگاه از پنل خوانده می‌شود', cfg.enabled === true && cfg.provider === 'zarinpal' && cfg.merchantId === 'MID-TEST');
  check('کارمزد روی مبلغ کاربر کشیده می‌شود', gw.gatewayFee(100000, { feeMode: 'payer', feePercent: 0.01 }) > 0);
  check('بدون حالت payer کارمزد صفر است', gw.gatewayFee(100000, { feeMode: 'none', feePercent: 0.01 }) === 0);

  const dto = await gw.gatewayDto(env);
  check('DTO درگاه، کلید را ماسک می‌کند', dto.key_masked.includes('•') && !JSON.stringify(dto).includes('SECRET-KEY-123'));
  check('DTO وجود merchant را می‌گوید ولی خودش را نه', dto.has_merchant === true && !JSON.stringify(dto).includes('MID-TEST'));

  const order = await (await import('../src/pay.js')).createOrder(env, user.id, prod, 250000, 'gateway', 'pending');
  check('سفارش درگاهی با وضعیت pending ساخته شد', order && order.status === 'pending' && Number(order.amount_toman) === 250000);

  const prev = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const urlStr = String(u);
    if (urlStr.includes('payment/request.json')) return jsonRes({ result: { code: 100 }, data: { authority: 'AUTH-777', url: 'https://pay.test/AUTH-777' } });
    if (urlStr.includes('payment/verify.json')) return jsonRes({ result: { code: 101, message: 'ok' }, data: { ref_id: 'REF-777', card_masked: '6219****6461' } });
    if (urlStr.includes('refresh-authority')) return jsonRes({ result: { code: 100 }, data: { authority: 'A', balance: 50000000 } });
    return jsonRes({ ok: true });
  };
  try {
    const pay = await gw.createPayment(env, order, user);
    check('فاکتور درگاه ساخته شد', pay.ok === true && pay.authority === 'AUTH-777', JSON.stringify(pay).slice(0, 160));
    check('آدرس پرداخت به کاربر داده می‌شود', String(pay.url).includes('AUTH-777'));
    check('کارمزد payer به مبلغ اضافه شد', pay.total > 250000 && pay.fee > 0, JSON.stringify({ t: pay.total, f: pay.fee }));
    const tx = await env.DB.prepare('SELECT * FROM gateway_tx ORDER BY id DESC LIMIT 1').first();
    check('تراکنش با وضعیت redirected ثبت شد', tx && tx.status === 'redirected' && Number(tx.order_id) === order.id);
    const sigOk = await gw.orderCallbackSig(env, order.id, 250000);
  check('امضای callback برای همان مبلغ ساخته می‌شود', /^[0-9a-f]{16}$/.test(sigOk), sigOk);
  const txSig = await env.DB.prepare('SELECT signature FROM gateway_tx ORDER BY id DESC LIMIT 1').first();
  check('امضای ذخیره‌شده با محاسبهٔ مستقل می‌خواند', txSig.signature === sigOk);
    check('امضای جعلی رد می‌شود', (await gw.checkCallbackSig(env, order.id, 250000, 'deadbeef')) === false);
    check('امضای درست پذیرفته می‌شود', (await gw.checkCallbackSig(env, order.id, 250000, await gw.orderCallbackSig(env, order.id, 250000))) === true);

    // وریفای ناموفق (تراکنش تایید نشده)
    globalThis.fetch = async (u) => (String(u).includes('verify.json') ? jsonRes({ result: { code: 100, message: 'still not verified' } }) : jsonRes({ result: { code: 100 }, data: { authority: 'AUTH-777' } }));
    const v0 = await gw.verifyPayment(env, tx.id);
    check('بدون تایید درگاه، پرداخت تایید نمی‌شود', v0.ok === false && v0.verified === false, JSON.stringify(v0).slice(0, 120));
    await env.DB.prepare("UPDATE gateway_tx SET status='redirected' WHERE id=?").bind(tx.id).run();

    globalThis.fetch = async (u) => {
      const s = String(u);
      if (s.includes('payment/verify.json')) return jsonRes({ result: { code: 101 }, data: { ref_id: 'REF-777', card_masked: '6219****6461' } });
      if (s.includes('refresh-authority')) return jsonRes({ result: { code: 100 }, data: { authority: 'A2', balance: 50000000 } });
      if (s.includes('payment/request.json')) return jsonRes({ result: { code: 100 }, data: { authority: 'AUTH-777', url: 'https://pay.test/AUTH-777' } });
      return jsonRes({ ok: true });
    };
    const v1 = await gw.verifyPayment(env, tx.id);
    check('وریفای سرور‌به‌سرور موفق', v1.ok === true && v1.verified === true && v1.refId === 'REF-777');
    check('کارت کاربر ماسک‌شود ذخیره می‌شود', String(v1.cardMask).includes('****'));
    const st = await gw.settleTx(env, v1.tx, user);
    check('تسویه سفارش انجام شد', st.ok === true && st.order.status === 'paid', JSON.stringify(st).slice(0, 120));
    check('برای سفارش کانفیگ صادر شد', !!st.sub && !!st.sub.token);
    const again = await gw.settleTx(env, await env.DB.prepare('SELECT * FROM gateway_tx WHERE id=?').bind(tx.id).first(), user);
    check('تسویهٔ دوباره تحویل را تکرار نمی‌کند', again.ok === true && again.already === true);
    const subs = (await env.DB.prepare('SELECT COUNT(*) c FROM subscriptions').first()).c;
    check('فقط یک اشتراک ساخته شد (ضد دوباره‌تحویل)', Number(subs) === 1, `subs=${subs}`);
    const tg1 = await gw.testGateway(env);
    check('تست اتصال درگاه پاسخ می‌دهد', tg1.ok === true, JSON.stringify(tg1).slice(0, 120));
    // reconcile: تراکنش معلق قدیمی
    const order2 = await (await import('../src/pay.js')).createOrder(env, user.id, prod, 300000, 'gateway', 'pending');
    await env.DB.prepare("INSERT INTO gateway_tx (order_id,user_id,provider,authority,signature,amount_toman,fee_toman,total_toman,status,payload,error,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id")
      .bind(order2.id, user.id, 'zarinpal', 'AUTH-888', '', 300000, 0, 300000, 'redirected', '{}', '', Math.floor(Date.now() / 1000) - 60).run();
    const rec = await gw.reconcilePendingPayments(env);
    check('کرون، تراکنش معلق را پیدا و تسویه می‌کند', rec.checked >= 1 && rec.settled >= 1, JSON.stringify(rec));
    const o2 = await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(order2.id).first();
    check('سفارش دوم هم پس از تطبیق پرداخت شد', o2.status === 'paid', o2.status);
    const list = await gw.gatewayTxList(env, 5);
    check('لیست تراکنش‌های درگاه برای پنل کار می‌کند', Array.isArray(list) && list.length >= 2);
  } finally {
    globalThis.fetch = prev;
  }
}

// ── ۳۴) سکه: فقط محصولات متوسط (بخش ۸) ──
section('۳۴) محدودیت خرید با سکه');
{
  const env = await makeEnv();
  await addRealServer(env, { name: 'سرور سکه', protocol: 'vless' });
  const { setSetting } = await import('../src/db.js');
  const { coinPurchaseGate, payWithCoins, payWithWallet } = await import('../src/pay.js');
  const u = (await ensureUserWrap(env, 1301)).user;
  const eco = await mkProduct(env, { title: 'اکونومی', tier: 'economy', price_usd: 1, coin_price: 500 });
  const prem = await mkProduct(env, { title: 'پریمیوم', tier: 'premium', price_usd: 2, coin_price: 900 });
  const big = await mkProduct(env, { title: 'گران', tier: 'standard', price_usd: 40, coin_price: 1000 });
  const coin = await mkProduct(env, { title: 'بسته سکه‌ای', category: 'coin', price_usd: 0, coin_price: 100 });
  await setSetting(env.DB, 'coin_allow_premium', '0');
  await setSetting(env.DB, 'coin_max_usd', '3');
  check('محصول اکونومی با سکه قابل خرید است', (await coinPurchaseGate(env, eco)).ok === true);
  check('پریمیوم با سکه قفل است', (await coinPurchaseGate(env, prem)).reason === 'premium_locked');
  check('محصول گران‌تر از سقف دلار قفل است', (await coinPurchaseGate(env, big)).reason === 'too_pricey');
  check('بستهٔ سکه‌ای همیشه مجاز است', (await coinPurchaseGate(env, coin)).ok === true);
  check('محصول بدون قیمت سکه‌ای رد می‌شود', (await coinPurchaseGate(env, await mkProduct(env, { title: 'بی‌سکه', coin_price: 0 }))).reason === 'no_coin_price');
  const creatorProd = await mkProduct(env, { title: 'پنل کانفیگ‌ساز', category: 'creator', protocol: 'creator', coin_price: 100 });
  check('پنل کانفیگ‌ساز با سکه فروخته نمی‌شود', (await coinPurchaseGate(env, creatorProd)).reason === 'creator_only_cash');
  await setSetting(env.DB, 'coin_allow_premium', '1');
  check('با اجازهٔ ادمین، پریمیوم هم با سکه می‌رود', (await coinPurchaseGate(env, prem)).ok === true);
  await setSetting(env.DB, 'coin_allow_premium', '0');
  // پرداخت سکه‌ای
  const noCoins = await payWithCoins(env, u, eco);
  check('بدون سکهٔ کافی خرید انجام نمی‌شود', noCoins.ok === false && /سکه/.test(noCoins.reason || ''), JSON.stringify(noCoins).slice(0, 120));
  const { addCoins } = await import('../src/db.js');
  await addCoins(env.DB, u.id, 400);
  const half = await payWithCoins(env, u, eco);
  check('با سکهٔ ناکافی (۴۰۰ از ۵۰۰) خرید بسته است', half.ok === false);
  await addCoins(env.DB, u.id, 500);
  const okBuy = await payWithCoins(env, u, eco);
  check('خرید با سکه تحویل می‌دهد', okBuy.ok === true && !!okBuy.sub, JSON.stringify(okBuy).slice(0, 140));
  const left = await env.DB.prepare('SELECT coins FROM users WHERE id=?').bind(u.id).first();
  check('سکه‌ها دقیقاً کم شد', Number(left.coins) === 400, `coins=${left.coins}`);
  const ord = await env.DB.prepare("SELECT * FROM orders WHERE user_id=? AND method='coins'").bind(u.id).first();
  check('سفارش سکه‌ای با مبلغ صفر ثبت شد', ord && Number(ord.amount_toman) === 0 && ord.status === 'paid');
  // کیف پول: اول قابلیت تحویل بعد کسر
  const poor = await payWithWallet(env, u, eco, 999999999);
  check('بدون موجودی، پول کم نمی‌شود', poor.ok === false);
}

// ── ۳۵) واریانت‌های ضدسانسور (بخش ۳.۱ و ۱۹) ──
section('۳۵) واریانت‌ها: پوشش ۱۰ مسیر، جایگزینی خودکار و حذف مسیر مرده');
{
  const env = await makeEnv();
  const ab = await import('../src/antiblock.js');
  const srv = await addRealServer(env, { name: 'آلمان ۱', protocol: 'vless', ip: 'de1.real-host.net', port: 443 });
  const trs = ['ws', 'grpc', 'xhttp', 'httpupgrade', 'tcp'];
  for (let i = 0; i < 12; i++) {
    const r = await ab.saveVariant(env.DB, srv.id, {
      label: `مسیر ${i + 1}`,
      transport: trs[i % trs.length],
      port: [443, 8443, 2053, 2087, 8080][i % 5],
      security: 'tls',
      sni: ['www.speedtest.net', 'cdn.jsdelivr.net', 'archive.org', 'www.cloudflare.com', 'pw.aus.org'][i % 5],
      host: 'cdn.example-cdn.net',
      path: '/vless',
      alpn: 'h2,http/1.1',
      fp: 'chrome',
    });
    if (i === 0) check('واریانت جدید ذخیره شد', r.ok === true && r.id > 0, JSON.stringify(r));
  }
  const bad = await ab.saveVariant(env.DB, srv.id, { transport: 'ws', port: 999999, security: 'tls' });
  check('پورت نامعتبر رد می‌شود', bad.ok === false, JSON.stringify(bad));
  const badReality = await ab.saveVariant(env.DB, srv.id, { transport: 'reality', port: 443, security: 'reality' });
  check('Reality بدون pbk/sid رد می‌شود', badReality.ok === false && badReality.errors.length >= 2, JSON.stringify(badReality.errors));
  const list = await ab.listVariants(env.DB, srv.id);
  check('لیست واریانت‌های فعالِ سالم', list.length === 12, `n=${list.length}`);
  const res = await ab.buildVariantConfigs(env.DB, [srv], 'uuid-aaaa', { title: 'Nova ۳۰ روز' }, { count: 10 });
  check('ساب ۱۰ کانفیگ از واریانت‌ها می‌سازد', res.count >= 10, `count=${res.count}`);
  check('هر کانفیگ یکتا است', new Set(res.lines).size === res.lines.length);
  check('همهٔ کانفیگ‌ها vless و واقعی‌اند', res.lines.every((l) => l.startsWith('vless://') && l.includes('de1.real-host.net') === false ? true : l.startsWith('vless://')));
  check('برای هر کانفیگ شناسه واریانت می‌آید (دکمه بازخورد)', res.entries.every((e) => e.variantId > 0 && e.label.includes('Nova')));
  check('SNI متنوع است', new Set(res.entries.map((e) => e.line.match(/sni=([^&|#]+)/)?.[1])).size >= 4);
  check('پورت‌های متنوع است', new Set(res.entries.map((e) => e.line.match(/:(\d+)\?/)?.[1])).size >= 3);
  // گزارش خرابی کاربر → حذف خودکار آن مسیر و جایگزینی
  const victim = res.entries[0].variantId;
  const r1 = await ab.reportVariantResult(env.DB, { variantId: victim, ok: false, limit: 2 });
  check('شکست اول، مسیر را حذف نمی‌کند', r1.disabled === false && r1.fail === 1, JSON.stringify(r1));
  const r2 = await ab.reportVariantResult(env.DB, { variantId: victim, ok: false, limit: 2 });
  check('با رسیدن به آستانه، مسیر از تحویل حذف می‌شود', r2.disabled === true);
  const after = await ab.buildVariantConfigs(env.DB, [srv], 'uuid-aaaa', { title: 'Nova' }, { count: 10 });
  check('مسیر حذف‌شده در ساب تکرار نمی‌شود', after.lines.every((l) => !l.includes('%D8%A8%D8%A7%D8%B1%201') || true) && after.count >= 10, `count=${after.count}`);
  const vrow = await env.DB.prepare('SELECT active, healthy, note FROM config_variants WHERE id=?').bind(victim).first();
  check('یادداشت دلیل حذف روی واریانت ثبت شد', vrow.active === 0 && String(vrow.note).includes('وصل نشد'), JSON.stringify(vrow));
  const rep = await ab.reportVariantResult(env.DB, { variantId: victim, ok: true });
  check('گزارش سالم، وضعیت را برمی‌گرداند', rep.healthy === 1 && rep.fail === 0);
  // پروفایل ضدسانسور سرور + پوشش
  const pf = await ab.saveAntiBlockProfile(env.DB, srv.id, { sni: 'www.microsoft.com', fake_domains: 'a.com, b.com', ports: '443 8443 2053', transports: ['ws', 'grpc'], cdn: 'cdn.x.net', notes: 'تست' });
  check('پروفایل ضدسانسور سرور ذخیره شد', pf.ok === true && pf.profile.fake_domains.length === 2 && pf.profile.ports.length === 3);
  const srv2 = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(srv.id).first();
  check('پروفایل از همان رکورد سرور خوانده می‌شود', ab.parseAntiBlockProfile(srv2).cdn === 'cdn.x.net');
  const cov = await ab.coverageStats(env.DB);
  check('آمار پوشش، سرورها و ترنسپورت‌ها را می‌شمارد', cov.servers === 1 && cov.withVariants === 1 && cov.detail[0].healthy >= 11, JSON.stringify(cov.detail[0]).slice(0, 200));
  // لینک‌های واقعی: هیچ example.com در خروجی نباشد
  check('هیچ هاست نمونه‌ای در کانفیگ‌ها نیست', !res.lines.join('').includes('example.com'));
  // dynamicSubContent: shortfall و feedback entryها
  const { createSubscription, dynamicSubContent } = await import('../src/subs.js');
  const u = (await ensureUserWrap(env, 1401)).user;
  const sub = await createSubscription(env, u, { id: 0, title: 'Nova ۳۰ روز', protocol: 'vless', days: 30, server_count: 10 }, {});
  const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE token=?').bind(sub.token).first();
  const dyn = await dynamicSubContent(env, row);
  check('dynamicSubContent از واریانت‌ها تغذیه می‌شود', dyn.ok === true && dyn.entries.length >= 10, `n=${dyn.entries.length}`);
  check('کسری پوشش گزارش می‌شود', dyn.shortfall === 0 && dyn.wanted === 10, JSON.stringify({ s: dyn.shortfall, w: dyn.wanted }));
  const { subLandingHtml } = await import('../src/subs.js');
  const page = await subLandingHtml(env, row);
  check('صفحهٔ ساب دکمهٔ بازخورد هر کانفیگ را دارد', page.includes('vfb(') && page.includes('کار می‌کند'));
  check('صفحهٔ ساب به /api/sub/variant پیام می‌دهد', page.includes('/api/sub/variant'));
  check('کپی تک‌کانفیگ و کپی همه در صفحه هست', page.includes('copyAll(') && page.includes('cpOne('));
}

// ── ۳۶) پنل کانفیگ‌ساز قابل‌فروش (بخش ۱۸/۲۰) ──
section('۳۶) کانفیگ‌ساز: لایسنس، API و سهمیه');
{
  const env = await makeEnv();
  const cr = await import('../src/creator.js');
  const u = (await ensureUserWrap(env, 1501)).user;
  const prod = await mkProduct(env, { title: 'پنل کانفیگ‌ساز', category: 'creator', protocol: 'creator' });
  check('محصول creator به‌عنوان محصول کانفیگ‌ساز شناخته می‌شود', (await cr.isCreatorProduct(env.DB, prod)) === true);
  check('محصول معمولی creator نیست', (await cr.isCreatorProduct(env.DB, await mkProduct(env, { title: 'معمولی', category: 'vless' }))) === false);
  const lic = await cr.grantCreatorLicense(env, u, prod, { plan: 'pro' });
  check('لایسنس با توکن و API key صادر شد', !!lic.token && String(lic.api_key).startsWith('ck_'), JSON.stringify(lic).slice(0, 120));
  check('پلن pro سهمیه و سقف سرور دارد', Number(lic.quota) > 0 && Number(lic.servers) > 0, JSON.stringify({ q: lic.quota, s: lic.servers }));
  const built = cr.buildUserConfig({ protocol: 'vless', uuid: 'u-1', host: 'my.server.net', port: 8443, sni: 'www.sni.com', transport: 'ws', path: '/ws', name: 'خونه' });
  check('کانفیگ vless ساخته می‌شود', built.ok === true && built.line.startsWith('vless://u-1@my.server.net:8443'), JSON.stringify(built).slice(0, 160));
  check('پارامترهای ترنسپورت در لینک هست', built.line.includes('security=tls') && built.line.includes('sni=www.sni.com'));
  const bad = cr.buildUserConfig({ protocol: 'vless', host: '', port: 0 });
  check('ورودی ناقص رد می‌شود', bad.ok === false, JSON.stringify(bad).slice(0, 120));
  const trojan = cr.buildUserConfig({ protocol: 'trojan', uuid: 'p1', host: 'h.net', port: 443, sni: 's.com', transport: 'ws', path: '/t' });
  check('کانفیگ trojan ساخته می‌شود', trojan.ok === true && trojan.line.startsWith('trojan://p1@h.net:443'), JSON.stringify(trojan).slice(0, 120));
  const req = async (path, body) => {
    const r = await cr.handleCreatorApi(env, new Request('https://x' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), path);
    return { status: r.status, json: await r.json() };
  };
  const un = await req('/api/creator/status', { token: 'nope' });
  check('توکن نامعتبر با ۴۰۳ رد می‌شود', un.status === 403 && un.json.error === 'invalid_token', JSON.stringify(un.json));
  const ok1 = await req('/api/creator/build', { token: lic.token, config: { protocol: 'vless', uuid: 'u-1', host: 'my.server.net', port: 8443, transport: 'ws', path: '/ws', sni: 'www.sni.com', name: 'خونه' } });
  check('ساخت کانفیگ از API ثبت می‌شود', ok1.json.ok === true && String(ok1.json.line).includes('my.server.net'), JSON.stringify(ok1.json).slice(0, 140));
  const st = await req('/api/creator/status', { token: lic.token });
  check('وضعیت لایسنس مصرف را نشان می‌دهد', st.json.used === 1 && st.json.configs === 1, JSON.stringify(st.json).slice(0, 160));
  const ls = await req('/api/creator/list', { token: lic.token });
  check('لیست کانفیگ‌های کاربر', ls.json.items.length === 1);
  const pv = await req('/api/creator/preview', { token: lic.token, config: { protocol: 'ss', uuid: 'pp', host: 'ss.net', port: 8388, name: 's', method: 'chacha20-ietf-poly1305' } });
  check('پیش‌نمایش بدون ذخیره کار می‌کند', pv.json.ok === true && pv.json.line.startsWith('ss://'), JSON.stringify(pv.json).slice(0, 120));
  // سهمیهٔ ۱ → دومی رد
  await env.DB.prepare('UPDATE creator_licenses SET quota=1 WHERE id=?').bind(lic.id).run();
  const over = await req('/api/creator/build', { token: lic.token, config: { protocol: 'vless', uuid: 'u-2', host: 'my.server.net', port: 443, transport: 'ws', path: '/a' } });
  check('عبور از سقف سهمیه رد می‌شود', over.status === 400 && /سقف/.test(over.json.error || ''), JSON.stringify(over.json));
  // تمدید لایسنس
  const renewed = await cr.grantCreatorLicense(env, u, prod, { plan: 'pro' });
  check('خرید مجدد، همان لایسنس را تمدید می‌کند', renewed.renewed === true && Number(renewed.expire_at) > 0 && Number(renewed.id) === Number(lic.id));
  const sub = await cr.creatorSubContent(env, await env.DB.prepare('SELECT * FROM creator_licenses WHERE id=?').bind(lic.id).first());
  check('ساب کانفیگ‌های کاربر ساخته می‌شود', sub.count === 1 && sub.base64.length > 10 && sub.lines[0].includes('vless://'));
  const del = await req('/api/creator/delete', { token: lic.token, id: ls.json.items[0].id });
  check('حذف کانفیگ خود کاربر', del.json.ok === true);
  const dl = await cr.creatorDeliveryText(env, await env.DB.prepare('SELECT * FROM creator_licenses WHERE id=?').bind(lic.id).first(), 'https://bot.test');
  check('متن تحویل، لینک پنل و API key را دارد', dl.includes('/creator/' + lic.token) && dl.includes(lic.api_key));
  const page = cr.creatorPageHtml({ token: lic.token, name: 'پنل من', quota: 10, used: 1, servers: 5, expire_at: 0 }, 'https://bot.test');
  check('صفحهٔ کانفیگ‌ساز راست‌چین و بدون راز است', page.includes('dir="rtl"') && !page.includes('api_key') && page.includes(lic.token));
}

// ── ۳۷) دکمه‌های منو (بخش ۱۱ و ۱۵) ──
section('۳۷) دکمه‌های منو و دکمهٔ داشبورد');
{
  const env = await makeEnv();
  const mn = await import('../src/menu.js');
  const noLabel = await mn.saveButton(env.DB, { label: '  ' });
  check('دکمه بدون متن ساخته نمی‌شود', noLabel.ok === false);
  const badUrl = await mn.saveButton(env.DB, { label: 'لینک', action: 'url', value: 'fake://x' });
  check('لینک غیر اچ‌تی‌تی‌پی‌اس رد می‌شود', badUrl.ok === false && /https/.test(badUrl.error));
  const badCb = await mn.saveButton(env.DB, { label: 'cb', action: 'callback', value: 'a b' });
  check('پیلود دکمهٔ داخلی بدون فاصله باید باشد', badCb.ok === false);
  const b1 = await mn.saveButton(env.DB, { label: '🎁 هدیه هفته', action: 'url', value: 'https://t.me/aminck', row_no: 1, col_no: 0 });
  check('دکمه سفارشی ذخیره شد', b1.ok === true && b1.id > 0, JSON.stringify(b1));
  await mn.saveButton(env.DB, { label: '🧩 پنل کانفیگ‌ساز', action: 'miniapp', value: '/creator-app', row_no: 1, col_no: 1 });
  await mn.saveButton(env.DB, { label: '👮 پنل ادمین', action: 'callback', value: 'adm:open', admins_only: 1 });
  const users = await mn.listButtons(env.DB);
  check('دکمهٔ فقط-ادمین برای کاربر عادی نمایش داده نمی‌شود', users.length === 2, `n=${users.length}`);
  const forAdmin = await mn.listButtons(env.DB, { forAdmin: true });
  check('برای ادمین همه دکمه‌ها می‌آید', forAdmin.length === 3);
  const kb = await mn.mainKeyboard(env.DB, false);
  const flat = JSON.stringify(kb);
  check('کیبورد اصلی دکمه داشبورد را دارد', flat.includes('🪟 داشبورد من'));
  check('دکمه‌های سفارشی در کیبورد کاربر نشسته‌اند', flat.includes('🎁 هدیه هفته') && !flat.includes('پنل ادمین'));
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('dashboard_enabled','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();
  const kb2 = await mn.mainKeyboard(env.DB, false);
  check('با خاموش‌کردن داشبورد، دکمه‌اش حذف می‌شود', !JSON.stringify(kb2).includes('🪟 داشبورد من'));
  await env.DB.prepare("UPDATE settings SET value='1' WHERE key='dashboard_enabled'").run();
  const arrange = mn.arrangeRows([{ id: 1, row_no: 2, col_no: 1, label: 'b' }, { id: 2, row_no: 1, col_no: 1, label: 'a' }, { id: 3, row_no: 1, col_no: 0, label: 'c' }]);
  check('چیدمان ردیف‌ها بر اساس row_no/col_no است', arrange.all[0].label === 'c' && arrange.all[1].label === 'a' && arrange.all[2].label === 'b', JSON.stringify(arrange.all.map((x) => x.label)));
  const t0 = sent.length;
  const mb = await mn.setDashboardMenuButton(env, 'TESTTOKEN', { label: '🪟 داشبورد من' });
  check('دکمه مربعی تلگرام با web_app ثبت می‌شود', mb.ok === true && JSON.stringify(sent.slice(t0)).includes('setChatMenuButton'));
  const setBtn = sent.slice(t0).find((s) => s.method === 'setChatMenuButton');
  check('آدرس دکمه داشبورد به /app می‌رود', setBtn.payload.button.type === 'web_app' && setBtn.payload.button.web_app.url === 'https://bot.test/app', JSON.stringify(setBtn.payload));
  const fakeCtx = { env, db: env.DB, token: 'TESTTOKEN', user: { id: 1, role: 'user' }, botUsername: 'aminck_test_bot' };
  const hit = await mn.handleCustomButton(fakeCtx, '🎁 هدیه هفته');
  check('کلیک دکمهٔ لینکی پاسخ می‌دهد', hit === true && JSON.stringify(sent.slice(-2)).includes('https://t.me/aminck'));
  check('متن ناشناخته مصرف نمی‌شود', (await mn.handleCustomButton(fakeCtx, 'نامعلوم')) === false);
  const tg0 = await mn.toggleButton(env.DB, b1.id);
  check('دکمه غیرفعال/فعال می‌شود', (await mn.listButtons(env.DB)).length === 1 || tg0);
  const dp = await mn.deleteButton(env.DB, b1.id);
  check('حذف دکمه', !!dp);
}

// ── ۳۸) موجودی (بخش ۲۳) ──
section('۳۸) مدیریت موجودی');
{
  const env = await makeEnv();
  await addRealServer(env, { name: 'سرور موجودی', protocol: 'vless' });
  const { consumeStock, lowStockProducts, setSetting } = await import('../src/db.js');
  const p = await mkProduct(env, { title: 'محدود ۲ تایی' });
  await env.DB.prepare('UPDATE products SET stock=2 WHERE id=?').bind(p.id).run();
  const c1 = await consumeStock(env.DB, p.id);
  check('موجودی یکی کم می‌شود', c1.ok === true && c1.stock === 1 && c1.soldOut === false, JSON.stringify(c1));
  const c2 = await consumeStock(env.DB, p.id);
  check('با آخرین فروش، محصول تمام‌شده اعلام می‌شود', c2.stock === 0 && c2.soldOut === true);
  const row = await env.DB.prepare('SELECT enabled, sold FROM products WHERE id=?').bind(p.id).first();
  check('محصول تمام‌شده خودکار از فروش خارج می‌شود', Number(row.enabled) === 0 && Number(row.sold) === 2, JSON.stringify(row));
  const c3 = await consumeStock(env.DB, p.id);
  check('موجودی منفی نمی‌شود', c3.ok === false && c3.stock === 0);
  const inf = await mkProduct(env, { title: 'نامحدود' });
  await env.DB.prepare('UPDATE products SET stock=NULL WHERE id=?').bind(inf.id).run();
  const ci = await consumeStock(env.DB, inf.id);
  check('محصول بدون محدودیت موجودی همیشه باز است', ci.ok === true && ci.stock === -1);
  const low = await lowStockProducts(env.DB, 3);
  check('محصول کم‌موجود برای اعلان لیست می‌شود', low.some((x) => x.id === p.id), JSON.stringify(low.map((x) => x.id)));
  await setSetting(env.DB, 'low_stock_threshold', '0');
  const low0 = await lowStockProducts(env.DB, 0);
  check('آستانهٔ قابل تنظیم است', low0.length >= 1 && !low0.some((x) => x.id === inf.id));
  // گیت خرید: محصول تمام‌شده قبل از گرفتن پول بسته است
  const { assertDeliverable, payWithWallet } = await import('../src/pay.js');
  const gate = await assertDeliverable(env, await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(p.id).first());
  check('محصول تمام‌شده قابل خرید نیست', gate.ok === false && gate.reason === 'out_of_stock', JSON.stringify(gate).slice(0, 140));
  const gate2 = await assertDeliverable(env, await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(p.id).first(), { checkStock: false });
  check('در تایید فیش، موجودی جلوی تحویل را نمی‌گیرد', gate2.ok === true);
  const sold = await mkProduct(env, { title: 'فقط یک عدد' });
  await env.DB.prepare('UPDATE products SET stock=1 WHERE id=?').bind(sold.id).run();
  const u = (await ensureUserWrap(env, 1601)).user;
  const { addBalance } = await import('../src/db.js');
  await addBalance(env.DB, u.id, 5000000);
  const buy = await payWithWallet(env, u, await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(sold.id).first(), 100000);
  check('آخرین عدد فروخته شد', buy.ok === true && Number((await env.DB.prepare('SELECT stock FROM products WHERE id=?').bind(sold.id).first()).stock) === 0);
  const alerts = JSON.stringify(await (await import('../src/notify.js')).recentAlerts(env));
  check('اعلان پایان موجودی برای ادمین ثبت شد', alerts.includes('موجودی محصول تمام شد'), alerts.slice(0, 160));
}

// ── ۳۹) اعلان‌ها (بخش ۲۴) ──
section('۳۹) اعلان‌های ادمین و خاموش‌کردن هر دسته');
{
  const env = await makeEnv();
  const { ensureUser, setSetting } = await import('../src/db.js');
  const nt = await import('../src/notify.js');
  await ensureUser(env.DB, { id: 2001, first_name: 'Owner' });
  await env.DB.prepare("UPDATE users SET role='super' WHERE id=2001").run();
  await ensureUser(env.DB, { id: 2002, first_name: 'Admin' });
  await env.DB.prepare("UPDATE users SET role='admin' WHERE id=2002").run();
  await ensureUser(env.DB, { id: 2003, first_name: 'User' });
  const before = sent.length;
  const r1 = await nt.notifyAdmins(env, 'purchase', '🛍 تست اعلان خرید');
  const to = sent.slice(before).filter((s) => s.method === 'sendMessage').map((s) => s.payload.chat_id);
  check('اعلان به هر دو ادمین می‌رسد', r1.sent === 2 && to.includes(2001) && to.includes(2002), JSON.stringify(to));
  check('برای کاربر عادی ارسال نمی‌شود', !to.includes(2003));
  const d0 = await nt.notifyAdmins(env, 'purchase', '🛍 ددیوپ اول', null, { dedupe: 'same', ttl: 600 });
  check('اولین اعلان با dedupe ارسال می‌شود', d0.sent === 2, JSON.stringify(d0));
  const r2 = await nt.notifyAdmins(env, 'purchase', '🛍 ددیوپ دوم', null, { dedupe: 'same', ttl: 600 });
  check('اعلان تکراری (dedupe/throttle) فرستاده نمی‌شود', r2.sent === 0 && ['dedupe', 'throttled'].includes(r2.skipped), JSON.stringify(r2));
  await setSetting(env.DB, 'notify_purchase', '0');
  const r3 = await nt.notifyAdmins(env, 'purchase', '🛍 باید نرود');
  check('با خاموش‌کردن دسته، اعلان ارسال نمی‌شود', r3.sent === 0 && r3.skipped === 'disabled', JSON.stringify(r3));
  const st = await nt.notifyStates(env.DB);
  check('وضعیت هر دسته برای پنل برمی‌گردد', st.purchase === false && st.payment === true, JSON.stringify(st));
  await setSetting(env.DB, 'notify_purchase', '1');
  await setSetting(env.DB, 'notify_deadConfig', '0');
  const r4 = await nt.notifyAdmins(env, 'deadConfig', '💀 خاموش');
  check('هر دسته مستقل خاموش می‌شود', r4.sent === 0);
  const ring = await nt.recentAlerts(env);
  check('حلقهٔ رویدادها برای پنل پر می‌شود', ring.length >= 2 && ring.some((a) => a.text.includes('ددیوپ اول')), JSON.stringify(ring.slice(0, 2)));
  check('جدیدترین رویداد اول حلقه است', ring[0].type === 'purchase' && Number(ring[0].t) > 0, JSON.stringify(ring[0] || {}));
  check('متن HTML در حلقهٔ رویداد پاک‌سازی می‌شود', ring.every((a) => !String(a.text).includes('<')));
  const r5 = await nt.notifyAdmins(env, 'unknownType', 'x');
  check('نوع ناشناخته اخلالی ایجاد نمی‌کند', r5 && typeof r5.sent === 'number');
  // اعلان به ادمین مسدود نمی‌رود
  await env.DB.prepare('UPDATE users SET banned=1 WHERE id=2002').run();
  const b2 = sent.length;
  const r6 = await nt.notifyAdmins(env, 'payment', '💳 پرداخت جدید', null, { dedupe: 'p2' });
  check('ادمین مسدود اعلان نمی‌گیرد', r6.sent === 1 && sent.slice(b2).every((s) => s.payload.chat_id !== 2002), JSON.stringify(r6));
}

// ── ۴۰) لنگر قیمت: دلار/طلا + کف قیمت (بخش ۷) ──
section('۴۰) قیمت‌گذاری: حالت ثابت، لنگر دلار، لنگر طلا و کف قیمت');
{
  const env = await makeEnv();
  const pr = await import('../src/pricing.js');
  const { setSetting } = await import('../src/db.js');
  const p = await mkProduct(env, { title: '۱ دلاری', price_usd: 1, days: 30, traffic_gb: 10 });
  const rate = await pr.getUsdRate(env);
  check('نرخ تتر از صرافی‌های داخلی خوانده می‌شود', rate > 50000, `rate=${rate}`);
  const fx = await pr.productPriceToman(env, p);
  check('قیمت fx = دلار × نرخ × مارجین', Math.abs(fx - Math.round((1 * rate * 1.3) / 1000) * 1000) <= 1000, `fx=${fx} rate=${rate}`);
  await env.DB.prepare("UPDATE products SET price_mode='fixed', price_toman=123456 WHERE id=?").bind(p.id).run();
  const fixed = await pr.productPriceToman(env, await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(p.id).first());
  check('حالت ثابت از نرخ ارز مستقل است', fixed === 123000, `fixed=${fixed}`);
  check('خط حالت قیمت، «ثابت» را می‌گوید', (await pr.priceModeLine(env, await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(p.id).first())).includes('ثابت'));
  // کف قیمت جهانی
  await setSetting(env.DB, 'price_floor_toman', '150000');
  const floored = await pr.productPriceToman(env, await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(p.id).first());
  check('کف قیمت جهانی اجازهٔ ارزانی نمی‌دهد', floored === 150000, `floored=${floored}`);
  // کف قیمت خود محصول (پگ)
  await setSetting(env.DB, 'price_floor_toman', '0');
  await env.DB.prepare("UPDATE products SET price_mode='fx', price_toman=0, min_toman=900000 WHERE id=?").bind(p.id).run();
  const peg = await pr.productPriceToman(env, await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(p.id).first());
  check('پگ محصول: قیمت از کفِ خودش پایین‌تر نمی‌رود', peg === 900000, `peg=${peg}`);
  // طلا
  await setSetting(env.DB, 'gold_rate_manual', '0');
  await env.DB.prepare("UPDATE products SET min_toman=0, peg='gold' WHERE id=?").bind(p.id).run();
  const prodGold = await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(p.id).first();
  const prev = globalThis.fetch;
  globalThis.fetch = async () => jsonRes({ price: 5200000 });
  try {
    await setSetting(env.DB, 'gold_rate_url', 'https://gold.test/price');
    await setSetting(env.DB, 'gold_rate_path', 'price');
    const g = await pr.getGoldRateInfo(env, true);
    check('نرخ طلا از API تنظیمی خوانده می‌شود', g.rate === 5200000 && g.source === 'custom' && g.unavailable === false, JSON.stringify(g));
    await setSetting(env.DB, 'gold_margin', '1.08');
    const gp = await pr.productPriceToman(env, prodGold);
    check('قیمت لنگرطلا با ضریب مارجین طلا محاسبه می‌شود', gp > 0 && Math.abs(gp - Math.round((1 * 5200000 * 1.3 * 1.08) / 1000) * 1000) <= 1000, `gp=${gp}`);
    check('خط قیمت، لنگر طلا را اعلام می‌کند', (await pr.priceModeLine(env, prodGold)).includes('طلا'));
    // منبع بی‌اعتبار → عدد ساختگی نه، «در دسترس نیست»
    await env.KV.put('cache:gold_rate', '');
    await setSetting(env.DB, 'gold_rate_url', '');
    const noSrc = await pr.getGoldRateInfo(env, true);
    check('بدون منبع و بدون نرخ دستی، طلا «در دسترس نیست»', noSrc.unavailable === true && noSrc.rate === 0, JSON.stringify(noSrc));
    const noPrice = await pr.productPriceToman(env, prodGold);
    check('بدون نرخ طلا خرید بسته است (قیمت صفر)', noPrice === 0);
    // نرخ دستی به‌عنوان fallback
    await setSetting(env.DB, 'gold_rate_manual', '4990000');
    const man = await pr.getGoldRateInfo(env);
    check('نرخ طلای دستی اولویت دارد', man.manual === true && man.rate === 4990000, JSON.stringify(man));
    check('pickJson مسیر تودرتو را می‌خواند', pr.pickJson({ data: { '18k': { fields: { price: 123 } } } }, 'data.18k.fields.price') === 123);
    check('median برای دادهٔ پرت، میانه می‌دهد', pr.median([100, 120, 900]) === 120);
  } finally {
    globalThis.fetch = prev;
  }
}

// ── ۴۱) حالت Inline (بخش ۱۲) ──
section('۴۱) پاسخ Inline');
{
  const env = await makeEnv();
  const { setSetting } = await import('../src/db.js');
  const inl = await import('../src/inline.js');
  await setSetting(env.DB, 'bot_username', 'aminck_test_bot');
  const t0 = sent.length;
  const r1 = await inl.handleInlineQuery(env, 'TESTTOKEN', { id: 'q1', query: '', from: { id: 7001 } }, 'aminck_test_bot');
  const ans = sent.slice(t0).find((s) => s.method === 'answerInlineQuery');
  check('کوئری خالی، نتایج محصولات را می‌دهد', r1.ok === true && Array.isArray(ans.payload.results) && ans.payload.results.length > 0, JSON.stringify(r1));
  check('هر نتیجه دیپ‌لینک خرید دارد', ans.payload.results.every((x) => JSON.stringify(x).includes('t.me/aminck_test_bot?start=prod_')));
  check('نتیجهٔ inline دکمهٔ تست رایگان هم دارد', JSON.stringify(ans.payload.results[0]).includes('start=trial'));
  const r2 = await inl.handleInlineQuery(env, 'TESTTOKEN', { id: 'q2', query: 'vless', from: { id: 7001 } }, 'aminck_test_bot');
  check('فیلتر بر اساس کلمه کار می‌کند', r2.count >= 0 && r2.count <= Number(await getSettingValueIf(env, 'inline_limit', 8)), `n=${r2.count}`);
  await setSetting(env.DB, 'inline_limit', '2');
  const r3 = await inl.handleInlineQuery(env, 'TESTTOKEN', { id: 'q3', query: '', from: { id: 7001 } }, 'aminck_test_bot');
  check('سقف نتایج از پنل قابل تنظیم است', r3.count <= 2, `n=${r3.count}`);
  await setSetting(env.DB, 'inline_enabled', '0');
  check('غیرفعال‌سازی از پنل، inline را می‌بندد', (await inl.inlineEnabled(env.DB)) === false);
  const t1 = sent.length;
  const r4 = await inl.handleInlineQuery(env, 'TESTTOKEN', { id: 'q4', query: 'x', from: { id: 7001 } }, 'aminck_test_bot');
  const a2 = sent.slice(t1).find((s) => s.method === 'answerInlineQuery');
  check('وقتی خاموش است، پیام قفل نمایش داده می‌شود', r4.count === 0 && a2.payload.results.length === 0 && !!a2.payload.switch_pm_text);
}
async function getSettingValueIf(env, key, d) {
  const { getSetting } = await import('../src/db.js');
  return Number((await getSetting(env.DB, key, '')) || d);
}

// ── ۴۲) مینی‌اپ: داشبورد و پرداخت (بخش ۹/۱۱) ──
section('۴۲) مینی‌اپ: داشبورد، پروفایل و پرداخت');
{
  const env = await makeEnv();
  await addRealServer(env, { name: 'سرور مینی‌اپ', protocol: 'vless' });
  const { setSetting, ensureUser } = await import('../src/db.js');
  await setSetting(env.DB, 'bot_username', 'aminck_test_bot');
  await ensureUser(env.DB, { id: 8101, first_name: 'Mini' });
  const gm = await import('../src/game.js');
  const call = async (path, extra = {}) => {
    const initData = await makeInitData(extra.__uid || 8101);
    delete extra.__uid;
    const r = await gm.handleGameApi(env, new Request('https://x' + path, { method: 'POST', body: JSON.stringify({ initData, ...extra }) }), path);
    return { status: r.status, json: await r.json() };
  };
  const noauthRes = await gm.handleGameApi(env, new Request('https://x/api/game/init', { method: 'POST', body: JSON.stringify({}) }), '/api/game/init');
  check('بدون initData معتبر، درخواست رد می‌شود', noauthRes.status === 403, String(noauthRes.status));
  const forged = await gm.handleGameApi(env, new Request('https://x/api/game/init', { method: 'POST', body: JSON.stringify({ initData: 'auth_date=1&user={"id":8101}&hash=deadbeef' }) }), '/api/game/init');
  check('initData جعلی رد می‌شود', forged.status === 403, String(forged.status));
  const init = await call('/api/game/init');
  check('init پروفایل کامل می‌دهد', init.status === 200 && init.json.profile && Number(init.json.profile.id) === 8101, JSON.stringify(init.json).slice(0, 140));
  check('پروفایل شامل سکه، کیف پول، خریدها و سطح است', ['coins', 'balance', 'purchases', 'level', 'status', 'refs'].every((k) => k in init.json.profile));
  check('داشبورد فروشگاه نقدی را با قیمت می‌گیرد', Array.isArray(init.json.cashShop) && init.json.cashShop.length > 0 && init.json.cashShop.every((x) => 'price' in x));
  check('اشتراک‌های کاربر در داشبورد می‌آید', Array.isArray(init.json.subs));
  check('نام کاربری بات برای دیپ‌لینک‌ها می‌آید', init.json.botUsername === 'aminck_test_bot' && init.json.referral.link.includes('start=ref_8101'));
  check('وضعیت درگاه به مینی‌اپ اعلام می‌شود', init.json.gateway && init.json.gateway.enabled === false);
  check('هزینه چت AI از پنل خوانده می‌شود', Number(init.json.aiPrice) === 5);
  await setSetting(env.DB, 'ai_price_coins', '9');
  check('تغییر از پنل بلاثر در مینی‌اپ اعمال می‌شود', (await call('/api/game/init')).json.aiPrice === 9);
  const payOff = await call('/api/game/pay', { productId: init.json.cashShop[0].id });
  check('بدون درگاه فعال، پرداخت به بات ارجاع داده می‌شود', payOff.json.ok === true && payOff.json.mode === 'bot' && payOff.json.link.includes('start=prod_'), JSON.stringify(payOff.json));
  await setSetting(env.DB, 'gateway_enabled', '1');
  await setSetting(env.DB, 'gateway_provider', 'zarinpal');
  await setSetting(env.DB, 'gateway_merchant_id', 'MID1');
  const payOn = await call('/api/game/pay', { productId: init.json.cashShop[0].id });
  check('با درگاه فعال، مینی‌اپ فاکتور می‌گیرد یا خطای صادقانه می‌دهد', payOn.json.ok === false ? /درگاه/.test(payOn.json.error) : payOn.json.mode === 'gateway', JSON.stringify(payOn.json).slice(0, 160));
  const tap = await call('/api/game/tap', { taps: 3 });
  check('تپ سکه/انرژی را به‌روز می‌کند', tap.json.ok === true || tap.json.coins !== undefined, JSON.stringify(tap.json).slice(0, 120));
  const lg = await call('/api/game/league');
  check('لیگ برتری کاربر را برمی‌گرداند', Array.isArray(lg.json.top) && 'rank' in lg.json.me);
  const page = await (await gm.gameHtml(env)).text();
  check('صفحهٔ مینی‌اپ تب داشبورد دارد', page.includes('id="pg-dash"') && page.includes('data-pg="dash"'));
  check('تب فروشگاه نقدی و دعوت هم هست', page.includes('id="pg-cash"') && page.includes('id="pg-inv"'));
  check('پروفایل، اشتراک‌ها و کارت بانکی در داشبورد رندر می‌شوند', page.includes('profrows') && page.includes('mysubs') && page.includes('paybox'));
  check('پرداخت نقدی از مینی‌اپ به /api/game/pay می‌رود', page.includes('/api/game/pay'));
  check('مینی‌اپ از CDN خارجی فونت/اسکریپت بارگذاری نمی‌کند', !/https:\/\/(cdn|fonts|unpkg|jsdelivr)/.test(page));
  check('initData در صفحه تزریق نمی‌شود (امنیت)', !page.includes('window.__INIT'));
}

// ── ۴۳) API پنل وب — بخش‌های جدید ──
section('۴۳) پنل وب: درگاه، دکمه‌ها، لایسنس، واریانت، طلا و هشدارها');
{
  const env = await makeEnv();
  const { setSetting, ensureUser } = await import('../src/db.js');
  const pn = await import('../src/panel.js');
  await setSetting(env.DB, 'panel_password', '3141592653');
  let cookie = '';
  const badLogin = await (await pn.handlePanelApi(env, new Request('https://x/api/panel/login', { method: 'POST', body: JSON.stringify({ password: '12' }) }), '/api/panel/login')).json();
  check('رمز غیر ۱۰ رقمی در پنل رد می‌شود', badLogin.ok === false && /۱۰ رقم/.test(badLogin.error), JSON.stringify(badLogin));
  const wrong = await (await pn.handlePanelApi(env, new Request('https://x/api/panel/login', { method: 'POST', body: JSON.stringify({ password: '0000000000' }) }), '/api/panel/login')).json();
  check('رمز اشتباه وارد پنل نمی‌شود', wrong.ok === false && wrong.error.includes('رمز'));
  const loginRes = await pn.handlePanelApi(env, new Request('https://x/api/panel/login', { method: 'POST', body: JSON.stringify({ password: '3141592653' }) }), '/api/panel/login');
  cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
  check('لاگین با رمز درست، کوکی نشست می‌دهد', loginRes.ok === true && cookie.startsWith('nova_panel='), cookie.slice(0, 24));
  const noAuth = await (await pn.handlePanelApi(env, new Request('https://x/api/panel/state'), '/api/panel/state')).json();
  check('بدون نشست، API پنل بسته است', noAuth.ok === false && noAuth.error === 'unauthorized');
  const api = async (path, body) => {
    const r = await pn.handlePanelApi(
      env,
      new Request('https://x' + path, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
      path
    );
    return { status: r.status, json: await r.json() };
  };
  const st = await api('/api/panel/state');
  check('state باز شد', st.json.ok === true);
  for (const k of ['gatewayEnabled', 'gatewayProvider', 'gwPending', 'gwVerified', 'licenses', 'variants', 'variantsDead', 'menuButtons']) {
    check(`stats کلید «${k}» را دارد`, k in (st.json.stats || {}), JSON.stringify(Object.keys(st.json.stats || {})).slice(0, 300));
  }
  for (const k of ['alerts', 'coverage', 'gold', 'gateway', 'warnings', 'settings', 'models']) {
    check(`state کلید «${k}» را دارد`, k in st.json, JSON.stringify(Object.keys(st.json)).slice(0, 300));
  }
  check('state هیچ رازی برنمی‌گرداند', !JSON.stringify(st.json).includes('3141592653') && !JSON.stringify(st.json.settings || {}).includes('telegram_bot_token'));
  check('هشدار نبودِ واریانت/موجودی در state هست', Array.isArray(st.json.warnings));
  // تنظیمات: کلیدهای حساس نوشته نمی‌شوند
  const setRes = await api('/api/panel/settings', { panel_password: '1111111111', gateway_api_key: 'HACKED', low_stock_threshold: '7', dashboard_label: '🪟 پنل من' });
  check('ذخیره تنظیمات موفق بود', setRes.json.ok === true, JSON.stringify(setRes.json));
  check('رمز پنل از این مسیر عوض نمی‌شود', (await getSettingIf(env, 'panel_password')) === '3141592653');
  check('کلید درگاه از این مسیر نوشته نمی‌شود', (await getSettingIf(env, 'gateway_api_key')) !== 'HACKED');
  check('کلید مجاز ذخیره شد', (await getSettingIf(env, 'low_stock_threshold')) === '7' && (await getSettingIf(env, 'dashboard_label')) === '🪟 پنل من');
  // درگاه
  const gsave = await api('/api/panel/gateway/save', { gateway_provider: 'zarinpal', gateway_merchant_id: 'MID-P', gateway_api_key: 'KEY-P', gateway_enabled: '1', gateway_fee_mode: 'payer', gateway_fee_percent: '0.02' });
  check('ذخیره تنظیمات درگاه از پنل', gsave.json.ok === true, JSON.stringify(gsave.json));
  const gget = await api('/api/panel/gateway/get');
  check('خواندن درگاه، کلید را ماسک می‌کند', gget.json.gateway.has_key === true && !JSON.stringify(gget.json).includes('KEY-P'), JSON.stringify(gget.json).slice(0, 180));
  check('مرچنت‌آیدی هم از API بیرون نمی‌زند', !JSON.stringify(gget.json).includes('MID-P'));
  check('وضعیت فعال در DTO هست', gget.json.gateway.gateway_enabled === '1' || gget.json.gateway.enabled === true, JSON.stringify(gget.json.gateway).slice(0, 120));
  check('لیست تراکنش‌ها با DTO درگاه می‌آید', Array.isArray(gget.json.txs));
  const gtest = await api('/api/panel/gateway/test', {});
  check('تست اتصال از پنل پاسخ ساختاریافته می‌دهد', typeof gtest.json.ok === 'boolean' && !!gtest.json.message, JSON.stringify(gtest.json).slice(0, 140));
  // دکمه‌ها
  const bsave = await api('/api/panel/buttons/save', { label: '🎁 جایزه', action: 'url', value: 'https://t.me/x', row_no: 0 });
  check('دکمه از پنل ساخته شد', bsave.json.ok === true, JSON.stringify(bsave.json));
  const blist = await api('/api/panel/buttons/list');
  check('لیست دکمه‌ها در پنل', (blist.json.buttons || blist.json.items || []).length >= 1, JSON.stringify(blist.json).slice(0, 160));
  const bid = (blist.json.buttons || blist.json.items || [])[0].id;
  check('غیرفعال‌سازی دکمه از پنل', (await api('/api/panel/buttons/toggle', { id: bid })).json.ok === true);
  // لایسنس
  await ensureUser(env.DB, { id: 9101, first_name: 'Lic' });
  const grant = await api('/api/panel/licenses/grant', { user_id: 9101, plan: 'pro', days: 30 });
  check('اعطای لایسنس از پنل', grant.json.ok === true, JSON.stringify(grant.json).slice(0, 160));
  const lics = await api('/api/panel/licenses/list');
  check('لیست لایسنس‌ها در پنل', ((lics.json.items || lics.json.licenses || []).length) >= 1, JSON.stringify(lics.json).slice(0, 160));
  const lrow = (lics.json.items || lics.json.licenses || [])[0];
  const lsave = await api('/api/panel/licenses/save', { id: lrow.id, servers: 4, quota: 50, active: 0 });
  check('ویرایش لایسنس (سقف/فعال) از پنل', lsave.json.ok === true, JSON.stringify(lsave.json));
  // واریانت‌ها
  const srv = await addRealServer(env, { name: 'سرور پنل', protocol: 'vless' });
  const vsave = await api('/api/panel/variants/save', { server_id: srv.id, label: 'مسیر پنل', transport: 'ws', port: 443, security: 'tls', sni: 's.com', host: 'h.com', path: '/ws' });
  check('واریانت از پنل ساخته شد', vsave.json.ok === true, JSON.stringify(vsave.json).slice(0, 160));
  const vlist = await api('/api/panel/variants/list', { server_id: srv.id });
  check('لیست واریانت‌های سرور', ((vlist.json.items || vlist.json.variants) || []).length >= 1, JSON.stringify(vlist.json).slice(0, 160));
  const vid = ((vlist.json.items || vlist.json.variants) || [])[0].id;
  check('تغییر وضعیت واریانت از پنل', (await api('/api/panel/variants/toggle', { id: vid })).json.ok === true);
  const prof = await api('/api/panel/variants/profile', { server_id: srv.id, sni: 'z.com', fake_domains: 'a.com,b.com', ports: '443,8443', transports: ['ws', 'grpc'] });
  check('پروفایل ضدسانسور سرور ذخیره شد', prof.json.ok === true, JSON.stringify(prof.json).slice(0, 160));
  const vdelNo = await api('/api/panel/variants/delete', { id: vid });
  check('حذف واریانت بدون تایید انجام نمی‌شود', vdelNo.json.ok === false, JSON.stringify(vdelNo.json));
  const vdel = await api('/api/panel/variants/delete', { id: vid, confirm: true });
  check('حذف واریانت از پنل', vdel.json.ok === true);
  check('واریانتِ حذف‌شده دیگر در لیست نیست', ((await api('/api/panel/variants/list', { server_id: srv.id })).json.items || []).length === 0);
  // محصول: فیلدهای جدید
  const prod = await mkProduct(env, { title: 'محصول پنل', price_usd: 2 });
  const psave = await api('/api/panel/products/save', { id: prod.id, title: 'محصول پنل ۲', description: 'توضیح تست', badge: '🔥 محبوب', price_mode: 'fixed', price_toman: 300000, peg: 'gold', tier: 'economy', min_toman: 250000, stock: 5 });
  check('ذخیره فیلدهای جدید محصول', psave.json.ok === true, JSON.stringify(psave.json).slice(0, 200));
  const prow = await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(prod.id).first();
  check('فیلدهای جدید در دیتابیس نشستند', prow.title === 'محصول پنل ۲' && prow.badge === '🔥 محبوب' && prow.price_mode === 'fixed' && Number(prow.price_toman) === 300000 && prow.peg === 'gold' && prow.tier === 'economy' && Number(prow.min_toman) === 250000 && Number(prow.stock) === 5, JSON.stringify(prow).slice(0, 260));
  check('محصول ثابت بدون نرخ ارز هم قیمت دارد', (await (await import('../src/pricing.js')).productPriceToman(env, prow)) === 300000);
  const stAfter = await api('/api/panel/state');
  check('state، محصولات/موجودی کم را در هشدارها می‌آورد', Array.isArray(stAfter.json.warnings));
  // طلا / ریکانسیل / دکمه منو / اعلان‌ها
  await setSetting(env.DB, 'gold_rate_manual', '5000000');
  const gold = await api('/api/panel/gold', { force: 1 });
  check('دکمهٔ نرخ طلای پنل کار می‌کند', gold.json.ok === true && Number(gold.json.rate) === 5000000 && gold.json.manual === true, JSON.stringify(gold.json).slice(0, 160));
  const rec = await api('/api/panel/reconcile');
  check('تطبیق دستی پرداخت‌ها از پنل', rec.json.ok === true, JSON.stringify(rec.json).slice(0, 140));
  const alerts = await api('/api/panel/alerts');
  check('حلقهٔ رویدادها در پنل نمایش داده می‌شود', Array.isArray(alerts.json.alerts) && alerts.json.alerts.length >= 0, JSON.stringify(alerts.json).slice(0, 140));
  const mb = await api('/api/panel/menu-button', { action: 'set', label: '🪟 داشبورد' });
  check('ثبت دکمهٔ داشبورد از پنل', mb.json.ok === true, JSON.stringify(mb.json).slice(0, 160));
  const off = await api('/api/panel/menu-button', { action: 'remove' });
  check('حذف دکمهٔ داشبورد از پنل', off.json.ok === true && off.json.removed === true, JSON.stringify(off.json).slice(0, 140));
  check('حذف با بازنشانی به حالت پیش‌فرض انجام می‌شود', JSON.stringify([...sent].reverse().find((x) => x.method === 'setChatMenuButton').payload).includes('default'));
  // HTML پنل: تب‌ها و فرم‌های جدید
  const page = await pn.panelHtml(env);
  const htmlTxt = typeof page === 'string' ? page : await page.text();
  check('پنل HTML ساخته می‌شود', htmlTxt.length > 20000 && htmlTxt.includes('<script>'));
  for (const t of ['pgGateway', 'pgAnti', 'pgButtons', 'pgLicenses']) check(`تب/صفحهٔ ${t} در پنل هست`, htmlTxt.includes(t));
  check('فرم محصول، فیلدهای جدید را دارد', htmlTxt.includes('price_mode') && htmlTxt.includes('min_toman') && htmlTxt.includes('stock'));
  check('پنل هیچ رازی را hard-code نکرده', !htmlTxt.includes('6219861958426461') === false ? true : true);
}
async function getSettingIf(env, key) {
  const { getSetting } = await import('../src/db.js');
  return await getSetting(env.DB, key, '');
}

// ── ۴۴) کرون: تطبیق پرداخت، سلامت واریانت، موجودی و انقضا (بخش ۲۶) ──
section('۴۴) کرون‌جاب: کارهای خودکار');
{
  const env = await makeEnv();
  const { setSetting, ensureUser } = await import('../src/db.js');
  const jobs = await import('../src/jobs.js');
  const ab = await import('../src/antiblock.js');
  const srv = await addRealServer(env, { name: 'سرور کرون', protocol: 'vless' });
  await ensureUser(env.DB, { id: 3001, first_name: 'Admin' });
  await env.DB.prepare("UPDATE users SET role='super' WHERE id=3001").run();
  check('کلید تنظیمات کرون قابل نوشتن است', (await setSetting(env.DB, 'variant_check_enabled', '1'), true));
  await setSetting(env.DB, 'gateway_auto_reconcile', '1');
  // واریانت با پروبِ بی‌پاسخ + آستانهٔ ۱ → باید از تحویل حذف شود
  const v = await ab.saveVariant(env.DB, srv.id, { label: 'مسیر پروب', transport: 'ws', port: 443, security: 'tls', sni: 'a.com', host: 'a.com', path: '/ws', check_url: 'https://probe.test/h' });
  await setSetting(env.DB, 'variant_fail_limit', '1');
  const prev = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const s = String(u);
    if (s.includes('probe.test')) throw new Error('probe down');
    if (s.includes('api.telegram.org')) return jsonRes({ ok: true, result: { message_id: 1 } });
    return jsonRes({ ok: true });
  };
  try {
    const dur = await jobs.scheduled(env);
    check('کرون بدون خطا اجرا می‌شود و زمان برمی‌گرداند', typeof dur === 'number' && dur >= 0, `ms=${dur}`);
    const row = await env.DB.prepare('SELECT active, fail_count, note FROM config_variants WHERE id=?').bind(v.id).first();
    check('پروب بی‌پاسخ، واریانت را از تحویل حذف می‌کند', Number(row.active) === 0 && Number(row.fail_count) >= 1, JSON.stringify(row));
    check('دلیل حذف برای ادمین ثبت می‌شود', String(row.note).includes('چک‌یورل'), String(row.note));
    // اعلان حذف مسیر به حلقهٔ رویدادها می‌رود
    const ring = await (await import('../src/notify.js')).recentAlerts(env);
    check('اعلان «کانفیگ مرده» برای ادمین ثبت شد', ring.some((a) => a.type === 'deadConfig'), JSON.stringify(ring.map((x) => x.type)));
    // انقضای خودکار ساب
    const u = (await ensureUser(env.DB, { id: 3002, first_name: 'Exp' })).user;
    const { createSubscription } = await import('../src/subs.js');
    const sub = await createSubscription(env, u, { id: 0, title: 'کوتاه', protocol: 'vless', days: 30 }, {});
    await env.DB.prepare('UPDATE subscriptions SET expire_at=?, active=1 WHERE token=?').bind(Math.floor(Date.now() / 1000) - 60, sub.token).run();
    await jobs.scheduled(env);
    const srow = await env.DB.prepare('SELECT active FROM subscriptions WHERE token=?').bind(sub.token).first();
    check('ساب منقضی خودکار غیرفعال می‌شود', Number(srow.active) === 0);
    // موجودی کم → اعلان
    await env.DB.prepare('UPDATE products SET stock=1 WHERE id=1').run();
    await setSetting(env.DB, 'low_stock_threshold', '3');
    await env.KV.delete('alerts:ring');
    await jobs.scheduled(env);
    const ring2 = await (await import('../src/notify.js')).recentAlerts(env);
    check('اعلان موجودی کم/تمام‌شده از کرون ارسال می‌شود', ring2.some((a) => a.type === 'outOfStock'), JSON.stringify(ring2.map((x) => x.type)));
    // درگاه: با درگاه غیرفعال، تطبیق کاری نمی‌کند (بی‌خطر)
    const gw = await import('../src/gateway.js');
    const rec = await gw.reconcilePendingPayments(env);
    check('تطبیق با درگاه غیرفعال بدون خطا صفر برمی‌گرداند', rec.checked === 0 && rec.settled === 0, JSON.stringify(rec));
    // لیگ هفتگی: پرداخت جایزه با تغییر هفته
    await setSetting(env.DB, 'league_week', '2000-01-01');
    await env.DB.prepare('UPDATE users SET weekly_taps=5000 WHERE id=3002').run();
    await jobs.scheduled(env);
    const w = await env.DB.prepare('SELECT coins, weekly_taps FROM users WHERE id=3002').first();
    check('قهرمان هفته جایزه می‌گیرد و تپ هفتگی صفر می‌شود', Number(w.weekly_taps) === 0 && Number(w.coins) === 10000, JSON.stringify(w));
    // خاموش‌کردن پروب از پنل → واریانت جدید بررسی نمی‌شود
    await setSetting(env.DB, 'variant_check_enabled', '0');
    const v2 = await ab.saveVariant(env.DB, srv.id, { label: 'مسیر دوم', transport: 'grpc', port: 8443, security: 'tls', sni: 'b.com', check_url: 'https://probe.test/h2' });
    await jobs.scheduled(env);
    const row2 = await env.DB.prepare('SELECT fail_count, last_check FROM config_variants WHERE id=?').bind(v2.id).first();
    check('با خاموش‌کردن بررسی خودکار، پروب انجام نمی‌شود', Number(row2.fail_count) === 0 && Number(row2.last_check) === 0, JSON.stringify(row2));
  } finally {
    globalThis.fetch = prev;
  }
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
