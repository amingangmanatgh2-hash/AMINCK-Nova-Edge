/*NOVA-UI-START*/
(function () {
  'use strict';

  var APP = 'AMINCK GOD Edition';
  var EDITION = 'AMINCK GOD Edition — فروش ساب';
  var TAB = 'dash';
  var STATE = { me: null, users: [], stats: null, endpoints: [], probe: {}, iron: null, clean: [], ironUser: '', launch: null, caps: [] };

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
  function numOrZero(id) {
    var el = $('#' + id);
    if (!el) return 0;
    var n = Number(el.value);
    return isFinite(n) && n > 0 ? n : 0;
  }
  function limRow(label, id) {
    return '<label>' + label + ' (۰ = نامحدود)</label><div class="row"><input id="' + id + '" value="0"><button class="btn" type="button" data-inf="' + id + '">∞ نامحدود</button></div>';
  }
  function bindInf() {
    document.querySelectorAll('[data-inf]').forEach(function (el) {
      el.onclick = function () {
        var t = $('#' + el.getAttribute('data-inf'));
        if (t) t.value = '0';
      };
    });
  }
  function pathOptions(sel) {
    var h = '';
    [1, 2, 3, 4, 5, 8, 10, 20, 50, 100, 200].forEach(function (n) {
      h += '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + ' کانفیگ ساب</option>';
    });
    return h;
  }
  function ironOptions(sel) {
    var h = '';
    [0, 1, 2, 3, 4, 5].forEach(function (n) {
      h += '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + ' آهنین JSON</option>';
    });
    return h;
  }

  function domainMenuHtml() {
    var html = '<div class="card" style="position:relative">';
    html += '<div class="row" style="justify-content:space-between">';
    html += '<div><b>دامنه این پنل</b><div class="mono">' + esc(location.host) + '</div></div>';
    html += '<button class="btn primary" id="cf-menu-btn">راه‌اندازی کلودفلر ▾</button></div>';
    html += '<div id="cf-menu" style="display:none;margin-top:12px;border-top:1px solid var(--line);padding-top:12px">';
    html += '<div class="row">';
    html += '<a class="btn" id="btn-token" target="_blank" rel="noopener">ساخت توکن کلودفلر</a>';
    html += '<a class="btn primary" id="btn-deploy" target="_blank" rel="noopener">ستاپ راحت — ساخت ورکر</a>';
    html += '</div>';
    html += '<p class="muted">توکن بساز → ورکر Deploy شود → توکن را بچسبان (حدود ۱۰ ثانیه).</p>';
    html += '<label>توکن API</label><input id="cf-token" type="password" style="width:100%;margin-bottom:8px">';
    html += '<label>رمز پنل (حداقل ۱۰)</label><input id="cf-pass" type="password" style="width:100%;margin-bottom:8px">';
    html += '<button class="btn primary" id="cf-go" style="width:100%">توکن گرفتم — وصل کن</button>';
    html += '<div id="cf-prog" class="muted" style="margin-top:10px"></div></div></div>';
    return html;
  }
  function bindDomainMenu() {
    var L = STATE.launch || {};
    var tokenA = $('#btn-token');
    var depA = $('#btn-deploy');
    if (tokenA) tokenA.href = L.tokenUrl || 'https://dash.cloudflare.com/profile/api-tokens';
    if (depA) depA.href = L.deployUrl || 'https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge';
    var mb = $('#cf-menu-btn');
    if (mb) mb.onclick = function () {
      var box = $('#cf-menu');
      if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
    };
    var go = $('#cf-go');
    if (go) go.onclick = function () {
      var box = $('#cf-prog');
      if (box) box.textContent = 'در حال اتصال…';
      var started = Date.now();
      api('POST', '/api/cf-bootstrap', { token: ($('#cf-token') || {}).value || '', adminPassword: ($('#cf-pass') || {}).value || '', workerName: 'aminck-nova-god-v2' })
        .then(function (d) {
          var left = Math.max(0, 10000 - (Date.now() - started));
          setTimeout(function () {
            if (box) {
              box.innerHTML = d.url
                ? '<div class="alert">آماده: <a href="' + esc(d.url) + '" target="_blank">' + esc(d.url) + '</a></div>'
                : '<div class="alert">' + esc(d.message || 'وصل شد') + '</div>';
            }
            toast(d.message || 'وصل شد', true);
          }, left);
        })
        .catch(function (e) { if (box) box.textContent = e.message; toast(e.message); });
    };
  }

  function renderLogin() {
    var theme = localStorage.getItem('edge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var html = '<div class="wrap">';
    html += '<div class="topbar"><button class="btn" id="theme-btn">' + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button></div>';
    html += '<div class="hero"><div class="mark">N</div><div><h1>AMINCK Nova Edge</h1><div class="sub">' + esc(EDITION) + '</div></div></div>';
    html += domainMenuHtml();
    html += '<div class="card login-box"><h2>ورود پنل فروش</h2>';
    html += '<p class="muted">مالک: <b>AMINCK</b> · رمز: <code>ADMIN_PASSWORD</code></p>';
    html += '<label>نام کاربری</label><input id="u" value="AMINCK" style="width:100%;margin-bottom:8px">';
    html += '<label>رمز</label><input id="p" type="password" style="width:100%;margin-bottom:12px">';
    html += '<button class="btn primary" id="login-btn" style="width:100%">ورود</button></div>';
    html += '<div class="card"><h2>کلاینت‌ها</h2><p class="muted">V2Box · V2RayNG · MahsaNG · NapsternetV · Clash · sing-box</p></div></div>';
    $('#app').innerHTML = html;
    $('#theme-btn').onclick = function () {
      localStorage.setItem('edge-theme', theme === 'dark' ? 'light' : 'dark');
      renderLogin();
    };
    bindDomainMenu();
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
    var tabs = [['dash', 'داشبورد'], ['sell', 'فروش / ویرایش'], ['iron', 'آهنین'], ['scan', 'پینگ'], ['caps', 'قابلیت‌ها'], ['help', 'راهنما']];
    var html = '<div class="wrap"><div class="topbar">';
    html += '<button class="btn" id="theme-btn">' + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button>';
    html += '<span class="badge">' + esc(me.role) + ' · ' + esc(me.username) + '</span>';
    html += '<button class="btn" id="logout-btn">خروج</button>';
    if (can(me, 'settings:manage')) html += '<button class="btn primary" id="hot-btn">آپدیت یک‌کلیکی</button>';
    html += '</div><div class="hero"><div class="mark">N</div><div><h1>' + esc(APP) + '</h1><div class="sub">GOD · ' + esc(location.host) + '</div></div></div>';
    html += domainMenuHtml();
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
    bindDomainMenu();
    var hot = $('#hot-btn');
    if (hot) hot.onclick = function () {
      api('POST', '/api/hot-update', { speedPreset: 'god' }).then(function (d) { toast('آپدیت gen=' + d.configGeneration, true); }).catch(function (e) { toast(e.message); });
    };
  }

  function viewDash() {
    var s = STATE.stats || {};
    var html = '<div class="grid">';
    html += '<div class="pill"><b>' + (s.users || 0) + '</b><span>مشترک</span></div>';
    html += '<div class="pill"><b>' + (s.activeUsers || 0) + '</b><span>فعال</span></div>';
    html += '<div class="pill"><b>' + (STATE.caps.length || '۲۰۰+') + '</b><span>قابلیت</span></div>';
    html += '<div class="pill"><b>GOD</b><span>۱۵ثانیه failover</span></div></div>';
    html += '<div class="card" style="margin-top:16px"><h2>ساخت اتومات GOD</h2>';
    html += '<p class="muted">مولتی‌پروکسی + جعل snaap.ir + نام AMINCK + تا ۲۰۰ مسیر در یک ساب.</p>';
    html += '<label>نام ساب</label><input id="n" placeholder="VIP-علی" style="width:100%;margin-bottom:8px">';
    html += '<label>قالب نام کانفیگ</label><input id="tpl" value="{brand} AMINCK {profile} {index}" style="width:100%;margin-bottom:8px">';
    html += limRow('حجم بایت', 'lim-b') + limRow('ثانیه اعتبار', 'lim-s') + limRow('سقف اتصال', 'lim-c') + limRow('سقف درخواست ساب', 'lim-r');
    html += '<div class="row"><select id="paths">' + pathOptions(5) + '</select><select id="iron-n">' + ironOptions(3) + '</select>';
    html += '<button class="btn primary" id="auto">ساخت اتومات GOD</button></div><div id="mk-out"></div></div>';
    shell(html);
    bindInf();
    $('#auto').onclick = function () {
      var name = $('#n').value || ('AMINCK-' + Date.now());
      api('POST', '/api/auto-build', {
        name: name,
        paths: Number($('#paths').value || 5),
        ironCount: Number($('#iron-n').value || 0),
        speedPreset: 'god',
        profileMode: 'auto',
        configNameTemplate: $('#tpl').value,
        limitBytes: numOrZero('lim-b'),
        limitSeconds: numOrZero('lim-s'),
        maxConnections: numOrZero('lim-c'),
        limitRequests: numOrZero('lim-r')
      }).then(function (d) {
        var u = d.user;
        var link = d.subUrl || subLink(u.token, '');
        var out = '<div class="alert">ساب AMINCK آماده — ' + esc(name) + '</div><div class="uri">' + esc(link) + '</div>';
        out += '<div class="row" style="margin-top:8px"><button class="btn" id="c1">کپی ساب</button><button class="btn" id="c2">Clash</button><button class="btn" id="c3">sing-box</button></div>';
        (d.iron || []).forEach(function (p) {
          out += '<div class="card"><b>' + esc(p.name) + '</b> <span class="badge">' + esc(p.client) + '</span><div class="uri">' + esc(p.json) + '</div></div>';
        });
        $('#mk-out').innerHTML = out;
        $('#c1').onclick = function () { copyText(link, 'ساب'); };
        $('#c2').onclick = function () { copyText(subLink(u.token, 'clash'), 'Clash'); };
        $('#c3').onclick = function () { copyText(subLink(u.token, 'singbox'), 'sing-box'); };
        toast('اتومات GOD', true);
        return loadUsers();
      }).catch(function (e) { toast(e.message); });
    };
  }

  function viewSell() {
    var html = '<div class="card"><h2>مشترک‌ها و ویرایش</h2><table><thead><tr><th>نام</th><th>مسیر</th><th></th></tr></thead><tbody>';
    STATE.users.forEach(function (u) {
      html += '<tr><td>' + esc(u.name) + '</td><td>' + (u.routes ? u.routes.length : 0) + '</td>';
      html += '<td><button class="btn" data-copy="' + esc(u.token) + '">کپی ساب</button> ';
      html += '<button class="btn" data-edit="' + esc(u.id) + '">ویرایش</button></td></tr>';
    });
    html += '</tbody></table><div id="edit-box"></div></div>';
    shell(html);
    document.querySelectorAll('[data-copy]').forEach(function (el) {
      el.onclick = function () { copyText(subLink(el.getAttribute('data-copy'), ''), 'ساب'); };
    });
    document.querySelectorAll('[data-edit]').forEach(function (el) {
      el.onclick = function () { showEdit(el.getAttribute('data-edit')); };
    });
  }

  function showEdit(id) {
    var u = STATE.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    var box = $('#edit-box');
    var h = '<h2>ویرایش ' + esc(u.name) + '</h2>';
    h += '<label>نام</label><input id="en" value="' + esc(u.name) + '" style="width:100%">';
    h += '<label>قالب نام</label><input id="et" value="' + esc(u.configNameTemplate || '{brand} AMINCK {profile} {index}') + '" style="width:100%">';
    h += '<label>تعداد مسیر ساب</label><select id="ep">' + pathOptions(u.routes ? u.routes.length : 3) + '</select>';
    h += limRow('حجم', 'eb') + limRow('ثانیه', 'es') + limRow('اتصال', 'ec') + limRow('سقف درخواست', 'er');
    h += '<button class="btn primary" id="esave">ذخیره ویرایش</button>';
    box.innerHTML = h;
    if ($('#eb')) $('#eb').value = String(u.limitBytes || 0);
    if ($('#es')) $('#es').value = String(u.limitSeconds || 0);
    if ($('#ec')) $('#ec').value = String(u.maxConnections || 0);
    if ($('#er')) $('#er').value = String(u.limitRequests || 0);
    bindInf();
    $('#esave').onclick = function () {
      api('POST', '/api/user-update', {
        id: id,
        name: $('#en').value,
        configNameTemplate: $('#et').value,
        paths: Number($('#ep').value || 3),
        limitBytes: numOrZero('eb'),
        limitSeconds: numOrZero('es'),
        maxConnections: numOrZero('ec'),
        limitRequests: numOrZero('er'),
        speedPreset: 'god'
      }).then(function () { toast('ذخیره شد', true); return loadUsers().then(paint); })
        .catch(function (e) { toast(e.message); });
    };
  }

  function viewIron() {
    var html = '<div class="card"><h2>کانفیگ آهنین</h2><div class="row"><select id="uid">';
    STATE.users.forEach(function (u) {
      html += '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>';
    });
    html += '</select><select id="ic">' + ironOptions(3) + '</select><button class="btn primary" id="ib">ساخت آهنین</button></div><div id="iron-out"></div></div>';
    shell(html);
    var ib = $('#ib');
    if (ib) ib.onclick = function () {
      api('POST', '/api/iron-build', { id: $('#uid').value, count: Number($('#ic').value) })
        .then(function (d) {
          STATE.iron = d.iron;
          var out = '';
          (d.iron || []).forEach(function (p) {
            out += '<div class="card"><b>' + esc(p.name) + '</b> <span class="badge">' + esc(p.client) + '</span><div class="uri">' + esc(p.json) + '</div></div>';
          });
          $('#iron-out').innerHTML = out;
        }).catch(function (e) { toast(e.message); });
    };
  }

  function viewScan() {
    var html = '<div class="card"><h2>پینگ Edge</h2><div class="row"><input id="eh" placeholder="host"><input id="ep" value="443" style="width:80px"><button class="btn" id="add-ep">افزودن</button><button class="btn primary" id="pr">پینگ</button></div><table><tbody>';
    (STATE.endpoints || []).forEach(function (e) {
      var r = (STATE.probe || {})[e.id] || {};
      html += '<tr><td class="mono">' + esc(e.host) + '</td><td>' + esc(String(r.ok ? (r.latencyMs + ' ms') : (r.error || '—'))) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    shell(html);
    $('#add-ep').onclick = function () {
      api('POST', '/api/endpoints', { action: 'add', host: $('#eh').value, port: Number($('#ep').value || 443) })
        .then(function () { toast('OK', true); loadScan(); }).catch(function (e) { toast(e.message); });
    };
    $('#pr').onclick = function () {
      api('POST', '/api/probe', {}).then(function (d) { STATE.probe = d.results || {}; toast('پینگ شد', true); paint(); }).catch(function (e) { toast(e.message); });
    };
  }

  function viewCaps() {
    var html = '<div class="card"><h2>مانیفست قابلیت‌ها (' + STATE.caps.length + ')</h2><ul class="api">';
    STATE.caps.forEach(function (c) {
      html += '<li><b>' + esc(c.title) + '</b> — ' + esc(c.description) + '</li>';
    });
    html += '</ul></div>';
    shell(html);
  }

  function viewHelp() {
    var html = '<div class="card"><h2>ستاپ راحت</h2><p class="muted">منوی راه‌اندازی کلودفلر بالای صفحه: توکن + Deploy رسمی با تنظیمات آماده.</p>';
    html += '<p><a class="btn primary" id="easy" target="_blank" rel="noopener">ستاپ یک‌کلیکی کلودفلر</a></p></div>';
    shell(html);
    var a = $('#easy');
    if (a && STATE.launch) a.href = STATE.launch.deployUrl;
  }

  function paint() {
    if (!STATE.me) { renderLogin(); return; }
    if (TAB === 'sell') viewSell();
    else if (TAB === 'iron') viewIron();
    else if (TAB === 'scan') viewScan();
    else if (TAB === 'caps') viewCaps();
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
      loadScan(),
      api('POST', '/api/capabilities', {}).then(function (d) { STATE.caps = d.capabilities || []; }).catch(function () {})
    ]).then(function () { paint(); });
  }

  function boot() {
    api('GET', '/api/launch').then(function (d) { STATE.launch = d; }).catch(function () {}).finally(function () {
      api('GET', '/api/me').then(function (d) { render(d && d.me ? d.me : null); }).catch(function () { render(null); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
/*NOVA-UI-END*/
