// ═══════════════════════════════════════════════════════════════════
//  پنل کانفیگ‌ساز (بخش ۱۸ و ۲۰) — محصول قابل خرید + ابزار ساخت لینک
//
//  خریدار یک «لایسنس» می‌گیرد: آدرس اختصاصی /creator/<token> که داخل آن
//  برای سرور(های) خودش کانفیگ می‌سازد، خروجی subbase64 می‌گیرد و با API
//  کارش را اتوماتیک می‌کند. سقف سرور/تعداد کانفیگ و تاریخ انقضا از پنل
//  ادمین قابل تنظیم است.
//
//  ⚠️ این پنل، سرور VPN نمی‌سازد — فقط کانفیگ کلاینت برای سرورهایی که
//  خریدار خودش روی سرور واقعیِ خودش (xray / marzban / 3x-ui …) راه انداخته
//  است تولید می‌کند. هیچ هاست نمونه‌ای به کاربر تحویل داده نمی‌شود.
// ═══════════════════════════════════════════════════════════════════
import { randToken } from './db.js';
import { getSettingValue } from './texts.js';
import { html, json, text } from './util.js';

const now = () => Math.floor(Date.now() / 1000);

export const CREATOR_PLANS = {
  starter: { name: 'استارتر', servers: 3, configs: 25 },
  pro: { name: 'حرفه‌ای', servers: 10, configs: 200 },
  unlimited: { name: 'بدون سقف', servers: 0, configs: 0 }, // ۰ = نامحدود
};

export function planOf(name) {
  return CREATOR_PLANS[String(name || '').toLowerCase()] || null;
}

/** ساخت/تمدید لایسنس برای خریدار */
export async function grantCreatorLicense(env, user, product = {}, opts = {}) {
  const days = Math.max(1, Number(opts.days ?? product.days) || 30);
  const plan = planOf(opts.plan || product.protocol_plan || 'pro') || CREATOR_PLANS.pro;
  const existing = await env.DB.prepare('SELECT * FROM creator_licenses WHERE user_id=? AND active=1 AND (expire_at=0 OR expire_at>?)').bind(user.id, now()).first();
  if (existing) {
    // تمدید: سقف‌ها از پلن جدید، انقضا از امروز + days
    const expire = Math.max(Number(existing.expire_at) || 0, now()) + days * 86400;
    await env.DB
      .prepare('UPDATE creator_licenses SET servers=?, quota=?, expire_at=?, note=? WHERE id=?')
      .bind(plan.servers, plan.configs, expire, `تمدید از سفارش ${opts.orderId || 0}`, existing.id)
      .run();
    return { ...existing, expire_at: expire, servers: plan.servers, quota: plan.configs, renewed: true };
  }
  const token = randToken(22);
  const apiKey = 'ck_' + randToken(28);
  const res = await env.DB
    .prepare(
      `INSERT INTO creator_licenses (user_id, token, api_key, name, servers, quota, used, expire_at, active, order_id, note, created_at)
       VALUES (?,?,?,?,?,?,0,?,?,?,?,?) RETURNING *`
    )
    .bind(
      user.id,
      token,
      apiKey,
      product.title || 'لایسنس کانفیگ‌ساز',
      plan.servers,
      plan.configs,
      now() + days * 86400,
      1,
      Number(opts.orderId || 0),
      `پلن: ${plan.name}`,
      now()
    )
    .first();
  return res;
}

export async function getLicenseByToken(env, token) {
  const row = await env.DB.prepare('SELECT * FROM creator_licenses WHERE token=?').bind(String(token || '').slice(0, 64)).first();
  if (!row) return null;
  if (!row.active) return { ...row, __invalid: 'این لایسنس غیرفعال شده است.' };
  if (row.expire_at && row.expire_at < now()) return { ...row, __invalid: 'این لایسنس منقضی شده است؛ برای تمدید به ربات سر بزنید.' };
  return row;
}

function b64u(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

/**
 * ساخت لینک کلاینت از ورودی‌های خود کاربر.
 * @returns {{ok:boolean, line?:string, error?:string}}
 */
export function buildUserConfig(input = {}) {
  const proto = String(input.protocol || 'vless').toLowerCase();
  const host = String(input.host || '').trim();
  const port = Number(input.port || 443);
  if (!/^[a-z0-9.-]+$/i.test(host) || /example\.(com|net|org)$/i.test(host) || /\.(test|invalid)$/i.test(host)) {
    return { ok: false, error: 'هاست معتبر نیست (آدرس نمونه هم مجاز نیست).' };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'پورت نامعتبر است.' };
  const name = encodeURIComponent(String(input.name || `${proto} ${host}`).slice(0, 50));
  const sec = String(input.security || 'tls').toLowerCase();
  const t = String(input.transport || 'ws').toLowerCase();
  const path = String(input.path || '').trim();
  const sni = String(input.sni || '').trim();
  const hdr = String(input.host_header || '').trim();
  const uuid = String(input.uuid || '').trim();
  if (!uuid) return { ok: false, error: 'UUID/پسورد لازم است.' };

  const common = [];
  if (t === 'ws') common.push('type=ws');
  else if (t === 'grpc') common.push('type=grpc', `serviceName=${encodeURIComponent(String(input.service_name || '').trim())}`);
  else if (t === 'xhttp') common.push('type=xhttp', `mode=${encodeURIComponent(String(input.mode || 'auto'))}`);
  else if (t === 'httpupgrade') common.push('type=httpupgrade');
  else common.push('type=tcp');
  if (path) common.push(`path=${encodeURIComponent(path)}`);
  if (hdr) common.push(`host=${encodeURIComponent(hdr)}`);
  if (sec === 'tls') {
    common.push('security=tls');
    if (sni) common.push(`sni=${encodeURIComponent(sni)}`);
    common.push(`fp=${encodeURIComponent(String(input.fp || 'chrome'))}`);
  } else if (sec === 'reality') {
    const pbk = String(input.pbk || '').trim();
    const sid = String(input.sid || '').trim();
    if (!pbk || !sid) return { ok: false, error: 'برای Reality به pbk و sid نیاز است (روی سرور خودتان: xray x25519).' };
    common.push('security=reality', `pbk=${encodeURIComponent(pbk)}`, `sid=${encodeURIComponent(sid)}`, `fp=${encodeURIComponent(String(input.fp || 'chrome'))}`);
    if (sni) common.push(`sni=${encodeURIComponent(sni)}`);
    if (String(input.flow || 'xtls-rprx-vision')) common.push(`flow=${encodeURIComponent(String(input.flow || 'xtls-rprx-vision'))}`);
  } else {
    common.push('security=none');
  }

  if (proto === 'vless') return { ok: true, line: `vless://${uuid}@${host}:${port}?${common.join('&')}#${name}` };
  if (proto === 'trojan') return { ok: true, line: `trojan://${uuid}@${host}:${port}?${common.join('&')}#${name}` };
  if (proto === 'ss') {
    const method = String(input.method || 'chacha20-ietf-poly1305');
    return { ok: true, line: `ss://${b64u(`${method}:${uuid}`)}@${host}:${port}#${name}` };
  }
  if (proto === 'vmess') {
    const obj = {
      v: '2', ps: decodeURIComponent(name), add: host, port: String(port), id: uuid, aid: String(input.alterId || '0'),
      scy: 'auto', net: t === 'tcp' ? 'tcp' : t, type: '', host: hdr, path, tls: sec === 'none' ? '' : 'tls', sni, alpn: 'h2',
    };
    return { ok: true, line: `vmess://${b64u(JSON.stringify(obj))}` };
  }
  return { ok: false, error: 'پروتکل پشتیبانی نمی‌شود (vless/vmess/trojan/ss).' };
}

/** ثبت کانفیگِ ساخته‌شده با سقف موجودی + ساخت subbase64 */
export async function saveCreatorConfig(env, license, input) {
  const built = buildUserConfig(input);
  if (!built.ok) return built;
  // سقف تعداد کانفیگ
  if (Number(license.quota) > 0 && Number(license.used) >= Number(license.quota)) {
    return { ok: false, error: 'سقف تعداد کانفیگ این لایسنس پر شده است.' };
  }
  // سقف تعداد هاست مجاز
  const host = String(input.host || '').trim().toLowerCase();
  const hosts = new Set((await env.DB.prepare('SELECT host FROM creator_configs WHERE license_id=?').bind(license.id).all()).results.map((r) => String(r.host).toLowerCase()));
  const maxServers = Number(license.servers) || 0;
  if (maxServers > 0 && !hosts.has(host) && hosts.size >= maxServers) {
    return { ok: false, error: `سقف ${maxServers} سرور این لایسنس پر شده است.` };
  }
  await env.DB.prepare('INSERT INTO creator_configs (license_id, name, protocol, host, port, line, created_at) VALUES (?,?,?,?,?,?,?)').bind(
    license.id,
    String(input.name || '').slice(0, 60),
    String(input.protocol || 'vless').toLowerCase(),
    host,
    Number(input.port || 443),
    built.line,
    now()
  ).run();
  await env.DB.prepare('UPDATE creator_licenses SET used = used + 1 WHERE id=?').bind(license.id).run();
  return { ok: true, line: built.line };
}

export async function creatorSubContent(env, license) {
  const rows = (await env.DB.prepare('SELECT line FROM creator_configs WHERE license_id=? ORDER BY id ASC').bind(license.id).all()).results;
  const lines = rows.map((r) => r.line).filter(Boolean);
  return { count: lines.length, base64: b64u(lines.join('\n')), lines };
}

/** حذف یک کانفیگ (سقف مصرف‌شده برگردانده نمی‌شود — ضد سوءاستفاده) */
export async function deleteCreatorConfig(env, license, id) {
  await env.DB.prepare('DELETE FROM creator_configs WHERE id=? AND license_id=?').bind(Number(id), license.id).run();
  return { ok: true };
}

// ─── API مینی‌پنل ───
export async function handleCreatorApi(env, request, path) {
  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {}
  }
  const token = String(body.token || request.headers.get('x-creator-token') || '').slice(0, 64);
  const lic = await getLicenseByToken(env, token);
  if (!lic) return json({ ok: false, error: 'invalid_token' }, 403);
  if (lic.__invalid) return json({ ok: false, error: lic.__invalid }, 403);

  if (path === '/api/creator/list') {
    const rows = (await env.DB.prepare('SELECT id, name, protocol, host, port, created_at FROM creator_configs WHERE license_id=? ORDER BY id DESC').bind(lic.id).all()).results;
    return json({ ok: true, items: rows, used: lic.used, quota: lic.quota, servers: lic.servers, expire_at: lic.expire_at });
  }
  if (path === '/api/creator/build') {
    const res = await saveCreatorConfig(env, lic, body.config || body);
    return json(res, res.ok ? 200 : 400);
  }
  if (path === '/api/creator/preview') {
    return json(buildUserConfig(body.config || body));
  }
  if (path === '/api/creator/delete') {
    return json(await deleteCreatorConfig(env, lic, body.id));
  }
  if (path === '/api/creator/status') {
    const sub = await creatorSubContent(env, lic);
    return json({ ok: true, used: lic.used, quota: lic.quota, servers: lic.servers, maxServers: lic.servers, configs: sub.count, expire_at: lic.expire_at });
  }
  return json({ ok: false, error: 'notfound' }, 404);
}

const CSS = `
:root{--bg:#0d1526;--card:#14213d;--line:#2a3b5f;--gold:#f5b31e;--txt:#eaf1ff;--mut:#9db0d2}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font-family:Vazirmatn,Segoe UI,Tahoma,sans-serif;padding:18px}
.wrap{max-width:760px;margin:0 auto}.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:14px}
h1{font-size:19px;margin:0 0 6px}.mut{color:var(--mut);font-size:13px;line-height:1.9}
label{display:block;font-size:12px;color:var(--mut);margin:10px 0 5px}
input,select{width:100%;padding:11px;border-radius:10px;border:1px solid var(--line);background:#0f1a2e;color:var(--txt);font:inherit;direction:ltr;text-align:left}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
button{border:0;border-radius:11px;background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#171305;font-weight:800;padding:12px 16px;cursor:pointer;font:inherit;width:100%;margin-top:14px}
.ghost{background:#22314f;color:var(--txt);border:1px solid var(--line)}
pre{background:#0a0f1d;border-radius:10px;padding:12px;font-size:11px;overflow:auto;direction:ltr;text-align:left;color:#7ee0a3;white-space:pre-wrap;word-break:break-all}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;background:#0f1a2e;border-radius:10px;margin:6px 0;font-size:12px}
.badge{background:#17382f;color:#c8ffe9;border-radius:8px;padding:3px 8px;font-size:11px}
.err{background:#3d1420;color:#ff7b93;border-radius:10px;padding:10px;font-size:12px;margin-top:10px}
.ok{background:#17382f;color:#c8ffe9;border-radius:10px;padding:10px;font-size:12px;margin-top:10px}
`;

/** صفحهٔ وب‌اپلایکِ پنل کانفیگ‌ساز */
export function creatorPageHtml(lic, base = '') {
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const quota = Number(lic.quota) > 0 ? `${esc(lic.used)} / ${esc(lic.quota)}` : `${esc(lic.used)} (نامحدود)`;
  const servers = Number(lic.servers) > 0 ? esc(lic.servers) : 'نامحدود';
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>🛠 پنل کانفیگ‌ساز</title>
<meta name="telegram:theme_color" content="#f5b31e"><style>${CSS}</style></head><body>
<main class="wrap">
  <div class="card">
    <h1>🛠 پنل کانفیگ‌ساز — ${esc(lic.name || '')}</h1>
    <div class="mut">سقف سرور: <b>${servers}</b> · کانفیگ‌ها: <b>${quota}</b> ·
      انقضا: <b>${lic.expire_at ? new Date(lic.expire_at * 1000).toLocaleDateString('fa-IR') : '—'}</b></div>
    <div class="row"><span>🔗 آدرس اشتراک اختصاصی شما (برای کلاینت‌ها)</span><span class="badge" id="substate">آماده</span></div>
    <pre id="suburl">${esc(base)}/creator/${esc(lic.token)}/sub</pre>
    <button class="ghost" onclick="cp(document.getElementById('suburl').innerText)">📋 کپی لینک اشتراک</button>
  </div>

  <div class="card">
    <h1>➕ کانفیگ جدید</h1>
    <div class="mut">هاست/پورت/UUID همان مقداری است که روی <b>سرور واقعی خودتان</b> ست کرده‌اید.</div>
    <label>نام کانفیگ</label><input id="f_name" placeholder="My Server #1">
    <div class="grid">
      <div><label>پروتکل</label><select id="f_proto"><option>vless</option><option>vmess</option><option>trojan</option><option>ss</option></select></div>
      <div><label>ترنسپورت</label><select id="f_t"><option value="ws">WebSocket</option><option value="grpc">gRPC</option><option value="xhttp">XHTTP</option><option value="httpupgrade">HTTPUpgrade</option><option value="tcp">TCP</option></select></div>
      <div><label>هاست/IP</label><input id="f_host" placeholder="vpn.example.com"></div>
      <div><label>پورت</label><input id="f_port" type="number" value="443"></div>
      <div><label>UUID / پسورد</label><input id="f_uuid" placeholder="uuid یا رمز"></div>
      <div><label>امنیت</label><select id="f_sec"><option value="tls">TLS</option><option value="reality">Reality (DPI-resistant)</option><option value="none">None</option></select></div>
      <div><label>SNI / Fake Domain</label><input id="f_sni" placeholder="speedtest.net"></div>
      <div><label>Host (CDN header)</label><input id="f_hosth" placeholder="cdn.example.com"></div>
      <div><label>Path</label><input id="f_path" placeholder="/vless"></div>
      <div><label>pbk (فقط Reality)</label><input id="f_pbk"></div>
      <div><label>sid (فقط Reality)</label><input id="f_sid"></div>
      <div><label>روش (فقط SS)</label><input id="f_method" placeholder="chacha20-ietf-poly1305"></div>
    </div>
    <button onclick="save()">💾 ساخت و ذخیره</button>
    <div id="out"></div>
  </div>

  <div class="card">
    <h1>📦 کانفیگ‌های من</h1>
    <div id="list" class="mut">در حال بارگذاری…</div>
    <button class="ghost" onclick="reload()">🔄 بارگذاری دوباره</button>
  </div>
  <div class="mut" style="text-align:center">AMINCK — لینک‌ها فقط برای سرورهای خودتان ساخته می‌شود.</div>
</main>
<script>
const TOKEN=${JSON.stringify(lic.token)};
const api=(p,b)=>fetch('/api/creator/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,...b})}).then(r=>r.json());
function cp(t){navigator.clipboard.writeText(t).then(()=>flash('✅ کپی شد'))}
function flash(m){const o=document.getElementById('out');o.className='ok';o.textContent=m}
function err(m){const o=document.getElementById('out');o.className='err';o.textContent='⛔ '+m}
function val(id){return document.getElementById(id).value.trim()}
function body(){return{config:{name:val('f_name')||('cfg '+new Date().getTime()),protocol:val('f_proto'),transport:val('f_t'),host:val('f_host'),port:Number(val('f_port')||443),uuid:val('f_uuid'),security:val('f_sec'),sni:val('f_sni'),host_header:val('f_hosth'),path:val('f_path'),pbk:val('f_pbk'),sid:val('f_sid'),method:val('f_method')||'chacha20-ietf-poly1305'}}}
async function save(){const r=await api('build',body());if(!r.ok)return err(r.error||'خطا');document.getElementById('out').className='ok';document.getElementById('out').innerHTML='<pre>'+r.line+'</pre>';reload()}
async function reload(){const r=await api('list',{token:TOKEN});const el=document.getElementById('list');
 if(!r.items||!r.items.length){el.innerHTML='<div class="mut">هنوز کانفیگی نساخته‌اید.</div>';return}
 el.innerHTML=r.items.map(i=>'<div class="row"><span>▪️ '+i.name+' <span class="mut">('+i.protocol+')</span></span><span><button class="ghost" style="width:auto;padding:6px 10px;margin:0" onclick="del('+i.id+')">🗑</button></span></div>').join('')}
async function del(id){await api('delete',{id});reload()}
reload();
</script></body></html>`;
}

/** محتوای base64 اشتراکِ لایسنس (برای کلاینت‌های v2rayNG/Streisand) */
export async function creatorSubResponse(env, token) {
  const lic = await getLicenseByToken(env, token);
  if (!lic) return text('invalid license', 404);
  const sub = await creatorSubContent(env, lic);
  const user = await env.DB.prepare('SELECT username FROM users WHERE id=?').bind(lic.user_id).first();
  const name = encodeURIComponent(`AMINCK Creator ${user?.username ? '@' + user.username : ''}`.trim());
  return new Response(sub.base64, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'profile-title': `base64:${btoa('AMINCK Config Creator')}`,
      'profile-update-interval': '12',
      'subscription-userinfo': `upload=0; download=${sub.count}; total=0; expire=${lic.expire_at || ''}`,
      'content-disposition': `attachment; filename*=UTF-8''${name}.txt`,
      'Cache-Control': 'no-store',
    },
  });
}

/** متن پیام تحویل لایسنس در تلگرام */
export async function creatorDeliveryText(env, lic, base) {
  return (
    `🛠 <b>پنل کانفیگ‌ساز شما فعال شد!</b>\n\n` +
    `🔑 کلید لایسنس:\n<code>${lic.token}</code>\n\n` +
    `🔑 API Key (برای اسکریپت‌ها):\n<code>${lic.api_key}</code>\n\n` +
    `🌐 پنل من:\n<code>${base}/creator/${lic.token}</code>\n\n` +
    `🔗 لینک اشتراک پنل:\n<code>${base}/creator/${lic.token}/sub</code>\n\n` +
    `🖥 سقف سرور: <b>${Number(lic.servers) > 0 ? lic.servers : 'نامحدود'}</b> · ` +
    `🧾 سقف کانفیگ: <b>${Number(lic.quota) > 0 ? lic.quota : 'نامحدود'}</b>\n` +
    `🗓 اعتبار تا: <b>${new Date((lic.expire_at || now()) * 1000).toLocaleDateString('fa-IR')}</b>\n\n` +
    `ℹ️ برای هر کانفیگ، هاست/پورت/UUID سرور واقعی خودتان را وارد کنید.`
  );
}

export async function isCreatorProduct(db, product) {
  if (String(product?.category || '').toLowerCase() !== 'creator') return false;
  return (await getSettingValue(db, 'creator_enabled')) !== '0';
}
