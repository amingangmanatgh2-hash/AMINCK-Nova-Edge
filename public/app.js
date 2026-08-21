/*NOVA-UI-START*/
(function () {
  'use strict';

  var APP = 'AMINNOVA';
  var EDITION = 'AMINNOVA — پنل فروش ساب AMINCK';
  var TAB = 'dash';
  var INSTALL_EVENT = null;
  var MONITOR_TIMER = null;
  var STATE = { me: null, users: [], stats: null, endpoints: [], probe: {}, settings: null, iron: null, clean: [], ironUser: '', launch: null, caps: [] };
  var ICON_PATHS = {
    dash: '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    iron: '<path d="m12 2 8 4v6c0 5-3.4 9.2-8 10-4.6-.8-8-5-8-10V6l8-4Zm-3 10 2 2 4-5"/>',
    scan: '<path d="M4 17V7m4 10v-6m4 6V4m4 13v-9m4 9v-3M3 21h18"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8 8 0 0 0-1.7-1L14.7 3h-4l-.4 3a8 8 0 0 0-1.7 1L6.1 6 4 9.4 6.1 11a7 7 0 0 0 0 2L4 14.6 6 18l2.5-1a8 8 0 0 0 1.7 1l.4 3h4l.4-3a8 8 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z"/>',
    app: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4M9 6h6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.7 2.7 0 1 1 4.4 2.1c-1.2.8-1.9 1.3-1.9 2.9M12 18h.01"/>',
    install: '<path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"/>',
    spark: '<path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Zm7 11 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/>',
    shield: '<path d="m12 2 8 4v6c0 5-3.4 9.2-8 10-4.6-.8-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-5"/>',
    infinity: '<path d="M8.5 8.5c-5-4-8 5-3 7 3 1 5-2 6.5-4 1.5-2 3.5-5 6.5-4 5 2 2 11-3 7l-7-6Z"/>',
    cloud: '<path d="M17.5 19H6a4 4 0 0 1-.6-8A7 7 0 0 1 19 9.5 4.8 4.8 0 0 1 17.5 19Z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Zm0 0A2.5 2.5 0 0 0 6.5 22H20"/>',
    logout: '<path d="M10 17l5-5-5-5m5 5H3m10-9h7v18h-7"/>',
    theme: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || ICON_PATHS.spark) + '</svg>';
  }
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
  function downloadJson(data, name) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function installApp() {
    if (isStandalone()) { toast('AMINNOVA همین حالا به‌صورت اپ اجرا شده', true); return; }
    if (!INSTALL_EVENT) { toast('از منوی مرورگر گزینه Add to Home Screen / نصب برنامه را بزنید'); return; }
    INSTALL_EVENT.prompt();
    INSTALL_EVENT.userChoice.then(function (choice) {
      if (choice.outcome === 'accepted') toast('اپ AMINNOVA نصب شد', true);
      INSTALL_EVENT = null;
    });
  }
  function registerPwa() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', function () {
        var worker = reg.installing;
        if (worker) worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('نسخه جدید اپ آماده شد', true);
        });
      });
    }).catch(function () {});
  }
  function shareValue(title, text, url) {
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () {});
    } else copyText(url || text, title);
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
  function testWsRoute(user) {
    return new Promise(function (resolve) {
      if (!user || !user.routes || !user.routes[0]) { resolve({ ok: false, error: 'مسیر ساخته نشد' }); return; }
      var started = Date.now();
      var scheme = location.protocol === 'https:' ? 'wss://' : 'ws://';
      var socket;
      var settled = false;
      function finish(result) { if (settled) return; settled = true; clearTimeout(timer); resolve(result); }
      var timer = setTimeout(function () {
        try { if (socket) socket.close(); } catch (e) {}
        finish({ ok: false, error: 'Timeout از شبکه مرورگر' });
      }, 8000);
      try {
        socket = new WebSocket(scheme + location.host + user.routes[0].path);
        socket.onopen = function () { finish({ ok: true, latencyMs: Date.now() - started }); socket.close(); };
        socket.onerror = function () { finish({ ok: false, error: 'WebSocket روی این دامنه/ISP باز نشد' }); };
      } catch (e) { finish({ ok: false, error: String(e.message || e) }); }
    });
  }
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
  function ironOptions(sel) {
    var h = '';
    [0, 1, 2, 3, 4, 5].forEach(function (n) {
      h += '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + ' آهنین JSON</option>';
    });
    return h;
  }
  function subscriptionOptions(sel) {
    var h = '';
    [1, 2, 3, 5, 10].forEach(function (n) {
      h += '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + ' ساب</option>';
    });
    return h;
  }

  function domainMenuHtml() {
    var html = '<div class="card" style="position:relative">';
    html += '<div class="row" style="justify-content:space-between">';
    html += '<div><b>دامنه این پنل</b><div class="mono">' + esc(location.host) + '</div></div>';
    html += '<button class="btn primary" id="cf-menu-btn">راه‌اندازی امن کلودفلر ▾</button></div>';
    html += '<div id="cf-menu" style="display:none;margin-top:12px;border-top:1px solid var(--line);padding-top:12px">';
    html += '<div class="row">';
    html += '<a class="btn primary" id="btn-deploy" target="_blank" rel="noopener">Deploy رسمی روی Cloudflare</a>';
    html += '<a class="btn" id="btn-repo" target="_blank" rel="noopener">مشاهده مخزن</a>';
    html += '</div>';
    html += '<p class="muted">توکن API را داخل هیچ پنل عمومی Paste نکنید. Deploy رسمی یا GitHub Actions توکن را در Secret رمزگذاری‌شده نگه می‌دارد.</p>';
    html += '<ol class="muted"><li>Deploy را باز کنید.</li><li>همان‌جا فقط رمز ADMIN_PASSWORD را وارد کنید.</li><li>دامنه Worker را باز کنید و ساب بسازید.</li></ol>';
    html += '</div></div>';
    return html;
  }
  function bindDomainMenu() {
    var L = STATE.launch || {};
    var depA = $('#btn-deploy');
    var repoA = $('#btn-repo');
    if (depA) depA.href = L.deployUrl || 'https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/tree/arena/01a01b70-aminck-nova-edge';
    if (repoA) repoA.href = L.repo || 'https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/tree/arena/01a01b70-aminck-nova-edge';
    var mb = $('#cf-menu-btn');
    if (mb) mb.onclick = function () {
      var box = $('#cf-menu');
      if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
    };
  }

  function renderLogin() {
    var theme = localStorage.getItem('edge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var html = '<div class="wrap">';
    html += '<div class="topbar"><span class="status-dot' + (navigator.onLine ? '' : ' offline') + '">' + (navigator.onLine ? 'Cloudflare Online' : 'Offline') + '</span><button class="btn" id="install-btn">' + icon('install') + 'نصب اپ</button><button class="btn" id="theme-btn">' + icon('theme') + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button></div>';
    html += '<div class="hero hero-panel card"><div class="mark">' + icon('cloud') + '</div><div><div class="eyebrow">AMINCK NOVA EDGE</div><h1>AMINNOVA Liquid</h1><div class="sub">' + esc(EDITION) + ' · PWA امن و نصب‌پذیر</div></div></div>';
    html += '<div class="grid"><div>' + domainMenuHtml() + '</div><div class="card login-box"><div class="section-title"><div><div class="eyebrow">Secure Access</div><h2>ورود مرکز کنترل</h2></div>' + icon('shield') + '</div>';
    html += '<p class="muted">مالک: <b>AMINCK</b> · رمز فقط در Secret امن <code>ADMIN_PASSWORD</code></p>';
    html += '<label>نام کاربری</label><input id="u" value="AMINCK" autocomplete="username" style="width:100%;margin-bottom:8px">';
    html += '<label>رمز</label><input id="p" type="password" autocomplete="current-password" style="width:100%;margin-bottom:12px">';
    html += '<button class="btn primary big" id="login-btn" style="width:100%;justify-content:center">' + icon('shield') + 'ورود امن</button></div></div>';
    html += '<div class="feature-grid"><div class="feature-tile">' + icon('infinity') + '<h3>Smart Pool ∞</h3><p class="muted">پنجره فعال سبک با چرخش دوره‌ای بدون خروجی بی‌نهایت و Crash کلاینت.</p></div><div class="feature-tile">' + icon('app') + '<h3>اپ موبایل PWA</h3><p class="muted">نصب مستقیم، اشتراک‌گذاری و مدیریت ساب از Home Screen.</p></div><div class="feature-tile">' + icon('shield') + '<h3>امنیت Edge</h3><p class="muted">نشست HttpOnly، SameSite، CSP و عدم Cache داده حساس.</p></div></div></div>';
    $('#app').innerHTML = html;
    $('#theme-btn').onclick = function () {
      localStorage.setItem('edge-theme', theme === 'dark' ? 'light' : 'dark');
      renderLogin();
    };
    var install = $('#install-btn');
    if (install) install.onclick = installApp;
    bindDomainMenu();
    $('#login-btn').onclick = function () {
      api('POST', '/api/login', { username: $('#u').value, password: $('#p').value })
        .then(function () { toast('ورود موفق', true); boot(); })
        .catch(function (e) { toast(e.message); });
    };
  }

  function shell(inner) {
    if (TAB !== 'app' && MONITOR_TIMER) { clearInterval(MONITOR_TIMER); MONITOR_TIMER = null; }
    var me = STATE.me;
    var theme = localStorage.getItem('edge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var tabs = [['dash', 'داشبورد', 'dash'], ['sell', 'مشترک‌ها', 'users'], ['iron', 'آهنین', 'iron'], ['scan', 'شبکه', 'scan'], ['app', 'اپ موبایل', 'app'], ['recovery', 'بکاپ', 'shield'], ['settings', 'تنظیمات', 'settings'], ['caps', 'قابلیت‌ها', 'spark'], ['help', 'راهنما', 'book']];
    var html = '<div class="wrap"><div class="topbar">';
    html += '<span id="network-state" class="status-dot' + (navigator.onLine ? '' : ' offline') + '">' + (navigator.onLine ? 'آنلاین' : 'آفلاین') + '</span>';
    html += '<button class="btn" id="install-btn">' + icon('install') + (isStandalone() ? 'نصب‌شده' : 'نصب اپ') + '</button>';
    html += '<button class="btn" id="theme-btn" aria-label="تعویض پوسته">' + icon('theme') + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button>';
    html += '<span class="badge">' + esc(me.role) + ' · ' + esc(me.username) + '</span>';
    html += '<button class="btn" id="logout-btn">' + icon('logout') + 'خروج</button>';
    if (can(me, 'settings:manage')) html += '<button class="btn primary" id="hot-btn">' + icon('spark') + 'آپدیت امن</button>';
    html += '</div><div class="hero"><div class="mark">' + icon('cloud') + '</div><div><div class="eyebrow">Liquid Glass Control Center</div><h1>' + esc(APP) + '</h1><div class="sub">Cloudflare Edge · ' + esc(location.host) + '</div></div></div>';
    html += domainMenuHtml();
    html += '<div class="tabs">';
    tabs.forEach(function (t) {
      html += '<button class="tab' + (TAB === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + icon(t[2]) + t[1] + '</button>';
    });
    html += '</div>' + inner;
    html += '<nav class="mobile-nav" aria-label="ناوبری موبایل">';
    tabs.forEach(function (t) {
      html += '<button class="' + (TAB === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + icon(t[2]) + '<span>' + t[1] + '</span></button>';
    });
    html += '</nav></div>';
    $('#app').innerHTML = html;
    document.querySelectorAll('[data-tab]').forEach(function (el) {
      el.addEventListener('click', function () { TAB = el.getAttribute('data-tab'); history.replaceState(null, '', '/?tab=' + TAB); paint(); });
    });
    var install = $('#install-btn');
    if (install) install.onclick = installApp;
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
    html += '<div class="pill"><b>' + (STATE.caps.length || '۳۵۰+') + '</b><span>قابلیت مستند</span></div>';
    html += '<div class="pill"><b>∞ Pool</b><span>چرخش پنجره فعال</span></div></div>';
    html += '<div class="card hero-panel" style="margin-top:16px"><div class="section-title"><div><div class="eyebrow">Smart Subscription Studio</div><h2>ساخت اتومات حرفه‌ای AMINNOVA</h2></div>' + icon('spark') + '</div>';
    html += '<p class="muted">Probe واقعی Edge، مسیر مستقیم + Anycast، خروجی‌های چندکلاینت و Smart Pool چرخان. هیچ سرویس اینترنتی نمی‌تواند نبود قطعی روی همه ISPها را تضمین کند؛ Failover احتمال قطعی را کم می‌کند.</p>';
    html += '<div class="row"><button class="btn primary" id="heavy-preset" type="button">' + icon('iron') + 'فعال‌سازی MAX Heavy</button><span class="badge">GOD · 200 Active · Iron 5</span></div>';
    html += '<label>نام ساب</label><input id="n" placeholder="VIP-علی" style="width:100%;margin-bottom:8px">';
    html += '<label>قالب نام کانفیگ</label><input id="tpl" value="{brand} AMINCK {profile} {index}" style="width:100%;margin-bottom:8px">';
    html += limRow('حجم بایت', 'lim-b') + limRow('ثانیه اعتبار', 'lim-s') + limRow('سقف اتصال', 'lim-c') + limRow('سقف درخواست ساب', 'lim-r');
    html += '<div class="card"><label>دامنه‌های متصل به همین Worker</label><p class="muted">فقط workers.dev یا Custom Domain متعلق به خودت و Route‌شده به همین Worker. دامنه شخص ثالث با TLS کار نمی‌کند.</p><div class="endpoint-pick">';
    if (STATE.endpoints.length === 0) html += '<span class="muted">Endpoint ثبت نشده؛ دامنه فعلی خودکار اضافه می‌شود.</span>';
    STATE.endpoints.forEach(function (endpoint) {
      var result = STATE.probe[endpoint.id];
      html += '<label class="check"><input type="checkbox" data-build-endpoint="' + esc(endpoint.id) + '" checked> ' + esc(endpoint.host + ':' + endpoint.port) + ' <span class="badge">' + (result && result.ok ? ('سالم ' + Math.round(result.latencyMs || 0) + 'ms') : 'نیازمند تست') + '</span></label>';
    });
    html += '</div><div class="row"><button class="btn" id="domains-all" type="button">انتخاب همه</button><button class="btn" id="domains-none" type="button">لغو همه</button></div></div>';
    html += '<div class="card"><label class="check"><input id="clean-auto" type="checkbox" checked> افزودن کاندیدهای Cloudflare Anycast برای تست واقعی داخل کلاینت</label>';
    html += '<p class="muted">این IPها تضمین «تمیز» نیستند؛ direct + Anycast با SNI واقعی Worker ساخته می‌شود و url-test/leastPing روی ISP خودت بهترین را انتخاب می‌کند.</p>';
    html += '<label>IPv4 دستی از بازه رسمی Cloudflare (اختیاری، با فاصله یا ویرگول)</label><textarea id="clean-manual" rows="2" placeholder="مثال: 162.159.36.1"></textarea></div>';
    html += '<div class="card install-banner"><label class="check"><input id="dynamic-pool" type="checkbox" checked> ' + icon('infinity') + ' Smart Pool نامحدود زمانی</label>';
    html += '<div class="grid"><div><label>تعویض پنجره کاندیدها (دقیقه)</label><input id="rotation-minutes" type="number" min="1" max="60" value="1" style="width:100%"></div><div><label>پنجره فعال هم‌زمان</label><div class="muted">حداکثر ۲۰۰ مسیر برای جلوگیری از هنگ کلاینت</div></div></div>';
    html += '<p class="muted">∞ یعنی نسل‌های نامحدود در Refreshهای متوالی، نه بی‌نهایت خط در یک پاسخ. URL و Path معتبر می‌مانند تا چرخش باعث قطع عمدی نشود. کلاینت باید ساب را Refresh کند؛ Clash/sing-box بین مسیرهای حاضر خودکار تست می‌کنند.</p></div>';
    html += '<div class="card"><label class="check"><input id="cf-ai" type="checkbox"> کمک اختیاری Cloudflare Workers AI برای انتخاب Profile</label>';
    html += '<p class="muted">AI فقط از عددهای Probe بین Profileهای معتبر انتخاب می‌کند؛ ساخت به AI وابسته نیست و استفاده ممکن است سهمیه/هزینه Workers AI داشته باشد.</p></div>';
    html += '<div class="grid"><div><label>تعداد ساب مستقل</label><select id="sub-count" style="width:100%">' + subscriptionOptions(1) + '</select></div>';
    html += '<div><label>تعداد کانفیگ داخل هر ساب (۱ تا ۲۰۰)</label><input id="paths" type="number" min="1" max="200" value="20" style="width:100%"></div></div>';
    html += '<label>تعداد کانفیگ آهنین برای ساب اول</label><select id="iron-n">' + ironOptions(1) + '</select> ';
    html += '<button class="btn primary big" id="auto">' + icon('spark') + 'ساخت Smart Subscription</button><div id="mk-out"></div></div>';
    shell(html);
    bindInf();
    var domainsAll = $('#domains-all');
    if (domainsAll) domainsAll.onclick = function () {
      document.querySelectorAll('[data-build-endpoint]').forEach(function (input) { input.checked = true; });
    };
    var domainsNone = $('#domains-none');
    if (domainsNone) domainsNone.onclick = function () {
      document.querySelectorAll('[data-build-endpoint]').forEach(function (input) { input.checked = false; });
    };
    var heavy = $('#heavy-preset');
    if (heavy) heavy.onclick = function () {
      $('#paths').value = '200'; $('#iron-n').value = '5'; $('#dynamic-pool').checked = true; $('#clean-auto').checked = true;
      $('#rotation-minutes').value = '1'; toast('پروفایل MAX Heavy فعال شد', true);
    };
    $('#auto').onclick = function () {
      var name = $('#n').value || ('AMINCK-' + Date.now());
      var button = $('#auto');
      button.disabled = true; button.textContent = 'در حال تست و ساخت…';
      var payload = {
        name: name,
        subscriptionCount: Number($('#sub-count').value || 1),
        paths: Number($('#paths').value || 5),
        ironCount: Number($('#iron-n').value || 0),
        speedPreset: 'god',
        profileMode: 'auto',
        configNameTemplate: $('#tpl').value,
        endpointIds: Array.prototype.slice.call(document.querySelectorAll('[data-build-endpoint]:checked')).map(function (input) { return input.getAttribute('data-build-endpoint'); }),
        useCleanCatalog: !!($('#clean-auto') && $('#clean-auto').checked),
        cleanIps: $('#clean-manual') ? $('#clean-manual').value : '',
        dynamicPool: !!($('#dynamic-pool') && $('#dynamic-pool').checked),
        rotationMinutes: Number($('#rotation-minutes').value || 1),
        useCloudflareAi: !!($('#cf-ai') && $('#cf-ai').checked),
        limitBytes: numOrZero('lim-b'),
        limitSeconds: numOrZero('lim-s'),
        maxConnections: numOrZero('lim-c'),
        limitRequests: numOrZero('lim-r')
      };
      api('POST', '/api/auto-build', payload).then(function (d) {
        var subs = d.subscriptions || [{ name: d.user.name, token: d.user.token, subUrl: d.subUrl }];
        var out = '<div class="alert">' + esc(String(subs.length)) + ' ساب AMINCK آماده شد · ' + esc(String((d.selectedEndpoints || []).length)) + ' دامنه · ' + esc(String((d.cleanIpsUsed || []).length)) + ' کاندید Anycast</div>';
        if (d.rollingPool && d.rollingPool.enabled) {
          out += '<div class="alert">' + icon('infinity') + ' Smart Pool فعال: ' + esc(d.rollingPool.activeWindow) + ' مسیر در پنجره فعال، چرخش هر ' + esc(d.rollingPool.rotationMinutes) + ' دقیقه هنگام Refresh ساب.</div>';
        }
        if (d.aiAssistance && d.aiAssistance.requested) {
          out += '<div class="alert">Workers AI: ' + (d.aiAssistance.applied ? ('پیشنهاد اعمال شد (' + esc(d.aiAssistance.recommendation) + ')') : 'در دسترس نبود؛ موتور Probe تعیین‌پذیر استفاده شد') + '</div>';
        }
        out += '<div class="alert" id="ws-live-test">در حال تست WebSocket از اینترنت همین مرورگر…</div>';
        subs.forEach(function (sub, i) {
          var link = sub.subUrl || subLink(sub.token, '');
          out += '<div class="sub-result"><b>' + esc(sub.name) + '</b><div class="uri">' + esc(link) + '</div>';
          var rawLink = sub.rawUrl || subLink(sub.token, 'raw');
          out += '<div class="row"><button class="btn" data-copy-url="' + esc(link) + '">' + icon('copy') + 'کپی ساب</button>';
          out += '<button class="btn" data-share-url="' + esc(link) + '">' + icon('share') + 'ارسال به موبایل</button>';
          out += '<button class="btn" data-copy-url="' + esc(rawLink) + '">کپی VLESS خام</button>';
          out += '<a class="btn" target="_blank" rel="noopener" href="' + esc(rawLink) + '">تست و نمایش</a>';
          out += '<button class="btn" data-copy-url="' + esc(sub.clashUrl || subLink(sub.token, 'clash')) + '">Clash</button>';
          out += '<button class="btn" data-copy-url="' + esc(sub.singboxUrl || subLink(sub.token, 'singbox')) + '">sing-box</button></div></div>';
        });
        (d.iron || []).forEach(function (p, ironIndex) {
          out += '<div class="card"><b>' + esc(p.name) + '</b> <span class="badge">' + esc(p.client) + '</span> ';
          out += '<button class="btn" data-copy-iron="' + ironIndex + '">کپی JSON آهنین</button>';
          out += '<div class="uri">' + esc(p.json) + '</div></div>';
        });
        $('#mk-out').innerHTML = out;
        document.querySelectorAll('[data-copy-url]').forEach(function (el) {
          el.onclick = function () { copyText(el.getAttribute('data-copy-url'), 'لینک'); };
        });
        document.querySelectorAll('[data-share-url]').forEach(function (el) {
          el.onclick = function () { shareValue('AMINNOVA Subscription', 'لینک خصوصی ساب را فقط برای صاحب آن ارسال کنید.', el.getAttribute('data-share-url')); };
        });
        document.querySelectorAll('[data-copy-iron]').forEach(function (el) {
          el.onclick = function () {
            var item = (d.iron || [])[Number(el.getAttribute('data-copy-iron'))];
            if (item) copyText(item.json, 'JSON آهنین');
          };
        });
        testWsRoute((d.users || [d.user])[0]).then(function (result) {
          var box = $('#ws-live-test');
          if (!box) return;
          box.textContent = result.ok
            ? ('WebSocket از شبکه فعلی باز شد: ' + result.latencyMs + 'ms')
            : ('هشدار: ' + result.error + '؛ Custom Domain خودت یا کاندید Anycast را امتحان کن.');
          box.style.borderColor = result.ok ? 'var(--ok)' : 'var(--err)';
        });
        toast(String(subs.length) + ' ساب ساخته شد', true);
        return loadUsers();
      }).catch(function (e) { toast(e.message); }).finally(function () {
        button.disabled = false; button.innerHTML = icon('spark') + 'ساخت Smart Subscription';
      });
    };
  }

  function viewSell() {
    var html = '<div class="card"><h2>مشترک‌ها و ویرایش</h2><table><thead><tr><th>نام</th><th>مسیر</th><th></th></tr></thead><tbody>';
    STATE.users.forEach(function (u) {
      html += '<tr><td>' + esc(u.name) + (u.dynamicPool ? ' <span class="badge">∞ ' + esc(u.rotationMinutes || 1) + 'm</span>' : '') + '</td><td>' + (u.routes ? u.routes.length : 0) + '</td>';
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
    h += '<label>تعداد مسیر فعال (۱ تا ۲۰۰)</label><input id="ep" type="number" min="1" max="200" value="' + esc(u.routes ? u.routes.length : 3) + '">';
    h += '<label class="check"><input id="edyn" type="checkbox"' + (u.dynamicPool ? ' checked' : '') + '> Smart Pool چرخان</label>';
    h += '<label>چرخش (دقیقه)</label><input id="erot" type="number" min="1" max="60" value="' + esc(u.rotationMinutes || 1) + '">';
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
        dynamicPool: $('#edyn').checked,
        rotationMinutes: Number($('#erot').value || 1),
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
    html += '</tbody></table><p class="muted">این عدد HTTPS از Edge کلودفلر است، نه Ping اینترنت کاربر. نتیجه ISP کاربر می‌تواند متفاوت باشد.</p></div>';
    html += '<div class="card"><h2>مخزن کاندیدهای Anycast</h2><p class="muted">IP تمیز ثابت وجود ندارد. با فعال بودن گزینه Anycast در ساخت اتومات، این کاندیدها کنار مسیر مستقیم وارد می‌شوند تا خود کلاینت از شبکه واقعی تست کند.</p><div class="row">';
    (STATE.clean || []).slice(0, 18).forEach(function (c) { html += '<span class="badge mono">' + esc(c.ip) + '</span>'; });
    html += '</div></div>';
    shell(html);
    $('#add-ep').onclick = function () {
      api('POST', '/api/endpoints', { action: 'add', host: $('#eh').value, port: Number($('#ep').value || 443) })
        .then(function () { toast('OK', true); loadScan(); }).catch(function (e) { toast(e.message); });
    };
    $('#pr').onclick = function () {
      api('POST', '/api/probe', {}).then(function (d) { STATE.probe = d.results || {}; toast('پینگ شد', true); paint(); }).catch(function (e) { toast(e.message); });
    };
  }

  function viewApp() {
    var html = '<div class="card hero-panel"><div class="section-title"><div><div class="eyebrow">Installable Mobile Companion</div><h2>اپ موبایل AMINNOVA</h2></div>' + icon('app') + '</div>';
    html += '<p class="muted">این نسخه PWA روی Android، iOS و دسکتاپ نصب می‌شود و پنل، ساب‌ها، Share و مانیتور Refresh را داخل یک اپ نگه می‌دارد.</p>';
    html += '<div class="row"><button class="btn primary big" id="app-install">' + icon('install') + (isStandalone() ? 'اپ نصب شده' : 'نصب روی صفحه اصلی') + '</button><button class="btn" id="app-update">' + icon('spark') + 'بررسی آپدیت اپ</button></div></div>';
    html += '<div class="grid"><div class="card"><h2>انتخاب مشترک</h2><select id="app-user" style="width:100%">';
    STATE.users.forEach(function (u) { html += '<option value="' + esc(u.token) + '">' + esc(u.name) + (u.dynamicPool ? ' · ∞ Pool' : '') + '</option>'; });
    html += '</select><div id="app-links"></div></div>';
    html += '<div class="card"><h2>مانیتور چرخش یک‌دقیقه‌ای</h2><p class="muted">فقط وقتی اپ باز است، هر دقیقه ساب انتخابی را Refresh و هدر Rotation را نمایش می‌دهد. اپ بسته یا Client خارجی را سیستم‌عامل کنترل می‌کند.</p><button class="btn primary" id="monitor-btn">شروع مانیتور</button><div id="monitor-state" class="uri">خاموش</div></div></div>';
    html += '<div class="card"><h2>اتصال به کانفیگ</h2><div class="alert">مرورگر/PWA اجازه ساخت VPN سیستمی ندارد. برای اتصال واقعی باید لینک را در V2RayNG، V2Box، MahsaNG، Clash/Mihomo یا sing-box Import کنید. AMINNOVA هیچ‌وقت اتصال جعلی یا VPN مرورگری ادعا نمی‌کند.</div>';
    html += '<div class="feature-grid"><div class="feature-tile">' + icon('copy') + '<h3>V2Ray / Raw</h3><p class="muted">کپی Base64 یا VLESS خام برای کلاینت‌های V2Ray.</p></div><div class="feature-tile">' + icon('scan') + '<h3>Clash / Mihomo</h3><p class="muted">YAML کامل با url-test و fallback.</p></div><div class="feature-tile">' + icon('iron') + '<h3>sing-box / Iron</h3><p class="muted">JSON استاندارد با Selector و URLTest.</p></div></div></div>';
    shell(html);
    var install = $('#app-install'); if (install) install.onclick = installApp;
    var update = $('#app-update'); if (update) update.onclick = function () {
      if (!navigator.serviceWorker) { toast('Service Worker پشتیبانی نمی‌شود'); return; }
      navigator.serviceWorker.getRegistration('/').then(function (reg) { if (reg) return reg.update(); }).then(function () { toast('بررسی آپدیت انجام شد', true); });
    };
    function paintLinks() {
      var token = $('#app-user') ? $('#app-user').value : '';
      if (!token) { $('#app-links').innerHTML = '<div class="alert">اول از داشبورد یک مشترک بساز.</div>'; return; }
      var base = subLink(token, '');
      var links = [
        ['ساب خودکار', base], ['VLESS خام', subLink(token, 'raw')], ['Clash/Mihomo', subLink(token, 'clash')], ['sing-box', subLink(token, 'singbox')]
      ];
      var out = '';
      links.forEach(function (item) {
        out += '<div class="sub-result"><b>' + item[0] + '</b><div class="uri">' + esc(item[1]) + '</div><div class="row"><button class="btn" data-app-copy="' + esc(item[1]) + '">' + icon('copy') + 'کپی</button><button class="btn" data-app-share="' + esc(item[1]) + '">' + icon('share') + 'Share</button></div></div>';
      });
      $('#app-links').innerHTML = out;
      document.querySelectorAll('[data-app-copy]').forEach(function (el) { el.onclick = function () { copyText(el.getAttribute('data-app-copy'), 'لینک Import'); }; });
      document.querySelectorAll('[data-app-share]').forEach(function (el) { el.onclick = function () { shareValue('AMINNOVA', 'Subscription خصوصی', el.getAttribute('data-app-share')); }; });
    }
    if ($('#app-user')) { $('#app-user').onchange = paintLinks; paintLinks(); }
    var monitor = $('#monitor-btn');
    function runMonitor() {
      var token = $('#app-user') ? $('#app-user').value : '';
      if (!token) return;
      fetch(subLink(token, 'raw'), { cache: 'no-store', credentials: 'omit' }).then(function (res) {
        if (res.body && res.body.cancel) res.body.cancel().catch(function () {});
        var box = $('#monitor-state'); if (!box) return;
        box.textContent = 'HTTP ' + res.status + ' · mode=' + (res.headers.get('x-aminck-pool-mode') || 'fixed') + ' · epoch=' + (res.headers.get('x-aminck-rotation-epoch') || '—') + ' · ' + new Date().toLocaleTimeString('fa-IR');
      }).catch(function () { var box = $('#monitor-state'); if (box) box.textContent = 'شبکه در دسترس نیست'; });
    }
    if (monitor) monitor.onclick = function () {
      if (MONITOR_TIMER) { clearInterval(MONITOR_TIMER); MONITOR_TIMER = null; monitor.textContent = 'شروع مانیتور'; $('#monitor-state').textContent = 'خاموش'; return; }
      runMonitor(); MONITOR_TIMER = setInterval(runMonitor, 60000); monitor.textContent = 'توقف مانیتور';
    };
  }

  function viewRecovery() {
    if (!can(STATE.me, 'backup:export')) { shell('<div class="card">دسترسی بکاپ ندارید.</div>'); return; }
    var html = '<div class="card"><h2>بکاپ و بازیابی ساب‌ها</h2>';
    html += '<p class="muted">اگر حساب Cloudflare حذف شود، Worker و دامنه workers.dev آن حساب هم از بین می‌رود. برای بازیابی: این فایل را نگه دارید، AMINNOVA را روی حساب جدید Deploy و همین‌جا Restore کنید.</p>';
    html += '<p class="muted">این فایل شامل Token و UUID مشترک‌هاست؛ آن را محرمانه نگه دارید.</p>';
    html += '<div class="row"><button class="btn primary" id="backup-download">دانلود بکاپ JSON</button></div>';
    if (STATE.me.role === 'owner') {
      html += '<hr style="border:0;border-top:1px solid var(--line);margin:18px 0">';
      html += '<label>فایل بکاپ AMINNOVA</label><input id="backup-file" type="file" accept="application/json,.json">';
      html += '<button class="btn" id="backup-restore">بازیابی روی این دامنه</button>';
      html += '<p class="muted">Token و UUID حفظ می‌شوند و مسیرها به دامنه فعلی متصل می‌شوند. برای ثابت ماندن لینک قدیمی باید از Custom Domain خودتان استفاده و DNS آن را به Deploy جدید منتقل کنید.</p>';
    }
    html += '</div>';
    shell(html);
    $('#backup-download').onclick = function () {
      api('POST', '/api/backup', {}).then(function (d) {
        downloadJson(d, 'AMINNOVA-backup-' + new Date().toISOString().slice(0, 10) + '.json');
        toast('بکاپ دانلود شد', true);
      }).catch(function (e) { toast(e.message); });
    };
    var restore = $('#backup-restore');
    if (restore) restore.onclick = function () {
      var input = $('#backup-file');
      if (!input.files || !input.files[0]) { toast('اول فایل بکاپ را انتخاب کنید'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var backup = JSON.parse(String(reader.result || ''));
          api('POST', '/api/restore', { backup: backup }).then(function (d) {
            toast(d.message || 'بازیابی شد', true);
            return Promise.all([loadUsers(), loadScan()]).then(function () { TAB = 'sell'; paint(); });
          }).catch(function (e) { toast(e.message); });
        } catch (e) { toast('JSON بکاپ نامعتبر است'); }
      };
      reader.readAsText(input.files[0]);
    };
  }

  function viewSettings() {
    var s = STATE.settings || {};
    if (!can(STATE.me, 'settings:manage')) { shell('<div class="card">دسترسی تنظیمات ندارید.</div>'); return; }
    var anti = s.antiDetect || {};
    var ports = s.tlsPorts || [443];
    var html = '<div class="card"><h2>تنظیمات خروجی و فروش</h2>';
    html += '<label>عنوان پنل</label><input id="st-title" value="' + esc(s.title || 'AMINNOVA') + '" style="width:100%">';
    html += '<label>برند کانفیگ</label><input id="st-brand" value="' + esc(s.brand || 'AMINCK GOD Edition') + '" style="width:100%">';
    html += '<label>لینک پشتیبانی</label><input id="st-support" value="' + esc(s.supportUrl || '') + '" style="width:100%">';
    html += '<label>قالب نام</label><input id="st-template" value="' + esc(s.configNameTemplate || '{brand} AMINCK {profile} {index}') + '" style="width:100%">';
    html += '<div class="grid"><div><label>تعداد پیش‌فرض</label><input id="st-paths" type="number" min="1" max="200" value="' + esc(s.defaultPaths || 3) + '"></div>';
    html += '<div><label>آپدیت ساب (ساعت)</label><input id="st-up" type="number" min="1" max="720" value="' + esc(s.updateIntervalHours || 24) + '"></div></div>';
    html += '<div class="row" style="margin-top:12px"><select id="st-speed"><option value="stable">Stable</option><option value="balanced">Balanced</option><option value="turbo">Turbo</option><option value="god">GOD</option></select>';
    html += '<select id="st-mode"><option value="auto">Auto</option><option value="fallback">Fallback</option><option value="balance">Balance</option></select>';
    html += '<select id="st-fp"><option value="chrome">Chrome</option><option value="firefox">Firefox</option><option value="safari">Safari</option><option value="edge">Edge</option><option value="random">Random</option></select></div>';
    html += '<h2 style="margin-top:18px">پورت‌های دامنه Worker</h2><div class="row">';
    [443,2053,2083,2087,2096,8443].forEach(function (p) { html += '<label class="check"><input type="checkbox" data-port="' + p + '"' + (ports.indexOf(p) >= 0 ? ' checked' : '') + '> ' + p + '</label>'; });
    html += '</div><p class="muted">برای workers.dev فقط 443 پیشنهاد می‌شود. مولتی‌پورت فقط با Custom Domain سازگار فعال شود.</p>';
    html += '<div class="row"><label class="check"><input id="st-pad" type="checkbox"' + (anti.pathPadding ? ' checked' : '') + '> Path padding</label>';
    html += '<label class="check"><input id="st-jitter" type="checkbox"' + (anti.pathJitter ? ' checked' : '') + '> Path jitter</label>';
    html += '<label class="check"><input id="st-frag" type="checkbox"' + (anti.fragment ? ' checked' : '') + '> Fragment hint</label>';
    html += '<label class="check"><input id="st-multi" type="checkbox"' + (anti.multiPort ? ' checked' : '') + '> Multi-port</label></div>';
    html += '<label>Host aliasهای متعلق به شما (باید در Endpointها باشند؛ با کاما)</label><input id="st-alias" value="' + esc((s.hostAliases || []).join(', ')) + '" style="width:100%">';
    html += '<p class="muted">دامنه شخص ثالث یا SNI جعلی پشتیبانی نمی‌شود؛ باعث شکست TLS/Route و ریسک سوءاستفاده می‌شود.</p>';
    html += '<button class="btn primary" id="st-save">ذخیره تنظیمات</button></div>';
    shell(html);
    if ($('#st-speed')) $('#st-speed').value = s.speedPreset || 'god';
    if ($('#st-mode')) $('#st-mode').value = s.profileMode || 'auto';
    if ($('#st-fp')) $('#st-fp').value = s.fingerprint || 'chrome';
    $('#st-save').onclick = function () {
      var selectedPorts = [];
      document.querySelectorAll('[data-port]:checked').forEach(function (el) { selectedPorts.push(Number(el.getAttribute('data-port'))); });
      var aliases = $('#st-alias').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      api('POST', '/api/settings', { settings: {
        title: $('#st-title').value,
        brand: $('#st-brand').value,
        supportUrl: $('#st-support').value,
        configNameTemplate: $('#st-template').value,
        defaultPaths: Number($('#st-paths').value || 3),
        updateIntervalHours: Number($('#st-up').value || 24),
        speedPreset: $('#st-speed').value,
        profileMode: $('#st-mode').value,
        fingerprint: $('#st-fp').value,
        tlsPorts: selectedPorts,
        hostAliases: aliases,
        antiDetect: {
          pathPadding: $('#st-pad').checked,
          pathJitter: $('#st-jitter').checked,
          fragment: $('#st-frag').checked,
          hostCamouflage: aliases.length > 0,
          multiPort: $('#st-multi').checked
        }
      }}).then(function (d) { STATE.settings = d.settings; toast('تنظیمات ذخیره شد', true); paint(); }).catch(function (e) { toast(e.message); });
    };
  }

  function viewCaps() {
    var categories = [];
    STATE.caps.forEach(function (c) { if (categories.indexOf(c.category) < 0) categories.push(c.category); });
    var html = '<div class="card hero-panel"><div class="section-title"><div><div class="eyebrow">Verified Feature Manifest</div><h2>' + STATE.caps.length + '+ قابلیت واقعی</h2></div>' + icon('spark') + '</div><p class="muted">همه موارد به کد، API، UI، امنیت، خروجی یا PWA موجود متصل‌اند؛ شعار و قابلیت خیالی ثبت نمی‌شود.</p></div>';
    html += '<div class="card"><div class="cap-toolbar"><input id="cap-search" placeholder="جست‌وجوی قابلیت…"><select id="cap-cat"><option value="">همه دسته‌ها</option>';
    categories.forEach(function (cat) { html += '<option value="' + esc(cat) + '">' + esc(cat) + '</option>'; });
    html += '</select></div><div id="cap-count" class="muted"></div><div id="cap-list" class="cap-list"></div></div>';
    shell(html);
    function filterCaps() {
      var q = ($('#cap-search').value || '').trim().toLowerCase();
      var cat = $('#cap-cat').value;
      var list = STATE.caps.filter(function (c) {
        return (!cat || c.category === cat) && (!q || (c.title + ' ' + c.description).toLowerCase().indexOf(q) >= 0);
      });
      $('#cap-count').textContent = list.length + ' مورد نمایش داده می‌شود';
      $('#cap-list').innerHTML = list.map(function (c) {
        return '<article class="cap-item"><span class="badge">' + esc(c.category) + '</span><b>' + esc(c.title) + '</b><div class="muted">' + esc(c.description) + '</div></article>';
      }).join('');
    }
    $('#cap-search').oninput = filterCaps; $('#cap-cat').onchange = filterCaps; filterCaps();
  }

  function viewHelp() {
    var html = '<div class="card hero-panel"><div class="section-title"><div><div class="eyebrow">AMINNOVA Academy</div><h2>راهنمای کامل از Deploy تا اتصال</h2></div>' + icon('book') + '</div><p class="muted">قدم‌ها را به ترتیب انجام بده؛ هیچ Cloudflare Token داخل پنل وارد نکن.</p><a class="btn primary big" id="easy" target="_blank" rel="noopener">' + icon('cloud') + 'Deploy رسمی</a></div>';
    html += '<div class="grid"><div class="card"><h2>راه‌اندازی</h2>';
    html += '<div class="guide-step"><strong>۱</strong><div><b>Deploy</b><p class="muted">لینک رسمی را باز و فقط ADMIN_PASSWORD قوی تعیین کن.</p></div></div>';
    html += '<div class="guide-step"><strong>۲</strong><div><b>ورود</b><p class="muted">با نام AMINCK وارد شو؛ دامنه جاری خودکار Endpoint می‌شود.</p></div></div>';
    html += '<div class="guide-step"><strong>۳</strong><div><b>ساخت</b><p class="muted">Endpoint، تعداد مسیر، Anycast و Smart Pool را انتخاب و ساخت را بزن.</p></div></div></div>';
    html += '<div class="card"><h2>Import در کلاینت</h2><div class="guide-step"><strong>۱</strong><div><b>لینک مناسب</b><p class="muted">V2Ray Base64 برای V2RayNG/V2Box؛ YAML برای Clash؛ JSON برای sing-box.</p></div></div><div class="guide-step"><strong>۲</strong><div><b>Refresh</b><p class="muted">برای Pool یک‌دقیقه‌ای، Refresh ساب کلاینت را روی کمترین بازه پشتیبانی‌شده تنظیم کن. url-test خودش مسیر حاضر را انتخاب می‌کند.</p></div></div><div class="guide-step"><strong>۳</strong><div><b>تست</b><p class="muted">نتیجه WSS پنل و تست داخل همان ISP را بررسی کن؛ Edge Ping معادل وضعیت اینترنت کاربر نیست.</p></div></div></div></div>';
    html += '<div class="card"><h2>Smart Pool و پایداری</h2><ul class="api"><li>∞ به معنی تولید نامحدود پنجره‌های جدید در طول زمان است؛ پاسخ واقعاً بی‌نهایت باعث مصرف حافظه و Crash کلاینت می‌شود.</li><li>Path و Token در چرخش خودکار ثابت می‌مانند تا اتصال‌های موجود عمداً شکسته نشوند.</li><li>همیشه مسیر Direct میان Anycastها حفظ می‌شود.</li><li>هیچ Worker، IP یا ISP بدون قطعی تضمین نمی‌شود؛ Custom Domain، بکاپ و Deploy دوم راهکار واقعی Failover هستند.</li></ul></div>';
    html += '<div class="card"><h2>اپ موبایل</h2><p class="muted">در تب «اپ موبایل» PWA را نصب، لینک‌ها را Share و Rotation را مانیتور کن. PWA مرورگر مجوز VpnService سیستم‌عامل ندارد؛ اتصال واقعی با کلاینت استاندارد انجام می‌شود.</p></div>';
    shell(html);
    var a = $('#easy');
    if (a && STATE.launch) a.href = STATE.launch.deployUrl;
  }

  function paint() {
    if (!STATE.me) { renderLogin(); return; }
    if (TAB === 'sell') viewSell();
    else if (TAB === 'iron') viewIron();
    else if (TAB === 'scan') viewScan();
    else if (TAB === 'app') viewApp();
    else if (TAB === 'recovery') viewRecovery();
    else if (TAB === 'settings') viewSettings();
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
      api('POST', '/api/get-settings', {}).then(function (d) { STATE.settings = d.settings || null; }).catch(function () {}),
      api('POST', '/api/capabilities', {}).then(function (d) { STATE.caps = d.capabilities || []; }).catch(function () {})
    ]).then(function () { paint(); });
  }

  function boot() {
    var requestedTab = new URLSearchParams(location.search).get('tab');
    if (['dash','sell','iron','scan','app','recovery','settings','caps','help'].indexOf(requestedTab) >= 0) TAB = requestedTab;
    registerPwa();
    api('GET', '/api/launch').then(function (d) { STATE.launch = d; }).catch(function () {}).finally(function () {
      api('GET', '/api/me').then(function (d) { render(d && d.me ? d.me : null); }).catch(function () { render(null); });
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) { event.preventDefault(); INSTALL_EVENT = event; });
  window.addEventListener('appinstalled', function () { INSTALL_EVENT = null; toast('AMINNOVA روی دستگاه نصب شد', true); });
  function updateNetworkState() {
    var badge = $('#network-state'); if (!badge) return;
    badge.className = 'status-dot' + (navigator.onLine ? '' : ' offline');
    badge.textContent = navigator.onLine ? 'آنلاین' : 'آفلاین';
  }
  window.addEventListener('online', updateNetworkState);
  window.addEventListener('offline', updateNetworkState);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
/*NOVA-UI-END*/
