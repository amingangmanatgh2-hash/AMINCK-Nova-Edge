// Bot credentials never belong in a browser response, configuration export or audit log.
// The only deployment secret needed by the UI wizard is PANEL_PASSWORD.
const encoder = new TextEncoder();
const PURPOSE = encoder.encode('nova-guard.bot-credentials.v1');
const ITERATIONS = 100_000; // Supported by Workers Web Crypto; derive once per cold start/save.
export interface VaultEnvelope {
  version: 1; kdf: 'PBKDF2-SHA256'; iterations: number;
  salt: string; iv: string; ciphertext: string;
}
export interface BotCredentials { botToken: string; webhookSecret: string }
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(value: string, max: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > max * 2) throw new Error('Invalid envelope');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length > max) throw new Error('Invalid envelope');
  return bytes;
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (!password || password.length < 16 || password.startsWith('REPLACE_')) throw new Error('رمز پنل معتبر تنظیم نشده است.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealCredentials(credentials: BotCredentials, password: string): Promise<VaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: PURPOSE }, key,
    encoder.encode(JSON.stringify(credentials)));
  return { version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
}
export async function openCredentials(envelope: VaultEnvelope, password: string): Promise<BotCredentials> {
  try {
    if (envelope.version !== 1 || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS) throw new Error('Invalid envelope');
    const salt = decode(envelope.salt, 16), iv = decode(envelope.iv, 12), bytes = decode(envelope.ciphertext, 2048);
    if (salt.length !== 16 || iv.length !== 12 || bytes.length < 17) throw new Error('Invalid envelope');
    const key = await derive(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: PURPOSE }, key, bytes);
    const data = JSON.parse(new TextDecoder().decode(decrypted));
    if (typeof data.botToken !== 'string' || typeof data.webhookSecret !== 'string') throw new Error('Invalid envelope');
    return { botToken: data.botToken, webhookSecret: data.webhookSecret };
  } catch {
    // Do not echo ciphertext, decrypted bytes, credentials or the passphrase on any failure.
    throw new Error('اطلاعات اتصال با رمز فعلی باز نمی‌شود. اگر رمز پنل را عوض کرده‌اید، توکن همان بات را دوباره ثبت کنید.');
  }
}

// Password-rotation tracking must not store a cheap SHA-256 password verifier next
// to a password-encrypted vault. Use the same work factor and cache in memory only.
export async function passwordStamp(value: string, saltHex: string): Promise<string> {
  if (!/^[a-f0-9]{32}$/.test(saltHex)) throw new Error('Invalid password-stamp salt');
  const salt = Uint8Array.from(saltHex.match(/../g)!, part => parseInt(part,16));
  const material = await crypto.subtle.importKey('raw',encoder.encode(value),'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,256);
  return encode(new Uint8Array(bits));
}
