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
  display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;
}
.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 16px; }
.tab {
  border: 1px solid var(--line); background: var(--bg3); color: var(--fg);
  border-radius: 999px; padding: 7px 12px; font-size: 12px;
}
.tab.on { background: linear-gradient(135deg, var(--brand), #6366f1); color: #fff; border: none; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
input, select, textarea {
  font-family: inherit; font-size: 13px; color: var(--fg);
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
  padding: 8px 10px;
}
label { font-size: 12px; color: var(--fg2); display: block; margin-bottom: 4px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: right; padding: 8px 6px; border-bottom: 1px solid var(--line); }
.login-box { max-width: 380px; margin: 24px auto; }
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
<meta name="description" content="AMINCK GOD Edition — پنل فروش ساب VLESS روی Cloudflare Workers">
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
  var EDITION = 'AMINCK GOD Edition — فروش ساب';
  var TAB = 'dash';
  var STATE = { me: null, users: [], stats: null, endpoints: [], probe: {}, iron: null, clean: [], ironUser: '' };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
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
    function done() { toast((label || 'متن') + ' کپی شد', true); }
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
  function can(me, p) { return me && me.permissions && me.permissions.indexOf(p) >= 0; }
  function subLink(token, fmt) { return location.origin + '/sub/' + token + (fmt ? '/' + fmt : ''); }

  function renderLogin() {
    var theme = localStorage.getItem('edge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var html = '<div class="wrap">';
    html += '<div class="topbar"><button class="btn" id="theme-btn">' + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button></div>';
    html += '<div class="hero"><div class="mark">N</div><div><h1>AMINCK Nova Edge</h1><div class="sub">' + esc(EDITION) + '</div></div></div>';
    html += '<div class="card login-box"><h2>ورود پنل فروش</h2>';
    html += '<p class="muted">مالک: <b>AMINCK</b> · رمز: <code>ADMIN_PASSWORD</code></p>';
    html += '<label>نام کاربری</label><input id="u" value="AMINCK" style="width:100%;margin-bottom:8px">';
    html += '<label>رمز</label><input id="p" type="password" style="width:100%;margin-bottom:12px">';
    html += '<button class="btn primary" id="login-btn" style="width:100%">ورود</button></div>';
    html += '<div class="card"><h2>کلاینت‌های سازگار</h2><p class="muted">V2Box · V2RayNG · MahsaNG · NapsternetV · Clash Meta · sing-box</p></div></div>';
    $('#app').innerHTML = html;
    $('#theme-btn').onclick = function () {
      localStorage.setItem('edge-theme', theme === 'dark' ? 'light' : 'dark');
      renderLogin();
    };
    $('#login-btn').onclick = function () {
      api('POST', '/api/login', { username: $('#u').value, password: $('#p').value })
        .then(function () { toast('ورود موفق', true); boot(); })
        .catch(function (e) { toast(e.message); });
    };
  }

  function shell(inner) {
    var me = STATE.me;
    var theme = localStorage.getItem('edge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var tabs = [['dash', 'داشبورد'], ['sell', 'فروش ساب'], ['iron', 'آهنین JSON'], ['scan', 'پینگ / IP تمیز'], ['help', 'راهنما']];
    var html = '<div class="wrap"><div class="topbar">';
    html += '<button class="btn" id="theme-btn">' + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button>';
    html += '<span class="badge">' + esc(me.role) + ' · ' + esc(me.username) + '</span>';
    html += '<button class="btn" id="logout-btn">خروج</button>';
    if (can(me, 'settings:manage')) html += '<button class="btn primary" id="hot-btn">آپدیت یک‌کلیکی</button>';
    html += '</div><div class="hero"><div class="mark">N</div><div><h1>' + esc(APP) + '</h1><div class="sub">پنل فروش ساب · ' + esc(location.host) + '</div></div></div>';
    html += '<div class="tabs">';
    tabs.forEach(function (t) {
      html += '<button class="tab' + (TAB === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    });
    html += '</div>' + inner + '</div>';
    $('#app').innerHTML = html;
    document.querySelectorAll('.tab').forEach(function (el) {
      el.addEventListener('click', function () { TAB = el.getAttribute('data-tab'); paint(); });
    });
    $('#theme-btn').onclick = function () {
      localStorage.setItem('edge-theme', theme === 'dark' ? 'light' : 'dark');
      paint();
    };
    $('#logout-btn').onclick = function () {
      api('POST', '/api/logout').then(function () { STATE.me = null; renderLogin(); }).catch(function (e) { toast(e.message); });
    };
    var hot = $('#hot-btn');
    if (hot) {
      hot.onclick = function () {
        api('POST', '/api/hot-update', { speedPreset: 'god' })
          .then(function (d) { toast('آپدیت gen=' + d.configGeneration, true); })
          .catch(function (e) { toast(e.message); });
      };
    }
  }

  function viewDash() {
    var s = STATE.stats || {};
    var html = '<div class="grid">';
    html += '<div class="pill"><b>' + (s.users || 0) + '</b><span>مشترک</span></div>';
    html += '<div class="pill"><b>' + (s.activeUsers || 0) + '</b><span>فعال</span></div>';
    html += '<div class="pill"><b>' + (s.endpoints || 0) + '</b><span>Endpoint</span></div>';
    html += '<div class="pill"><b>' + (s.liveSessions || 0) + '</b><span>نشست زنده</span></div></div>';
    html += '<div class="card" style="margin-top:16px"><h2>فروش سریع ساب</h2>';
    html += '<p class="muted">لینک را به مشتری بده — V2Box / MahsaNG / Napster / V2RayNG</p>';
    html += '<div class="row"><input id="n" placeholder="نام مشتری"><select id="paths"><option value="1">۱ مسیر</option><option value="3" selected>۳ مسیر</option><option value="5">۵ مسیر</option></select>';
    html += '<button class="btn primary" id="mk">ساخت ساب</button></div><div id="mk-out"></div></div>';
    shell(html);
    $('#mk').onclick = function () {
      var name = $('#n').value || ('مشتری-' + Date.now());
      api('POST', '/api/user-create', { name: name, paths: Number($('#paths').value), speedPreset: 'god' })
        .then(function (d) {
          var u = d.user;
          var link = subLink(u.token, '');
          $('#mk-out').innerHTML = '<div class="uri">' + esc(link) + '</div><div class="row" style="margin-top:8px"><button class="btn" id="c1">کپی ساب</button><button class="btn" id="c2">کپی Clash</button><button class="btn" id="c3">کپی sing-box</button></div>';
          $('#c1').onclick = function () { copyText(link, 'ساب'); };
          $('#c2').onclick = function () { copyText(subLink(u.token, 'clash'), 'Clash'); };
          $('#c3').onclick = function () { copyText(subLink(u.token, 'singbox'), 'sing-box'); };
          toast('ساب ساخته شد', true);
          return loadUsers();
        })
        .catch(function (e) { toast(e.message); });
    };
  }

  function viewSell() {
    var html = '<div class="card"><h2>مشترک‌ها</h2><table><thead><tr><th>نام</th><th>مسیر</th><th>ساب</th><th></th></tr></thead><tbody>';
    STATE.users.forEach(function (u) {
      html += '<tr><td>' + esc(u.name) + '</td><td>' + (u.routes ? u.routes.length : 0) + '</td>';
      html += '<td class="mono" style="font-size:11px">/sub/' + esc((u.token || '').slice(0, 8)) + '…</td>';
      html += '<td><button class="btn" data-copy="' + esc(u.token) + '">کپی ساب</button> ';
      html += '<button class="btn" data-iron="' + esc(u.id) + '">آهنین</button></td></tr>';
    });
    html += '</tbody></table></div>';
    shell(html);
    document.querySelectorAll('[data-copy]').forEach(function (el) {
      el.onclick = function () { copyText(subLink(el.getAttribute('data-copy'), ''), 'ساب'); };
    });
    document.querySelectorAll('[data-iron]').forEach(function (el) {
      el.onclick = function () { TAB = 'iron'; STATE.ironUser = el.getAttribute('data-iron'); paint(); };
    });
  }

  function viewIron() {
    var html = '<div class="card"><h2>کانفیگ آهنین (۱ تا ۵ JSON)</h2>';
    html += '<p class="muted">خروجی Xray / sing-box برای V2RayNG، MahsaNG، NapsternetV و V2Box.</p>';
    html += '<div class="row"><select id="uid">';
    STATE.users.forEach(function (u) {
      var sel = STATE.ironUser === u.id ? ' selected' : '';
      html += '<option value="' + esc(u.id) + '"' + sel + '>' + esc(u.name) + '</option>';
    });
    html += '</select><select id="ic"><option>1</option><option selected>3</option><option>5</option></select>';
    html += '<button class="btn primary" id="ib">ساخت آهنین</button></div><div id="iron-out"></div></div>';
    shell(html);
    var ib = $('#ib');
    if (ib) ib.onclick = function () {
      api('POST', '/api/iron-build', { id: $('#uid').value, count: Number($('#ic').value) })
        .then(function (d) {
          STATE.iron = d.iron;
          var out = '';
          (d.iron || []).forEach(function (p) {
            out += '<div class="card"><b>' + esc(p.name) + '</b> <span class="badge">' + esc(p.client) + '</span>';
            out += '<div class="uri">' + esc(p.json) + '</div>';
            out += '<button class="btn" data-j="' + p.index + '">کپی JSON</button></div>';
          });
          $('#iron-out').innerHTML = out;
          document.querySelectorAll('[data-j]').forEach(function (el) {
            el.onclick = function () {
              var idx = Number(el.getAttribute('data-j'));
              var item = (STATE.iron || []).filter(function (x) { return x.index === idx; })[0];
              if (item) copyText(item.json, 'JSON آهنین');
            };
          });
        })
        .catch(function (e) { toast(e.message); });
    };
  }

  function viewScan() {
    var html = '<div class="card"><h2>پینگ از Edge کلودفلر</h2><p class="muted">عدد پینگ گوشی نیست — تأخیر TCP+TLS از ورکر است. کمتر = بهتر.</p>';
    html += '<div class="row"><input id="eh" placeholder="host مثلا workers.dev"><input id="ep" value="443" style="width:80px"><button class="btn" id="add-ep">افزودن</button><button class="btn primary" id="pr">پینگ همه</button></div>';
    html += '<table><thead><tr><th>Host</th><th>Port</th><th>وضعیت</th></tr></thead><tbody>';
    (STATE.endpoints || []).forEach(function (e) {
      var r = (STATE.probe || {})[e.id] || {};
      var st = r.ok ? ((r.latencyMs || '?') + ' ms') : (r.error || '—');
      html += '<tr><td class="mono">' + esc(e.host) + '</td><td>' + e.port + '</td><td>' + esc(String(st)) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="card"><h2>مخزن IP تمیز</h2><p class="muted">فرانت anycast کلودفلر برای تانل نت ملی.</p><ul class="api">';
    (STATE.clean || []).forEach(function (c) {
      html += '<li class="mono">' + esc(c.ip) + ' — ' + esc(c.label) + '</li>';
    });
    html += '</ul></div>';
    shell(html);
    $('#add-ep').onclick = function () {
      api('POST', '/api/endpoints', { action: 'add', host: $('#eh').value, port: Number($('#ep').value || 443) })
        .then(function () { toast('افزوده شد', true); loadScan(); })
        .catch(function (e) { toast(e.message); });
    };
    $('#pr').onclick = function () {
      api('POST', '/api/probe', {}).then(function (d) {
        STATE.probe = d.results || {};
        toast('پینگ انجام شد', true);
        paint();
      }).catch(function (e) { toast(e.message); });
    };
  }

  function viewHelp() {
    var html = '<div class="card"><h2>نصب خودکار کلودفلر</h2>';
    html += '<ol class="api"><li><code>npx wrangler login</code></li><li><code>npm run deploy</code></li>';
    html += '<li><code>wrangler secret put ADMIN_PASSWORD</code></li><li><code>wrangler secret put SESSION_SECRET</code></li></ol>';
    html += '<p class="muted">یا دکمه Deploy to Cloudflare در README گیت‌هاب.</p></div>';
    html += '<div class="card"><h2>وارد کردن ساب</h2><p class="muted">لینک /sub/TOKEN را در V2Box / MahsaNG / Napster / V2RayNG بچسبان. Clash: /sub/TOKEN/clash · sing-box: /sub/TOKEN/singbox</p></div>';
    html += '<div class="card"><h2>نت ملی</h2><p class="muted">Host استتار روی دامنه‌های داخلی. اتصال واقعی روی همین Worker است. IP تمیز را به‌عنوان فرانت روی دامنه ورکر ست کن.</p></div>';
    shell(html);
  }

  function paint() {
    if (!STATE.me) { renderLogin(); return; }
    if (TAB === 'sell') viewSell();
    else if (TAB === 'iron') viewIron();
    else if (TAB === 'scan') viewScan();
    else if (TAB === 'help') viewHelp();
    else viewDash();
  }

  function loadUsers() {
    return api('POST', '/api/users', {}).then(function (d) { STATE.users = d.users || []; });
  }

  function loadScan() {
    return Promise.all([
      api('POST', '/api/endpoints', { action: 'view' }).then(function (d) {
        STATE.endpoints = d.endpoints || [];
        STATE.probe = d.probeResults || {};
      }).catch(function () {}),
      api('POST', '/api/clean-ips', {}).then(function (d) { STATE.clean = d.ips || []; }).catch(function () {})
    ]).then(function () { if (TAB === 'scan') paint(); });
  }

  function render(me) {
    STATE.me = me;
    if (!me) { renderLogin(); return; }
    Promise.all([
      api('POST', '/api/stats', {}).then(function (d) { STATE.stats = d; }).catch(function () {}),
      loadUsers().catch(function () {}),
      loadScan()
    ]).then(function () { paint(); });
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

export function uiAppJsForCheck(): string {
  return UI_APP_JS;
}
