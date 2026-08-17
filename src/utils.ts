/**
 * EDGE PANEL — pure helpers (no Cloudflare runtime dependencies,
 * fully unit-testable in Node).
 */
import type { Permission } from './types';
import { ROLE_PERMISSIONS } from './types';

const HEX = '0123456789abcdef';

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) out += HEX[buf[i]! >> 4]! + HEX[buf[i]! & 15]!;
  return out;
}

export function randomToken(bytes = 32): string {
  return randomHex(bytes);
}

export function newId(): string {
  return randomHex(12);
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export function base64Encode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function base64Decode(input: string): Uint8Array {
  const cleaned = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = cleaned.length % 4 === 0 ? '' : '='.repeat(4 - (cleaned.length % 4));
  const bin = atob(cleaned + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64UrlEncode(input: string | Uint8Array): string {
  return base64Encode(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i]! >> 4]! + HEX[bytes[i]! & 15]!;
  return out;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ---------------------------------------------------------------------------
// Crypto: HMAC-SHA256 sessions and PBKDF2-SHA256 passwords
// ---------------------------------------------------------------------------

export async function hmacSha256(key: string, data: string): Promise<string> {
  const keyBuf = await crypto.subtle.importKey(
    'raw',
    utf8(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', keyBuf, utf8(data));
  return toHex(new Uint8Array(sig));
}

/** Sign a session id: `id.signature` where signature = HMAC-SHA256(secret, id). */
export async function signSessionId(secret: string, id: string): Promise<string> {
  return `${id}.${await hmacSha256(secret, id)}`;
}

/** Verify + parse a signed session cookie. Returns the session id or null. */
export async function verifySessionId(
  secret: string,
  cookieValue: string | null | undefined,
): Promise<string | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = await hmacSha256(secret, id);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? id : null;
}

export const PBKDF2_ITERATIONS = 210_000;

export interface PasswordHash {
  salt: string;
  hash: string;
  iterations: number;
}

/** PBKDF2-SHA256 with a random 16-byte salt. Returns hex values for storage. */
export async function hashPassword(
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<PasswordHash> {
  const salt = randomHex(16);
  const key = await derivePbkdf2(password, salt, iterations, 32);
  return { salt, hash: toHex(key), iterations };
}

export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  if (!password || !stored.hash) return false;
  const key = await derivePbkdf2(password, stored.salt, stored.iterations, 32);
  const candidate = toHex(key);
  if (candidate.length !== stored.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ stored.hash.charCodeAt(i);
  return diff === 0;
}

async function derivePbkdf2(
  password: string,
  saltHex: string,
  iterations: number,
  length: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    utf8(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** SHA-256 of a string (diagnostics only, not security critical). */
export async function sha256Hex(data: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(data))));
}

// ---------------------------------------------------------------------------
// IP handling: literal blocking of private / reserved destinations
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    acc = acc * 256 + n;
  }
  return acc >>> 0;
}

function isPrivateV4(ip: string): boolean {
  const int = ipv4ToInt(ip);
  if (int === null) return false;
  const ranges: Array<[number, number]> = [
    [0x00000000, 8], // 0.0.0.0/8
    [0x0a000000, 8], // 10.0.0.0/8
    [0x7f000000, 8], // 127.0.0.0/8
    [0x64400000, 10], // 100.64.0.0/10 (CGNAT)
    [0xa9fe0000, 16], // 169.254.0.0/16
    [0xac100000, 12], // 172.16.0.0/12
    [0xc0a80000, 16], // 192.168.0.0/16
    [0xc0000000, 24], // 192.0.0.0/24
    [0xc0000200, 24], // 192.0.2.0/24 TEST-NET-1
    [0xc6120000, 15], // 198.18.0.0/15 benchmarking
    [0xc6336400, 24], // 198.51.100.0/24 TEST-NET-2
    [0xcb007100, 24], // 203.0.113.0/24 TEST-NET-3
    [0xe0000000, 4], // 224.0.0.0/4 multicast (not routable)
    [0xf0000000, 4], // 240.0.0.0/4 reserved
  ];
  for (const [prefix, bits] of ranges) {
    const mask = 0xffffffff << (32 - bits);
    if (((int & mask) >>> 0) === ((prefix & mask) >>> 0)) return true;
  }
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10
  if (lower.startsWith('ff')) return true; // multicast
  if (lower === '::ffff:127.0.0.1') return true;
  const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isPrivateV4(m[1]!);
  if (lower.startsWith('2001:db8')) return true; // documentation
  if (lower.startsWith('2001:10') || lower.startsWith('2001:20')) return true; // ORCHID
  return false;
}

/** True when `literal` is a private / reserved / non-routable IP literal. */
export function isPrivateLiteral(literal: string): boolean {
  const trimmed = literal.trim();
  if (trimmed.includes(':')) return isPrivateV6(trimmed);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) return isPrivateV4(trimmed);
  return false;
}

/** Ports that are always rejected because they serve SMTP. */
export const BLOCKED_SMTP_PORTS = [25, 465, 587, 2525];

export function isSmtpPort(port: number): boolean {
  return BLOCKED_SMTP_PORTS.includes(port);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function isUnlimited(value: number): boolean {
  return value === 0;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '∞';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d} روز`;
  if (h > 0) return `${h} ساعت`;
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${m} دقیقه` : `${Math.floor(seconds)} ثانیه`;
}

const ROLE_PERMS: Record<'owner' | 'admin' | 'operator' | 'support', Permission[]> = {
  owner: [
    'users:view',
    'users:create',
    'users:edit',
    'users:delete',
    'configs:build',
    'settings:manage',
    'endpoints:probe',
    'backup:export',
    'admins:manage',
    'audit:view',
  ],
  admin: ROLE_PERMISSIONS.admin,
  operator: ROLE_PERMISSIONS.operator,
  support: ROLE_PERMISSIONS.support,
};

const permCache = new Map<string, Set<Permission>>();

export function permissionSet(
  role: 'owner' | 'admin' | 'operator' | 'support',
): Set<Permission> {
  let s = permCache.get(role);
  if (!s) {
    s = new Set<Permission>(ROLE_PERMS[role]);
    permCache.set(role, s);
  }
  return s;
}

export function hasPermission(
  role: 'owner' | 'admin' | 'operator' | 'support',
  permission: Permission,
): boolean {
  return permissionSet(role).has(permission);
}