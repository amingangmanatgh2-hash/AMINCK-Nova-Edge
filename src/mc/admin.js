// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — پنل ادمین شخصی مالک سرور
//
//  /mc/setup  → راه‌اندازی اولیه: رمز پنل (خالی، خودتان پر کنید)،
//               اسم سرور، آی‌پی/دامنه، پورت‌ها، روش OTP، درگاه، کارت.
//               بعد از اولین ذخیره → برند (لوگو/بنر/اسپلش) با Workers AI
//               بر اساس *اسمی که گذاشته‌اید* ساخته می‌شود.
//  /mc/admin  → داشبورد کامل (۱۹ بخش) + همهٔ APIها با نشست امضاشده.
// ═══════════════════════════════════════════════════════════════════
import { html, json, esc, clamp } from '../util.js';
import { page, navHtml, footerHtml, css, baseScript } from './theme.js';
import {
  mcGet, mcSet, mcNum, mcBool, sha256Hex, bridgeKey, ipKey, pushAlert, serverConfig,
  initMcDb, MC_SETTINGS_EDITABLE, recentMcAlerts,
} from './db.js';
import { publicStatus, runtimeConfig, handleBotDecide, handleBotTier, acTracker } from './bridge.js';
import { generateBrand, brandInfo, svgBrand, heuristicTheme, uploadAsset, paletteFromName } from './brand.js';
import { buildCatalog, shopStats, activeSeason, usdRate, rawCatalog } from './catalog.js';
import { mcGatewayConfig, mcCardConfig, receiptQueue, decideReceipt } from './orders.js';
import { otpConfig } from './auth.js';
import { addConfigs, listConfigs, checkAllConfigs, importFromUrl, configDto, parseConfigUri } from './freeconfigs.js';
import { listModes, listRanks, listCosmetics, SPECS } from '../../shared/engine/spec.js';
import { summarize } from '../../shared/engine/anticheat.js';
import { notifyAdmins } from '../notify.js';

const now = () => Math.floor(Date.now() / 1000);
const SESSION_TTL = 8 * 3600;

// ───────────────────────── نشست ادمین ─────────────────────────
export async function adminSession(db, request) {
  const auth = request.headers.get('Authorization') || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)nova_admin=([a-f0-9]{16,128})/);
    if (m) token = m[1];
  }
  if (!token) return null;
  const key = await sha256Hex(token);
  const row = await db.prepare('SELECT value FROM kv WHERE key=?').bind(`mc_admin_session:${key}`).first();
  if (!row?.value) return null;
  try {
    const s = JSON.parse(row.value);
    if (Number(s.exp) < now()) return null;
    return s;
  } catch {
    return null;
  }
}

async function createAdminSession(db, ip) {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  const token = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const key = await sha256Hex(token);
  await db.prepare('INSERT INTO kv (key,value,exp) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, exp=excluded.exp')
    .bind(`mc_admin_session:${key}`, JSON.stringify({ exp: now() + SESSION_TTL, ip: await ipKey(ip), created: now() }), now() + SESSION_TTL).run();
  return token;
}

export const adminCookie = (token) => `nova_admin=${token}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; SameSite=Lax; Secure`;

async function passwordOk(db, pass) {
  const stored = await mcGet(db, 'admin_password_hash', '');
  if (!stored) return false;
  const salt = await mcGet(db, 'admin_salt', '');
  const h = await sha256Hex(`${salt}|${pass}`);
  return h === stored;
}

async function setPassword(db, pass) {
  if (String(pass || '').length < 8) return { ok: false, error: 'رمز باید حداقل ۸ کاراکتر باشد' };
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  const salt = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  await mcSet(db, 'admin_salt', salt);
  await mcSet(db, 'admin_password_hash', await sha256Hex(`${salt}|${pass}`));
  await mcSet(db, 'admin_password_set_at', String(now()));
  return { ok: true };
}

// ───────────────────────── صفحهٔ راه‌اندازی ─────────────────────────
export async function setupPage(env, db, request) {
  await initMcDb(db);
  const cfg = await serverConfig(db);
  const done = cfg.setupDone;
  const key = await bridgeKey(db);
  const origin = new URL(request.url).origin;
  const body = `
  <div style="max-width:920px;margin:26px auto">
    <div class="glass card" style="border-color:#22d3ee44">
      <h1 style="margin-top:0">⚙️ راه‌اندازی پنل مالک</h1>
      <div class="small mut">این صفحه فقط برای شماست. مقادیر خالی را پر کنید؛ هیچ‌چیز از پیش تنظیم نشده و هیچ رمز پیش‌فرضی وجود ندارد.</div>
      ${done ? '<div class="badge ok" style="margin-top:10px">✅ راه‌اندازی اولیه انجام شده — می‌توانید همین‌جا ویرایش کنید</div>' : '<div class="badge warn" style="margin-top:10px">⚠️ هنوز راه‌اندازی نشده</div>'}
      <div class="divider"></div>
      <div class="grid g2">
        <div>
          <label>🔑 رمز پنل ادمین ${done ? '(برای تغییر)' : '(اجباری)'}</label>
          <input id="adminPass" type="password" placeholder="حداقل ۸ کاراکتر — خالی بگذارید یعنی تغییر نکند" autocomplete="new-password">
          <label>🏷 اسم سرور</label>
          <input id="serverName" value="${esc(cfg.name)}" placeholder="مثلاً Nova Edge">
          <label>✨ توضیح کوتاه (تگ‌لاین)</label>
          <input id="tagline" value="${esc(cfg.tagline)}">
          <label>🌐 آی‌پی / دامنهٔ سرور</label>
          <input id="address" value="${esc(cfg.address)}" placeholder="play.example.com">
          <div class="grid g2">
            <div><label>☕ پورت Java</label><input id="portJava" type="number" value="${cfg.portJava}"></div>
            <div><label>📱 پورت Bedrock</label><input id="portBedrock" type="number" value="${cfg.portBedrock}"></div>
          </div>
          <label>🎨 سبک بصری برند (برای تولید لوگو با AI)</label>
          <input id="brandStyle" value="${esc(await mcGet(db, 'brand_style', 'cartoon pixel-art minecraft, vibrant, epic'))}">
          <label>📝 پرامپت اختصاصی لوگو (اختیاری — خالی = از روی اسم سرور ساخته می‌شود)</label>
          <textarea id="brandPrompt" rows="2" placeholder="مثلاً: اژدهای پیکسلی روی قلعهٔ ووکسلی با نور طلایی"></textarea>
        </div>
        <div>
          <label>📲 روش ارسال کد احراز هویت (OTP)</label>
          <select id="otpProvider">
            <option value="dev">حالت تست (کد در پاسخ نمایش داده می‌شود)</option>
            <option value="sms">سرویس پیامکی (REST)</option>
            <option value="telegram">ربات تلگرام</option>
          </select>
          <label>آدرس API پیامک</label><input id="smsUrl" placeholder="https://api.kavenegar.com/v1/{key}/verify/lookup.json">
          <label>کلید/توکن پیامک</label><input id="smsKey" type="password">
          <label>بدنهٔ درخواست ({phone} و {code} جایگذاری می‌شوند)</label>
          <textarea id="smsBody" rows="2" placeholder='{"receptor":"{phone}","token":"{code}","template":"nova-otp"}'></textarea>
          <label>آیدی چت تلگرام برای کد/هشدارها</label><input id="tgChat" placeholder="مثلاً 123456789">
          <div class="divider"></div>
          <label>🏦 درگاه پرداخت</label>
          <select id="gwProvider"><option value="zarinpal">زرین‌پال</option><option value="idpay">آی‌دی‌پی</option><option value="custom">قالب دلخواه</option></select>
          <label>مرچنت آیدی / شناسه</label><input id="gwMerchant" placeholder="xxxxxxxx-xxxx-...">
          <label>API Key (برای IDPay)</label><input id="gwKey" type="password">
          <label>آدرس API (اختیاری — پیش‌فرض رسمی)</label><input id="gwUrl" placeholder="https://api.zarinpal.com/pg/v4/payment/request.json">
          <div class="row"><label style="margin:0"><input type="checkbox" id="gwEnabled" style="width:auto"> فعال</label></div>
          <div class="divider"></div>
          <label>🏧 کارت‌به‌کارت</label>
          <input id="cardNumber" placeholder="۱۶ رقم شمارهٔ کارت (خالی = غیرفعال)">
          <input id="cardHolder" placeholder="به نام" style="margin-top:8px">
          <input id="cardBank" placeholder="نام بانک" style="margin-top:8px">
          <div class="row" style="margin-top:8px"><label style="margin:0"><input type="checkbox" id="cardEnabled" style="width:auto"> فعال</label>
          <label style="margin:0"><input type="checkbox" id="cardAuto" style="width:auto"> تأیید خودکار فیش معتبر (توصیه نمی‌شود)</label></div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="row">
        <button class="btn pri" id="save">💾 ذخیرهٔ تنظیمات</button>
        <button class="btn gold" id="brand">🎨 ساخت لوگو/بنر با AI از روی اسم سرور</button>
        <a class="btn ghost" href="/mc/admin">ورود به داشبورد</a>
        <a class="btn ghost" href="/">دیدن سایت</a>
      </div>
      <div class="small mut" id="msg" style="margin-top:12px"></div>
      <div class="divider"></div>
      <h3>🔌 کلید پل (Bridge Key) — برای پلاگین سرور بازی</h3>
      <div class="row"><code class="mono" style="font-size:14px;word-break:break-all">${esc(key)}</code>
        <button class="btn sm ghost" data-copy="${esc(key)}">کپی</button>
        <button class="btn sm ghost" id="rotate">چرخش کلید</button></div>
      <div class="small mut">این کلید را در <span class="mono">plugins/NovaEdge/config.yml</span> هر دو سرور (Paper و PocketMine) بگذارید. بدون آن، پلاگین نمی‌تواند وضعیت/مچ/بات‌ها را همگام کند.</div>
      <div class="small mut" style="margin-top:6px">آدرس ورکر: <span class="mono">${esc(origin)}</span></div>
    </div>
  </div>
  <script>
  const $=id=>document.getElementById(id);
  async function load(){const r=await api('/api/mc/setup/state');if(!r.data)return;const s=r.data;
    $('otpProvider').value=s.otp_provider||'dev';$('smsUrl').value=s.otp_sms_api_url||'';$('smsKey').value='';$('smsBody').value=s.otp_sms_body||'';
    $('tgChat').value=s.otp_tg_chat_id||'';$('gwProvider').value=s.gateway_provider||'zarinpal';$('gwMerchant').value=s.gateway_merchant_id||'';
    $('gwUrl').value=s.gateway_url||'';$('gwEnabled').checked=s.gateway_enabled==='1';$('cardNumber').value=s.card_number||'';
    $('cardHolder').value=s.card_holder||'';$('cardBank').value=s.card_bank||'';$('cardEnabled').checked=s.card_enabled!=='0';$('cardAuto').checked=s.card_auto_verify==='1';
    $('brandStyle').value=s.brand_style||'cartoon pixel-art minecraft, vibrant, epic';$('brandPrompt').value=s.brand_prompt||'';}
  load();
  const msg=(t,ok=true)=>{$('msg').innerHTML='<span style="color:'+(ok?'#86efac':'#fca5a5')+'">'+t+'</span>'};
  $('save').onclick=async()=>{
    const payload={admin_password:$('adminPass').value,server_name:$('serverName').value,server_tagline:$('tagline').value,
      server_address:$('address').value,server_port_java:$('portJava').value,server_port_bedrock:$('portBedrock').value,
      brand_style:$('brandStyle').value,brand_prompt:$('brandPrompt').value,
      otp_provider:$('otpProvider').value,otp_sms_api_url:$('smsUrl').value,otp_sms_api_key:$('smsKey').value,otp_sms_body:$('smsBody').value,
      otp_tg_chat_id:$('tgChat').value,gateway_provider:$('gwProvider').value,gateway_merchant_id:$('gwMerchant').value,
      gateway_api_key:$('gwKey').value,gateway_url:$('gwUrl').value,gateway_enabled:$('gwEnabled').checked?'1':'0',
      card_number:$('cardNumber').value,card_holder:$('cardHolder').value,card_bank:$('cardBank').value,
      card_enabled:$('cardEnabled').checked?'1':'0',card_auto_verify:$('cardAuto').checked?'1':'0'};
    const r=await api('/api/mc/setup/save',{method:'POST',body:JSON.stringify(payload)});
    msg(r.ok?(r.data.message||'ذخیره شد ✅'):(r.data.error||'خطا'),r.ok);
    if(r.ok&&r.data.session){document.cookie='nova_admin='+r.data.session+';path=/;samesite=lax'}
  };
  $('brand').onclick=async()=>{msg('در حال ساخت برند با AI… ممکن است ۲۰ تا ۶۰ ثانیه طول بکشد ⏳');
    const r=await api('/api/mc/setup/brand',{method:'POST',body:JSON.stringify({name:$('serverName').value,prompt:$('brandPrompt').value,style:$('brandStyle').value})});
    msg(r.ok?('برند ساخته شد ✅ '+((r.data.saved||[]).map(s=>s.key).join('، ')||'')):(r.data.error||'خطا'),r.ok);};
  $('rotate').onclick=async()=>{const r=await api('/api/mc/setup/rotate-key',{method:'POST',body:'{}'});if(r.ok)location.reload()};
  </script>`;
  return html(page({ title: 'راه‌اندازی — Nova Edge', body, nav: navHtml({ name: cfg.name, active: '/mc/admin' }), footerHtml: footerHtml({ name: cfg.name }) }));
}

export async function handleSetupApi(env, db, request, action, session = null) {
  const body = await readJson(request);

  // 🔒 بعد از راه‌اندازی اولیه، هیچ‌کدام از این APIها بدون نشست ادمین کار نمی‌کنند.
  //    (وگرنه هر کسی می‌توانست اسم سرور/کارت/کانفیگ را عوض کند.)
  const setupDone = (await mcGet(db, 'setup_done', '')) === '1';
  if (setupDone && !session) {
    return json({ ok: false, error: 'راه‌اندازی قبلاً انجام شده است. برای تغییر تنظیمات وارد پنل مالک شوید (/mc/admin).', need_login: true, redirect: '/mc/admin' }, 401);
  }
  if (action === 'state') {
    const cfg = await serverConfig(db);
    const s = {};
    for (const k of ['otp_provider', 'otp_sms_api_url', 'otp_sms_body', 'otp_tg_chat_id', 'gateway_provider', 'gateway_merchant_id', 'gateway_url', 'gateway_enabled', 'card_number', 'card_holder', 'card_bank', 'card_enabled', 'card_auto_verify', 'brand_style', 'brand_prompt', 'brand_theme']) {
      s[k] = await mcGet(db, k, '');
    }
    return json({ ok: true, ...s, setup_done: cfg.setupDone, brand_done: cfg.brandDone });
  }
  if (action === 'save') {
    const out = [];
    const pass = String(body.admin_password || '');
    if (pass) {
      const r = await setPassword(db, pass);
      if (!r.ok) return json(r, 400);
      out.push('رمز پنل تنظیم شد');
    } else if (!(await mcGet(db, 'admin_password_hash', ''))) {
      return json({ ok: false, error: 'برای راه‌اندازی اولیه، رمز پنل الزامی است' }, 400);
    }
    const allowed = new Set([...MC_SETTINGS_EDITABLE, 'brand_prompt', 'brand_style']);
    for (const [k, v] of Object.entries(body)) {
      if (k === 'admin_password' || !allowed.has(k)) continue;
      if (k === 'gateway_api_key' || k === 'otp_sms_api_key') {
        if (String(v || '').trim()) await mcSet(db, k, String(v).trim());
        continue;
      }
      await mcSet(db, k, String(v ?? '').slice(0, 500));
    }
    await mcSet(db, 'setup_done', '1');
    await pushAlert(db, 'setup', 'تنظیمات پنل مالک ذخیره شد', 1);
    const token = await createAdminSession(db, clientIp(request));
    return json({ ok: true, message: `ذخیره شد ✅ ${out.join(' • ')}`, session: token });
  }
  if (action === 'brand') {
    const name = String(body.name || (await mcGet(db, 'server_name', 'Nova Edge')));
    if (body.name) await mcSet(db, 'server_name', name.slice(0, 60));
    if (body.prompt) await mcSet(db, 'brand_prompt', String(body.prompt).slice(0, 500));
    if (body.style) await mcSet(db, 'brand_style', String(body.style).slice(0, 300));
    const res = await generateBrand(env, db, { name, prompt: body.prompt ? String(body.prompt) : undefined, style: body.style });
    return json({ ok: res.ok, ...res, error: res.ok ? undefined : 'تولید تصویر با AI ناموفق بود (بایندینگ AI یا سهمیه را بررسی کنید). برند جایگزین SVG فعال شد.' }, res.ok ? 200 : 200);
  }
  if (action === 'rotate-key') {
    const b = new Uint8Array(24);
    crypto.getRandomValues(b);
    const k = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    await mcSet(db, 'bridge_key', k);
    await pushAlert(db, 'bridge_key', 'کلید پل چرخش یافت', 2);
    return json({ ok: true, key: k });
  }
  return json({ ok: false, error: 'action نامعتبر' }, 400);
}

// ───────────────────────── ورود ادمین ─────────────────────────
export async function adminPage(env, db, request, session) {
  const cfg = await serverConfig(db);
  const hasPass = !!(await mcGet(db, 'admin_password_hash', ''));
  if (!session) {
    const body = `<div style="max-width:430px;margin:70px auto"><div class="glass card">
      <h2 style="margin-top:0">🔒 ورود به پنل مالک</h2>
      ${hasPass ? '' : '<div class="badge warn">رمز تعیین نشده — ابتدا به <a href="/mc/setup">/mc/setup</a> بروید</div>'}
      <label>رمز پنل</label><input id="pass" type="password" autocomplete="current-password">
      <div class="row" style="margin-top:14px"><button class="btn pri" id="go">ورود</button><a class="btn ghost" href="/">بازگشت به سایت</a></div>
      <div class="small mut" id="msg" style="margin-top:10px"></div>
      <div class="small mut" style="margin-top:14px">۵ تلاش ناموفق = ۱۵ دقیقه قفل.</div>
    </div></div>
    <script>const $=id=>document.getElementById(id);
    $('go').onclick=async()=>{const r=await api('/api/mc/admin/login',{method:'POST',body:JSON.stringify({password:$('pass').value})});
      if(r.ok){document.cookie='nova_admin='+r.data.token+';path=/;samesite=lax';location.href='/mc/admin'}
      else $('msg').innerHTML='<span style="color:#fca5a5">'+(r.data.error||'ورود ناموفق')+'</span>'};
    $('pass').addEventListener('keydown',e=>{if(e.key==='Enter')$('go').click()});</script>`;
    return html(page({ title: 'ورود پنل', body, nav: navHtml({ name: cfg.name, active: '/mc/admin' }), footerHtml: footerHtml({ name: cfg.name }) }));
  }
  return html(page({
    title: 'داشبورد مالک',
    body: dashboardShell(cfg),
    nav: navHtml({ name: cfg.name, active: '/mc/admin' }),
    footerHtml: footerHtml({ name: cfg.name }),
    head: `<style>${dashCss}</style>`,
  }));
}

const dashCss = `
.side{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
.side a{padding:8px 13px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);font-size:13.5px;color:var(--txt);cursor:pointer}
.side a.on{background:linear-gradient(135deg,var(--pri),var(--sec));color:#060912;font-weight:800;border-color:transparent}
.panel{display:none}.panel.on{display:block}
.stat{padding:14px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04)}
.stat b{font-size:23px;display:block}
.kv{display:grid;grid-template-columns:210px 1fr;gap:10px;align-items:center}
.kv label{margin:0}
pre.code{background:#070b14;border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto;font-size:12.5px;direction:ltr;text-align:left}
.pill{padding:2px 8px;border-radius:999px;font-size:11.5px;border:1px solid var(--line)}
`;

const TABS = [
  ['overview', '📊 داشبورد'],
  ['servers', '🖥 سرورها'],
  ['players', '👥 بازیکنان'],
  ['matches', '🎮 مچ‌ها'],
  ['bots', '🤖 بات‌ها و AI'],
  ['shop', '🛍 فروشگاه'],
  ['orders', '🧾 سفارش‌ها'],
  ['receipts', '💳 فیش‌ها'],
  ['fraud', '🚨 تقلب'],
  ['gateway', '🏦 درگاه'],
  ['card', '🏧 کارت‌به‌کارت'],
  ['otp', '📲 احراز هویت'],
  ['configs', '🛰 کانفیگ‌ها'],
  ['brand', '🎨 برندینگ'],
  ['anticheat', '🛡 آنتی‌چیت'],
  ['reports', '🚩 گزارش‌ها'],
  ['season', '🎉 ایونت فصلی'],
  ['settings', '⚙️ تنظیمات'],
  ['api', '🔌 API و کلیدها'],
];

function dashboardShell(cfg) {
  return `<div class="wrap">
  <div class="between" style="margin-top:22px">
    <div><h1 style="margin:0">🎛 داشبورد مالک — ${esc(cfg.name)}</h1>
    <div class="small mut">همه‌چیز از یک صفحه: سرور، بازیکنان، بات‌های AI، فروشگاه، پرداخت، احراز هویت، کانفیگ‌ها و برند.</div></div>
    <div class="row"><a class="btn ghost sm" href="/">سایت</a><a class="btn ghost sm" href="/mc/setup">راه‌اندازی</a><button class="btn ghost sm" id="logout">خروج</button></div>
  </div>
  <div class="side" id="side">${TABS.map(([k, l], i) => `<a data-tab="${k}" class="${i === 0 ? 'on' : ''}">${l}</a>`).join('')}</div>
  <div id="panels">${TABS.map(([k], i) => `<div class="panel ${i === 0 ? 'on' : ''}" id="p-${k}"><div class="glass card"><div class="mut">در حال بارگذاری…</div></div></div>`).join('')}</div>
</div>
<script src="/mc/admin.js"></script>`;
}

// ───────────────────────── دادهٔ داشبورد ─────────────────────────
export async function adminState(env, db) {
  const st = await publicStatus(db);
  const shop = await shopStats(db);
  const rate = await usdRate(env);
  const cfg = await serverConfig(db);
  const alerts = await recentMcAlerts(db, 25);
  const players = await db.prepare('SELECT COUNT(*) c FROM mc_players').first();
  const banned = await db.prepare('SELECT COUNT(*) c FROM mc_players WHERE banned=1').first();
  const verified = await db.prepare('SELECT COUNT(*) c FROM mc_auth WHERE verified=1').first();
  const fraudOpen = await db.prepare("SELECT COUNT(*) c FROM mc_fraud WHERE status='open'").first();
  const receipts = await db.prepare("SELECT COUNT(*) c FROM mc_receipts WHERE status='pending'").first();
  const ordersPending = await db.prepare("SELECT COUNT(*) c FROM mc_orders WHERE status IN ('pending','manual')").first();
  const tiers = await db.prepare("SELECT tier_end t, COUNT(*) c, SUM(ai_calls) ai, SUM(bots) b FROM mc_matches WHERE ended_at>? GROUP BY tier_end").bind(now() - 7 * 86400).all();
  const grants = await db.prepare("SELECT COUNT(*) c FROM mc_grants WHERE status='pending'").first();
  return {
    ok: true,
    config: cfg,
    status: st,
    shop,
    rate,
    alerts,
    counters: {
      players: Number(players?.c) || 0,
      banned: Number(banned?.c) || 0,
      verified_phones: Number(verified?.c) || 0,
      fraud_open: Number(fraudOpen?.c) || 0,
      receipts_pending: Number(receipts?.c) || 0,
      orders_open: Number(ordersPending?.c) || 0,
      grants_pending: Number(grants?.c) || 0,
    },
    bot_tiers_7d: (tiers.results || []).map((r) => ({ tier: r.t || '—', matches: r.c, ai_calls: r.ai || 0, bots: r.b || 0 })),
    runtime: await runtimeConfig(db),
    anticheat: summarize(acTracker()),
    tabs: TABS.map((t) => t[0]),
  };
}

// ───────────────────────── API ادمین ─────────────────────────
export async function handleAdminApi(env, db, request, url, session) {
  const action = url.pathname.replace('/api/mc/admin/', '');
  const body = await readJson(request);
  const cfg = await serverConfig(db);

  if (action === 'login') {
    const lock = await db.prepare("SELECT value FROM kv WHERE key='mc_admin_lock'").first();
    if (lock?.value && Number(JSON.parse(lock.value).until) > now()) {
      return json({ ok: false, error: `پنل قفل است — ${Math.ceil((JSON.parse(lock.value).until - now()) / 60)} دقیقهٔ دیگر` }, 429);
    }
    const ok = await passwordOk(db, String(body.password || ''));
    if (!ok) {
      const fails = Number(JSON.parse(lock?.value || '{}').fails || 0) + 1;
      const until = fails >= 5 ? now() + 900 : 0;
      await db.prepare("INSERT INTO kv (key,value,exp) VALUES ('mc_admin_lock',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, exp=excluded.value")
        .bind(JSON.stringify({ fails, until }), until || now() + 900).run();
      await pushAlert(db, 'login_failed', `تلاش ناموفق ورود به پنل (${fails}) از ${await ipKey(clientIp(request))}`, fails >= 3 ? 3 : 1);
      return json({ ok: false, error: 'رمز اشتباه است' }, 401);
    }
    await db.prepare("DELETE FROM kv WHERE key='mc_admin_lock'").run();
    const token = await createAdminSession(db, clientIp(request));
    await pushAlert(db, 'login', 'ورود موفق به پنل مالک', 1);
    return json({ ok: true, token });
  }

  if (!session) return json({ ok: false, error: 'نشست ادمین معتبر نیست' }, 401);

  switch (action) {
    case 'state':
      return json(await adminState(env, db));

    case 'logout': {
      const m = (request.headers.get('Cookie') || '').match(/nova_admin=([a-f0-9]+)/);
      if (m) await db.prepare('DELETE FROM kv WHERE key=?').bind(`mc_admin_session:${await sha256Hex(m[1])}`).run();
      return json({ ok: true });
    }

    case 'settings': {
      const allowed = new Set(MC_SETTINGS_EDITABLE);
      let n = 0;
      for (const [k, v] of Object.entries(body.settings || {})) {
        if (!allowed.has(k)) continue;
        await mcSet(db, k, String(v ?? '').slice(0, 600));
        n++;
      }
      await pushAlert(db, 'settings', `${n} تنظیم به‌روز شد`, 1);
      const out = {};
      for (const k of MC_SETTINGS_EDITABLE) out[k] = await mcGet(db, k, '');
      return json({ ok: true, saved: n, settings: out });
    }

    case 'players': {
      const q = String(body.q || '').trim();
      const sql = q
        ? 'SELECT * FROM mc_players WHERE username_lc LIKE ? ORDER BY rating DESC LIMIT 60'
        : 'SELECT * FROM mc_players ORDER BY last_seen DESC LIMIT 60';
      const rows = await db.prepare(sql).bind(...(q ? [`%${q.toLowerCase()}%`] : [])).all();
      return json({ ok: true, players: (rows.results || []).map((p) => ({ ...p, cosmetics: safeArr(p.cosmetics), rating_modes: safeObj(p.rating_modes) })) });
    }

    case 'player_update': {
      const id = String(body.id || '');
      const p = await db.prepare('SELECT * FROM mc_players WHERE id=?').bind(id).first();
      if (!p) return json({ ok: false, error: 'بازیکن پیدا نشد' }, 404);
      const fields = [];
      const args = [];
      for (const [k, col] of [['coins', 'coins'], ['gems', 'gems'], ['rating', 'rating'], ['rp', 'rp'], ['level', 'level'], ['xp', 'xp']]) {
        if (body[k] !== undefined) {
          fields.push(`${col}=?`);
          args.push(Math.round(Number(body[k]) || 0));
        }
      }
      if (body.rank_id && listRanks().some((r) => r.id === body.rank_id)) {
        fields.push('rank_bought=?');
        args.push(body.rank_id);
      }
      if (body.banned !== undefined) {
        fields.push('banned=?', 'ban_reason=?', 'ban_until=?');
        args.push(body.banned ? 1 : 0, String(body.ban_reason || '').slice(0, 120), Number(body.ban_until) || 0);
      }
      if (body.cosmetics) {
        fields.push('cosmetics=?');
        args.push(JSON.stringify(Array.isArray(body.cosmetics) ? body.cosmetics.slice(0, 200) : []).slice(0, 3000));
      }
      if (!fields.length) return json({ ok: false, error: 'تغییری داده نشد' }, 400);
      args.push(id);
      await db.prepare(`UPDATE mc_players SET ${fields.join(', ')} WHERE id=?`).bind(...args).run();
      await pushAlert(db, 'player_update', `${p.username}: ${fields.length} فیلد توسط ادمین تغییر کرد`, 2);
      return json({ ok: true, player: await db.prepare('SELECT * FROM mc_players WHERE id=?').bind(id).first() });
    }

    case 'grant': {
      const username = String(body.username || '').trim();
      if (!username) return json({ ok: false, error: 'نام کاربری لازم است' }, 400);
      await db.prepare('INSERT INTO mc_grants (player_key, username, item_id, type, payload, status, order_ref, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(`name:${username.toLowerCase()}`, username, String(body.item_id || 'manual'), String(body.type || 'custom'), JSON.stringify(body.payload || {}).slice(0, 900), 'pending', 'admin-grant', now()).run();
      await pushAlert(db, 'grant', `گرانت دستی ${body.type} → ${username}`, 1);
      return json({ ok: true, message: 'در صف تحویل قرار گرفت (اولین اتصال بازیکن)' });
    }

    case 'matches': {
      const rows = await db.prepare('SELECT * FROM mc_matches ORDER BY ended_at DESC LIMIT ?').bind(Number(body.limit) || 40).all();
      const out = [];
      for (const m of rows.results || []) {
        const ps = await db.prepare('SELECT player_id, is_bot, points, elo_delta, won, mvp, placement, kills, deaths FROM mc_match_players WHERE match_id=? LIMIT 40').bind(m.id).all();
        out.push({ ...m, players: (ps.results || []).map((x) => ({ ...x, username: x.is_bot ? '(bot)' : x.player_id })) });
      }
      return json({ ok: true, matches: out });
    }

    case 'orders': {
      const status = body.status || '';
      const rows = await db.prepare(`SELECT * FROM mc_orders ${status ? 'WHERE status=?' : ''} ORDER BY id DESC LIMIT 80`).bind(...(status ? [status] : [])).all();
      return json({ ok: true, orders: rows.results || [] });
    }

    case 'order_update': {
      const id = Number(body.id);
      const status = ['paid', 'rejected', 'cancelled', 'manual', 'pending'].includes(body.status) ? body.status : null;
      if (!id || !status) return json({ ok: false, error: 'id/status نامعتبر' }, 400);
      const o = await db.prepare('SELECT * FROM mc_orders WHERE id=?').bind(id).first();
      if (!o) return json({ ok: false, error: 'سفارش پیدا نشد' }, 404);
      await db.prepare('UPDATE mc_orders SET status=?, paid_at=? WHERE id=?').bind(status, status === 'paid' ? now() : o.paid_at, id).run();
      if (status === 'paid') {
        const { fulfillOrder } = await import('./orders.js');
        await fulfillOrder(env, db, { ...o, status }, { method: o.method, provider: 'admin' });
      }
      await pushAlert(db, 'order_update', `${o.ref} → ${status} توسط ادمین`, 2);
      return json({ ok: true });
    }

    case 'receipts':
      return json({ ok: true, receipts: await receiptQueue(db, body.status || 'pending', 40), all: await receiptQueue(db, 'approved', 20), rejected: await receiptQueue(db, 'rejected', 20) });

    case 'receipt_decide': {
      const r = await decideReceipt(env, db, body.id, body.decision === 'approve' ? 'approve' : 'reject', 'admin');
      return json(r.ok ? { ok: true, ...r } : r, r.ok ? 200 : 400);
    }

    case 'receipt_image': {
      const r = await db.prepare('SELECT * FROM mc_receipts WHERE id=?').bind(Number(body.id)).first();
      if (!r) return json({ ok: false, error: 'پیدا نشد' }, 404);
      return json({ ok: true, ai: safeObj(r.ai_json), reasons: safeArr(r.ai_reasons), verdict: r.ai_verdict, status: r.status, sha: r.sha256.slice(0, 16), bytes: r.bytes });
    }

    case 'fraud': {
      const rows = await db.prepare('SELECT * FROM mc_fraud ORDER BY (status=\'open\') DESC, severity DESC, id DESC LIMIT 60').all();
      return json({ ok: true, items: (rows.results || []).map((f) => ({ ...f, detail: safeObj(f.detail) })) });
    }

    case 'fraud_resolve':
      await db.prepare('UPDATE mc_fraud SET status=? WHERE id=?').bind(body.status === 'dismiss' ? 'dismissed' : 'resolved', Number(body.id)).run();
      return json({ ok: true });

    case 'configs':
      {
        const free = await listConfigs(db, { tier: 'free', activeOnly: false });
        const special = await listConfigs(db, { tier: 'special', activeOnly: false });
        return json({ ok: true, configs: [...free, ...special] });
      }

    case 'config_add': {
      const r = await addConfigs(db, { text: body.text || body.uri || '', tier: body.tier || 'free', country: body.country || '', unlimited: body.unlimited === false ? 0 : 1, note: body.note || '' });
      return json(r, r.ok ? 200 : 400);
    }

    case 'config_import': {
      const r = await importFromUrl(db, body.url, { tier: body.tier || 'free', country: body.country || '' });
      return json(r, r.ok ? 200 : 400);
    }

    case 'config_toggle':
      await db.prepare('UPDATE mc_configs SET active=?, healthy=? WHERE id=?').bind(body.active ? 1 : 0, body.healthy === undefined ? 1 : body.healthy ? 1 : 0, Number(body.id)).run();
      return json({ ok: true });

    case 'config_delete':
      await db.prepare('DELETE FROM mc_configs WHERE id=?').bind(Number(body.id)).run();
      return json({ ok: true });

    case 'config_check':
      return json({ ok: true, results: await checkAllConfigs(db, 15) });

    case 'brand':
      return json({ ok: true, info: await brandInfo(db), fallback_preview: svgBrand(cfg.name, safeObj(await mcGet(db, 'brand_theme', ''))), palette: paletteFromName(cfg.name) });

    case 'brand_generate': {
      const res = await generateBrand(env, db, { name: body.name || cfg.name, prompt: body.prompt || undefined, style: body.style || undefined });
      return json({ ok: res.ok, saved: res.saved, theme: res.theme, error: res.ok ? undefined : 'AI در دسترس نبود یا سهمیه تمام شد — برند SVG جایگزین فعال است' });
    }

    case 'brand_upload': {
      const r = await uploadAsset(db, String(body.key || 'logo'), String(body.data_b64 || ''), String(body.mime || 'image/png'));
      return json(r, r.ok ? 200 : 400);
    }

    case 'bots': {
      const modes = listModes().map((m) => ({ id: m.id, name_fa: m.name_fa, cap: m.bot?.llm_interval_sec }));
      return json({
        ok: true,
        tiers: SPECS.tiers.tiers,
        models: SPECS.tiers.models,
        escalation: SPECS.tiers.escalation,
        humanization: SPECS.tiers.humanization,
        cost_guard: SPECS.tiers.cost_guard,
        modes,
        settings: {
          bot_llm_enabled: await mcBool(db, 'bot_llm_enabled', true),
          bot_tier_offset: await mcNum(db, 'bot_tier_offset', 0),
          bot_max_tier: await mcGet(db, 'bot_max_tier', 'T4'),
          bot_force_tier: await mcGet(db, 'bot_force_tier', ''),
          bot_model_override: await mcGet(db, 'bot_model_override', ''),
          bot_names_visible: await mcBool(db, 'bot_names_visible', true),
        },
        usage_7d: (await db.prepare('SELECT SUM(ai_calls) ai, COUNT(*) c, AVG(ai_latency_ms) l FROM mc_matches WHERE ended_at>?').bind(now() - 7 * 86400).first()),
      });
    }

    case 'bot_simulate': {
      // شبیه‌ساز: با پروفایل‌های داده‌شده سطح را حساب کن و یک تصمیم بگیر
      const players = Array.isArray(body.players) ? body.players : [];
      const mode = body.mode || 'bedwars';
      const tierRes = await handleBotTier(db, { mode, players, seed: 7, fill_slots: body.fill_slots || 0 });
      const decideRes = await handleBotDecide(env, db, {
        mode,
        tier: tierRes.match_tier,
        match_id: 'sim',
        bot: body.bot || { id: 'simbot', team: 0, hp: 14, max_hp: 20, inventory: { obsidian: 1 }, resources: { iron: 24, gold: 8 } },
        world: body.world || {
          elapsed_sec: 240, duration_sec: 1800,
          alive_enemies: [{ id: 'e1', dist: 12, hp: 18 }], alive_allies: [{ id: 'a1', dist: 6, hp: 16 }],
          objectives: { my_bed: { obsidian: false }, bed_threat_dist: 10, enemy_beds: [{ team: 2, dist: 45, obsidian: false }] },
          scores: { my_team: 1, enemy_team: 2 }, resources: [{ id: 'gen', dist: 3 }], shop_affordable: ['wool_16', 'iron_sword'], gear_gap: 0.3,
        },
        params: tierRes.bots?.[0] || {},
        seed: 7,
        bot_count: Math.max(1, body.fill_slots || 1),
      });
      return json({ ok: true, tier: tierRes, decision: decideRes });
    }

    case 'catalog': {
      const cat = await buildCatalog({ env, db, userKey: '', totalSpentUsd: 0 });
      return json({ ok: true, count: cat.items.length, season: cat.season, rate: cat.rate, ai: cat.ai, max_discount: cat.max_discount, items: cat.items.map((i) => ({ id: i.id, type: i.type, title_fa: i.title_fa, list_usd: i.price_usd, pct: i.pct, price_usd: i.price_usd_final, price_toman: i.price_toman, reasons: i.price_reasons, p7: i.stats?.p7, p30: i.stats?.p30 })) });
    }

    case 'reports': {
      const rows = await db.prepare('SELECT * FROM mc_reports ORDER BY (status=\'open\') DESC, id DESC LIMIT 60').all();
      return json({ ok: true, reports: rows.results || [] });
    }

    case 'report_resolve':
      await db.prepare('UPDATE mc_reports SET status=?, admin_note=?, closed_at=? WHERE id=?').bind(body.status === 'reject' ? 'rejected' : 'actioned', String(body.note || '').slice(0, 200), now(), Number(body.id)).run();
      if (body.ban_target) {
        await db.prepare('UPDATE mc_players SET banned=1, ban_reason=?, ban_until=? WHERE username_lc=?').bind(`report:${body.id}`, Number(body.ban_until) || 0, String(body.ban_target).toLowerCase()).run();
      }
      if (body.reward_reporter) {
        await db.prepare('UPDATE mc_players SET coins=coins+? WHERE username_lc=?').bind(Number(body.reward_reporter) || 100, String(body.reporter || '').toLowerCase()).run();
      }
      return json({ ok: true });

    case 'anticheat': {
      const rows = await db.prepare('SELECT id, username, cheat_score, banned, ban_reason, reported, last_seen FROM mc_players WHERE cheat_score>0 OR reported>0 OR banned=1 ORDER BY cheat_score DESC LIMIT 60').all();
      return json({ ok: true, players: rows.results || [], live: summarize(acTracker()), settings: { warn_at: await mcNum(db, 'ac_warn_at', 20), kick_at: await mcNum(db, 'ac_kick_at', 45), tempban_at: await mcNum(db, 'ac_tempban_at', 80), ban_at: await mcNum(db, 'ac_ban_at', 150), auto_ban: await mcBool(db, 'ac_auto_ban', true) } });
    }

    case 'otp_state': {
      const c = await otpConfig(db);
      const recent = await db.prepare('SELECT phone_masked, provider, verified, sends, attempts, suspicious, ip_count, created_at FROM mc_auth ORDER BY created_at DESC LIMIT 30').all();
      const fraud = await db.prepare("SELECT COUNT(*) c FROM mc_fraud WHERE status='open'").first();
      return json({ ok: true, config: { ...c, sms: { ...c.sms, key: c.sms.key ? '••••' + c.sms.key.slice(-4) : '' }, fraud: { ...c.fraud, phoneRegex: c.fraud.phoneRegex ? String(c.fraud.phoneRegex) : '' } }, recent: recent.results || [], fraud_open: Number(fraud?.c) || 0 });
    }

    case 'gateway_test': {
      const c = await mcGatewayConfig(db);
      const card = await mcCardConfig(db);
      const out = { gateway: { ...c, apiKey: c.apiKey ? '••••' : '', merchantId: c.merchantId ? c.merchantId.slice(0, 8) + '…' : '' }, card: { ...card, number: card.number ? card.number.slice(0, 6) + '****' + card.number.slice(-4) : '' } };
      if (c.enabled && c.merchantId) {
        try {
          const res = await fetch(c.provider === 'idpay' ? 'https://api.idpay.ir/v1.1/account' : 'https://api.zarinpal.com/pg/v4/payment/request.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(c.provider === 'idpay' ? { 'X-API-KEY': c.apiKey || c.merchantId, 'X-SANDBOX': '1' } : {}) },
            body: JSON.stringify(c.provider === 'idpay' ? {} : { merchant_id: c.merchantId, amount: 1000, callback_url: `${new URL(request.url).origin}/mc/pay/callback?ref=test` }),
          });
          const t = await res.text();
          out.probe = { status: res.status, body: t.slice(0, 220) };
        } catch (e) {
          out.probe = { error: String(e).slice(0, 160) };
        }
      } else out.probe = { skipped: 'درگاه فعال/پیکربندی نشده' };
      return json({ ok: true, ...out });
    }

    case 'season': {
      const s = await activeSeason(db);
      return json({
        ok: true, season: s,
        settings: { season_active: await mcGet(db, 'season_active', ''), season_name: await mcGet(db, 'season_name', ''), season_ends: await mcGet(db, 'season_ends', ''), season_promo_pct: await mcGet(db, 'season_promo_pct', '10'), season_promo_items: await mcGet(db, 'season_promo_items', ''), season_id: await mcGet(db, 'season_id', 'season-1') },
        items: rawCatalog(null).map((i) => i.id),
      });
    }

    case 'settings_current': {
      const out = {};
      for (const k of MC_SETTINGS_EDITABLE) out[k] = await mcGet(db, k, '');
      // کلیدهای حساس ماسک می‌شوند
      for (const k of ['gateway_api_key', 'otp_sms_api_key']) if (out[k]) out[k] = '••••' + out[k].slice(-4);
      return json({ ok: true, settings: out });
    }

    case 'bridge_key':
      return json({ ok: true, key: await bridgeKey(db), worker_origin: new URL(request.url).origin });

    case 'export': {
      const tables = ['mc_players', 'mc_orders', 'mc_matches', 'mc_configs', 'mc_reports', 'mc_fraud'];
      const out = {};
      for (const t of tables) {
        const r = await db.prepare(`SELECT * FROM ${t} LIMIT 2000`).all();
        out[t] = r.results || [];
      }
      return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="nova-edge-export.json"' } });
    }

    default:
      return json({ ok: false, error: `action ناشناخته: ${action}` }, 404);
  }
}

// ───────────────────────── ابزارها ─────────────────────────
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || request.headers.get('X-Real-IP') || '';
const safeArr = (v) => {
  try {
    const o = JSON.parse(v || '[]');
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
};
const safeObj = (v) => {
  try {
    const o = JSON.parse(v || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
};
