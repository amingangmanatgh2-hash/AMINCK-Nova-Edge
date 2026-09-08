// ═══════════════════════════════════════════════════════════════════
//  اعتبارسنجی سرورها و ساخت لینک‌های اتصال واقعی
//  — MTProto: لینک مستقیم تلگرام (tg://proxy و https://t.me/proxy)
//  — SOCKS5:  لینک مستقیم تلگرام (tg://socks و https://t.me/socks)
//  — VLESS/VMess/Trojan/SS: لینک ساب (/sub/<token>)
//
//  هیچ‌جا سکرت/UUID جعلی ساخته نمی‌شود؛ اگر اطلاعات سرور ناقص باشد
//  لینک ساخته نمی‌شود و خطای واضح به ادمین برمی‌گردد.
// ═══════════════════════════════════════════════════════════════════

/** پروتکل‌هایی که تحویل‌شان لینک اشتراک (subscription) است */
export const SUBSCRIPTION_PROTOCOLS = ['vless', 'vmess', 'trojan', 'ss'];

/** پروتکل‌هایی که تحویل‌شان لینک اتصال مستقیم است */
export const DIRECT_PROTOCOLS = ['mtproto', 'socks5'];

/** نوع تحویل هر پروتکل */
export function deliveryKind(protocol) {
  const p = String(protocol || '').toLowerCase();
  if (p === 'mtproto') return 'mtproto';
  if (p === 'socks5') return 'socks5';
  if (p === 'openvpn') return 'file';
  return 'subscription';
}

// ─────────────────────── هاست‌های نمونه/جعلی ───────────────────────

/**
 * دامنه‌های رزروشدهٔ مستندسازی (RFC 2606) و مقادیر placeholder.
 * هیچ‌کدام نباید به‌عنوان کانفیگ واقعی به کاربر تحویل شوند.
 */
const PLACEHOLDER_PATTERNS = [
  /(^|\.)example\.(com|net|org|edu)$/i,
  /(^|\.)(test|invalid|localhost|local|example)$/i,
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i,
  /^(your|my)[-_.]?(server|host|domain)/i,
  /^(changeme|placeholder|todo|sample|demo|dummy|foo|bar)$/i,
  /(^|\.)server\.example\./i,
];

/** آیا این هاست یک آدرس نمونه/جعلی است؟ */
export function isPlaceholderHost(host) {
  const h = String(host || '').trim().toLowerCase();
  if (!h) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(h));
}

/** ساده‌ترین اعتبارسنجی ساختاری هاست (دامنه یا IPv4) */
export function isValidHost(host) {
  const h = String(host || '').trim();
  if (!h || /\s/.test(h)) return false;
  if (isPlaceholderHost(h)) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4.test(h)) return h.split('.').every((o) => Number(o) >= 0 && Number(o) <= 255);
  // دامنه: حداقل یک نقطه و TLD حرفی
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(h);
}

/** پورت معتبر TCP */
export function isValidPort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

// ─────────────────────── سکرت MTProto ───────────────────────

/**
 * سکرت معتبر MTProto طبق پیاده‌سازی رسمی تلگرام:
 *   • ۳۲ کاراکتر هگز            → سکرت ساده
 *   • dd + ۳۲ هگز               → حالت random-padding
 *   • ee + ۳۲ هگز + hex(دامنه)  → حالت FakeTLS
 *   • base64url معادل موارد بالا (که تلگرام هم می‌پذیرد)
 */
export function isValidMtprotoSecret(secret) {
  const s = String(secret || '').trim();
  if (!s) return false;
  if (/^(dd)?[0-9a-f]{32}$/i.test(s)) return true;
  if (/^ee[0-9a-f]{34,}$/i.test(s) && s.length % 2 === 0) return true;
  // base64url — ۱۶ بایت خام = ۲۲ کاراکتر، FakeTLS بلندتر است
  if (/^[A-Za-z0-9_-]{22,}={0,2}$/.test(s) && !/^[0-9a-f]+$/i.test(s)) return true;
  return false;
}

/** رشتهٔ سکرت را برای قراردادن در URL آماده می‌کند */
export function normalizeMtprotoSecret(secret) {
  return String(secret || '').trim();
}

/** خطای ساخت لینک با کد ماشین‌خوان (برای گزارش دقیق به ادمین) */
function linkError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

// ─────────────────────── ساخت لینک‌ها ───────────────────────

/**
 * لینک‌های اتصال مستقیم پروکسی MTProto تلگرام.
 * @returns {{tg:string, https:string}}
 * @throws {Error} اگر اطلاعات ناقص/نامعتبر باشد (لینک جعلی ساخته نمی‌شود)
 */
export function buildMtprotoLinks({ host, port, secret }) {
  const h = String(host || '').trim();
  const p = Number(port);
  const s = normalizeMtprotoSecret(secret);
  if (!isValidHost(h)) throw linkError('mtproto_host_invalid');
  if (!isValidPort(p)) throw linkError('mtproto_port_invalid');
  if (!isValidMtprotoSecret(s)) throw linkError('mtproto_secret_invalid');
  const qs = `server=${encodeURIComponent(h)}&port=${p}&secret=${encodeURIComponent(s)}`;
  return { tg: `tg://proxy?${qs}`, https: `https://t.me/proxy?${qs}` };
}

/**
 * لینک‌های اتصال مستقیم پروکسی SOCKS5 تلگرام.
 * user/pass اختیاری‌اند (پروکسی عمومی بدون احراز هویت هم مجاز است).
 */
export function buildSocks5Links({ host, port, user = '', pass = '' }) {
  const h = String(host || '').trim();
  const p = Number(port);
  if (!isValidHost(h)) throw linkError('socks5_host_invalid');
  if (!isValidPort(p)) throw linkError('socks5_port_invalid');
  let qs = `server=${encodeURIComponent(h)}&port=${p}`;
  if (user) qs += `&user=${encodeURIComponent(user)}`;
  if (pass) qs += `&pass=${encodeURIComponent(pass)}`;
  return { tg: `tg://socks?${qs}`, https: `https://t.me/socks?${qs}` };
}

// ─────────────────────── سلامت پیکربندی سرور ───────────────────────

/**
 * مشکلات پیکربندی یک سرور را به فارسی برمی‌گرداند.
 * آرایهٔ خالی یعنی سرور برای تحویل واقعی آماده است.
 * @param {object} s سطر جدول servers
 * @returns {string[]}
 */
export function serverIssues(s) {
  const issues = [];
  if (!s) return ['سرور یافت نشد.'];
  const host = String(s.ip || '').trim();
  const proto = String(s.protocol || '').toLowerCase();

  if (!host) issues.push('هاست/IP تنظیم نشده است.');
  else if (isPlaceholderHost(host)) issues.push(`هاست «${host}» یک آدرس نمونه است و واقعی نیست.`);
  else if (!isValidHost(host)) issues.push(`هاست «${host}» ساختار معتبری ندارد.`);

  if (proto === 'mtproto') {
    if (!isValidPort(s.port)) issues.push('پورت MTProto تنظیم نشده یا معتبر نیست (۱ تا ۶۵۵۳۵).');
    if (!String(s.secret || '').trim()) issues.push('سکرت MTProto تنظیم نشده است.');
    else if (!isValidMtprotoSecret(s.secret)) issues.push('سکرت MTProto معتبر نیست (۳۲ هگز، یا dd/ee + هگز، یا base64url).');
  } else if (proto === 'socks5') {
    if (!isValidPort(s.port)) issues.push('پورت SOCKS5 تنظیم نشده یا معتبر نیست.');
  } else {
    const t = String(s.template || '');
    if (t && /example\.(com|net|org)/i.test(t)) issues.push('قالب کانفیگ هنوز شامل دامنهٔ نمونهٔ example.com است.');
  }
  return issues;
}

/** آیا سرور برای تحویل واقعی قابل استفاده است؟ */
export function isServerUsable(s) {
  return serverIssues(s).length === 0;
}

/** آیا سرور «فعال» و قابل استفاده است؟ */
export function isServerDeliverable(s) {
  return !!s && !!s.active && isServerUsable(s);
}

/** پیام استاندارد نبودِ سرور واقعی */
export const NO_REAL_SERVER_MESSAGE =
  '⚠️ هنوز سرور واقعی تنظیم نشده است؛ این محصول فعلاً قابل تحویل نیست.';

/**
 * پیام صادقانهٔ kill-switch: وقتی هیچ مسیر سالمی برای یک پروتکل باقی نمانده،
 * به‌جای تحویل کانفیگ مرده، همین پیام داده می‌شود.
 */
export const SERVICE_UNAVAILABLE_MESSAGE =
  '⚠️ سرویس در دسترس نیست؛ در حال حاضر هیچ مسیر سالمی برای این پروتکل باقی نمانده است. ' +
  'لطفاً کمی بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید. 🙏';

/** خطای اختصاصی «سرور واقعی موجود نیست» */
export class NoRealServerError extends Error {
  constructor(message = NO_REAL_SERVER_MESSAGE) {
    super(message);
    this.name = 'NoRealServerError';
    this.code = 'no_real_server';
  }
}
