// ═══════════════════════════════════════════════════════════════════
//  ابزارهای عمومی — امنیت وب‌اپ، دیپ‌لینک، پاسخ‌های HTTP
// ═══════════════════════════════════════════════════════════════════

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

export const text = (body, status = 200, type = 'text/plain; charset=utf-8') =>
  new Response(body, { status, headers: { 'Content-Type': type } });

export async function hmacSha256(keyBytes, msg) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}

/** فرار HTML برای رندر متن کاربر در صفحه‌های وب */
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** اعتبارسنجی initData وب‌اپ تلگرام طبق مستندات رسمی */
export async function verifyInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const pairs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort();
    const dataCheckString = pairs.join('\n');
    const secret = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
    const calc = toHex(await hmacSha256(secret, dataCheckString));
    if (calc !== hash) return null;
    const user = JSON.parse(params.get('user') || '{}');
    // عمر داده کمتر از ۲۴ ساعت
    const authDate = Number(params.get('auth_date') || 0);
    if (authDate && Date.now() / 1000 - authDate > 86400) return null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

export function deepLink(botUsername, payload) {
  return payload ? `https://t.me/${botUsername}?start=${payload}` : `https://t.me/${botUsername}`;
}

/** آدرس عمومی Worker از اولین درخواست در Durable Object کش می‌شود. */
export async function getBase(env, request = null) {
  try {
    const cached = await env.KV.get('worker_origin');
    if (cached) return String(cached).replace(/\/$/, '');
    if (request) {
      const origin = new URL(request.url).origin;
      await env.KV.put('worker_origin', origin);
      return origin;
    }
  } catch {}
  return '';
}

/** جایگذاری {name} در متن */
export function tmpl(str, vars = {}) {
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

export function parseMoney(s) {
  // تبدیل ارقام فارسی/عربی و حذف جداکننده‌ها
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  let out = '';
  for (const ch of String(s)) {
    const fi = fa.indexOf(ch);
    const ai = ar.indexOf(ch);
    if (fi >= 0) out += fi;
    else if (ai >= 0) out += ai;
    else if (/\d/.test(ch)) out += ch;
  }
  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** رمز پنل تحت وب باید دقیقاً ۱۰ رقم عددی باشد */
export function isValidPanelPassword(v) {
  return /^\d{10}$/.test(String(v || '').trim());
}

/** ساخت رمز تصادفی ۱۰ رقمی */
export function randomPanelPassword() {
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => n % 10).join('');
}
