/**
 * AMINCK GOD Edition — API-only landing (vanilla JavaScript, no external CDN).
 *
 * The full browser admin UI has been removed. Management is JSON API only
 * (login cookie + /api/*). This module still ships three static strings
 * (CSS / JS / HTML shell) so Workers Static Assets + tests keep working.
 * The JS never uses backticks or ${...} so it can live inside this TS
 * template literal and be extracted for `node --check`.
 */

export const UI_APP_CSS = `/*NOVA-CSS-START*/
:root {
  --bg: #0b1020;
  --bg2: #121a2e;
  --bg3: #1a243c;
  --fg: #e8eefc;
  --fg2: #93a0bd;
  --line: #2a3550;
  --brand: #0ea5e9;
  --brand2: #38bdf8;
  --ok: #22c55e;
  --warn: #f59e0b;
  --err: #ef4444;
  --card: #121a2e;
  --shadow: 0 12px 40px rgba(0,0,0,.45);
}
html[data-theme="light"] {
  --bg: #f3f6fb;
  --bg2: #ffffff;
  --bg3: #e8eef8;
  --fg: #0f172a;
  --fg2: #5b6b86;
  --line: #d5deee;
  --card: #ffffff;
  --shadow: 0 8px 28px rgba(15,30,60,.10);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Vazirmatn", "Segoe UI", Tahoma, sans-serif;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(14,165,233,.18), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, rgba(56,189,248,.12), transparent 50%),
    var(--bg);
  color: var(--fg);
  font-size: 14px;
  line-height: 1.75;
  min-height: 100vh;
}
a { color: var(--brand2); text-decoration: none; }
a:hover { text-decoration: underline; }
button { font-family: inherit; cursor: pointer; }
code, .mono {
  direction: ltr;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
}
.wrap {
  max-width: 920px;
  margin: 0 auto;
  padding: 48px 20px 64px;
}
.hero {
  display: flex;
  gap: 18px;
  align-items: center;
  margin-bottom: 28px;
}
.mark {
  width: 64px; height: 64px; border-radius: 18px; flex: 0 0 64px;
  background: linear-gradient(135deg, var(--brand), #6366f1);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 900; font-size: 22px;
  box-shadow: var(--shadow);
}
h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -.02em; }
.sub { color: var(--fg2); font-size: 13px; }
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px 22px;
  box-shadow: var(--shadow);
  margin-bottom: 16px;
}
.card h2 { margin: 0 0 10px; font-size: 16px; }
.muted { color: var(--fg2); font-size: 13px; }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); }
.pill {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--bg3);
}
.pill b { display: block; margin-bottom: 2px; }
.pill span { color: var(--fg2); font-size: 12px; }
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--line);
  background: var(--bg3);
  color: var(--fg);
  border-radius: 12px;
  padding: 9px 14px;
  font-size: 13px;
  transition: all .15s;
}
.btn:hover { border-color: var(--brand2); color: var(--brand2); }
.btn.primary {
  background: linear-gradient(135deg, var(--brand), #6366f1);
  border: none; color: #fff;
}
.btn.primary:hover { filter: brightness(1.08); color: #fff; }
.uri {
  direction: ltr; text-align: left;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  overflow-x: auto;
  font-family: Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 10px 0 0;
}
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--brand2);
  color: var(--brand2);
  margin-left: 6px;
}
.alert {
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13px;
  border: 1px solid var(--brand2);
  color: var(--brand2);
  margin: 0 0 16px;
}
.topbar {
  display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 10px;
}
ul.api { margin: 8px 0 0; padding-right: 18px; color: var(--fg2); font-size: 13px; }
ul.api li { margin: 4px 0; }
ul.api code { color: var(--fg); }
@media (max-width: 700px) {
  .grid { grid-template-columns: 1fr; }
  .hero { flex-direction: column; align-items: flex-start; }
  h1 { font-size: 22px; }
  .wrap { padding: 24px 14px 40px; }
  .card { padding: 16px 14px; border-radius: 14px; }
  .btn { padding: 12px 16px; font-size: 14px; min-height: 44px; }
  .pill { padding: 14px 12px; }
  .topbar { margin-bottom: 14px; }
}
/* Mobile panel enhancements for AMINCK Nova Edge */
@media (max-width: 480px) {
  body { font-size: 15px; }
  .hero .mark { width: 48px; height: 48px; font-size: 16px; border-radius: 14px; }
  h1 { font-size: 20px; line-height: 1.25; }
  .sub { font-size: 12px; }
  .card h2 { font-size: 15px; }
  .uri { font-size: 11px; padding: 10px; border-radius: 8px; }
  .badge { font-size: 10px; padding: 2px 8px; }
  .btn { border-radius: 10px; }
}
/*NOVA-CSS-END*/
`;

export const UI_SHELL_HTML = `<!--NOVA-SHELL-START-->
<!doctype html>
<html lang="fa" dir="rtl" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="AMINCK GOD Edition — API-only VLESS management on Cloudflare Workers">
<link rel="stylesheet" href="/app.css">
</head>
<body>
<div id="app"></div>
<script src="/app.js" defer></script>
</body>
</html>
<!--NOVA-SHELL-END-->
`;

export function uiShell(title: string): string {
  return UI_SHELL_HTML.replace('{TITLE}', escAttr(title));
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export const UI_APP_JS = `/*NOVA-UI-START*/
(function () {
  'use strict';

  var APP = 'AMINCK GOD Edition';
  var EDITION = 'AMINCK GOD Edition — API Only';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg, ok) {
    var box = $('#toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.style.cssText = 'position:fixed;top:16px;left:16px;z-index:50;display:flex;flex-direction:column;gap:8px';
      document.body.appendChild(box);
    }
    var t = document.createElement('div');
    t.style.cssText = 'background:var(--bg2);border:1px solid ' + (ok ? 'var(--ok)' : 'var(--err)') + ';border-radius:12px;padding:10px 14px;font-size:13px;box-shadow:var(--shadow);max-width:320px';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3800);
  }
  function copyText(text, label) {
    function done() { toast((label || 'متن') + ' کپی شد ✓', true); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  function api(method, path, body) {
    var opts = { method: method || 'GET', headers: { 'content-type': 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.message || data.error || ('HTTP ' + res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function featurePills() {
    var items = [
      ['برند AMINCK GOD Edition', 'روی همهٔ کانفیگ‌ها و ساب‌ها'],
      ['ضد شناسایی', 'padding · jitter · path رندوم · fragment'],
      ['دامنه‌های جعلی', 'snaap.ir و دامنه‌های نت ملی'],
      ['سرعت GOD', 'interval ۵۰ · tolerance ۵۰ · retry ۴'],
      ['پورت Zooz/BPB', 'انتخاب پورت‌های TLS کلودفلر'],
      ['آپدیت یک‌کلیکی', 'بدون قطعی دامنه Worker'],
      ['فقط API', 'پنل ادمین مرورگری حذف شده'],
      ['Durable Object', 'بدون D1 / KV دستی']
    ];
    var h = '<div class="grid">';
    items.forEach(function (it) {
      h += '<div class="pill"><b>' + esc(it[0]) + '</b><span>' + esc(it[1]) + '</span></div>';
    });
    h += '</div>';
    return h;
  }

  function render(me) {
    var theme = localStorage.getItem('edge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var host = location.host;
    var base = location.origin;
    var html = '';
    html += '<div class="wrap">';
    html += '<div class="topbar">';
    html += '<button class="btn" id="theme-btn">' + (theme === 'dark' ? '☀️ روشن' : '🌙 تاریک') + '</button>';
    if (me) {
      html += '<span class="badge">' + esc(me.role) + ' · ' + esc(me.username) + '</span>';
      html += '<button class="btn" id="logout-btn">خروج API</button>';
      if (me.permissions && me.permissions.indexOf('settings:manage') >= 0) {
        html += '<button class="btn primary" id="hot-btn">آپدیت یک‌کلیکی</button>';
      }
    }
    html += '</div>';
    html += '<div class="hero"><div class="mark">E</div><div>';
    html += '<h1>AMINCK GOD Edition</h1>';
    html += '<div class="sub">' + esc(EDITION) + ' · مدیریت اشتراک VLESS + WS + TLS روی Cloudflare Workers</div>';
    html += '</div></div>';
    html += '<div class="alert">پنل ادمین مرورگری حذف شده است. همهٔ عملیات مدیریتی از طریق JSON API با کوکی نشست انجام می‌شود. دامنهٔ فعلی: <span class="mono">' + esc(host) + '</span></div>';
    html += '<div class="card"><h2>قابلیت‌های این نسخه</h2>' + featurePills() + '</div>';
    html += '<div class="card"><h2>ورود API (مالک)</h2>';
    html += '<p class="muted">نام کاربری مالک: <b>AMINCK</b> (یا خالی) · رمز: secret با نام <code>ADMIN_PASSWORD</code></p>';
    html += '<div class="uri">POST ' + esc(base) + '/api/login\\nContent-Type: application/json\\n\\n{\\n  "username": "AMINCK",\\n  "password": "<ADMIN_PASSWORD>"\\n}</div>';
    html += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">';
    html += '<button class="btn" id="copy-login">کپی نمونه Login</button>';
    html += '<button class="btn" id="copy-health">کپی /healthz</button>';
    html += '<a class="btn" href="/healthz" target="_blank">Health Check</a>';
    html += '</div></div>';
    html += '<div class="card"><h2>مسیرهای اصلی API</h2><ul class="api">';
    html += '<li><code>POST /api/login</code> — ورود مالک/ادمین (کوکی HttpOnly)</li>';
    html += '<li><code>GET /api/me</code> — نقش، قدرت و Permissionها</li>';
    html += '<li><code>POST /api/user-create</code> — ساخت مشترک (سقف قدرت در Backend)</li>';
    html += '<li><code>POST /api/config-build</code> — ساخت کانفیگ AMINCK GOD Edition</li>';
    html += '<li><code>POST /api/auto-build</code> — ساخت ساب اتومات + Probe</li>';
    html += '<li><code>POST /api/hot-update</code> — آپدیت یک‌کلیکی بدون قطعی دامنه</li>';
    html += '<li><code>POST /api/settings</code> — برند، fakeDomains، antiDetect، tlsPorts، GOD</li>';
    html += '<li><code>GET /sub/{token}</code> — ساب V2Ray / Clash / sing-box / raw</li>';
    html += '<li><code>WS /e{slug}{userId}</code> — پروکسی VLESS (path رندوم + jitter)</li>';
    html += '</ul></div>';
    html += '<div class="card"><h2>ضد شناسایی و سرعت GOD</h2>';
    html += '<p class="muted">pathPadding + pathJitter + Host camouflage روی دامنه‌هایی مثل snaap.ir · fragment در Clash/sing-box · GOD: earlyData 4096، healthInterval 50، tolerance 50، tcpRetries 4، tcp-concurrent.</p>';
    html += '<div class="uri">{\\n  "antiDetect": {\\n    "pathPadding": true,\\n    "pathJitter": true,\\n    "fragment": true,\\n    "hostCamouflage": true,\\n    "multiPort": true\\n  },\\n  "fakeDomains": ["snaap.ir", "www.digikala.com"],\\n  "tlsPorts": [443, 2053, 2083, 2087, 2096, 8443],\\n  "speedPreset": "god",\\n  "brand": "AMINCK GOD Edition"\\n}</div>';
    html += '<div style="margin-top:12px"><button class="btn" id="copy-settings">کپی نمونه Settings</button></div>';
    html += '</div>';
    html += '<div class="card"><h2>آپدیت بدون قطعی دامنه</h2>';
    html += '<p class="muted">یک درخواست authenticated مسیرهای همهٔ مشترک‌ها را بازسازی می‌کند (generation++) بدون تغییر دامنهٔ Worker یا Custom Hostname.</p>';
    html += '<div class="uri">POST ' + esc(base) + '/api/hot-update\\nCookie: nova_session=…\\n\\n{ "speedPreset": "god" }</div>';
    html += '</div>';
    html += '<div class="card"><h2>وضعیت نشست</h2><div id="session-box" class="muted">در حال بررسی…</div></div>';
    html += '<p class="muted" style="text-align:center;margin-top:24px">AMINCK GOD Edition · بدون ادعای سرعت تضمینی · Probe فقط تأخیر TCP+TLS از Edge کلودفلر است.</p>';
    html += '</div>';
    $('#app').innerHTML = html;

    $('#theme-btn').addEventListener('click', function () {
      var next = (localStorage.getItem('edge-theme') || 'dark') === 'dark' ? 'light' : 'dark';
      localStorage.setItem('edge-theme', next);
      render(me);
    });
    $('#copy-login').addEventListener('click', function () {
      copyText('curl -X POST ' + base + '/api/login -H "content-type: application/json" -d "{\\"username\\":\\"AMINCK\\",\\"password\\":\\"YOUR_PASSWORD\\"}" -c cookies.txt', 'نمونه Login');
    });
    $('#copy-health').addEventListener('click', function () { copyText(base + '/healthz', 'Health'); });
    $('#copy-settings').addEventListener('click', function () {
      copyText(JSON.stringify({
        settings: {
          brand: 'AMINCK GOD Edition',
          speedPreset: 'god',
          tlsPorts: [443, 2053, 2083, 2087, 2096, 8443],
          fakeDomains: ['snaap.ir', 'www.digikala.com', 'www.aparat.com'],
          antiDetect: {
            pathPadding: true,
            pathJitter: true,
            fragment: true,
            hostCamouflage: true,
            multiPort: true,
            fragmentLength: [100, 200],
            fragmentInterval: [10, 20]
          }
        }
      }, null, 2), 'Settings');
    });
    var logout = $('#logout-btn');
    if (logout) {
      logout.addEventListener('click', function () {
        api('POST', '/api/logout').then(function () { toast('خارج شدید', true); render(null); }).catch(function (e) { toast(e.message); });
      });
    }
    var hot = $('#hot-btn');
    if (hot) {
      hot.addEventListener('click', function () {
        hot.disabled = true; hot.textContent = 'در حال آپدیت…';
        api('POST', '/api/hot-update', { speedPreset: 'god' })
          .then(function (d) {
            toast('آپدیت gen=' + d.configGeneration + ' — دامنه بدون تغییر ✓', true);
            $('#session-box').innerHTML = '<b>Hot update OK</b><div class="uri">' + esc(JSON.stringify(d, null, 2)) + '</div>';
          })
          .catch(function (e) { toast(e.message); })
          .finally(function () { hot.disabled = false; hot.textContent = 'آپدیت یک‌کلیکی'; });
      });
    }
    var box = $('#session-box');
    if (me) {
      box.innerHTML = 'وارد شده‌اید به عنوان <b>' + esc(me.username) + '</b> (' + esc(me.role) + ' / ' + esc(me.power) + '). مدیریت کامل فقط از API.';
    } else {
      box.textContent = 'نشست فعالی نیست. از POST /api/login با ADMIN_PASSWORD استفاده کنید.';
    }
  }

  function boot() {
    api('GET', '/api/me').then(function (d) {
      render(d && d.me ? d.me : null);
    }).catch(function () {
      render(null);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
/*NOVA-UI-END*/
`;

/**
 * Export the JS payload so tests can extract it and run `node --check`.
 */
export function uiAppJsForCheck(): string {
  return UI_APP_JS;
}
