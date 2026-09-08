// ═══════════════════════════════════════════════════════════════════
//  راه‌اندازی اولیه — دریافت توکن، ذخیره در Durable Object و ثبت webhook
// ═══════════════════════════════════════════════════════════════════
import { getSetting, setSetting } from './db.js';
import { BOT_TOKEN_SETTING } from './config.js';
import { getMe, tg } from './tg.js';
import { html, json, text } from './util.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setupPage({ configured = false, message = '', error = false, username = '' } = {}) {
  const notice = message
    ? `<div class="notice ${error ? 'error' : 'ok'}">${esc(message)}</div>`
    : '';
  const form = configured
    ? `<div class="okbox"><b>✅ ربات قبلاً راه‌اندازی شده است.</b>
<p>توکن در دیتابیس Durable Object ذخیره شده و وب‌هوک ثبت شده است.</p>
<p>حالا در تلگرام به ربات پیام <code>/start</code> بدهید.</p>
${username ? `<a class="button" href="https://t.me/${encodeURIComponent(username)}">🤖 باز کردن ربات</a>` : ''}
<a class="secondary" href="/">بازگشت به صفحه اصلی</a></div>`
    : `<form method="post" action="/setup" autocomplete="off">
<label for="token">توکن ربات تلگرام</label>
<input id="token" name="token" type="password" required spellcheck="false" autocomplete="new-password" placeholder="توکن دریافتی از BotFather">
<p class="hint">توکن فقط در Durable Object همین Worker ذخیره می‌شود و در پاسخ صفحه نمایش داده نمی‌شود.</p>
<button type="submit">ذخیره و فعال‌سازی وب‌هوک</button>
</form>
<a class="secondary" href="/">بازگشت به صفحه اصلی</a>`;

  return `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>راه‌اندازی ربات AMINCK</title>
<style>
:root{--bg:#0d1526;--card:#152037;--line:#2a3b5f;--gold:#f5b31e;--txt:#eaf1ff;--mut:#9db0d2}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--txt);font-family:Vazirmatn,Segoe UI,Tahoma,sans-serif}
.card{width:min(92vw,520px);background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:0 18px 60px #0004}
h1{font-size:22px;margin:0 0 10px}.lead,p{color:var(--mut);font-size:14px;line-height:2}.lead{margin:0 0 18px}
label{display:block;color:var(--mut);font-size:13px;margin:12px 0 6px}input{width:100%;padding:13px;border-radius:11px;border:1px solid var(--line);background:#0f1a2e;color:var(--txt);font:inherit;direction:ltr;text-align:left}
button,.button{display:inline-block;border:0;border-radius:11px;background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#171305;font:inherit;font-weight:800;padding:12px 18px;cursor:pointer;text-decoration:none;margin-top:14px}
.secondary{display:inline-block;color:var(--mut);font-size:13px;margin-top:18px;text-decoration:none}.hint{font-size:12px;margin:8px 0;color:var(--mut)}
.notice,.okbox{border-radius:12px;padding:13px;margin:12px 0;line-height:1.9}.notice.error{background:#4b1f32;color:#ffd6df;border:1px solid #8f3654}.notice.ok,.okbox{background:#17382f;color:#c8ffe9;border:1px solid #2a8063}
code{direction:ltr;display:inline-block;background:#0d1526;color:var(--gold);padding:1px 6px;border-radius:5px}
</style></head><body><main class="card">
<h1>⚡ راه‌اندازی ربات AMINCK</h1>
<p class="lead">بعد از دیپلوی، توکن ربات را از BotFather اینجا وارد کنید. Worker وب‌هوک را خودش ثبت می‌کند.</p>
${notice}
${form}
</main></body></html>`;
}

function wantsJson(request) {
  const type = request.headers.get('content-type') || '';
  const accept = request.headers.get('accept') || '';
  return type.includes('application/json') || accept.includes('application/json');
}

function reply(request, payload, status = 200) {
  if (wantsJson(request)) return json(payload, status);
  return html(setupPage(payload), status);
}

async function readToken(request) {
  const type = request.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) {
      const body = await request.json();
      return String(body?.token || '').trim();
    }
    const body = new URLSearchParams(await request.text());
    return String(body.get('token') || '').trim();
  } catch {
    return '';
  }
}

/** پاسخ‌دهنده مسیر GET/POST /setup */
export async function handleSetup(env, request, url = new URL(request.url)) {
  const stored = await getSetting(env.DB, BOT_TOKEN_SETTING, '');

  if (request.method === 'GET') {
    return html(setupPage({ configured: !!stored }));
  }
  if (request.method !== 'POST') return text('Method not allowed', 405);
  if (stored) {
    return reply(request, { configured: true, message: 'ربات قبلاً راه‌اندازی شده است.', error: true, username: '' }, 409);
  }

  const token = await readToken(request);
  if (!token || token.length > 256) {
    return reply(request, { configured: false, message: 'توکن واردشده معتبر نیست.', error: true }, 400);
  }

  // قبل از ذخیره، هم توکن و هم دسترسی Bot API بررسی می‌شود؛ خود توکن هرگز به UI برنمی‌گردد.
  const bot = await getMe(token);
  if (!bot) {
    return reply(request, { configured: false, message: 'توکن معتبر نیست یا ارتباط با Telegram برقرار نشد.', error: true }, 400);
  }

  const origin = url.origin;
  const hook = await tg(token, 'setWebhook', {
    url: `${origin}/webhook`,
    drop_pending_updates: false,
  });
  if (!hook?.ok) {
    return reply(request, { configured: false, message: 'ثبت وب‌هوک انجام نشد. دامنه Worker و دسترسی Telegram را بررسی کنید.', error: true }, 502);
  }

  // فقط بعد از موفقیت setWebhook توکن را در SQLite Durable Object ثبت می‌کنیم.
  await env.KV.put('worker_origin', origin);
  await setSetting(env.DB, BOT_TOKEN_SETTING, token);
  await setSetting(env.DB, 'setup_done', '1');

  return reply(
    request,
    {
      configured: true,
      message: 'راه‌اندازی با موفقیت انجام شد.',
      error: false,
      username: bot.username || '',
    },
    200
  );
}

export { setupPage };
