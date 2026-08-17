/**
 * AMINCK Nova Edge — admin panel UI (vanilla JavaScript, no external CDN).
 *
 * The whole panel ships as three static strings (CSS / JS / HTML shell) that
 * the worker serves. The JS is plain ES2017-style DOM code; it never uses
 * backticks or ${...} so it can live inside this TS template literal and be
 * extracted verbatim for `node --check` (see scripts/check-ui.mjs).
 */

export const UI_APP_CSS = `/*NOVA-CSS-START*/
:root {
  --bg: #0d1117;
  --bg2: #161b22;
  --bg3: #1c2330;
  --fg: #e6edf3;
  --fg2: #9aa7b4;
  --line: #2b3444;
  --brand: #7c3aed;
  --brand2: #a855f7;
  --ok: #22c55e;
  --warn: #f59e0b;
  --err: #ef4444;
  --card: #161b22;
  --shadow: 0 8px 30px rgba(0,0,0,.35);
}
html[data-theme="light"] {
  --bg: #f4f6fa;
  --bg2: #ffffff;
  --bg3: #eef1f6;
  --fg: #1a2230;
  --fg2: #5b6675;
  --line: #dfe5ee;
  --card: #ffffff;
  --shadow: 0 6px 24px rgba(20,30,60,.10);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Vazirmatn", "Segoe UI", Tahoma, sans-serif;
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
  line-height: 1.7;
}
a { color: var(--brand2); text-decoration: none; }
a:hover { text-decoration: underline; }
button { font-family: inherit; cursor: pointer; }
input, select, textarea {
  font-family: inherit;
  font-size: 14px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 9px 12px;
  width: 100%;
  outline: none;
  transition: border .15s;
}
input:focus, select:focus, textarea:focus { border-color: var(--brand2); }
textarea { resize: vertical; min-height: 120px; }
label { display: block; margin: 10px 0 4px; color: var(--fg2); font-size: 13px; }
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--line);
  background: var(--bg3);
  color: var(--fg);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 13px;
  transition: all .15s;
  white-space: nowrap;
}
.btn:hover { border-color: var(--brand2); color: var(--brand2); }
.btn.primary { background: linear-gradient(135deg, var(--brand), var(--brand2)); border: none; color: #fff; }
.btn.primary:hover { filter: brightness(1.1); color: #fff; }
.btn.danger { background: transparent; border-color: var(--err); color: var(--err); }
.btn.danger:hover { background: var(--err); color: #fff; }
.btn.ok { background: transparent; border-color: var(--ok); color: var(--ok); }
.btn.ok:hover { background: var(--ok); color: #fff; }
.btn.small { padding: 4px 10px; font-size: 12px; border-radius: 8px; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; border: 1px solid var(--line); color: var(--fg2); }
.badge.on { color: var(--ok); border-color: var(--ok); }
.badge.off { color: var(--err); border-color: var(--err); }
.badge.owner { color: #fff; background: linear-gradient(135deg, #7c3aed, #d946ef); border: none; }
.badge.admin { color: var(--brand2); border-color: var(--brand2); }
.badge.operator { color: var(--warn); border-color: var(--warn); }
.badge.support { color: var(--fg2); }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: right; padding: 9px 10px; border-bottom: 1px solid var(--line); font-size: 13px; vertical-align: middle; }
th { color: var(--fg2); font-weight: 600; font-size: 12px; white-space: nowrap; }
td .row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.muted { color: var(--fg2); font-size: 12px; }
.mono { direction: ltr; font-family: "JetBrains Mono", Consolas, monospace; font-size: 12px; }
/* layout */
#app { min-height: 100vh; display: flex; }
#sidebar {
  width: 230px; flex: 0 0 230px;
  background: var(--bg2);
  border-left: 1px solid var(--line);
  padding: 18px 12px;
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column; gap: 4px;
  overflow-y: auto;
}
#sidebar .logo { display: flex; align-items: center; gap: 10px; padding: 6px 10px 16px; }
#sidebar .logo .mark {
  width: 38px; height: 38px; border-radius: 12px;
  background: linear-gradient(135deg, var(--brand), #d946ef);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; font-size: 16px;
}
#sidebar .logo .name { font-weight: 800; font-size: 15px; }
#sidebar .logo .sub { font-size: 10px; color: var(--fg2); }
#sidebar nav a {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 10px;
  color: var(--fg2); font-size: 13.5px;
}
#sidebar nav a:hover { background: var(--bg3); color: var(--fg); text-decoration: none; }
#sidebar nav a.active { background: linear-gradient(135deg, rgba(124,58,237,.18), rgba(217,70,239,.12)); color: var(--brand2); font-weight: 700; }
#main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
#topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 22px; border-bottom: 1px solid var(--line);
  background: var(--bg2);
  position: sticky; top: 0; z-index: 20;
}
#topbar .spacer { flex: 1; }
#topbar .user-chip { display: flex; align-items: center; gap: 8px; }
#content { padding: 22px; flex: 1; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; box-shadow: var(--shadow); }
.grid { display: grid; gap: 14px; }
.grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
.grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
.stat { }
.stat .k { color: var(--fg2); font-size: 12px; }
.stat .v { font-size: 24px; font-weight: 800; margin-top: 2px; }
.stat .d { color: var(--fg2); font-size: 11px; }
h1 { font-size: 19px; margin: 0 0 14px; }
h2 { font-size: 16px; margin: 0 0 10px; }
.section-title { display: flex; align-items: center; gap: 10px; margin: 22px 0 12px; }
.section-title h2 { margin: 0; }
.toasts { position: fixed; top: 16px; left: 16px; z-index: 300; display: flex; flex-direction: column; gap: 8px; }
.toast {
  background: var(--bg2); border: 1px solid var(--line);
  border-radius: 12px; padding: 10px 16px; font-size: 13px;
  box-shadow: var(--shadow); max-width: 340px; animation: slidein .2s ease;
}
.toast.ok { border-color: var(--ok); }
.toast.err { border-color: var(--err); }
@keyframes slidein { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
/* modal */
.modal-back {
  position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 100;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 40px 16px; overflow-y: auto;
}
.modal {
  background: var(--bg2); border: 1px solid var(--line); border-radius: 18px;
  width: 100%; max-width: 560px; padding: 20px; box-shadow: var(--shadow);
}
.modal.wide { max-width: 860px; }
.modal h3 { margin: 0 0 12px; font-size: 16px; }
.modal .row { display: flex; gap: 10px; align-items: flex-end; }
.modal .row > div { flex: 1; }
.modal .close-x { float: left; background: none; border: none; color: var(--fg2); font-size: 18px; }
/* login */
#login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
#login-card { width: 100%; max-width: 380px; }
#login-card .logo-big { text-align: center; margin-bottom: 18px; }
#login-card .mark-big {
  width: 64px; height: 64px; border-radius: 20px; margin: 0 auto 10px;
  background: linear-gradient(135deg, var(--brand), #d946ef);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; font-size: 26px;
}
/* misc */
.progress { height: 10px; background: var(--bg3); border-radius: 999px; overflow: hidden; }
.progress > div { height: 100%; background: linear-gradient(90deg, var(--brand), var(--brand2)); border-radius: 999px; transition: width .3s; }
.uri-box { direction: ltr; text-align: left; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 10px; overflow-x: auto; max-height: 300px; overflow-y: auto; font-family: Consolas, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
.tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--line); margin-bottom: 14px; flex-wrap: wrap; }
.tabs button { background: none; border: none; padding: 8px 14px; color: var(--fg2); border-bottom: 2px solid transparent; font-size: 13px; }
.tabs button.active { color: var(--brand2); border-bottom-color: var(--brand2); font-weight: 700; }
.inline { display: inline-flex; gap: 8px; align-items: center; }
.alert { border-radius: 12px; padding: 12px 14px; font-size: 13px; margin: 12px 0; border: 1px solid var(--line); }
.alert.info { border-color: var(--brand2); color: var(--brand2); }
.alert.warn { border-color: var(--warn); color: var(--warn); }
.search { max-width: 300px; }
.hidden { display: none !important; }
@media (max-width: 900px) {
  #app { flex-direction: column; }
  #sidebar { width: 100%; flex: none; height: auto; position: static; flex-direction: row; flex-wrap: wrap; padding: 10px; }
  #sidebar .logo { padding: 0 6px; }
  #sidebar nav { display: flex; flex-wrap: wrap; gap: 4px; }
  #content { padding: 14px; }
  .grid.cols-4, .grid.cols-3, .grid.cols-2 { grid-template-columns: 1fr 1fr; }
  #topbar { flex-wrap: wrap; padding: 10px 14px; }
}
@media (max-width: 560px) {
  .grid.cols-4, .grid.cols-3, .grid.cols-2 { grid-template-columns: 1fr; }
  table { display: block; overflow-x: auto; }
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

  var SESSION_COOKIE_FLAG = true; // cookies are HttpOnly; JS never reads them
  var state = {
    me: null,
    theme: localStorage.getItem('nova-theme') || 'dark',
    users: [],
    settings: null,
    stats: null,
    page: (location.hash || '#dashboard').replace('#', ''),
    userModal: null,
    autoModalOpen: false
  };

  // ---------------------------------------------------------------- helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return esc(s); }
  function fa(n) { return String(n); }
  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    var i = 0;
    while (b >= 1024 && i < units.length - 1) { b = b / 1024; i++; }
    return b.toFixed(b >= 100 ? 0 : b >= 10 ? 1 : 2) + ' ' + units[i];
  }
  function fmtDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDuration(s) {
    s = Number(s) || 0;
    if (s <= 0) return '∞ نامحدود';
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    if (d > 0) return d + ' روز';
    if (h > 0) return h + ' ساعت';
    return Math.floor(s / 60) + ' دقیقه';
  }
  function toast(msg, ok) {
    var box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.id = 'toasts'; document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'toast ' + (ok ? 'ok' : 'err');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(function () { t.remove(); }, 320); }, 4200);
  }
  function api(method, path, body) {
    var opts = { method: method || 'GET', headers: { 'content-type': 'application/json' } };
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
  function perm(p) { return state.me && state.me.permissions && state.me.permissions.indexOf(p) >= 0; }
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
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function roleLabel(r) { return r === 'owner' ? 'مالک' : r === 'admin' ? 'مدیر' : r === 'operator' ? 'اپراتور' : 'پشتیبانی'; }
  function roleClass(r) { return r === 'owner' ? 'owner' : r === 'admin' ? 'admin' : r === 'operator' ? 'operator' : 'support'; }
  function powerLabel(p) {
    var map = { limited: 'Limited (۵ مسیر)', normal: 'Normal (۳۰ مسیر)', strong: 'Strong (۸۰ مسیر)', ultra: 'Ultra (۲۰۰ مسیر)' };
    return map[p] || p;
  }
  function modeLabel(m) { return m === 'fallback' ? 'Fallback' : m === 'balance' ? 'Balance' : 'Auto'; }
  function speedLabel(s) { var map = { stable: 'Stable', balanced: 'Balanced', turbo: 'Turbo', god: 'GOD' }; return map[s] || s; }

  // ---------------------------------------------------------------- router
  var NAV = [
    { id: 'dashboard', label: 'داشبورد', icon: '◈' },
    { id: 'users', label: 'کاربران', icon: '👤', perm: 'users:view' },
    { id: 'config', label: 'کانفیگ آهنین', icon: '⚙', perm: 'configs:build' },
    { id: 'auto', label: 'ساخت ساب اتومات', icon: '✦', perm: 'configs:build' },
    { id: 'scanner', label: 'Scanner', icon: '◎', perm: 'endpoints:probe' },
    { id: 'settings', label: 'تنظیمات', icon: '☰', perm: 'settings:manage' },
    { id: 'admins', label: 'مدیریت ادمین', icon: '⚑', perm: 'admins:manage' },
    { id: 'audit', label: 'Audit', icon: '📜', perm: 'audit:view' },
    { id: 'caps', label: 'قابلیت‌ها', icon: '❖' },
    { id: 'install', label: 'نصب', icon: '⌁' }
  ];

  function render() {
    var app = $('#app');
    if (!state.me) { app.innerHTML = loginView(); bindLogin(); return; }
    var nav = NAV.filter(function (n) { return !n.perm || perm(n.perm); });
    var html = '<aside id="sidebar">';
    html += '<div class="logo"><div class="mark">A</div><div><div class="name">' + esc((state.settings && state.settings.title) || 'AMINCK Nova Edge') + '</div><div class="sub">AMINCK GOD Edition</div></div></div>';
    html += '<nav>';
    nav.forEach(function (n) {
      var active = state.page === n.id ? ' active' : '';
      html += '<a href="#' + n.id + '" data-nav="' + n.id + '" class="' + active + '"><span>' + n.icon + '</span> ' + n.label + '</a>';
    });
    html += '</nav></aside>';
    html += '<div id="main">';
    html += '<header id="topbar">';
    html += '<button class="btn small" id="nav-toggle">☰</button>';
    html += '<div class="spacer"></div>';
    html += '<div class="user-chip">';
    html += '<span class="badge ' + roleClass(state.me.role) + '">' + roleLabel(state.me.role) + '</span>';
    html += '<span class="badge">' + esc(powerLabel(state.me.power)) + '</span>';
    html += '<span class="muted">' + esc(state.me.username) + '</span>';
    html += '<button class="btn small" id="theme-btn">' + (state.theme === 'dark' ? '☀️' : '🌙') + '</button>';
    html += '<button class="btn small" id="logout-btn">خروج</button>';
    html += '</div></header>';
    html += '<div id="content">' + pageHtml() + '</div>';
    html += '</div>';
    app.innerHTML = html;
    bindShell();
    bindPage();
  }

  function pageHtml() {
    switch (state.page) {
      case 'dashboard': return dashboardView();
      case 'users': return usersView();
      case 'config': return configView();
      case 'auto': return autoView();
      case 'scanner': return scannerView();
      case 'settings': return settingsView();
      case 'admins': return adminsView();
      case 'audit': return auditView();
      case 'caps': return capsView();
      case 'install': return installView();
      default: return dashboardView();
    }
  }

  function bindShell() {
    $('#theme-btn').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('nova-theme', state.theme);
      document.documentElement.setAttribute('data-theme', state.theme);
      $('#theme-btn').textContent = state.theme === 'dark' ? '☀️' : '🌙';
    });
    $('#logout-btn').addEventListener('click', function () {
      api('POST', '/api/logout').then(function () { state.me = null; location.hash = '#dashboard'; render(); }).catch(function (e) { toast(e.message); });
    });
    var t = $('#nav-toggle');
    if (t) t.addEventListener('click', function () { var s = $('#sidebar'); s.style.display = s.style.display === 'none' ? 'flex' : 'none'; });
  }

  function bindPage() {
    var map = {
      dashboard: bindDashboard, users: bindUsers, config: bindConfig,
      auto: bindAuto, scanner: bindScanner, settings: bindSettings,
      admins: bindAdmins, audit: bindAudit, caps: bindCaps, install: bindInstall
    };
    if (map[state.page]) map[state.page]();
  }

  // ------------------------------------------------------------------ login
  function loginView() {
    return '<div id="login-wrap"><div id="login-card" class="card">'
      + '<div class="logo-big"><div class="mark-big">A</div><h1>AMINCK Nova Edge</h1><div class="muted">AMINCK GOD Edition — پنل مدیریت</div></div>'
      + '<label>نام کاربری (مالک: AMINCK یا خالی)</label><input id="login-user" autocomplete="username" placeholder="AMINCK">'
      + '<label>رمز عبور</label><input id="login-pass" type="password" autocomplete="current-password">'
      + '<div style="margin-top:16px"><button class="btn primary" id="login-btn" style="width:100%;justify-content:center">ورود</button></div>'
      + '<div id="login-err" class="muted" style="margin-top:10px;color:var(--err);min-height:18px"></div>'
      + '</div></div>';
  }
  function bindLogin() {
    function go() {
      var user = $('#login-user').value.trim();
      var pass = $('#login-pass').value;
      if (!pass) { $('#login-err').textContent = 'رمز عبور را وارد کنید'; return; }
      var btn = $('#login-btn');
      btn.disabled = true; btn.textContent = 'در حال ورود…';
      api('POST', '/api/login', { username: user, password: pass })
        .then(function () {
          return api('GET', '/api/me').then(function (d) {
            state.me = d.me;
            toast('خوش آمدید ' + d.me.username + ' 👋', true);
            render();
          });
        })
        .catch(function (e) {
          $('#login-err').textContent = e.message || 'ورود ناموفق';
          btn.disabled = false; btn.textContent = 'ورود';
        });
    }
    $('#login-btn').addEventListener('click', go);
    $('#login-pass').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    $('#login-user').focus();
  }

  // --------------------------------------------------------------- dashboard
  function dashboardView() {
    return '<h1>داشبورد</h1>'
      + '<div class="grid cols-4">'
      + statCard('کاربران', fa(state.stats ? state.stats.users : '…'), 'کل مشترک‌ها')
      + statCard('فعال', fa(state.stats ? state.stats.activeUsers : '…'), 'مشترک‌های فعال')
      + statCard('نشست زنده', fa(state.stats ? state.stats.liveSessions : '…'), 'اتصال WebSocket هم‌زمان')
      + statCard('مصرف کل', fmtBytes(state.stats ? state.stats.totalTraffic : 0), 'تقریبی')
      + '</div>'
      + '<div class="grid cols-3" style="margin-top:14px">'
      + statCard('ادمین‌ها', fa(state.stats ? state.stats.admins : '…'), 'شامل مالک')
      + statCard('Endpointها', fa(state.stats ? state.stats.endpoints : '…'), 'حداکثر ۵۰')
      + statCard('آخرین Probe', state.stats && state.stats.lastProbeAt ? fmtDate(state.stats.lastProbeAt) : '—', 'هر ۳۰ دقیقه خودکار')
      + '</div>'
      + '<div class="section-title"><h2>آخرین کاربران</h2></div>'
      + '<div class="card" id="recent-users"><div class="muted">در حال بارگذاری…</div></div>';
  }
  function statCard(k, v, d) { return '<div class="card stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; }
  function bindDashboard() {
    api('GET', '/api/stats').then(function (d) { state.stats = d; render(); }).catch(function (e) { toast(e.message); });
    api('GET', '/api/users').then(function (d) {
      var box = $('#recent-users');
      if (!box) return;
      var list = d.users.slice(-6).reverse();
      if (list.length === 0) { box.innerHTML = '<div class="muted">هنوز کاربری ساخته نشده است.</div>'; return; }
      var h = '<table><tr><th>نام</th><th>مصرف</th><th>وضعیت</th><th>آخرین اتصال</th></tr>';
      list.forEach(function (u) {
        h += '<tr><td>' + esc(u.name) + '</td><td>' + fmtBytes(u.usageBytes) + '</td>'
          + '<td><span class="badge ' + (u.active ? 'on' : 'off') + '">' + (u.active ? 'فعال' : 'غیرفعال') + '</span></td>'
          + '<td>' + fmtDate(u.lastSeenAt) + '</td></tr>';
      });
      box.innerHTML = h + '</table>';
    }).catch(function () {});
  }

  // ------------------------------------------------------------------ users
  function usersView() {
    var canEdit = perm('users:edit'), canDelete = perm('users:delete');
    var h = '<h1>کاربران</h1>';
    h += '<div class="card"><div class="inline" style="width:100%">'
      + '<input class="search" id="user-q" placeholder="جست‌وجو بر اساس نام / UUID / Token…">'
      + '<div class="spacer" style="flex:1"></div>'
      + (perm('users:create') ? '<button class="btn primary" id="new-user-btn">+ کاربر جدید</button>' : '')
      + '</div></div>';
    h += '<div class="card" style="margin-top:14px;overflow-x:auto"><table id="users-table"><thead><tr>'
      + '<th>نام</th><th>حجم باقی‌مانده</th><th>زمان</th><th>اتصال</th><th>وضعیت</th><th>آخرین اتصال</th><th>آخرین ساب</th><th>عملیات</th>'
      + '</tr></thead><tbody><tr><td colspan="8" class="muted">در حال بارگذاری…</td></tr></tbody></table></div>';
    return h;
  }
  function bindUsers() {
    function load() {
      var q = ($('#user-q') ? $('#user-q').value : '').trim();
      var url = '/api/users';
      return api('POST', '/api/users', { q: q }).then(function (d) { return d; });
    }
    function refresh() {
      load().then(function (d) { state.users = d.users; drawUsers(d.users); }).catch(function (e) { toast(e.message); });
    }
    function drawUsers(users) {
      var tbody = $('#users-table tbody');
      if (!tbody) return;
      if (!users.length) { tbody.innerHTML = '<tr><td colspan="8" class="muted">کاربری پیدا نشد.</td></tr>'; return; }
      var h = '';
      users.forEach(function (u) {
        var left = u.limitBytes === 0 ? '∞' : fmtBytes(Math.max(0, u.limitBytes - u.usageBytes));
        var timeLeft = u.limitSeconds === 0 ? '∞' : (u.expiresAt ? fmtDuration(Math.floor((u.expiresAt - Date.now()) / 1000)) : '—');
        var connLeft = u.maxConnections === 0 ? '∞' : fa(u.maxConnections);
        var actions = '';
        if (perm('users:edit')) {
          actions += '<button class="btn small" data-act="edit" data-id="' + u.id + '">ویرایش</button>';
          actions += '<button class="btn small" data-act="toggle" data-id="' + u.id + '">' + (u.active ? 'غیرفعال' : 'فعال') + '</button>';
          actions += '<button class="btn small" data-act="reset-usage" data-id="' + u.id + '">ریست مصرف</button>';
          actions += '<button class="btn small" data-act="reset-conn" data-id="' + u.id + '">ریست اتصال</button>';
          actions += '<button class="btn small" data-act="rotate-uuid" data-id="' + u.id + '">UUID جدید</button>';
          actions += '<button class="btn small" data-act="rotate-token" data-id="' + u.id + '">Token جدید</button>';
          actions += '<button class="btn small" data-act="config" data-id="' + u.id + '">کانفیگ</button>';
        }
        if (perm('users:delete')) actions += '<button class="btn small danger" data-act="del" data-id="' + u.id + '">حذف</button>';
        h += '<tr>'
          + '<td><b>' + esc(u.name) + '</b><div class="muted mono">' + esc(u.uuid.slice(0, 8)) + '…</div></td>'
          + '<td>' + left + '</td><td>' + timeLeft + '</td><td>' + connLeft + '</td>'
          + '<td><span class="badge ' + (u.active ? 'on' : 'off') + '">' + (u.active ? 'فعال' : 'غیرفعال') + '</span></td>'
          + '<td>' + fmtDate(u.lastSeenAt) + '</td><td>' + fmtDate(u.lastSubAt) + '</td>'
          + '<td><div class="row-actions">' + actions + '</div></td></tr>';
      });
      tbody.innerHTML = h;
      $$('button[data-act]', tbody).forEach(function (b) {
        b.addEventListener('click', function () {
          var act = b.getAttribute('data-act');
          var id = b.getAttribute('data-id');
          if (act === 'edit') openUserModal(id);
          else if (act === 'config') { state.page = 'config'; state.configUserId = id; location.hash = '#config'; render(); }
          else if (act === 'del') {
            if (!confirm('کاربر حذف شود؟ این عمل برگشت‌پذیر نیست.')) return;
            api('POST', '/api/user-delete', { id: id }).then(function () { toast('کاربر حذف شد', true); refresh(); }).catch(function (e) { toast(e.message); });
          } else {
            var actionMap = { toggle: 'toggle', 'reset-usage': 'reset_usage', 'reset-conn': 'reset_connections', 'rotate-uuid': 'rotate_uuid', 'rotate-token': 'rotate_token' };
            api('POST', '/api/users/' + id, { action: actionMap[act] }).then(function () { toast('انجام شد ✓', true); refresh(); }).catch(function (e) { toast(e.message); });
          }
        });
      });
    }
    var q = $('#user-q');
    if (q) q.addEventListener('input', function () { clearTimeout(q._t); q._t = setTimeout(refresh, 250); });
    var nb = $('#new-user-btn');
    if (nb) nb.addEventListener('click', function () { openUserModal(null); });
    refresh();
  }

  // ------------------------------------------------------------ user modal
  function openUserModal(id) {
    var u = id ? state.users.filter(function (x) { return x.id === id; })[0] : null;
    var h = '<div class="modal-back" id="user-modal-back"><div class="modal wide">'
      + '<button class="close-x" id="um-close">✕</button>'
      + '<h3>' + (u ? 'ویرایش کاربر' : 'کاربر جدید') + '</h3>'
      + '<div class="row"><div><label>نام</label><input id="um-name" value="' + escAttr(u ? u.name : '') + '"></div></div>'
      + '<div class="row">'
      + '<div><label>Profile Mode</label><select id="um-mode">'
      + '<option value="auto"' + (u && u.profileMode === 'auto' ? ' selected' : '') + '>Auto</option>'
      + '<option value="fallback"' + (u && u.profileMode === 'fallback' ? ' selected' : '') + '>Fallback</option>'
      + '<option value="balance"' + (u && u.profileMode === 'balance' ? ' selected' : '') + '>Load-Balance</option>'
      + '</select></div>'
      + '<div><label>Speed Preset</label><select id="um-speed">'
      + presetOptions(u ? u.speedPreset : null)
      + '</select></div>'
      + '<div><label>نام کانفیگ (قالب)</label><input id="um-template" placeholder="{brand} {profile} {index}" value="' + escAttr(u && u.configNameTemplate ? u.configNameTemplate : '') + '"></div>'
      + '</div>'
      + '<div class="row">'
      + '<div><label>حجم (گیگابایت) — صفر = ∞</label><input id="um-bytes" type="number" min="0" value="' + fa(u ? (u.limitBytes ? Math.round(u.limitBytes / 1073741824 * 100) / 100 : 0) : 0) + '"><button class="btn small" data-inf="um-bytes">∞</button></div>'
      + '<div><label>زمان (روز) — صفر = ∞</label><input id="um-days" type="number" min="0" value="' + fa(u ? (u.limitSeconds ? Math.round(u.limitSeconds / 86400 * 100) / 100 : 0) : 0) + '"><button class="btn small" data-inf="um-days">∞</button></div>'
      + '<div><label>سقف اتصال — صفر = ∞</label><input id="um-conn" type="number" min="0" value="' + fa(u ? u.maxConnections : 0) + '"><button class="btn small" data-inf="um-conn">∞</button></div>'
      + '</div>'
      + '<div class="row">'
      + '<div><label>تعداد مسیر (۱ تا ' + fa(200) + ')</label><input id="um-paths" type="number" min="1" max="200" value="' + fa(u ? u.routes.length : 3) + '"></div>'
      + '<div><label>وضعیت</label><select id="um-active"><option value="true"' + (!u || u.active ? ' selected' : '') + '>فعال</option><option value="false"' + (u && !u.active ? ' selected' : '') + '>غیرفعال</option></select></div>'
      + '</div>'
      + '<div><label>یادداشت داخلی</label><input id="um-note" value="' + escAttr(u ? u.note : '') + '"></div>'
      + '<div style="margin-top:16px;display:flex;gap:10px">'
      + '<button class="btn primary" id="um-save" style="flex:1;justify-content:center">ذخیره</button>'
      + '<button class="btn" id="um-cancel">انصراف</button>'
      + '</div></div></div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = h;
    document.body.appendChild(wrap);
    var modal = wrap.firstChild;
    function close() { modal.remove(); }
    $('#um-close').addEventListener('click', close);
    $('#um-cancel').addEventListener('click', close);
    $$('button[data-inf]', modal).forEach(function (b) {
      b.addEventListener('click', function () { $('#' + b.getAttribute('data-inf'), modal).value = '0'; });
    });
    $('#um-save').addEventListener('click', function () {
      var gb = parseFloat($('#um-bytes').value) || 0;
      var days = parseFloat($('#um-days').value) || 0;
      var body = {
        name: $('#um-name').value.trim(),
        limitBytes: gb > 0 ? Math.round(gb * 1073741824) : 0,
        limitSeconds: days > 0 ? Math.round(days * 86400) : 0,
        maxConnections: parseInt($('#um-conn').value, 10) || 0,
        paths: parseInt($('#um-paths').value, 10) || 3,
        profileMode: $('#um-mode').value,
        speedPreset: $('#um-speed').value,
        active: $('#um-active').value === 'true',
        configNameTemplate: $('#um-template').value.trim(),
        note: $('#um-note').value
      };
      var req = u ? api('POST', '/api/user-update', Object.assign({ id: u.id }, body)) : api('POST', '/api/user-create', body);
      req.then(function () { toast('ذخیره شد ✓', true); close(); bindUsers && location.hash === '#users' && render(); })
         .catch(function (e) { toast(e.message); });
    });
  }
  function presetOptions(cur) {
    var list = ['stable', 'balanced', 'turbo', 'god'];
    var h = '';
    list.forEach(function (s) { h += '<option value="' + s + '"' + (cur === s ? ' selected' : '') + '>' + speedLabel(s) + '</option>'; });
    return h;
  }

  // ------------------------------------------------------------------ config
  function configView() {
    var h = '<h1>کانفیگ آهنین</h1>';
    h += '<div class="card"><div class="row">'
      + '<div><label>مشترک</label><select id="cfg-user"></select></div>'
      + '<div style="max-width:160px"><label>تعداد مسیر (۱ تا ۲۰۰)</label><input id="cfg-paths" type="number" min="1" max="200" value="' + fa(3) + '"></div>'
      + '<div style="display:flex;gap:8px;align-items:flex-end;padding-bottom:2px">'
      + '<button class="btn primary" id="cfg-build">ساخت / بازسازی و ذخیره</button>'
      + '<button class="btn" id="cfg-preview">فقط پیش‌نمایش</button>'
      + '</div></div></div>';
    h += '<div class="tabs" id="cfg-tabs" style="margin-top:16px">'
      + '<button data-f="v2ray" class="active">V2Ray Base64</button>'
      + '<button data-f="raw">Raw VLESS</button>'
      + '<button data-f="clash">Clash Meta</button>'
      + '<button data-f="singbox">sing-box</button>'
      + '</div>';
    h += '<div class="card"><div class="uri-box" id="cfg-out">خروجی اینجا نمایش داده می‌شود.</div>'
      + '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">'
      + '<button class="btn ok" id="cfg-copy">کپی</button>'
      + '<button class="btn" id="cfg-download">دانلود فایل</button>'
      + '<span class="muted" id="cfg-sub-link" style="align-self:center"></span>'
      + '</div></div>';
    return h;
  }
  function bindConfig() {
    var currentFormat = 'v2ray';
    var lastPayload = '';
    var lastSub = '';
    function fillUsers() {
      var sel = $('#cfg-user');
      if (!sel) return;
      api('POST', '/api/users', {}).then(function (d) {
        var opts = '<option value="">— انتخاب مشترک —</option>';
        d.users.forEach(function (u) { opts += '<option value="' + u.id + '"' + (state.configUserId === u.id ? ' selected' : '') + '>' + esc(u.name) + ' (مسیرها: ' + fa(u.routes.length) + ')</option>'; });
        sel.innerHTML = opts;
      }).catch(function (e) { toast(e.message); });
    }
    function build(save) {
      var id = $('#cfg-user').value;
      if (!id) { toast('ابتدا مشترک را انتخاب کنید'); return; }
      var paths = parseInt($('#cfg-paths').value, 10) || 1;
      var btn = save ? $('#cfg-build') : $('#cfg-preview');
      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'در حال ساخت…';
      api('POST', '/api/config-build', {
        id: id, paths: paths, formats: [currentFormat], save: save, download: false
      }).then(function (d) {
        var cfg = d.configs[0];
        lastPayload = cfg.payload;
        lastSub = cfg.user.subUrl;
        $('#cfg-out').textContent = cfg.payload;
        var link = $('#cfg-sub-link');
        link.innerHTML = '<b>Subscription:</b> <a href="' + escAttr(cfg.user.subUrl) + '" target="_blank" class="mono">' + esc(cfg.user.subUrl) + '</a>'
          + (d.truncated ? '<div class="muted" style="color:var(--warn)">توجه: درخواست ' + fa(paths) + ' مسیر بود و به سقف قدرت شما (' + fa(cfg.paths) + ') محدود شد.</div>' : '');
        toast('کانفیگ ساخته شد ✓' + (d.truncated ? ' (محدود به قدرت)' : ''), true);
        state.configUserId = null;
      }).catch(function (e) { toast(e.message); })
        .finally(function () { btn.disabled = false; btn.textContent = label; });
    }
    fillUsers();
    $('#cfg-build').addEventListener('click', function () { build(true); });
    $('#cfg-preview').addEventListener('click', function () { build(false); });
    $('#cfg-copy').addEventListener('click', function () { if (lastPayload) copyText(lastPayload, 'کانفیگ'); });
    $('#cfg-download').addEventListener('click', function () { if (lastPayload) download('aminck-config.' + (currentFormat === 'clash' ? 'yaml' : currentFormat === 'singbox' ? 'json' : 'txt'), lastPayload); });
    $$('#cfg-tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#cfg-tabs button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        currentFormat = b.getAttribute('data-f');
      });
    });
    // sub-link plain text row
    var link = $('#cfg-sub-link');
    if (link) link.addEventListener('click', function (ev) { if (ev.target.tagName === 'A') ev.preventDefault(); });
  }

  // ------------------------------------------------------------------- auto
  function autoView() {
    return '<h1>ساخت ساب اتومات</h1>'
      + '<div class="card">'
      + '<div class="row"><div><label>نام مشترک</label><input id="ab-name" placeholder="مشترک جدید" value=""></div>'
      + '<div style="max-width:140px"><label>تعداد مسیر</label><input id="ab-paths" type="number" min="1" max="200" value="3"></div>'
      + '<div><label>قالب نام کانفیگ</label><input id="ab-template" placeholder="{brand} {profile} {index}"></div></div>'
      + '<div class="row">'
      + '<div><label>حجم (گیگابایت) — ∞ = ۰</label><input id="ab-bytes" type="number" min="0" value="0"><button class="btn small" data-inf="ab-bytes">∞</button></div>'
      + '<div><label>زمان (روز) — ∞ = ۰</label><input id="ab-days" type="number" min="0" value="30"><button class="btn small" data-inf="ab-days">∞</button></div>'
      + '<div><label>سقف اتصال — ∞ = ۰</label><input id="ab-conn" type="number" min="0" value="0"><button class="btn small" data-inf="ab-conn">∞</button></div></div>'
      + '<div class="row">'
      + '<div><label>Profile Mode</label><select id="ab-mode"><option value="auto">Auto</option><option value="fallback">Fallback</option><option value="balance">Load-Balance</option></select></div>'
      + '<div><label>Speed Preset</label><select id="ab-speed">' + presetOptions(null) + '</select></div>'
      + '<div style="display:flex;align-items:flex-end"><button class="btn primary" id="ab-go" style="width:100%">✦ ساخت ساب اتومات</button></div>'
      + '</div>'
      + '<div class="hidden" id="ab-progress"><div style="margin:14px 0 6px" class="muted" id="ab-progress-text">شروع…</div><div class="progress"><div id="ab-progress-bar" style="width:0%"></div></div></div>'
      + '<div id="ab-result" style="margin-top:14px"></div>'
      + '</div>';
  }
  function bindAuto() {
    $$('[data-inf]').forEach(function (b) {
      if (b.getAttribute('data-inf').indexOf('ab-') === 0) {
        b.addEventListener('click', function () { $('#' + b.getAttribute('data-inf')).value = '0'; });
      }
    });
    $('#ab-go').addEventListener('click', function () {
      var btn = $('#ab-go');
      btn.disabled = true;
      var prog = $('#ab-progress');
      prog.classList.remove('hidden');
      setProg(8, 'در حال Probe کردن Endpointها از Cloudflare Edge…');
      api('POST', '/api/probe', {})
        .then(function (p) {
          setProg(45, 'Endpointهای سالم مرتب شدند (' + fa(p.ordered.length) + ' مورد). در حال ساخت ساب…');
          var gb = parseFloat($('#ab-bytes').value) || 0;
          var days = parseFloat($('#ab-days').value) || 0;
          return api('POST', '/api/auto-build', {
            name: $('#ab-name').value.trim() || 'مشترک جدید',
            paths: parseInt($('#ab-paths').value, 10) || 3,
            configNameTemplate: $('#ab-template').value.trim(),
            limitBytes: gb > 0 ? Math.round(gb * 1073741824) : 0,
            limitSeconds: days > 0 ? Math.round(days * 86400) : 0,
            maxConnections: parseInt($('#ab-conn').value, 10) || 0,
            profileMode: $('#ab-mode').value,
            speedPreset: $('#ab-speed').value,
            orderedEndpoints: p.ordered
          });
        })
        .then(function (d) {
          setProg(100, 'تمام شد ✓');
          var sub = d.configs[0].user.subUrl;
          var names = d.user.routes.map(function (r) { return r.host + ':' + r.port; });
          var uniq = names.filter(function (v, i, a) { return a.indexOf(v) === i; });
          var h = '<div class="alert info"><b>ساب ساخته شد ✓</b> — ' + fa(d.user.routes.length) + ' مسیر روی ' + fa(uniq.length) + ' Endpoint سالم</div>';
          h += '<label>لینک Subscription</label><div class="uri-box mono">' + esc(sub) + '</div>';
          h += '<div style="margin-top:10px;display:flex;gap:8px"><button class="btn ok" id="ab-copy">کپی لینک</button><button class="btn" id="ab-copy-clash">کپی Clash</button><button class="btn" id="ab-copy-sb">کپی sing-box</button></div>';
          h += '<div style="margin-top:14px"><b>Smart Profile</b><div class="muted" style="margin-top:4px">ترتیب Endpointهای انتخابی (سریع‌ترین اول):</div><div class="mono" style="margin-top:4px">' + uniq.map(esc).join('<br>') + '</div></div>';
          h += '<div class="muted" style="margin-top:10px">مصرف حجم تقریبی شمارش می‌شود. هیچ ادعایی درباره سرعت تضمینی وجود ندارد.</div>';
          $('#ab-result').innerHTML = h;
          $('#ab-copy').addEventListener('click', function () { copyText(sub, 'لینک ساب'); });
          $('#ab-copy-clash').addEventListener('click', function () { copyText(d.configs.filter(function (c) { return c.format === 'clash'; })[0].payload, 'Clash'); });
          $('#ab-copy-sb').addEventListener('click', function () { copyText(d.configs.filter(function (c) { return c.format === 'singbox'; })[0].payload, 'sing-box'); });
          btn.disabled = false;
        })
        .catch(function (e) {
          prog.classList.add('hidden');
          toast(e.message);
          btn.disabled = false;
        });
    });
  }
  function setProg(pct, text) {
    var bar = $('#ab-progress-bar');
    var txt = $('#ab-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = text;
  }

  // ---------------------------------------------------------------- scanner
  function scannerView() {
    return '<h1>Scanner</h1>'
      + '<div class="alert info">این عدد، تأخیر TCP Handshake از Edge کلودفلر است — نه پینگ دستگاه کاربر شما. تست خودکار هر ۳۰ دقیقه با Cron انجام می‌شود.</div>'
      + '<div class="card"><div class="row">'
      + '<div><label>نام (اختیاری)</label><input id="ep-label" placeholder="endpoint-1"></div>'
      + '<div><label>Host (دامنه)</label><input id="ep-host" placeholder="example.workers.dev"></div>'
      + '<div style="max-width:130px"><label>Port</label><input id="ep-port" type="number" value="443"></div>'
      + '<div style="display:flex;align-items:flex-end;gap:8px">'
      + '<button class="btn primary" id="ep-add">افزودن</button>'
      + '<button class="btn" id="ep-probe">Probe اکنون</button>'
      + '</div></div></div>'
      + '<div class="card" style="margin-top:14px"><table><thead><tr><th>Endpoint</th><th>پورت</th><th>وضعیت</th><th>TCP+TLS (ms)</th><th>آخرین بررسی</th><th>خطا</th><th></th></tr></thead><tbody id="ep-tbody"><tr><td colspan="7" class="muted">در حال بارگذاری…</td></tr></tbody></table>'
      + '<div class="muted" id="ep-info" style="margin-top:8px"></div></div>';
  }
  function bindScanner() {
    function load() {
      api('POST', '/api/endpoints', { action: 'view' }).then(function (d) { draw(d.endpoints, d.probeResults); }).catch(function (e) { toast(e.message); });
    }
    function draw(eps, results) {
      var tbody = $('#ep-tbody');
      var info = $('#ep-info');
      if (!tbody) return;
      if (!eps.length) { tbody.innerHTML = '<tr><td colspan="7" class="muted">هنوز Endpointی ثبت نشده. نمونه پیش‌فرض (خود این Worker) به‌صورت خودکار اضافه می‌شود.</td></tr>'; return; }
      var h = '';
      eps.forEach(function (ep) {
        var r = results[ep.id];
        var ok = r ? r.ok : null;
        var status = ok === null ? '<span class="badge">بررسی نشده</span>' : ok ? '<span class="badge on">سالم</span>' : '<span class="badge off">ناموفق</span>';
        var lat = r && r.ok && r.latencyMs != null ? fa(Math.round(r.latencyMs)) : '—';
        var err = r && r.error ? '<span class="muted">' + esc(r.error.slice(0, 40)) + '</span>' : '—';
        h += '<tr><td>' + esc(ep.label) + '<div class="muted mono">' + esc(ep.host) + '</div></td>'
          + '<td>' + fa(ep.port) + '</td><td>' + status + '</td><td>' + lat + '</td>'
          + '<td>' + (r ? fmtDate(r.checkedAt) : '—') + '</td><td>' + err + '</td>'
          + '<td><button class="btn small danger" data-rm="' + ep.id + '">حذف</button></td></tr>';
      });
      tbody.innerHTML = h;
      if (info) {
        var healthy = eps.filter(function (e) { return results[e.id] && results[e.id].ok; }).length;
        info.textContent = healthy + ' سالم از ' + eps.length + ' — حداکثر ۵۰ Endpoint مجاز است.';
      }
      $$('button[data-rm]', tbody).forEach(function (b) {
        b.addEventListener('click', function () {
          api('POST', '/api/endpoints', { action: 'remove', id: b.getAttribute('data-rm') }).then(function () { toast('حذف شد', true); load(); }).catch(function (e) { toast(e.message); });
        });
      });
    }
    $('#ep-add').addEventListener('click', function () {
      api('POST', '/api/endpoints', {
        action: 'add', label: $('#ep-label').value.trim(),
        host: $('#ep-host').value.trim(), port: parseInt($('#ep-port').value, 10) || 443
      }).then(function () { toast('Endpoint اضافه شد ✓', true); $('#ep-host').value = ''; load(); }).catch(function (e) { toast(e.message); });
    });
    $('#ep-probe').addEventListener('click', function () {
      var btn = $('#ep-probe');
      btn.disabled = true; btn.textContent = 'در حال Probe…';
      api('POST', '/api/probe', {}).then(function (d) {
        toast('Probe انجام شد ✓', true);
        load();
      }).catch(function (e) { toast(e.message); }).finally(function () { btn.disabled = false; btn.textContent = 'Probe اکنون'; });
    });
    load();
  }

  // ---------------------------------------------------------------- settings
  function settingsView() {
    return '<h1>تنظیمات</h1><div class="card" id="set-form"><div class="muted">در حال بارگذاری…</div></div>';
  }
  function bindSettings() {
    api('POST', '/api/get-settings', {}).then(function (d) { drawSettings(d.settings); }).catch(function (e) { toast(e.message); });
    function drawSettings(s) {
      state.settings = s;
      var h = '<div class="row"><div><label>عنوان پنل</label><input id="s-title" value="' + escAttr(s.title) + '"></div>'
        + '<div><label>برند مالک</label><input id="s-brand" value="' + escAttr(s.brand) + '"></div>'
        + '<div><label>لینک پشتیبانی</label><input id="s-support" value="' + escAttr(s.supportUrl) + '"></div></div>';
      h += '<div class="row"><div><label>DoH اصلی</label><input id="s-doh" class="mono" dir="ltr" value="' + escAttr(s.doh) + '"></div>'
        + '<div><label>Health URL (خالی = خودکار)</label><input id="s-health" dir="ltr" value="' + escAttr(s.healthUrl) + '"></div></div>';
      h += '<div><label>DoH جایگزین (هر خط یکی)</label><textarea id="s-dohalt" dir="ltr" class="mono">' + esc(s.dohAlt.join('\\n')) + '</textarea></div>';
      h += '<div class="row"><div><label>قالب نام کانفیگ</label><input id="s-template" dir="ltr" class="mono" value="' + escAttr(s.configNameTemplate) + '"></div>'
        + '<div style="max-width:150px"><label>تعداد پیش‌فرض مسیر</label><input id="s-paths" type="number" min="1" max="200" value="' + fa(s.defaultPaths) + '"></div>'
        + '<div style="max-width:150px"><label>فاصله Update (ساعت)</label><input id="s-interval" type="number" min="1" value="' + fa(s.updateIntervalHours) + '"></div></div>';
      h += '<div class="row"><div><label>Fingerprint</label><select id="s-fp">' + fpOptions(s.fingerprint) + '</select></div>'
        + '<div><label>Profile Mode</label><select id="s-mode">' + modeOptions(s.profileMode) + '</select></div>'
        + '<div><label>Speed Preset</label><select id="s-speed">' + presetOptions(s.speedPreset) + '</select></div></div>';
      h += '<div><label>پورت‌های TLS (با کاما جدا کنید)</label><input id="s-ports" dir="ltr" class="mono" value="' + escAttr(s.tlsPorts.join(', ')) + '"></div>';
      h += '<div style="margin-top:16px"><button class="btn primary" id="s-save">ذخیره تنظیمات</button></div>';
      $('#set-form').innerHTML = h;
      $('#s-save').addEventListener('click', function () {
        var ports = ($('#s-ports').value || '').split(',').map(function (x) { return parseInt(x.trim(), 10); }).filter(function (n) { return n > 0; });
        api('POST', '/api/settings', {
          settings: {
            title: $('#s-title').value.trim(), brand: $('#s-brand').value.trim(),
            supportUrl: $('#s-support').value.trim(), doh: $('#s-doh').value.trim(),
            healthUrl: $('#s-health').value.trim(),
            dohAlt: ($('#s-dohalt').value || '').split('\\n').map(function (x) { return x.trim(); }).filter(Boolean),
            configNameTemplate: $('#s-template').value.trim(),
            defaultPaths: parseInt($('#s-paths').value, 10) || 1,
            updateIntervalHours: parseInt($('#s-interval').value, 10) || 24,
            fingerprint: $('#s-fp').value, profileMode: $('#s-mode').value,
            speedPreset: $('#s-speed').value, tlsPorts: ports
          }
        }).then(function () { toast('تنظیمات ذخیره شد ✓', true); }).catch(function (e) { toast(e.message); });
      });
    }
  }
  function fpOptions(cur) {
    var list = ['chrome', 'firefox', 'safari', 'edge', 'random'];
    var h = '';
    list.forEach(function (f) { h += '<option value="' + f + '"' + (cur === f ? ' selected' : '') + '>' + f + '</option>'; });
    return h;
  }
  function modeOptions(cur) {
    var h = '';
    [['auto', 'Auto'], ['fallback', 'Fallback'], ['balance', 'Load-Balance']].forEach(function (m) {
      h += '<option value="' + m[0] + '"' + (cur === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
    });
    return h;
  }

  // ------------------------------------------------------------------ admins
  function adminsView() {
    return '<h1>مدیریت ادمین</h1>'
      + '<div class="card"><h2>افزودن ادمین</h2><div class="row">'
      + '<div><label>نام کاربری</label><input id="a-user" dir="ltr"></div>'
      + '<div><label>رمز (حداقل ۱۰ کاراکتر)</label><input id="a-pass" type="password" dir="ltr"></div>'
      + '<div><label>نقش</label><select id="a-role"><option value="admin">admin</option><option value="operator">operator</option><option value="support">support</option></select></div>'
      + '<div><label>سطح قدرت</label><select id="a-power"><option value="limited">Limited</option><option value="normal">Normal</option><option value="strong">Strong</option><option value="ultra">Ultra</option></select></div>'
      + '<div style="display:flex;align-items:flex-end"><button class="btn primary" id="a-create">ساخت</button></div>'
      + '</div></div>'
      + '<div class="card" style="margin-top:14px"><table><thead><tr><th>نام کاربری</th><th>نقش</th><th>قدرت</th><th>وضعیت</th><th>آخرین ورود</th><th>عملیات</th></tr></thead><tbody id="a-tbody"></tbody></table></div>';
  }
  function bindAdmins() {
    function load() {
      api('POST', '/api/admins/list', {}).then(function (d) {
        var tbody = $('#a-tbody');
        var h = '';
        d.admins.forEach(function (a) {
          var actions = '';
          if (a.role !== 'owner') {
            actions += '<button class="btn small" data-aid="' + a.id + '" data-act="edit">ویرایش</button>';
            actions += '<button class="btn small ' + (a.active ? 'danger' : 'ok') + '" data-aid="' + a.id + '" data-act="toggle">' + (a.active ? 'قطع دسترسی' : 'وصل مجدد') + '</button>';
            actions += '<button class="btn small danger" data-aid="' + a.id + '" data-act="del">حذف</button>';
          } else {
            actions = '<span class="muted">—</span>';
          }
          h += '<tr><td>' + esc(a.username) + (a.role === 'owner' ? ' <span class="badge owner">مالک</span>' : '') + '</td>'
            + '<td><span class="badge ' + roleClass(a.role) + '">' + roleLabel(a.role) + '</span></td>'
            + '<td>' + esc(powerLabel(a.power)) + '</td>'
            + '<td><span class="badge ' + (a.active ? 'on' : 'off') + '">' + (a.active ? 'فعال' : 'غیرفعال') + '</span></td>'
            + '<td>' + fmtDate(a.lastLoginAt) + '</td><td><div class="row-actions">' + actions + '</div></td></tr>';
        });
        tbody.innerHTML = h;
        $$('button[data-act]', tbody).forEach(function (b) {
          b.addEventListener('click', function () {
            var aid = b.getAttribute('data-aid');
            var act = b.getAttribute('data-act');
            if (act === 'del') {
              if (!confirm('این ادمین حذف شود؟')) return;
              api('POST', '/api/admins/delete', { id: aid }).then(function () { toast('حذف شد ✓', true); load(); }).catch(function (e) { toast(e.message); });
            } else if (act === 'toggle') {
              api('POST', '/api/admins/update', { id: aid, active: b.textContent.indexOf('وصل') >= 0 }).then(function (d) {
                toast(d.ok ? 'وضعیت تغییر کرد ✓' : 'خطا', !!d.ok); load();
              }).catch(function (e) { toast(e.message); });
            } else if (act === 'edit') {
              openAdminEdit(aid, load);
            }
          });
        });
      }).catch(function (e) { toast(e.message); });
    }
    $('#a-create').addEventListener('click', function () {
      api('POST', '/api/admins/create', {
        username: $('#a-user').value.trim(), password: $('#a-pass').value,
        role: $('#a-role').value, power: $('#a-power').value
      }).then(function () { toast('ادمین ساخته شد ✓', true); $('#a-user').value = ''; $('#a-pass').value = ''; load(); }).catch(function (e) { toast(e.message); });
    });
    load();
  }
  function openAdminEdit(id, refresh) {
    var h = '<div class="modal-back"><div class="modal">'
      + '<h3>ویرایش ادمین</h3>'
      + '<div class="row"><div><label>نقش</label><select id="ae-role"><option value="admin">admin</option><option value="operator">operator</option><option value="support">support</option></select></div>'
      + '<div><label>سطح قدرت</label><select id="ae-power"><option value="limited">Limited</option><option value="normal">Normal</option><option value="strong">Strong</option><option value="ultra">Ultra</option></select></div></div>'
      + '<div><label>رمز جدید (خالی = بدون تغییر)</label><input id="ae-pass" type="password" dir="ltr"></div>'
      + '<div style="margin-top:14px;display:flex;gap:10px"><button class="btn primary" id="ae-save" style="flex:1">ذخیره</button><button class="btn" id="ae-cancel">انصراف</button></div>'
      + '</div></div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = h;
    document.body.appendChild(wrap);
    var modal = wrap.firstChild;
    $('#ae-cancel').addEventListener('click', function () { modal.remove(); });
    $('#ae-save').addEventListener('click', function () {
      api('POST', '/api/admins/update', {
        id: id, role: $('#ae-role').value, power: $('#ae-power').value,
        password: $('#ae-pass').value || undefined
      }).then(function () { toast('ذخیره شد ✓', true); modal.remove(); refresh(); }).catch(function (e) { toast(e.message); });
    });
  }

  // ------------------------------------------------------------------ audit
  function auditView() {
    return '<h1>Audit Log</h1>'
      + '<div class="card"><div class="inline"><select id="au-action" style="max-width:280px"><option value="">همه رویدادها</option></select></div></div>'
      + '<div class="card" style="margin-top:14px"><table><thead><tr><th>زمان</th><th>بازیگر</th><th>رویداد</th><th>هدف</th><th>جزئیات</th><th>IP</th></tr></thead><tbody id="au-tbody"></tbody></table></div>';
  }
  function bindAudit() {
    function load(filter) {
      api('POST', '/api/audit', { limit: 300 }).then(function (d) {
        var tbody = $('#au-tbody');
        var h = '';
        var seen = {};
        d.events.forEach(function (ev) {
          if (filter && ev.action !== filter) return;
          var key = ev.action;
          if (!seen[key]) { seen[key] = 1; }
          h += '<tr><td>' + fmtDate(ev.ts) + '</td><td>' + esc(ev.actor) + '</td>'
            + '<td class="mono">' + esc(ev.action) + '</td><td>' + esc(ev.target) + '</td>'
            + '<td>' + esc(ev.details) + '</td><td class="mono">' + esc(ev.ip) + '</td></tr>';
        });
        tbody.innerHTML = h || '<tr><td colspan="6" class="muted">رویدادی یافت نشد.</td></tr>';
        if ($('#au-action').options.length <= 1) {
          Object.keys(seen).forEach(function (k) {
            var o = document.createElement('option');
            o.value = k; o.textContent = k;
            $('#au-action').appendChild(o);
          });
        }
      }).catch(function (e) { toast(e.message); });
    }
    $('#au-action').addEventListener('change', function () { load(this.value); });
    load('');
  }

  // ------------------------------------------------------------------- caps
  function capsView() {
    return '<h1>قابلیت‌ها</h1><div class="card" id="caps-body"><div class="muted">در حال بارگذاری…</div></div>';
  }
  function bindCaps() {
    api('POST', '/api/capabilities', {}).then(function (d) {
      var h = '<div class="grid cols-3">'
        + statCard('کل قابلیت‌ها', fa(d.total), 'همه واقعاً پیاده‌سازی شده‌اند')
        + statCard('مدیریت مالک/ادمین', fa(d.ownerCount), 'نقش‌ها، دسترسی‌ها، Audit و امنیت')
        + statCard('دسته‌ها', fa(Object.keys(d.byCategory).length), 'protocol تا deploy')
        + '</div>';
      h += '<input class="search" id="cap-q" placeholder="جست‌وجو در قابلیت‌ها…" style="margin-top:14px;max-width:100%">';
      h += '<div id="cap-list" style="margin-top:14px"></div>';
      $('#caps-body').innerHTML = h;
      function draw(q) {
        var list = d.capabilities.filter(function (c) { return !q || c.title.indexOf(q) >= 0 || c.id.indexOf(q) >= 0 || c.description.indexOf(q) >= 0; });
        var byCat = {};
        list.forEach(function (c) { byCat[c.category] = byCat[c.category] || []; byCat[c.category].push(c); });
        var html = '';
        Object.keys(byCat).forEach(function (cat) {
          html += '<div class="section-title"><h2>' + esc(cat) + ' (' + fa(byCat[cat].length) + ')</h2></div>';
          html += '<div class="card"><table><thead><tr><th style="width:150px">شناسه</th><th>عنوان</th><th>توضیح</th></tr></thead><tbody>';
          byCat[cat].forEach(function (c) {
            html += '<tr><td class="mono">' + esc(c.id) + '</td><td><b>' + esc(c.title) + '</b></td><td class="muted">' + esc(c.description) + '</td></tr>';
          });
          html += '</tbody></table></div>';
        });
        $('#cap-list').innerHTML = html || '<div class="muted">چیزی پیدا نشد.</div>';
      }
      $('#cap-q').addEventListener('input', function () { draw(this.value.trim()); });
      draw('');
    }).catch(function (e) { toast(e.message); });
  }

  // ------------------------------------------------------------------ install
  function installView() {
    var repo = 'https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge';
    var deploy = 'https://deploy.workers.cloudflare.com/?url=' + encodeURIComponent(repo);
    return '<h1>نصب</h1>'
      + '<div class="card"><h2>Deploy مستقیم به Cloudflare</h2>'
      + '<p class="muted">دکمهٔ رسمی Deploy به Cloudflare Workers — Durable Object به‌صورت خودکار Provision می‌شود و هیچ D1 یا KV دستی لازم نیست.</p>'
      + '<div class="uri-box mono">' + esc(deploy) + '</div>'
      + '<div style="margin-top:12px;display:flex;gap:8px"><button class="btn primary" id="in-deploy">باز کردن لینک Deploy</button>'
      + '<button class="btn" id="in-copy">کپی لینک</button>'
      + '<a class="btn" href="' + escAttr(repo) + '" target="_blank">مخزن GitHub</a></div>'
      + '<div style="margin-top:18px"><h2>گام‌های سریع</h2>'
      + '<ol class="muted" style="padding-right:20px">'
      + '<li>Deploy کنید یا <span class="mono">npm run deploy</span> را اجرا کنید.</li>'
      + '<li>دو Secret تنظیم کنید: <span class="mono">wrangler secret put ADMIN_PASSWORD</span> و <span class="mono">wrangler secret put SESSION_SECRET</span>.</li>'
      + '<li>پنل در دامنهٔ Worker شماست؛ Enter با نام AMINCK و رمز مالک.</li>'
      + '<li>Endpoint پیش‌فرض (خود دامنهٔ Worker) خودکار اضافه می‌شود — از صفحه Scanner Probe کنید.</li>'
      + '</ol></div>'
      + '<div class="alert warn">هیچ API Token کلودفلر در پنل دریافت یا ذخیره نمی‌شود. تمام نصب از طریق لینک Deploy یا Wrangler انجام می‌شود.</div>'
      + '</div>';
  }
  function bindInstall() {
    $('#in-deploy').addEventListener('click', function () { window.open('https://deploy.workers.cloudflare.com/?url=' + encodeURIComponent('https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge'), '_blank'); });
    $('#in-copy').addEventListener('click', function () { copyText('https://deploy.workers.cloudflare.com/?url=' + encodeURIComponent('https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge'), 'لینک Deploy'); });
  }

  // ------------------------------------------------------------- bootstrap
  function boot() {
    document.documentElement.setAttribute('data-theme', state.theme);
    window.addEventListener('hashchange', function () {
      state.page = (location.hash || '#dashboard').replace('#', '') || 'dashboard';
      state.configUserId = null;
      render();
    });
    api('GET', '/api/me').then(function (d) {
      if (!d.me) { render(); return; }
      state.me = d.me;
      return api('POST', '/api/get-settings', {}).then(function (s) { state.settings = s.settings; }).catch(function () {});
    }).then(function () {
      render();
    }).catch(function () {
      state.me = null;
      render();
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