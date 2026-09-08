// ═══════════════════════════════════════════════════════════════════
//  بخش ۴ — ساخت خودکار سکرت/کلید (دکمهٔ «🎲 ساخت خودکار»)
//
//  ⚠️ همهٔ این مقادیر «سکرت سمت کلاینت/سرور» هستند؛ خود Worker نمی‌تواند
//     سرور MTProto/Reality باشد. مقدار تولیدشده باید روی سرور واقعی خودِ
//     ادمین هم ست شود تا کار کند.
// ═══════════════════════════════════════════════════════════════════

/** UUID استاندارد برای VLESS / VMess / Trojan */
export function randomUuid() {
  return crypto.randomUUID();
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** پسورد امن base64url حداقل ۲۴ کاراکتر (Trojan / Shadowsocks) */
export function randomSecurePassword(len = 32) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => B64URL[b & 63]).join('');
}

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * سکرت MTProto — ۱۶ بایت هگز، سه حالت:
 *   'raw'  → 32 کاراکتر هگز
 *   'dd'   → dd + 32 هگز (random padding)
 *   'ee'   → ee + 32 هگز + هگز دامنه (FakeTLS)
 * خروجی همیشه با isValidMtprotoSecret اعتبارسنجی می‌شود.
 */
export function randomMtprotoSecret(mode = 'raw', fakeTlsDomain = '') {
  const hex = randomHex(16);
  if (mode === 'dd') return `dd${hex}`;
  if (mode === 'ee') {
    const dom = String(fakeTlsDomain || '').trim();
    if (!dom) return `ee${hex}`; // بدون دامنه، همان ee+hex کوتاه (اعتبار کمتر)
    const domHex = Array.from(new TextEncoder().encode(dom), (b) => b.toString(16).padStart(2, '0')).join('');
    return `ee${hex}${domHex}`;
  }
  return hex;
}

/** هشدار اجباری کنار MTProto (مطابق الزام بخش ۴) */
export const MTPROTO_SECRET_WARNING =
  '⚠️ این سکرت فقط وقتی کار می‌کند که همین مقدار را روی سرور MTProto واقعی خودتان هم ست کرده باشید. ' +
  'Worker نمی‌تواند خودش سرور MTProto باشد چون TCP خام ورودی ندارد.';

/** راهنمای تولید کلید Reality (pbk/sid) — Worker فقط راهنما می‌دهد، کلید نمی‌سازد */
export const REALITY_KEY_GUIDANCE =
  'برای Reality باید روی سرور واقعی خودتان با xray یک زوج کلید X25519 بسازید:\n' +
  'xray x25519\n' +
  '• private key → در کانفیگ سمت سرور (flow: xtls-rprx-vision)\n' +
  '• public key  → فیلد pbk کانفیگ کلاینت\n' +
  '• short id (hex) → فیلد sid کانفیگ کلاینت\n' +
  'Worker نمی‌تواند این زوج کلید را برای سرور واقعی شما تولید/جایگزین کند.';

/**
 * ساخت خودکار سکرت بر اساس پروتکل.
 * @returns {{secret:string, note?:string}|{error:string}}
 */
export function generateSecretFor(protocol, opts = {}) {
  const p = String(protocol || '').toLowerCase();
  switch (p) {
    case 'vless':
    case 'vmess':
    case 'trojan':
      return { secret: randomUuid() };
    case 'ss':
      return { secret: randomSecurePassword(32) };
    case 'mtproto':
      return { secret: randomMtprotoSecret(opts.mtprotoMode || 'raw', opts.fakeTlsDomain), note: MTPROTO_SECRET_WARNING };
    case 'reality':
      return { error: REALITY_KEY_GUIDANCE };
    default:
      return { secret: randomSecurePassword(32) };
  }
}
