/*NOVA-UI-START*/
(function () {
  'use strict';

  var APP = 'AMINNOVA';
  var EDITION = 'AMINNOVA — پنل فروش ساب AMINCK';
  var TAB = 'dash';
  var STATE = { me: null, users: [], stats: null, endpoints: [], probe: {}, settings: null, iron: null, clean: [], ironUser: '', launch: null, caps: [] };

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
    if (depA) depA.href = L.deployUrl || 'https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/IR-penalty-';
    if (repoA) repoA.href = L.repo || 'https://github.com/amingangmanatgh2-hash/IR-penalty-';
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
    html += '<div class="topbar"><button class="btn" id="theme-btn">' + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button></div>';
    html += '<div class="hero"><div class="mark">N</div><div><h1>AMINNOVA</h1><div class="sub">' + esc(EDITION) + '</div></div></div>';
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
    var tabs = [['dash', 'داشبورد'], ['sell', 'فروش / ویرایش'], ['iron', 'آهنین'], ['scan', 'پینگ'], ['recovery', 'بکاپ'], ['settings', 'تنظیمات'], ['caps', 'قابلیت‌ها'], ['help', 'راهنما']];
    var html = '<div class="wrap"><div class="topbar">';
    html += '<button class="btn" id="theme-btn">' + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button>';
    html += '<span class="badge">' + esc(me.role) + ' · ' + esc(me.username) + '</span>';
    html += '<button class="btn" id="logout-btn">خروج</button>';
    if (can(me, 'settings:manage')) html += '<button class="btn primary" id="hot-btn">آپدیت یک‌کلیکی</button>';
    html += '</div><div class="hero"><div class="mark">N</div><div><h1>' + esc(APP) + '</h1><div class="sub">Cloudflare Edge · ' + esc(location.host) + '</div></div></div>';
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
    html += '<div class="pill"><b>Auto</b><span>انتخاب Endpoint سالم</span></div></div>';
    html += '<div class="card" style="margin-top:16px"><h2>ساخت اتومات AMINNOVA</h2>';
    html += '<p class="muted">Endpointهای سالم و کم‌تاخیر Edge + نام AMINCK + تا ۲۰۰ مسیر در یک ساب. هیچ سرعت یا دسترسی روی همه ISPها تضمین نمی‌شود.</p>';
    html += '<label>نام ساب</label><input id="n" placeholder="VIP-علی" style="width:100%;margin-bottom:8px">';
    html += '<label>قالب نام کانفیگ</label><input id="tpl" value="{brand} AMINCK {profile} {index}" style="width:100%;margin-bottom:8px">';
    html += limRow('حجم بایت', 'lim-b') + limRow('ثانیه اعتبار', 'lim-s') + limRow('سقف اتصال', 'lim-c') + limRow('سقف درخواست ساب', 'lim-r');
    html += '<div class="grid"><div><label>تعداد ساب مستقل</label><select id="sub-count" style="width:100%">' + subscriptionOptions(1) + '</select></div>';
    html += '<div><label>تعداد کانفیگ داخل هر ساب</label><select id="paths" style="width:100%">' + pathOptions(5) + '</select></div></div>';
    html += '<label>تعداد کانفیگ آهنین برای ساب اول</label><select id="iron-n">' + ironOptions(3) + '</select> ';
    html += '<button class="btn primary" id="auto">ساخت اتومات ساب</button><div id="mk-out"></div></div>';
    shell(html);
    bindInf();
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
        limitBytes: numOrZero('lim-b'),
        limitSeconds: numOrZero('lim-s'),
        maxConnections: numOrZero('lim-c'),
        limitRequests: numOrZero('lim-r')
      };
      api('POST', '/api/probe', {}).catch(function () { return null; }).then(function () {
        return api('POST', '/api/auto-build', payload);
      }).then(function (d) {
        var subs = d.subscriptions || [{ name: d.user.name, token: d.user.token, subUrl: d.subUrl }];
        var out = '<div class="alert">' + esc(String(subs.length)) + ' ساب AMINCK آماده شد</div>';
        subs.forEach(function (sub, i) {
          var link = sub.subUrl || subLink(sub.token, '');
          out += '<div class="sub-result"><b>' + esc(sub.name) + '</b><div class="uri">' + esc(link) + '</div>';
          out += '<div class="row"><button class="btn" data-copy-url="' + esc(link) + '">کپی ساب</button>';
          out += '<button class="btn" data-copy-url="' + esc(sub.clashUrl || subLink(sub.token, 'clash')) + '">Clash</button>';
          out += '<button class="btn" data-copy-url="' + esc(sub.singboxUrl || subLink(sub.token, 'singbox')) + '">sing-box</button></div></div>';
        });
        (d.iron || []).forEach(function (p) {
          out += '<div class="card"><b>' + esc(p.name) + '</b> <span class="badge">' + esc(p.client) + '</span><div class="uri">' + esc(p.json) + '</div></div>';
        });
        $('#mk-out').innerHTML = out;
        document.querySelectorAll('[data-copy-url]').forEach(function (el) {
          el.onclick = function () { copyText(el.getAttribute('data-copy-url'), 'لینک'); };
        });
        toast(String(subs.length) + ' ساب ساخته شد', true);
        return loadUsers();
      }).catch(function (e) { toast(e.message); }).finally(function () {
        button.disabled = false; button.textContent = 'ساخت اتومات ساب';
      });
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
    html += '</tbody></table><p class="muted">این عدد HTTPS از Edge کلودفلر است، نه Ping اینترنت کاربر. نتیجه ISP کاربر می‌تواند متفاوت باشد.</p></div>';
    html += '<div class="card"><h2>مخزن کاندیدهای Anycast</h2><p class="muted">IP تمیز ثابت وجود ندارد؛ این فهرست خودکار داخل ساب تزریق نمی‌شود. از شبکه واقعی کاربر تست کنید.</p><div class="row">';
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
    var html = '<div class="card"><h2>مانیفست قابلیت‌ها (' + STATE.caps.length + ')</h2><ul class="api">';
    STATE.caps.forEach(function (c) {
      html += '<li><b>' + esc(c.title) + '</b> — ' + esc(c.description) + '</li>';
    });
    html += '</ul></div>';
    shell(html);
  }

  function viewHelp() {
    var html = '<div class="card"><h2>ستاپ راحت و امن</h2><p class="muted">از Deploy رسمی استفاده کنید. توکن Cloudflare فقط باید در Secretهای Cloudflare/GitHub باشد و این پنل هیچ‌وقت آن را دریافت نمی‌کند.</p>';
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
    api('GET', '/api/launch').then(function (d) { STATE.launch = d; }).catch(function () {}).finally(function () {
      api('GET', '/api/me').then(function (d) { render(d && d.me ? d.me : null); }).catch(function () { render(null); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
/*NOVA-UI-END*/
