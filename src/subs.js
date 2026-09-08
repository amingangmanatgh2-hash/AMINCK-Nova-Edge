// ═══════════════════════════════════════════════════════════════════
//  ساخت ساب‌اسکریپشن چندکانفیگه + جایگزینی خودکار سرور مرده
// ═══════════════════════════════════════════════════════════════════
import { randToken, fmtDate, faDigits } from './db.js';
import { tmpl } from './util.js';

const SERVER_COLS = [
  { protocol: 'vless', category: 'vless' },
  { protocol: 'vmess', category: 'vmess' },
  { protocol: 'trojan', category: 'trojan' },
  { protocol: 'ss', category: 'ss' },
];

/** انتخاب سرورهای سالم برای ساب — اولویت با پروتکل محصول و سرورهای سالم */
export async function pickServers(db, protocol, count = 10) {
  const rows = await db
    .prepare('SELECT * FROM servers WHERE active=1 ORDER BY healthy DESC, speed_rank ASC, id ASC')
    .all();
  const all = rows.results || [];
  const primary = all.filter((s) => s.protocol === protocol && s.healthy);
  const fallback = all.filter((s) => s.protocol !== protocol && s.healthy);
  const deadButActive = all.filter((s) => !s.healthy);
  const picked = [...primary, ...fallback, ...deadButActive].slice(0, Math.max(1, count));
  return picked;
}

/** ساخت رشته‌های کانفیگ برای یک ساب */
export function buildConfigs(servers, uuid, product, userName) {
  const lines = [];
  servers.forEach((s, i) => {
    const t = s.template || defaultTemplate(s.protocol, s.ip);
    const line = tmpl(t, {
      uuid,
      name: `${product.title || 'AMINCK'} | ${s.name || 'سرور ' + (i + 1)}`,
      ip: s.ip,
      days: String(product.days || 30),
      user: userName || 'AMINCK',
    });
    if (line.trim()) lines.push(line.trim());
  });
  return lines;
}

export function defaultTemplate(protocol, ip) {
  const host = ip || 'server.example.com';
  switch (protocol) {
    case 'vmess':
      return `vmess://${btoa(`{"v":"2","ps":"{name}","add":"${host}","port":"443","id":"{uuid}","aid":"0","net":"ws","type":"","host":"","path":"/vmess","tls":"tls"}`)}`;
    case 'trojan':
      return `trojan://{uuid}@${host}:443?type=tcp&security=tls#{name}`;
    case 'ss':
      return `ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTp7dXVpZH0@${host}:8388#{name}`;
    case 'mtproto':
      return `tg://proxy?server=${host}&port=443&secret={uuid}`;
    case 'socks5':
      return `socks5://{user}:{uuid}@${host}:1080`;
    case 'openvpn':
      return `# OpenVPN {name}\nremote ${host} 1194 udp\nauth-user-pass {uuid}`;
    default:
      return `vless://{uuid}@${host}:443?type=ws&security=tls&path=%2Fvless&host=cdn.aminck.ir#{name}`;
  }
}

/** ایجاد اشتراک جدید در دیتابیس */
export async function createSubscription(env, user, product, opts = {}) {
  const { DB } = env;
  const token = randToken(18);
  const uuid = randToken(24);
  const servers = await pickServers(DB, product.protocol || 'vless', product.server_count || 10);
  const days = opts.days ?? product.days ?? 30;
  const now = Math.floor(Date.now() / 1000);
  const expire = now + days * 86400;
  await DB.prepare(
    `INSERT INTO subscriptions
       (user_id, product_id, order_id, title, token, uuid, server_ids, days, traffic_gb, expire_at, is_trial, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    user.id,
    product.id || 0,
    opts.orderId || 0,
    product.title || 'اشتراک',
    token,
    uuid,
    JSON.stringify(servers.map((s) => s.id)),
    days,
    opts.trafficGb ?? product.traffic_gb ?? 0,
    expire,
    opts.isTrial ? 1 : 0,
    now
  ).run();
  return { token, servers, expire, uuid };
}

/** محتوای صفحه لندینگ ساب — مینیمال */
export async function subLandingHtml(env, sub) {
  const { DB } = env;
  const servers = JSON.parse(sub.server_ids || '[]');
  const serverRows = servers.length
    ? (await DB.prepare(`SELECT * FROM servers WHERE id IN (${servers.map(() => '?').join(',')})`).bind(...servers).all()).results
    : [];
  const fakeProduct = { title: sub.title, days: sub.days };
  const lines = buildConfigs(serverRows, sub.uuid, fakeProduct, '');
  const expired = sub.expire_at < Math.floor(Date.now() / 1000);
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMINCK | ${sub.title}</title>
<style>
 body{font-family:Vazirmatn,Segoe UI,Roboto,sans-serif;background:#0d1526;color:#eaf1ff;margin:0;padding:24px;display:flex;justify-content:center}
 .card{max-width:640px;width:100%;background:#14213d;border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
 h1{font-size:20px;margin:0 0 4px}.sub{color:#8fa3c8;font-size:13px;margin-bottom:18px}
 .row{display:flex;justify-content:space-between;background:#0d1526;border-radius:12px;padding:12px 14px;margin:8px 0;font-size:13px}
 pre{background:#0a0f1d;border-radius:12px;padding:14px;font-size:11px;overflow:auto;max-height:320px;color:#7ee0a3;direction:ltr;text-align:left}
 .btn{display:block;background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#1a1a1a;text-align:center;font-weight:700;border-radius:12px;padding:13px;margin:14px 0;text-decoration:none;cursor:pointer;border:none;width:100%;font-size:15px}
 .expired{background:#3d1420;color:#ff7b93;border-radius:12px;padding:14px;text-align:center;font-weight:700}
</style></head><body><div class="card">
<h1>⚡ ${sub.title}</h1>
<div class="sub">AMINCK — اشتراک اختصاصی شما</div>
${expired ? '<div class="expired">⛔ این اشتراک منقضی شده است — برای تمدید به ربات مراجعه کنید</div>' : `
<div class="row"><span>📅 تاریخ انقضا</span><b>${fmtDate(sub.expire_at)}</b></div>
<div class="row"><span>⏱ مدت</span><b>${faDigits(sub.days)} روز</b></div>
<div class="row"><span>📊 حجم</span><b>${sub.traffic_gb > 0 ? faDigits(sub.traffic_gb) + ' گیگابایت' : 'نامحدود'}</b></div>
<div class="row"><span>🖥 تعداد سرور</span><b>${faDigits(serverRows.length)}</b></div>
<button class="btn" onclick="copyAll()">📋 کپی همه کانفیگ‌ها</button>
<pre id="cfg">${lines.join('\n\n').replace(/</g, '&lt;')}</pre>`}
<script>
function copyAll(){navigator.clipboard.writeText(document.getElementById('cfg').innerText).then(()=>alert('✅ کپی شد'))}
</script></div></body></html>`;
}

/** جایگزینی خودکار سرور مرده در ساب‌های فعال */
export async function healSubscription(db, sub) {
  const ids = JSON.parse(sub.server_ids || '[]');
  if (!ids.length) return;
  const rows = (await db.prepare(`SELECT * FROM servers WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
  const dead = rows.filter((s) => !s.healthy);
  if (!dead.length) return;
  const deadIds = new Set(dead.map((d) => d.id));
  const alive = rows.filter((s) => s.healthy);
  // جایگزین‌ها از سرورهای سالم خارج از لیست فعلی
  const replacements = (
    await db
      .prepare(`SELECT * FROM servers WHERE active=1 AND healthy=1 AND id NOT IN (${ids.map(() => '?').join(',')}) ORDER BY speed_rank ASC LIMIT ?`)
      .bind(...ids, dead.length)
      .all()
  ).results;
  const newIds = [...alive.map((a) => a.id), ...replacements.map((r) => r.id)];
  if (newIds.length !== ids.length) return; // تعداد کم است؛ دست نمی‌زنیم
  await db.prepare('UPDATE subscriptions SET server_ids=? WHERE id=?').bind(JSON.stringify(newIds), sub.id).run();
}

/** تست رایگان — ۱ روزه، ۵۰۰ مگ، پرسرعت‌ترین سرور */
export async function grantTrial(env, user) {
  const { DB } = env;
  const best = await DB.prepare("SELECT * FROM servers WHERE active=1 AND healthy=1 ORDER BY speed_rank ASC LIMIT 10").all();
  const product = {
    id: 0,
    title: '🎁 تست رایگان',
    protocol: 'vless',
    days: 1,
    traffic_gb: 0.5,
    server_count: Math.min(3, best.results.length || 1),
  };
  return createSubscription(env, user, product, { isTrial: true, days: 1, trafficGb: 0.5 });
}
