// ═══════════════════════════════════════════════════════════════════
//  بخش ۲ — تانل VLESS-over-WebSocket داخل خود Worker (src/tunnel.js)
//
//  ⚠️ صداقت فنی — چیزی که واقعاً پیاده/تست شده و چیزی که نه:
//   • منطق خالص این فایل (پارس هدر VLESS، احراز UUID، رد آدرس‌های ممنوع،
//     شمارش/سقف مصرف، ساخت کانفیگ، ساختن مسیر WS) کاملاً لوکال/موک تست می‌شود.
//   • رلهٔ واقعی بایت‌ها بین WebSocket و سوکت TCP با connect() از
//     'cloudflare:sockets' فقط روی خود Cloudflare Workers اجرا می‌شود و در
//     تست‌های لوکال/موک قابل اجرا نیست؛ بنابراین رلهٔ انتها-به‌انتها
//     هنوز روی Cloudflare واقعی smoke-test نشده است (به گزارش نهایی مراجعه کنید).
//
//  محدودیت‌های واقعی Workers که روی این تانل اثر می‌گذارند (بدون ادعای
//  «پشتیبانی می‌شود»):
//   • UDP روی Workers وجود ندارد → پروتکل VLESS-UDP/MUX (کماندهای 0x02 و 0x03)
//     صریحاً پشتیبانی نمی‌شود و با پیام روشن رد می‌شود. برای DNS باید DoH
//     (DoH_client بالای Workers) به‌کار رود، نه UDP خام.
//   • Workers اجازهٔ اتصال به آدرس‌های loopback/private/multicast/reserved را
//     نمی‌دهد. این فایل آدرس‌های literal را همین‌جا رد می‌کند؛ برای دامنه‌ای که
//     به IP خصوصی resolve می‌شود، اعمال محدودیت در زمان اجرا به عهدهٔ خود
//     رانتایم Workers است.
//   • مدت اجرای هر اتصال به سقف CPU-time/مدت Workers محدود است؛ اتصال‌های
//     بسیار طولانی ممکن است قطع شوند.
// ═══════════════════════════════════════════════════════════════════
import { getNum, isEnabled, getSettingValue } from './texts.js';
import { randToken } from './db.js';

const now = () => Math.floor(Date.now() / 1000);

// ─── ثابت‌های پروتکل VLESS ───
export const VLESS_VERSION = 0x00;
export const CMD_TCP = 0x01;
export const CMD_UDP = 0x02;
export const CMD_MUX = 0x03;
export const ATYP_IPV4 = 0x01;
export const ATYP_DOMAIN = 0x02;
export const ATYP_IPV6 = 0x03;

const VALID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** یک UUID معتبر برای کانفیگ/سربرگ VLESS است؟ */
export function isValidUuid(u) {
  return VALID_UUID_RE.test(String(u || '').trim());
}

/**
 * پارس سربرگ درخواست VLESS از بایت‌های ابتدای استریم.
 * چیدمان: version(1) + uuid(16) + addonsLen(1) + addons + cmd(1) + port(2) + atyp(1) + address
 * @param {Uint8Array|ArrayLike} buf
 * @returns {{ok:boolean, needMore?:boolean, version?:number, uuid?:string, cmd?:number, port?:number,
 *            atyp?:number, host?:string, headerLen?:number, error?:string, udp?:boolean}}
 */
export function parseVlessHeader(buf) {
  const b = Array.from(buf || []);
  if (b.length < 1) return { ok: false, needMore: true };
  const version = b[0];
  if (version !== VLESS_VERSION) return { ok: false, error: `unsupported_version:${version}` };
  if (b.length < 1 + 16 + 1) return { ok: false, needMore: true };
  const uuidBytes = b.slice(1, 17);
  const addonsLen = b[17];
  let p = 18 + addonsLen;
  if (b.length < p + 1 + 2 + 1) return { ok: false, needMore: true };
  const cmd = b[p];
  p += 1;
  const port = (b[p] << 8) | b[p + 1];
  p += 2;
  const atyp = b[p];
  p += 1;
  let host = '';
  if (atyp === ATYP_IPV4) {
    if (b.length < p + 4) return { ok: false, needMore: true };
    host = b.slice(p, p + 4).join('.');
    p += 4;
  } else if (atyp === ATYP_IPV6) {
    if (b.length < p + 16) return { ok: false, needMore: true };
    const parts = [];
    for (let i = 0; i < 8; i++) parts.push(((b[p + i * 2] << 8) | b[p + i * 2 + 1]).toString(16));
    host = parts.join(':');
    p += 16;
  } else if (atyp === ATYP_DOMAIN) {
    if (b.length < p + 1) return { ok: false, needMore: true };
    const len = b[p];
    p += 1;
    if (b.length < p + len) return { ok: false, needMore: true };
    host = String.fromCharCode(...b.slice(p, p + len));
    p += len;
  } else {
    return { ok: false, error: `unsupported_atyp:${atyp}` };
  }
  const uuid = Array.from(uuidBytes, (x) => x.toString(16).padStart(2, '0')).join('');
  // صرفاً برای خوانایی، uuid را با خط‌تیره‌گذاری استاندارد برمی‌گردانیم
  const dashed = `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
  return {
    ok: true,
    version,
    uuid: dashed,
    cmd,
    port,
    atyp,
    host,
    headerLen: p,
    udp: cmd === CMD_UDP || cmd === CMD_MUX,
    mux: cmd === CMD_MUX,
  };
}

/** ساخت یک UUID تصادفی معتبر (نسخهٔ ۴) */
export function randomUuidV4() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ─── آدرس‌های literal ممنوع (loopback/private/multicast/link-local/reserved) ───
function ipv4Int(ip) {
  const p = String(ip).split('.').map(Number);
  if (p.length !== 4 || p.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

function v6ToBig(parts) {
  // بازسازی IPv6 (بلوک‌های ناقص با صفر) — برای بررسی بلوک‌های متداول کافی است
  const blocks = parts.map((x) => parseInt(x || '0', 16));
  let n = 0n;
  for (const blk of blocks) n = (n << 16n) | BigInt(blk & 0xffff);
  return n;
}

/** آیا این آدرس literal در رنج ممنوع برای Workers است؟ (بلوک دادن سمت‌ورکر) */
export function isBlockedLiteral(host) {
  const h = String(host || '').trim().toLowerCase();
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    const n = ipv4Int(h);
    if (n === null) return true;
    if (n === 0) return true; // 0.0.0.0/8
    if ((n >>> 24) === 10) return true; // 10/8
    if ((n >>> 24) === 127) return true; // 127/8 loopback
    if ((n >>> 24) === 169 && ((n >>> 16) & 0xff) === 254) return true; // link-local
    if ((n >>> 24) === 172 && ((n >>> 16) & 0xff) >= 16 && ((n >>> 16) & 0xff) <= 31) return true; // 172.16/12
    if ((n >>> 24) === 192 && ((n >>> 16) & 0xff) === 168) return true; // 192.168/16
    if ((n >>> 24) === 100 && ((n >>> 16) & 0xff) >= 64 && ((n >>> 16) & 0xff) <= 127) return true; // CGNAT 100.64/10
    const top = (n >>> 28) & 0xf; // 224-255 multicast/reserved
    if (top >= 14) return true;
    return false;
  }
  // IPv6
  if (h.includes(':')) {
    if (h === '::' || h === '::1') return true; // unspecified/loopback
    const cleaned = h.replace(/^\[|\]$/g, '').split('%')[0];
    if (/^::ffff:/i.test(cleaned) && /\./.test(cleaned)) {
      // IPv4-mapped IPv6 → همان قواعد IPv4
      const tail = cleaned.split(':').pop();
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(tail)) return isBlockedLiteral(tail);
    }
    const parts = cleaned.split('::');
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const zeros = 8 - left.length - right.length;
    const norm = [...left, ...Array(Math.max(0, zeros)).fill('0'), ...right];
    const n = v6ToBig(norm);
    // ::1 loopback
    if (n === 1n) return true;
    return isBlockedV6Big(n);
  }
  // دامنه‌های سیستمی/رزرو شده
  if (/\.(internal|local|localhost|invalid|test)$/i.test(h)) return true;
  return false;
}

function isBlockedV6Big(n) {
  const top16 = Number(n >> 112n) & 0xffff;
  // fe80::/10
  if ((top16 & 0xffc0) === 0xfe80) return true;
  // fc00::/7 unique-local
  if ((top16 & 0xfe00) === 0xfc00) return true;
  // ff00::/8 multicast
  if ((top16 & 0xff00) === 0xff00) return true;
  // 2001:db8::/32 doc
  if ((n >> 96n) === 0x20010db8n) return true;
  return false;
}

/** آیا درخواست تانل به مقصد ممنوع/نامعتبر است؟ */
export function targetAllowed(host, port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return { ok: false, reason: 'bad_port' };
  if (isBlockedLiteral(host)) return { ok: false, reason: 'blocked_target' };
  return { ok: true };
}

// ─── تنظیمات تانل ───
export async function tunnelWsPath(env) {
  const cur = await getSettingValue(env.DB, 'tunnel_ws_path');
  if (cur) return cur;
  const p = `/wss-${randToken(12)}`;
  await env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind('tunnel_ws_path', p)
    .run();
  return p;
}

/** آیا تانل برای این درخواست (راه‌اندازی‌شده + فعال) مجاز است؟ */
export async function tunnelGate(env, request, url) {
  if (!(await isEnabled(env.DB, 'tunnel_enabled'))) {
    return { ok: false, status: 404, reason: 'not_enabled' };
  }
  const path = await tunnelWsPath(env);
  if (url.pathname !== path) return { ok: false, status: 404, reason: 'not_found' };
  const upgrade = String(request.headers.get('upgrade') || '').toLowerCase();
  if (upgrade !== 'websocket') return { ok: false, status: 426, reason: 'not_ws' };
  return { ok: true };
}

/**
 * یافتن اشتراک معتبر برای یک UUID تانل.
 * UUID می‌تواند dash-less یا dash-دار باشد (مقایسهٔ عادی‌شده).
 */
export async function findSubscriptionByUuid(env, uuidIn) {
  const n = String(uuidIn || '').replace(/-/g, '').toLowerCase();
  const rows = (await env.DB.prepare("SELECT * FROM subscriptions WHERE active=1").all()).results;
  for (const s of rows) {
    const su = String(s.uuid || '').replace(/-/g, '').toLowerCase();
    if (su && su === n) return s;
  }
  return null;
}

/** آیا اشتراک هنوز معتبر است و سقف مصرف را رد نکرده؟ */
export async function subQuotaOk(env, sub) {
  if (Number(sub.expire_at || 0) < now()) return { ok: false, reason: 'expired' };
  const maxBytes = await getNum(env.DB, 'tunnel_max_bytes', 0);
  if (maxBytes > 0 && Number(sub.traffic_used || 0) >= maxBytes) return { ok: false, reason: 'quota_exceeded' };
  return { ok: true };
}

/** شمارش مصرف (بایت) برای یک اشتراک — از جدول tunnel_usage تجمیع می‌کند */
export async function recordTunnelTraffic(env, subId, bytesIn, bytesOut) {
  const upsert =
    'INSERT INTO tunnel_usage (sub_id, bytes_in, bytes_out, connects, last_seen) VALUES (?,?,?,0,?) ' +
    'ON CONFLICT(sub_id) DO UPDATE SET bytes_in=bytes_in+excluded.bytes_in, bytes_out=bytes_out+excluded.bytes_out, last_seen=excluded.last_seen';
  await env.DB.prepare(upsert).bind(subId, Math.max(0, Math.round(bytesIn)), Math.max(0, Math.round(bytesOut)), now()).run();
}

/** مصرف تجمیعی یک اشتراک (برای پنل) */
export async function tunnelUsage(env, subId) {
  const row = await env.DB.prepare('SELECT * FROM tunnel_usage WHERE sub_id=?').bind(subId).first();
  return row
    ? { sub_id: row.sub_id, bytes_in: Number(row.bytes_in || 0), bytes_out: Number(row.bytes_out || 0), connects: Number(row.connects || 0), last_seen: Number(row.last_seen || 0) }
    : { sub_id: subId, bytes_in: 0, bytes_out: 0, connects: 0, last_seen: 0 };
}

/** ساختن UUID معتبر برای اشتراک در صورت نبودن (برای کانفیگ تانل) */
export async function ensureTunnelUuid(env, sub) {
  if (sub.uuid && isValidUuid(sub.uuid)) return sub.uuid;
  const fresh = randomUuidV4();
  await env.DB.prepare('UPDATE subscriptions SET uuid=? WHERE id=?').bind(fresh, sub.id).run();
  return fresh;
}

/**
 * ساخت کانفیگ vless:// به سمت خود ورکر (protocol cf-worker).
 * میزبان از worker_origin واقعیِ همان ورکر خوانده می‌شود — هیچ دامنه‌ای
 * حدس زده/جعل نمی‌شود. اگر origin موجود نباشد، کانفیگ ساخته نمی‌شود.
 */
export async function buildTunnelConfig(env, sub, opts = {}) {
  if (!(await isEnabled(env.DB, 'tunnel_enabled'))) return { ok: false, reason: 'not_enabled' };
  let origin = '';
  try {
    origin = String(await env.KV.get('worker_origin') || '').trim();
  } catch {}
  if (!origin) return { ok: false, reason: 'no_origin' };
  const host = origin.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const path = await tunnelWsPath(env);
  const uuid = await ensureTunnelUuid(env, sub);
  const name = encodeURIComponent(`AMINCK | تانل ورکر | ${sub.title || 'اشتراک'}`);
  const frag = opts.fragment || '#cf-worker';
  const uri = `vless://${uuid}@${host}:443?encryption=none&type=ws&security=tls&host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}&fp=chrome${frag}&pinned=${''}${name}`;
  return { ok: true, uri, host, path, uuid, protocol: 'cf-worker' };
}

// ─── هندلر آپگرید WS (رلهٔ واقعی فقط روی Workers) ───
/**
 * با در دسترس بودن رانتایم Workers، بایت‌ها را بین WebSocket کلاینت و
 * سوکت TCPِ اتصال‌یافته با connect() از 'cloudflare:sockets' پاس می‌دهد.
 * در تست‌های لوکال صدا زده نمی‌شود (cloudflare:sockets در دسترس نیست).
 */
export async function relayTunnelConnection(env, clientWs, parsed, sub, opts = {}) {
  // import پویا تا ماژول در محیط تست/لوکال load شود
  const { connect } = await import('cloudflare:sockets');
  const socket = connect({ hostname: parsed.host, port: parsed.port });
  const writer = socket.writable.getWriter();
  const reader = clientWs.readable.getReader();
  const track = opts.track || (() => {});
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    try { clientWs.close(); } catch {}
    try { writer.close(); } catch {}
  };
  try {
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const arr = value instanceof Uint8Array ? value : new Uint8Array(value);
          await writer.write(arr);
          track(arr.length, 0);
        }
      } catch {}
      cleanup();
    })();
    (async () => {
      try {
        const sr = socket.readable.getReader();
        while (true) {
          const { done, value } = await sr.read();
          if (done) break;
          const arr = value instanceof Uint8Array ? value : new Uint8Array(value);
          clientWs.send(arr);
          track(0, arr.length);
        }
      } catch {}
      cleanup();
    })();
    // قفل تا بسته‌شدن
    await new Promise((r) => clientWs.addEventListener('close', r, { once: true }));
  } finally {
    cleanup();
  }
}

/** لاگ خطای امن — هرگز uuid/توکن/محتوای بدنه در لاگ نمی‌رود */
export function logTunnelError(where, err) {
  const msg = String((err && err.message) || err || 'unknown');
  // فقط توکن/نوع خطا؛ شماره/متن کامل که ممکن است uuid داشته باشد را فیلتر می‌کنیم
  const safe = msg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[uuid]');
  console.warn(`[tunnel] ${where}: ${safe.slice(0, 200)}`);
}
