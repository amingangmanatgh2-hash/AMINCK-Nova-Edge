// ═══════════════════════════════════════════════════════════════════
//  ساخت ساب‌اسکریپشن چندکانفیگه + جایگزینی خودکار سرور مرده
//  ⛔ هیچ کانفیگی با هاست نمونه (example.com) یا سکرت جعلی ساخته نمی‌شود.
// ═══════════════════════════════════════════════════════════════════
import { randToken, fmtDate, faDigits } from './db.js';
import { buildVariantConfigs } from './antiblock.js';
import { getSettingValue } from './texts.js';
import { tmpl } from './util.js';
import {
  buildMtprotoLinks, buildSocks5Links, isServerDeliverable, serverIssues,
  deliveryKind, NoRealServerError, isValidHost, SUBSCRIPTION_PROTOCOLS,
  SERVICE_UNAVAILABLE_MESSAGE,
} from './proxy.js';

const now = () => Math.floor(Date.now() / 1000);

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

/** چند IP تمیز برتر (فعال و خارج از مدارشکن) — مرتب بر اساس امتیاز واقعی */
export async function bestCleanIps(db, count = 3) {
  const rows = (
    await db
      .prepare('SELECT ip FROM clean_ips WHERE active=1 AND (blocked_until=0 OR blocked_until<=?) ORDER BY score DESC, samples DESC LIMIT ?')
      .bind(now(), Math.min(20, Math.max(1, Number(count) || 1)))
      .all()
  ).results;
  return rows.map((r) => r.ip).filter(isValidHost);
}

/**
 * وضعیت سلامت مسیرهای یک پروتکل — پایهٔ kill-switch صادقانه.
 * برای پروتکل‌های اشتراکی، سرور سالم از پروتکل دیگر هم یک «مسیر سالم» محسوب
 * می‌شود (کلاینت چندپروتکلی می‌تواند از آن استفاده کند).
 * @returns {Promise<{ok:boolean, healthyCount:number, totalSame:number, reason:string}>}
 */
export async function protocolHealth(db, protocol) {
  const kind = deliveryKind(protocol);
  const rows = (await db.prepare('SELECT * FROM servers WHERE active=1').all()).results.filter(isServerDeliverable);
  const same = rows.filter((s) => s.protocol === protocol);
  const healthySame = same.filter((s) => s.healthy);
  if (kind === 'subscription') {
    const otherHealthy = rows.filter((s) => s.healthy && SUBSCRIPTION_PROTOCOLS.includes(s.protocol) && s.protocol !== protocol);
    const healthyCount = healthySame.length + otherHealthy.length;
    return { ok: healthyCount > 0, healthyCount, totalSame: same.length, reason: healthyCount > 0 ? '' : 'no_healthy_route' };
  }
  const healthyCount = healthySame.length;
  return { ok: healthyCount > 0, healthyCount, totalSame: same.length, reason: healthyCount > 0 ? '' : 'no_healthy_route' };
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

/**
 * ساخت کانفیگ با چند IP تمیز برای هر سرور (بخش ۰ — چند IP به‌جای یک IP).
 * ترتیب: clean_ip اختصاصی سرور → IPهای تمیز برتر (مرتب با امتیاز) → خود سرور.
 * پروتکل‌های اتصال مستقیم (MTProto/SOCKS5) فقط هاست واقعی خودشان را می‌گیرند؛
 * جایگزینی IP تمیز فقط برای پروتکل‌های اشتراکی (VLESS/VMess/Trojan/SS) معنا دارد.
 *
 * @param {object[]} servers سرورهای تحویل‌دادنی
 * @param {string} uuid
 * @param {object} product {title, days, protocol}
 * @param {string} userName
 * @param {object} opts {cleanIps:string[], perServer:number}
 */
export function buildConfigsMulti(servers, uuid, product, userName = '', opts = {}) {
  const perServer = Math.min(6, Math.max(1, Number(opts.perServer) || 3));
  const cleanIps = (opts.cleanIps || []).filter(isValidHost);
  const lines = [];
  (servers || []).forEach((s, i) => {
    if (serverIssues(s).length) return;
    const proto = String(s.protocol || '').toLowerCase();
    const name = `${product.title || 'AMINCK'} | ${s.name || 'سرور ' + (i + 1)}`;
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
      return;
    }
    const hosts = [];
    const pushHost = (h) => {
      if (isValidHost(h) && !hosts.includes(h)) hosts.push(h);
    };
    if (s.clean_ip) pushHost(s.clean_ip);
    for (const c of cleanIps) {
      if (hosts.length >= perServer) break;
      pushHost(c);
    }
    pushHost(s.ip);
    for (const host of hosts.slice(0, perServer + 1)) {
      let t = s.template || defaultTemplate(proto, host, s.port);
      // اگر قالب، هاست سرور را سفت کرده باشد (بدون {ip})، برای هر IP تمیز همان
      // هاست جایگزین می‌شود تا کانفیگ‌های چندگانه واقعاً متفاوت باشند.
      if (s.ip && host !== s.ip) t = t.split(s.ip).join(host);
      if (s.clean_ip && s.clean_ip !== s.ip && host !== s.clean_ip) t = t.split(s.clean_ip).join(host);
      const line = tmpl(t, {
        uuid,
        name,
        ip: host,
        port: String(s.port || defaultPort(proto)),
        days: String(product.days || 30),
        user: userName || 'AMINCK',
      });
      if (line.trim() && !/example\.(com|net|org)/i.test(line) && !lines.includes(line)) lines.push(line.trim());
    }
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
 * آیا محصول با سرورهای واقعیِ فعلی قابل تحویل است؟ (با kill-switch)
 *
 * reasonهای ممکن:
 *   ''                → قابل تحویل
 *   'no_real_server'  → هیچ سرور واقعی/قابل‌تحویلی ثبت نشده
 *   'no_healthy_route'→ سرور هست اما هیچ مسیر سالمی برای پروتکل نمانده (kill-switch خودکار)
 *   'manual_killswitch'→ ادمین دستی این پروتکل را خاموش کرده است
 *
 * @returns {Promise<{ok:boolean, servers:object[], reason?:string}>}
 */
export async function checkDeliverable(db, product) {
  const protocol = product?.protocol || 'vless';
  const servers = await pickServers(db, protocol, product?.server_count || 10);
  if (!servers.length) return { ok: false, servers: [], reason: 'no_real_server' };

  const manual = await getSettingValue(db, `killswitch:${protocol}`);
  if (manual === '1') return { ok: false, servers, reason: 'manual_killswitch' };
  if (manual === '0') return { ok: true, servers };

  const health = await protocolHealth(db, protocol);
  if (!health.ok) return { ok: false, servers, reason: 'no_healthy_route' };
  return { ok: true, servers };
}

/**
 * kill-switch دستی ادمین: force_on ('0') / force_off ('1') / auto ('')
 * @param {string} protocol
 * @param {'0'|'1'|''} mode
 */
export async function setProductKillSwitch(db, protocol, mode) {
  const p = String(protocol || '').toLowerCase();
  if (!SUBSCRIPTION_PROTOCOLS.includes(p) && !['mtproto', 'socks5', 'openvpn'].includes(p)) return { ok: false, reason: 'bad_protocol' };
  const v = mode === '1' || mode === '0' ? mode : '';
  await db
    .prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(`killswitch:${p}`, v)
    .run();
  return { ok: true, protocol: p, mode: v };
}

/** وضعیت kill-switch همهٔ پروتکل‌ها برای پنل */
export async function killSwitchStatus(db) {
  const out = {};
  for (const p of [...SUBSCRIPTION_PROTOCOLS, 'mtproto', 'socks5', 'openvpn']) {
    const manual = await getSettingValue(db, `killswitch:${p}`);
    const health = await protocolHealth(db, p);
    out[p] = {
      manual: manual === '1' ? 'off' : manual === '0' ? 'on' : 'auto',
      healthyCount: health.healthyCount,
      totalSame: health.totalSame,
      available: manual === '1' ? false : manual === '0' ? true : health.ok,
    };
  }
  return out;
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

/**
 * محتوای پویای ساب — بخش ۰ (ساب داینامیک) + بخش ۳.۱ (ضدسانسور):
 *  ۱) اول «واریانت‌های ضد DPI» هر سرور (ترنسپورت/پورت/SNI متفاوت) چیده می‌شوند؛
 *  ۲) اگر تعداد به `sub_min_configs` (پیش‌فرض ۱۰) نرسید، با چند IP تمیزِ
 *     برتر برای همان سرورها پُر می‌شود؛
 *  ۳) در هر fetch همه چیز بر اساس سلامت لحظه‌ای rebuild می‌شود.
 * @returns {Promise<{ok:boolean, reason:string, servers:object[], cleanIps:string[],
 *   lines:string[], entries:{line:string,variantId:number}[], wanted:number, shortfall:number}>}
 */
export async function dynamicSubContent(env, sub) {
  const { DB } = env;
  const prod = sub.product_id ? await DB.prepare('SELECT * FROM products WHERE id=?').bind(sub.product_id).first() : null;
  const protocol = (prod?.protocol || 'vless').toLowerCase();
  const product = { title: sub.title, days: sub.days, protocol, server_count: prod?.server_count || 10 };
  const check = await checkDeliverable(DB, product);
  if (!check.ok) return { ok: false, reason: check.reason, servers: [], cleanIps: [], lines: [], entries: [], wanted: 0, shortfall: 0 };
  const wanted = Math.max(1, Number(await getSettingValue(DB, 'sub_min_configs')) || 10);
  const perServer = Math.min(6, Math.max(1, Number(await getSettingValue(DB, 'sub_ips_per_server')) || 3));
  const cleanIps = await bestCleanIps(DB, perServer);

  // ۱) واریانت‌های ضدسانسور (هر کدام یک مسیر مستقل؛ مردن یکی = باقی می‌مانند)
  const varRes = await buildVariantConfigs(DB, check.servers, sub.uuid, product, { count: wanted });
  const lines = [...varRes.lines];
  const entries = varRes.entries || [];

  // ۲) تکمیل با IPهای تمیز چندگانه اگر هنوز به حداقل نرسیده‌ایم
  if (lines.length < wanted) {
    for (const l of buildConfigsMulti(check.servers, sub.uuid, product, '', { cleanIps, perServer })) {
      if (lines.length >= wanted) break;
      if (!lines.includes(l)) lines.push(l);
    }
  }
  return {
    ok: true,
    reason: '',
    servers: check.servers,
    cleanIps,
    lines,
    entries,
    wanted,
    shortfall: Math.max(0, wanted - lines.length),
  };
}

/** محتوای صفحه لندینگ ساب — پویا و بدون هیچ کانفیگ نمونه/جعلی */
export async function subLandingHtml(env, sub) {
  const dyn = await dynamicSubContent(env, sub);
  const lines = dyn.lines;
  const direct = buildDirectLinks(dyn.servers);
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

  // دکمهٔ بازخورد اتصال موفق (استخراج خودکار IP از اتصال موفق کاربر)
  const ipChips = dyn.cleanIps.length
    ? `<div class="row" style="display:block">
<span style="color:#8fa3c8">📡 اگر با یکی از این IPها وصل شدید، تأیید کنید تا امتیازش واقعی‌تر شود:</span>
<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${dyn.cleanIps
      .map(
        (ip) =>
          `<button class="chip" data-ip="${esc(ip)}" onclick="connOk(this)">✅ ${esc(ip)}</button>`
      )
      .join('')}</div></div>`
    : '';

  let body;
  if (!dyn.ok) {
    const reasonText =
      dyn.reason === 'no_real_server'
        ? '⚠️ هنوز سرور واقعی برای این اشتراک تنظیم نشده است. لطفاً با پشتیبانی تماس بگیرید.'
        : '⚠️ سرویس در دسترس نیست؛ در حال حاضر مسیر سالمی برای این اشتراک باقی نمانده است. کمی بعد دوباره امتحان کنید.';
    body = `<div class="expired">${reasonText}</div>`;
  } else if (!lines.length) {
    body = `<div class="expired">⚠️ هنوز سرور واقعی برای این اشتراک تنظیم نشده است. لطفاً با پشتیبانی تماس بگیرید.</div>`;
  } else {
    // تک‌تک کانفیگ‌ها با دکمهٔ بازخورد (بخش ۳.۱: تشخیص فیلتر شدن روی نت ملی)
    const list = (dyn.entries && dyn.entries.length ? dyn.entries : lines.map((l) => ({ line: l, variantId: 0 })));
    const rows = list
      .map((it, i) => {
        const label = esc(it.label || `کانفیگ ${i + 1}`);
        const vid = Number(it.variantId || 0);
        return `<div class="cfg"><div class="ct">${label}</div>
<div class="cl">${esc(it.line)}</div>
<div class="cb">${vid ? `<button class="chip ok2" onclick="vfb(${vid},1)">✅ کار می‌کند</button><button class="chip no2" onclick="vfb(${vid},0)">⛔ وصل نشد / فیلتر است</button>` : `<button class="chip" onclick="cpOne(this)">📋 کپی</button>`}</div></div>`;
      })
      .join('');
    body = `<button class="btn" onclick="copyAll()">📋 کپی همه کانفیگ‌ها (${lines.length} مورد)</button>
${dyn.shortfall ? `<div class="short">⚠️ این اشتراک فعلاً ${faDigits(dyn.lines ? dyn.lines.length : 0)} کانفیگ سالم دارد (هدف: ${faDigits(dyn.wanted)}). اگر همه را یک‌جا قطع دیدید، با پشتیبانی تماس بگیرید — کانفیگ خراب تحویل نمی‌شود.</div>` : ''}
${rows}`;
  }

  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMINCK | ${esc(sub.title)}</title>
<style>
 body{font-family:Vazirmatn,Segoe UI,Roboto,sans-serif;background:#0d1526;color:#eaf1ff;margin:0;padding:24px;display:flex;justify-content:center}
 .card{max-width:640px;width:100%;background:#14213d;border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
 h1{font-size:20px;margin:0 0 4px}.sub{color:#8fa3c8;font-size:13px;margin-bottom:18px}
 .row{display:flex;justify-content:space-between;background:#0d1526;border-radius:12px;padding:12px 14px;margin:8px 0;font-size:13px}
 pre{background:#0a0f1d;border-radius:12px;padding:14px;font-size:11px;overflow:auto;max-height:320px;color:#7ee0a3;direction:ltr;text-align:left}
 .cfg{background:#0a0f1d;border:1px solid #22314f;border-radius:12px;padding:10px 12px;margin:8px 0}
 .ct{font-size:12px;color:#eaf1ff;font-weight:700;margin-bottom:6px}
 .cl{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#7ee0a3;direction:ltr;text-align:left;word-break:break-all;max-height:44px;overflow:hidden}
 .cb{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
 .ok2{background:#14513c;color:#b8f5df;border-color:#2a8063}
 .no2{background:#3d1420;color:#ffb3c4;border-color:#7a2440}
 .short{background:#3a2a0c;border:1px solid #7a5c14;color:#ffe1a3;border-radius:12px;padding:10px;font-size:12px;margin-bottom:10px}
 .btn{display:block;background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#1a1a1a;text-align:center;font-weight:700;border-radius:12px;padding:13px;margin:14px 0;text-decoration:none;cursor:pointer;border:none;width:100%;font-size:15px}
 .expired{background:#3d1420;color:#ff7b93;border-radius:12px;padding:14px;text-align:center;font-weight:700}
 .chip{background:#22314f;color:#eaf1ff;border:1px solid #33477a;border-radius:10px;padding:7px 12px;cursor:pointer;font-family:inherit;font-size:12px;direction:ltr}
 .chip.ok{background:#14513c;color:#b8f5df;border-color:#2a8063}
</style></head><body><div class="card">
<h1>⚡ ${esc(sub.title)}</h1>
<div class="sub">AMINCK — اشتراک اختصاصی شما</div>
${expired ? '<div class="expired">⛔ این اشتراک منقضی شده است — برای تمدید به ربات مراجعه کنید</div>' : `
<div class="row"><span>📅 تاریخ انقضا</span><b>${fmtDate(sub.expire_at)}</b></div>
<div class="row"><span>⏱ مدت</span><b>${faDigits(sub.days)} روز</b></div>
<div class="row"><span>📊 حجم</span><b>${sub.traffic_gb > 0 ? faDigits(sub.traffic_gb) + ' گیگابایت' : 'نامحدود'}</b></div>
<div class="row"><span>🖥 تعداد سرور سالم</span><b>${faDigits(dyn.servers.length)}</b></div>
${directHtml}
${ipChips}
${body}`}
<script>
function copyAll(){var t=[];document.querySelectorAll('.cl').forEach(function(e){t.push(e.innerText)});if(!t.length)return;navigator.clipboard.writeText(t.join('\\n')).then(function(){alert('✅ '+t.length+' کانفیگ کپی شد')})}
function cpOne(b){var c=b.closest('.cfg').querySelector('.cl');navigator.clipboard.writeText(c.innerText).then(function(){b.textContent='✅ کپی شد'})}
function vfb(vid,ok){var b=event.currentTarget;fetch('/api/sub/variant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(sub.token)},variantId:vid,ok:!!ok})}).then(function(r){return r.json()}).then(function(j){if(j&&j.ok){b.textContent=ok?'✅ ثبت شد':'⛔ ثبت شد — این مسیر موقتاً از ساب حذف می‌شود';b.disabled=true}else b.textContent='⚠️ ثبت نشد'}).catch(function(){b.textContent='⚠️ ارتباط برقرار نشد'})}
function connOk(btn){var ip=btn.getAttribute('data-ip');fetch('/api/sub/success',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(sub.token)},ip:ip})}).then(function(r){return r.json()}).then(function(j){if(j&&j.ok){btn.classList.add('ok');btn.textContent='✅ ثبت شد'}else{alert('⚠️ '+(j&&j.reason?j.reason:'ناموفق'))}}).catch(function(){alert('⚠️ ارتباط برقرار نشد')})}
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
  // kill-switch: بدون مسیر سالم، تست رایگان هم تحویل داده نمی‌شود
  const check = await checkDeliverable(DB, product);
  if (!check.ok) {
    throw new NoRealServerError(check.reason === 'no_real_server' ? undefined : SERVICE_UNAVAILABLE_MESSAGE);
  }
  return createSubscription(env, user, product, { isTrial: true, days: 1, trafficGb: 0.5 });
}
