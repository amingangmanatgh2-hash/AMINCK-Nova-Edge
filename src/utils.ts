export const now = () => Date.now();
export function normalize(s: string): string {
  return s.normalize('NFKC').replace(/[۰-۹]/g, x => String(x.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, x => String(x.charCodeAt(0) - 1632)).replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}
export const html = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const fa = (n: number) => n.toLocaleString('fa-IR');
export function token(bytes = 24): string { return [...crypto.getRandomValues(new Uint8Array(bytes))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function hash(value: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function secureEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hash(a), hash(b)]); let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
export function randomInt(max: number): number {
  if (!Number.isSafeInteger(max) || max <= 0 || max > 1_000_000) throw new Error('Invalid random bound');
  const ceiling = Math.floor(0x100000000 / max) * max;
  let value; do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= ceiling);
  return value % max;
}
export function integer(s: string | number, min = 1, max = 1_000_000_000): number {
  const value = typeof s === 'string' && /^-?\d+$/.test(normalize(s)) ? Number(normalize(s)) : typeof s === 'number' ? s : NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    // For huge ranges (like user ID validation) don't show scary 9 quadrillion number
    if (max >= Number.MAX_SAFE_INTEGER) throw new Error('شناسهٔ عددی معتبر وارد کنید.');
    if (max > 100000) throw new Error(`عدد باید بین ${fa(min)} و ${fa(max)} باشد.`);
    throw new Error(`لطفاً عددی بین ${fa(min)} تا ${fa(max)} وارد کنید.`);
  }
  return value;
}
export const onOff = (s: string) => {
  const n = normalize(s).toLowerCase();
  if (['on', 'روشن', 'فعال', 'بله', '1'].includes(n)) return true;
  if (['off', 'خاموش', 'غیرفعال', 'خیر', '0'].includes(n)) return false;
  throw new Error('از «روشن» یا «خاموش» استفاده کنید.');
};
export function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export function safeError(error: unknown, secrets: string[] = []): string {
  if (!(error instanceof Error)) return 'خطای داخلی؛ دوباره تلاش کنید.';
  let message = error.message;
  for (const secret of secrets) if (secret.length >= 4) message = message.split(secret).join('[REDACTED]');
  return message.replace(/\b\d{5,16}:[A-Za-z0-9_-]{20,}/g, '[REDACTED]').replace(/https:\/\/api\.telegram\.org\/bot\S+/g, '[Telegram API]').slice(0, 350);
}
export function calculate(source: string): number {
  const input = normalize(source).replace(/×/g, '*').replace(/÷/g, '/').replace(/\s/g, '');
  if (!input || input.length > 150 || /[^\d.+\-*/%()]/.test(input)) throw new Error('فقط عدد، پرانتز و + - × ÷ % مجاز است.');
  let i = 0, depth = 0;
  const atom = (): number => {
    if (++depth > 24) throw new Error('عبارت بیش از حد پیچیده است.');
    let value: number;
    if (input[i] === '+' || input[i] === '-') { const sign = input[i++] === '-' ? -1 : 1; value = sign * atom(); }
    else if (input[i] === '(') { i++; value = sum(); if (input[i++] !== ')') throw new Error('پرانتز نامعتبر'); }
    else { const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(input.slice(i)); if (!match) throw new Error('عبارت نامعتبر'); i += match[0].length; value = Number(match[0]); }
    depth--; return value;
  };
  const product = (): number => { let n = atom(); while (['*', '/', '%'].includes(input[i])) { const op = input[i++], v = atom(); n = op === '*' ? n * v : op === '/' ? n / v : n % v; } return n; };
  const sum = (): number => { let n = product(); while (['+', '-'].includes(input[i])) { const op = input[i++], v = product(); n = op === '+' ? n + v : n - v; } return n; };
  const value = sum(); if (i !== input.length || !Number.isFinite(value) || Math.abs(value) > 1e15) throw new Error('نتیجه نامعتبر یا بیش از حد بزرگ است.');
  return Number(value.toPrecision(12));
}
