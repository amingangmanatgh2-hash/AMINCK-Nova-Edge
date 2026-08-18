/*NOVA-UI-START*/
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
    html += '<div class="uri">POST ' + esc(base) + '/api/login\nContent-Type: application/json\n\n{\n  "username": "AMINCK",\n  "password": "<ADMIN_PASSWORD>"\n}</div>';
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
    html += '<div class="uri">{\n  "antiDetect": {\n    "pathPadding": true,\n    "pathJitter": true,\n    "fragment": true,\n    "hostCamouflage": true,\n    "multiPort": true\n  },\n  "fakeDomains": ["snaap.ir", "www.digikala.com"],\n  "tlsPorts": [443, 2053, 2083, 2087, 2096, 8443],\n  "speedPreset": "god",\n  "brand": "AMINCK GOD Edition"\n}</div>';
    html += '<div style="margin-top:12px"><button class="btn" id="copy-settings">کپی نمونه Settings</button></div>';
    html += '</div>';
    html += '<div class="card"><h2>آپدیت بدون قطعی دامنه</h2>';
    html += '<p class="muted">یک درخواست authenticated مسیرهای همهٔ مشترک‌ها را بازسازی می‌کند (generation++) بدون تغییر دامنهٔ Worker یا Custom Hostname.</p>';
    html += '<div class="uri">POST ' + esc(base) + '/api/hot-update\nCookie: nova_session=…\n\n{ "speedPreset": "god" }</div>';
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
      copyText('curl -X POST ' + base + '/api/login -H "content-type: application/json" -d "{\"username\":\"AMINCK\",\"password\":\"YOUR_PASSWORD\"}" -c cookies.txt', 'نمونه Login');
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
