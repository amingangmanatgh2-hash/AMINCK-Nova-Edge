/*NOVA-UI-START*/
(function () {
  'use strict';

  var APP = 'AMINCK GOD Edition';
  var EDITION = 'AMINCK GOD Edition — فروش ساب';
  var TAB = 'dash';
  var STATE = { me: null, users: [], stats: null, endpoints: [], probe: {}, iron: null, clean: [], ironUser: '', launch: null, menu: false };

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
    html += domainMenuHtml();
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
    var tabs = [['dash', 'داشبورد'], ['sell', 'فروش ساب'], ['iron', 'آهنین JSON'], ['scan', 'پینگ / IP تمیز'], ['help', 'راهنما']];
    var html = '<div class="wrap"><div class="topbar">';
    html += '<button class="btn" id="theme-btn">' + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button>';
    html += '<span class="badge">' + esc(me.role) + ' · ' + esc(me.username) + '</span>';
    html += '<button class="btn" id="logout-btn">خروج</button>';
    if (can(me, 'settings:manage')) html += '<button class="btn primary" id="hot-btn">آپدیت یک‌کلیکی</button>';
    html += '</div><div class="hero"><div class="mark">N</div><div><h1>' + esc(APP) + '</h1><div class="sub">پنل فروش ساب · ' + esc(location.host) + '</div></div></div>';
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
    html += '<div class="card" style="margin-top:16px"><h2>ساخت اتومات (بهترین ستینگ GOD)</h2>';
    html += '<p class="muted">نام + تعداد کانفیگ ساب + تعداد آهنین. سرعت GOD، پینگ بهتر اول.</p>';
    html += '<label>نام ساب</label><input id="n" placeholder="مثلا VIP-علی" style="width:100%;margin-bottom:8px">';
    html += '<div class="row"><select id="paths">' + pathOptions(5) + '</select><select id="iron-n">' + ironOptions(3) + '</select>';
    html += '<button class="btn primary" id="auto">ساخت اتومات</button></div><div id="mk-out"></div></div>';
    shell(html);
    $('#auto').onclick = function () {
      var name = $('#n').value || ('GOD-' + Date.now());
      var paths = Number($('#paths').value || 5);
      var ironN = Number($('#iron-n').value || 0);
      api('POST', '/api/auto-build', { name: name, paths: paths, ironCount: ironN, speedPreset: 'god', profileMode: 'auto' })
        .then(function (d) {
          var u = d.user;
          var link = d.subUrl || subLink(u.token, '');
          var out = '<div class="alert">ساب آماده شد — ' + esc(name) + '</div><div class="uri">' + esc(link) + '</div>';
          out += '<div class="row" style="margin-top:8px"><button class="btn" id="c1">کپی ساب</button><button class="btn" id="c2">Clash</button><button class="btn" id="c3">sing-box</button></div>';
          (d.iron || []).forEach(function (p) {
            out += '<div class="card"><b>' + esc(p.name) + '</b> <span class="badge">' + esc(p.client) + '</span><div class="uri">' + esc(p.json) + '</div></div>';
          });
          $('#mk-out').innerHTML = out;
          $('#c1').onclick = function () { copyText(link, 'ساب'); };
          $('#c2').onclick = function () { copyText(subLink(u.token, 'clash'), 'Clash'); };
          $('#c3').onclick = function () { copyText(subLink(u.token, 'singbox'), 'sing-box'); };
          toast('اتومات GOD ساخته شد', true);
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
