// ═══════════════════════════════════════════════════════════════════
//  ساخت ساب‌اسکریپشن چندکانفیگه + جایگزینی خودکار سرور مرده
//  ⛔ هیچ کانفیگی با هاست نمونه (example.com) یا سکرت جعلی ساخته نمی‌شود.
// ═══════════════════════════════════════════════════════════════════
import { randToken, fmtDate, faDigits } from './db.js';
import { tmpl } from './util.js';
import {
  buildMtprotoLinks, buildSocks5Links, isServerDeliverable, serverIssues,
  deliveryKind, NoRealServerError, isValidHost,
} from './proxy.js';

/** انتخاب سرورهای سالم و «واقعاً پیکربندی‌شده» برای ساب */
export async function pickServers(db, protocol, count = 10) {
  const rows = await db
    .prepare('SELECT * FROM servers WHERE active=1 ORDER BY healthy DESC, speed_rank ASC, id ASC')
    .all();
  // ⛔ سرورهای نمونه/ناقص کاملاً کنار گذاشته می‌شوند — نه به‌عنوان fallback و نه backup.
  const all = (rows.results || []).filter(isServerDeliverable);
  const primary = all.filter((s) => s.protocol === protocol && s.healthy);
  const sameProtoUnhealthy = all.filter((s) => s.protocol === protocol && !s.healthy);
  const otherProto = all.filter((s) => s.protocol !== protocol && s.healthy);
  // برای پروتکل‌های اتصال مستقیم، تحویلِ پروتکل دیگر بی‌معنی است.
  const kind = deliveryKind(protocol);
  const pool = kind === 'subscription'
    ? [...primary, ...otherProto, ...sameProtoUnhealthy]
    : [...primary, ...sameProtoUnhealthy];
  return pool.slice(0, Math.max(1, count));
}

/** ساخت رشته‌های کانفیگ برای یک ساب — سرورهای ناقص نادیده گرفته می‌شوند */
export function buildConfigs(servers, uuid, product, userName) {
  const lines = [];
  (servers || []).forEach((s, i) => {
    if (serverIssues(s).length) return; // ⛔ هرگز کانفیگ جعلی نساز
    const name = `${product.title || 'AMINCK'} | ${s.name || 'سرور ' + (i + 1)}`;
    const proto = String(s.protocol || '').toLowerCase();
    try {
      if (proto === 'mtproto') {
        lines.push(buildMtprotoLinks({ host: s.ip, port: s.port, secret: s.secret }).tg);
        return;
      }
      if (proto === 'socks5') {
        lines.push(buildSocks5Links({ host: s.ip, port: s.port, user: userName || '', pass: s.secret || '' }).tg);
        return;
      }
    } catch {
      return; // اطلاعات ناقص → لینک ساخته نمی‌شود
    }
    // IP تمیز انتخابی (اگر ادمین برای این سرور ست کرده باشد) جایگزین هاست می‌شود
    const host = s.clean_ip && isValidHost(s.clean_ip) ? s.clean_ip : s.ip;
    const t = s.template || defaultTemplate(proto, host, s.port);
    const line = tmpl(t, {
      uuid,
      name,
      ip: host,
      port: String(s.port || defaultPort(proto)),
      days: String(product.days || 30),
      user: userName || 'AMINCK',
    });
    if (line.trim() && !/example\.(com|net|org)/i.test(line)) lines.push(line.trim());
  });
  return lines;
}

/** لینک‌های اتصال مستقیم (MTProto/SOCKS5) برای سرورهای یک ساب */
export function buildDirectLinks(servers, userName = '') {
  const out = [];
  for (const s of servers || []) {
    if (serverIssues(s).length) continue;
    const proto = String(s.protocol || '').toLowerCase();
    try {
      if (proto === 'mtproto') {
        const l = buildMtprotoLinks({ host: s.ip, port: s.port, secret: s.secret });
        out.push({ server: s, kind: 'mtproto', ...l });
      } else if (proto === 'socks5') {
        const l = buildSocks5Links({ host: s.ip, port: s.port, user: userName, pass: s.secret || '' });
        out.push({ server: s, kind: 'socks5', ...l });
      }
    } catch {
      /* اطلاعات ناقص → رد می‌شود */
    }
  }
  return out;
}

export function defaultPort(protocol) {
  switch (String(protocol || '').toLowerCase()) {
    case 'ss': return 8388;
    case 'socks5': return 1080;
    case 'openvpn': return 1194;
    default: return 443;
  }
}

export function defaultTemplate(protocol, ip, port) {
  const host = String(ip || '').trim();
  const p = Number(port) || defaultPort(protocol);
  switch (protocol) {
    case 'vmess':
      return `vmess://${btoa(`{"v":"2","ps":"{name}","add":"${host}","port":"${p}","id":"{uuid}","aid":"0","net":"ws","type":"","host":"","path":"/vmess","tls":"tls"}`)}`;
    case 'trojan':
      return `trojan://{uuid}@${host}:${p}?type=tcp&security=tls#{name}`;
    case 'ss':
      return `ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTp7dXVpZH0@${host}:${p}#{name}`;
    case 'mtproto':
      // ⚠️ سکرت واقعی از ستون servers.secret خوانده می‌شود؛ اینجا فقط قالب نمایشی است.
      return `tg://proxy?server=${host}&port=${p}&secret={secret}`;
    case 'socks5':
      return `tg://socks?server=${host}&port=${p}`;
    case 'openvpn':
      return `# OpenVPN {name}\nremote ${host} ${p} udp\nauth-user-pass {uuid}`;
    default:
      return `vless://{uuid}@${host}:${p}?type=ws&security=tls&path=%2Fvless&host=cdn.aminck.ir#{name}`;
  }
}

/**
 * آیا محصول با سرورهای واقعیِ فعلی قابل تحویل است؟
 * @returns {Promise<{ok:boolean, servers:object[], reason?:string}>}
 */
export async function checkDeliverable(db, product) {
  const servers = await pickServers(db, product?.protocol || 'vless', product?.server_count || 10);
  if (!servers.length) return { ok: false, servers: [], reason: 'no_real_server' };
  return { ok: true, servers };
}

/** ایجاد اشتراک جدید در دیتابیس */
export async function createSubscription(env, user, product, opts = {}) {
  const { DB } = env;
  const token = randToken(18);
  const uuid = randToken(24);
  const servers = await pickServers(DB, product.protocol || 'vless', product.server_count || 10);
  // ⛔ بدون سرور واقعی هیچ اشتراکی ساخته نمی‌شود (به‌جای تحویل کانفیگ جعلی)
  if (!servers.length) throw new NoRealServerError();
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

/** محتوای صفحه لندینگ ساب — مینیمال (بدون هیچ کانفیگ نمونه/جعلی) */
export async function subLandingHtml(env, sub) {
  const { DB } = env;
  const servers = JSON.parse(sub.server_ids || '[]');
  const rawRows = servers.length
    ? (await DB.prepare(`SELECT * FROM servers WHERE id IN (${servers.map(() => '?').join(',')})`).bind(...servers).all()).results
    : [];
  // ⛔ صفحهٔ ساب هرگز کانفیگ example.com یا سرور ناقص را نمایش نمی‌دهد
  const serverRows = (rawRows || []).filter((s) => serverIssues(s).length === 0);
  const fakeProduct = { title: sub.title, days: sub.days };
  const lines = buildConfigs(serverRows, sub.uuid, fakeProduct, '');
  const direct = buildDirectLinks(serverRows);
  const expired = sub.expire_at < Math.floor(Date.now() / 1000);
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const directHtml = direct.length
    ? direct
        .map(
          (d) =>
            `<a class="btn" href="${esc(d.https)}">${d.kind === 'mtproto' ? '🔗 اتصال مستقیم در تلگرام' : '🧦 افزودن SOCKS5 به تلگرام'} — ${esc(d.server.name || '')}</a>`
        )
        .join('')
    : '';
  const body = lines.length
    ? `<button class="btn" onclick="copyAll()">📋 کپی همه کانفیگ‌ها</button>
<pre id="cfg">${esc(lines.join('\n\n'))}</pre>`
    : `<div class="expired">⚠️ هنوز سرور واقعی برای این اشتراک تنظیم نشده است. لطفاً با پشتیبانی تماس بگیرید.</div>`;
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMINCK | ${esc(sub.title)}</title>
<style>
 body{font-family:Vazirmatn,Segoe UI,Roboto,sans-serif;background:#0d1526;color:#eaf1ff;margin:0;padding:24px;display:flex;justify-content:center}
 .card{max-width:640px;width:100%;background:#14213d;border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
 h1{font-size:20px;margin:0 0 4px}.sub{color:#8fa3c8;font-size:13px;margin-bottom:18px}
 .row{display:flex;justify-content:space-between;background:#0d1526;border-radius:12px;padding:12px 14px;margin:8px 0;font-size:13px}
 pre{background:#0a0f1d;border-radius:12px;padding:14px;font-size:11px;overflow:auto;max-height:320px;color:#7ee0a3;direction:ltr;text-align:left}
 .btn{display:block;background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#1a1a1a;text-align:center;font-weight:700;border-radius:12px;padding:13px;margin:14px 0;text-decoration:none;cursor:pointer;border:none;width:100%;font-size:15px}
 .expired{background:#3d1420;color:#ff7b93;border-radius:12px;padding:14px;text-align:center;font-weight:700}
</style></head><body><div class="card">
<h1>⚡ ${esc(sub.title)}</h1>
<div class="sub">AMINCK — اشتراک اختصاصی شما</div>
${expired ? '<div class="expired">⛔ این اشتراک منقضی شده است — برای تمدید به ربات مراجعه کنید</div>' : `
<div class="row"><span>📅 تاریخ انقضا</span><b>${fmtDate(sub.expire_at)}</b></div>
<div class="row"><span>⏱ مدت</span><b>${faDigits(sub.days)} روز</b></div>
<div class="row"><span>📊 حجم</span><b>${sub.traffic_gb > 0 ? faDigits(sub.traffic_gb) + ' گیگابایت' : 'نامحدود'}</b></div>
<div class="row"><span>🖥 تعداد سرور</span><b>${faDigits(serverRows.length)}</b></div>
${directHtml}
${body}`}
<script>
function copyAll(){var e=document.getElementById('cfg');if(!e)return;navigator.clipboard.writeText(e.innerText).then(function(){alert('✅ کپی شد')})}
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
  const newIds = [...alive.map((a) => a.id), ...replacements.filter(isServerDeliverable).map((r) => r.id)];
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
