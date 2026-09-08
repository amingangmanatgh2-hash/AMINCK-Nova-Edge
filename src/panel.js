// ═══════════════════════════════════════════════════════════════════
//  پنل تحت وب — ورود با رمز اجباری ۱۰ رقمی + مدیریت کامل گروه‌ها
//  مسیرها: /panel  و  /api/panel/*
// ═══════════════════════════════════════════════════════════════════
import { getSetting, setSetting, faDigits, fmtDate } from './db.js';
import { getSettingValue, isEnabled } from './texts.js';
import { html, json, isValidPanelPassword, randomPanelPassword, hmacSha256, toHex } from './util.js';
import { postAdToGroup, postAdsNow } from './group.js';
import { tg, send } from './tg.js';

const now = () => Math.floor(Date.now() / 1000);
const SESSION_TTL = 6 * 3600;

/** رمز فعلی پنل — اگر تنظیم نشده باشد، یک رمز ۱۰ رقمی ساخته و ذخیره می‌شود */
export async function ensurePanelPassword(db) {
  let pw = await getSetting(db, 'panel_password', '');
  if (!isValidPanelPassword(pw)) {
    pw = randomPanelPassword();
    await setSetting(db, 'panel_password', pw);
  }
  return pw;
}

async function makeToken(env, pw) {
  const sig = await hmacSha256(new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN || 'nova'), `panel:${pw}:${now()}`);
  const tok = toHex(sig).slice(0, 32);
  await env.KV.put(`panel_sess:${tok}`, String(now()), { expirationTtl: SESSION_TTL });
  return tok;
}

async function checkAuth(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/nova_panel=([a-f0-9]{32})/);
  const tok = m?.[1] || request.headers.get('X-Panel-Token') || '';
  if (!/^[a-f0-9]{32}$/.test(tok)) return false;
  const v = await env.KV.get(`panel_sess:${tok}`);
  return !!v;
}

// ─────────────────────────── API ───────────────────────────
export async function handlePanelApi(env, request, path) {
  const { DB } = env;

  if (path === '/api/panel/login') {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const given = String(body.password || '').trim();
    if (!isValidPanelPassword(given)) {
      return json({ ok: false, error: 'رمز باید دقیقاً ۱۰ رقم عددی باشد.' }, 400);
    }
    const real = await ensurePanelPassword(DB);
    if (given !== real) return json({ ok: false, error: 'رمز نادرست است.' }, 401);
    const tok = await makeToken(env, real);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `nova_panel=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`,
      },
    });
  }

  if (!(await checkAuth(env, request))) return json({ ok: false, error: 'unauthorized' }, 401);

  // ── وضعیت کلی ──
  if (path === '/api/panel/state') {
    const groups = (await DB.prepare('SELECT * FROM groups ORDER BY created_at DESC').all()).results;
    const stats = {
      users: (await DB.prepare('SELECT COUNT(*) c FROM users').first())?.c || 0,
      groups: groups.length,
      active: groups.filter((g) => g.enabled).length,
    };
    return json({
      ok: true,
      stats,
      settings: {
        group_ai_enabled: await isEnabled(DB, 'group_ai_enabled'),
        group_welcome_enabled: await isEnabled(DB, 'group_welcome_enabled'),
        ad_interval_hours: await getSettingValue(DB, 'ad_interval_hours'),
        ad_text: await getSettingValue(DB, 'ad_text'),
      },
      groups: groups.map((g) => ({
        chat_id: String(g.chat_id),
        title: g.title || String(g.chat_id),
        enabled: !!g.enabled,
        last_post: g.last_post ? fmtDate(g.last_post) : '—',
        created_at: g.created_at ? fmtDate(g.created_at) : '—',
      })),
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}
  const chatId = Number(body.chat_id);

  if (path === '/api/panel/group/add') {
    if (!chatId) return json({ ok: false, error: 'آیدی گروه معتبر نیست.' }, 400);
    let title = String(body.title || '').trim();
    if (!title) {
      const info = await tg(env.TELEGRAM_BOT_TOKEN, 'getChat', { chat_id: chatId });
      title = info?.result?.title || `گروه ${chatId}`;
    }
    await DB.prepare('INSERT OR REPLACE INTO groups (chat_id, title, enabled, created_at) VALUES (?,?,1,?)').bind(chatId, title, now()).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/group/toggle') {
    await DB.prepare('UPDATE groups SET enabled = 1 - enabled WHERE chat_id=?').bind(chatId).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/group/rename') {
    await DB.prepare('UPDATE groups SET title=? WHERE chat_id=?').bind(String(body.title || '').slice(0, 120), chatId).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/group/delete') {
    await DB.prepare('DELETE FROM groups WHERE chat_id=?').bind(chatId).run();
    return json({ ok: true });
  }

  if (path === '/api/panel/group/post') {
    const ok = await postAdToGroup(env, chatId);
    return json({ ok, error: ok ? undefined : 'ارسال ناموفق بود (بات در گروه عضو است؟).' });
  }

  if (path === '/api/panel/group/postall') {
    const n = await postAdsNow(env);
    return json({ ok: true, count: n });
  }

  if (path === '/api/panel/group/message') {
    const txt = String(body.text || '').trim();
    if (!txt) return json({ ok: false, error: 'متن خالی است.' }, 400);
    if (chatId) {
      const r = await send(env.TELEGRAM_BOT_TOKEN, chatId, txt);
      return json({ ok: !!r?.ok });
    }
    const gs = (await DB.prepare('SELECT chat_id FROM groups WHERE enabled=1').all()).results;
    let n = 0;
    for (const g of gs) {
      const r = await send(env.TELEGRAM_BOT_TOKEN, g.chat_id, txt);
      if (r?.ok) n++;
    }
    return json({ ok: true, count: n });
  }

  if (path === '/api/panel/settings') {
    const allowed = ['group_ai_enabled', 'group_welcome_enabled', 'ad_interval_hours', 'ad_text'];
    for (const k of allowed) {
      if (k in body) await setSetting(DB, k, String(body[k]));
    }
    return json({ ok: true });
  }

  if (path === '/api/panel/password') {
    const pw = String(body.password || '').trim();
    if (!isValidPanelPassword(pw)) return json({ ok: false, error: 'رمز جدید باید دقیقاً ۱۰ رقم عددی باشد.' }, 400);
    await setSetting(DB, 'panel_password', pw);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'not found' }, 404);
}

// ─────────────────────────── UI ───────────────────────────
export async function panelHtml(env) {
  if (!(await isEnabled(env.DB, 'panel_enabled'))) return html('<h3 dir="rtl">🚫 پنل تحت وب غیرفعال است.</h3>', 403);
  await ensurePanelPassword(env.DB);
  return html(PANEL_HTML);
}

const PANEL_HTML = `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMINCK Nova — پنل مدیریت</title>
<style>
:root{--bg:#0d1526;--card:#152037;--line:#243352;--gold:#f5b31e;--txt:#eaf1ff;--mut:#8fa3c8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font-family:Vazirmatn,Segoe UI,Tahoma,sans-serif}
.wrap{max-width:960px;margin:0 auto;padding:18px}
h1{font-size:20px;margin:6px 0 16px}h2{font-size:16px;margin:0 0 12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:16px}
input,textarea,select{width:100%;background:#0f1a2e;border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:11px;font-family:inherit;font-size:14px}
button{background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#171305;font-weight:800;border:0;border-radius:10px;padding:10px 16px;cursor:pointer;font-family:inherit;font-size:14px}
button.gh{background:#243352;color:var(--txt)}button.rd{background:#63223a;color:#ffd9e4}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.g{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;background:#0f1a2e}
.mut{color:var(--mut);font-size:12px}
.hint{color:var(--gold);font-size:12px;margin-top:6px}
.err{color:#ff8a9c;font-size:13px;min-height:18px}
.st{display:flex;gap:10px;flex-wrap:wrap}.st div{flex:1;min-width:110px;text-align:center;background:#0f1a2e;border:1px solid var(--line);border-radius:12px;padding:10px}
.st b{display:block;font-size:20px;color:var(--gold)}
label{display:block;margin:10px 0 4px;font-size:13px;color:var(--mut)}
.hidden{display:none}
</style></head><body><div class="wrap">

<div id="login" class="card">
  <h1>🔐 ورود به پنل AMINCK Nova</h1>
  <label>رمز عبور (دقیقاً ۱۰ رقم عددی)</label>
  <input id="pw" type="password" inputmode="numeric" maxlength="10" placeholder="۱۰ رقم عددی">
  <div class="hint">⚠️ رمز پنل الزاماً باید ۱۰ رقم عددی باشد. رمز اولیه از پنل تلگرام: تنظیمات → 🔐 رمز پنل وب</div>
  <div class="err" id="lerr"></div>
  <div class="row" style="margin-top:10px"><button onclick="login()">ورود</button></div>
</div>

<div id="app" class="hidden">
  <h1>⚡ پنل مدیریت گروه‌ها</h1>
  <div class="card"><div class="st">
    <div><b id="s_users">0</b><span class="mut">کاربر</span></div>
    <div><b id="s_groups">0</b><span class="mut">گروه</span></div>
    <div><b id="s_active">0</b><span class="mut">گروه فعال</span></div>
  </div></div>

  <div class="card">
    <h2>➕ افزودن گروه</h2>
    <div class="row"><input id="ng_id" placeholder="آیدی عددی گروه (مثل -1001234567890)" style="flex:2;min-width:200px">
    <input id="ng_title" placeholder="نام (اختیاری)" style="flex:1;min-width:140px">
    <button onclick="addGroup()">افزودن</button></div>
    <div class="hint">گروه‌هایی که بات در آن‌ها عضو شود، خودکار اینجا ثبت می‌شوند.</div>
  </div>

  <div class="card">
    <h2>📢 گروه‌ها</h2>
    <div id="groups"></div>
    <div class="row"><button onclick="postAll()">📣 پست تبلیغ در همه گروه‌ها</button>
    <button class="gh" onclick="load()">🔄 بروزرسانی</button></div>
  </div>

  <div class="card">
    <h2>✉️ ارسال پیام به گروه‌ها</h2>
    <textarea id="bmsg" rows="3" placeholder="متن پیام (HTML مجاز)"></textarea>
    <div class="row" style="margin-top:8px"><button onclick="bcast()">ارسال به همه گروه‌های فعال</button></div>
  </div>

  <div class="card">
    <h2>⚙️ تنظیمات گروه</h2>
    <label>🤖 هوش مصنوعی در گروه</label>
    <select id="ai_en"><option value="1">فعال</option><option value="0">غیرفعال</option></select>
    <label>👋 خوش‌آمدگویی به عضو جدید</label>
    <select id="wc_en"><option value="1">فعال</option><option value="0">غیرفعال</option></select>
    <label>⏰ فاصله پست تبلیغ (ساعت)</label>
    <input id="adh" type="number" min="1">
    <label>📢 متن تبلیغ</label>
    <textarea id="adt" rows="3"></textarea>
    <div class="row" style="margin-top:10px"><button onclick="saveSettings()">💾 ذخیره</button></div>
  </div>

  <div class="card">
    <h2>🔐 تغییر رمز پنل</h2>
    <input id="npw" inputmode="numeric" maxlength="10" placeholder="رمز جدید — دقیقاً ۱۰ رقم">
    <div class="hint">رمز باید دقیقاً ۱۰ رقم عددی باشد؛ در غیر این صورت ذخیره نمی‌شود.</div>
    <div class="err" id="perr"></div>
    <div class="row" style="margin-top:8px"><button onclick="chpw()">تغییر رمز</button></div>
  </div>
</div>

</div><script>
const $=(id)=>document.getElementById(id);
async function api(p,b){const r=await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});return r.json();}
async function login(){
  const pw=$('pw').value.trim();
  if(!/^[0-9]{10}$/.test(pw)){$('lerr').textContent='⛔ رمز باید دقیقاً ۱۰ رقم عددی باشد.';return;}
  const r=await api('/api/panel/login',{password:pw});
  if(!r.ok){$('lerr').textContent='⛔ '+(r.error||'خطا');return;}
  $('login').classList.add('hidden');$('app').classList.remove('hidden');load();
}
async function load(){
  const r=await api('/api/panel/state');
  if(!r.ok){$('app').classList.add('hidden');$('login').classList.remove('hidden');return;}
  $('s_users').textContent=r.stats.users;$('s_groups').textContent=r.stats.groups;$('s_active').textContent=r.stats.active;
  $('ai_en').value=r.settings.group_ai_enabled?'1':'0';
  $('wc_en').value=r.settings.group_welcome_enabled?'1':'0';
  $('adh').value=r.settings.ad_interval_hours;$('adt').value=r.settings.ad_text;
  $('groups').innerHTML=r.groups.length?r.groups.map(g=>
    '<div class="g"><b>'+(g.enabled?'🟢':'🔴')+' '+esc(g.title)+'</b>'+
    '<div class="mut">🆔 '+g.chat_id+' | آخرین پست: '+g.last_post+'</div>'+
    '<div class="row" style="margin-top:8px">'+
    '<button class="gh" onclick="act(\\'toggle\\',\\''+g.chat_id+'\\')">'+(g.enabled?'غیرفعال':'فعال')+'</button>'+
    '<button class="gh" onclick="act(\\'post\\',\\''+g.chat_id+'\\')">📣 پست فوری</button>'+
    '<button class="gh" onclick="rename(\\''+g.chat_id+'\\')">✏️ نام</button>'+
    '<button class="gh" onclick="msg(\\''+g.chat_id+'\\')">✉️ پیام</button>'+
    '<button class="rd" onclick="del(\\''+g.chat_id+'\\')">🗑 حذف</button></div></div>').join(''):'<div class="mut">هنوز گروهی ثبت نشده است.</div>';
}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
async function act(a,id){await api('/api/panel/group/'+a,{chat_id:id});load();}
async function addGroup(){const r=await api('/api/panel/group/add',{chat_id:$('ng_id').value.trim(),title:$('ng_title').value.trim()});if(!r.ok)alert(r.error||'خطا');$('ng_id').value='';$('ng_title').value='';load();}
async function rename(id){const t=prompt('نام جدید گروه:');if(t)await api('/api/panel/group/rename',{chat_id:id,title:t});load();}
async function del(id){if(confirm('حذف این گروه؟'))await api('/api/panel/group/delete',{chat_id:id});load();}
async function msg(id){const t=prompt('متن پیام به این گروه:');if(t){const r=await api('/api/panel/group/message',{chat_id:id,text:t});alert(r.ok?'✅ ارسال شد':'⛔ ناموفق');}}
async function postAll(){const r=await api('/api/panel/group/postall');alert('✅ ارسال شد به '+(r.count||0)+' گروه');load();}
async function bcast(){const t=$('bmsg').value.trim();if(!t)return;const r=await api('/api/panel/group/message',{text:t});alert('✅ ارسال به '+(r.count||0)+' گروه');$('bmsg').value='';}
async function saveSettings(){await api('/api/panel/settings',{group_ai_enabled:$('ai_en').value,group_welcome_enabled:$('wc_en').value,ad_interval_hours:$('adh').value,ad_text:$('adt').value});alert('💾 ذخیره شد');load();}
async function chpw(){const pw=$('npw').value.trim();if(!/^[0-9]{10}$/.test(pw)){$('perr').textContent='⛔ رمز باید دقیقاً ۱۰ رقم عددی باشد.';return;}const r=await api('/api/panel/password',{password:pw});$('perr').textContent=r.ok?'':'⛔ '+(r.error||'خطا');if(r.ok){alert('✅ رمز تغییر کرد');$('npw').value='';}}
$('pw').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
</script></body></html>`;
