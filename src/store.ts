/**
 * AMINCK GOD Edition — Durable Object store.
 *
 * Single SQLite-backed Durable Object holding ALL state: settings, users,
 * admins, sessions, audit log, login throttling and live session counters.
 * No D1, no KV, no manual provisioning: the wrangler migration provisions it.
 *
 * This object is THE enforcement point: it verifies sessions, permissions,
 * role integrity and power-level caps. Even a direct API call can never
 * exceed a Limited admin's 5-path cap because the cap is applied here.
 *
 * The browser admin UI is intentionally disabled — management is API-only.
 * One-click hot-update regenerates subscription paths without changing the
 * Worker domain / custom hostname binding.
 */
import type {
  Admin,
  AdminRole,
  AntiDetectSettings,
  AuditAction,
  AuditEvent,
  ConfigFormat,
  Endpoint,
  MeInfo,
  PanelSettings,
  Permission,
  PowerLevel,
  ProbeResult,
  Route,
  Session,
  SpeedPreset,
  User,
} from './types';
import {
  DEFAULT_ANTI_DETECT,
  DEFAULT_FAKE_DOMAINS,
  MAX_AUDIT_EVENTS,
  MAX_ENDPOINTS,
  POWER_LEVELS,
  ROLE_PERMISSIONS,
  SPEED_PRESETS,
  type ProfileMode,
} from './types';
import { clamp, newId, randomHex, signSessionId, sleep, verifyPassword } from './utils';
import { hashPassword } from './utils';
import {
  BuildContext,
  DEFAULT_NAME_TEMPLATE,
  buildFormats,
  buildRoutes,
  expandRoutesMultiPort,
  planRoutes,
  resolveAntiDetect,
  validateNameTemplate,
} from './config';

export interface Env {
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  AMINCK_STORE: DurableObjectNamespace;
  /** Workers Static Assets binding (present when wrangler assets config is active). */
  ASSETS?: Fetcher;
}

export const OWNER_USERNAME = 'AMINCK';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const LOGIN_LOCKOUT_AFTER = 10;
export const LOGIN_LOCKOUT_MS = 10 * 60 * 1000;

const K = {
  settings: 'settings',
  admins: 'admins',
  sessions: 'sessions',
  userIndex: 'users:index',
  user: (id: string) => `users:${id}`,
  auditInfo: 'audit:info',
  auditChunk: (n: number) => `audit:${n}`,
};

const AUDIT_CHUNK_SIZE = 200;

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

export function defaultSettings(): PanelSettings {
  return {
  title: 'AMINCK Nova Edge',
  brand: 'AMINCK GOD Edition',
    supportUrl: 'https://t.me/EDGEPANEL',
    doh: 'https://cloudflare-dns.com/dns-query',
    dohAlt: ['https://one.one.one.one/dns-query', 'https://dns.google/dns-query'],
    healthUrl: '',
    configNameTemplate: '{brand} {profile} {index}',
    defaultPaths: 3,
    updateIntervalHours: 24,
    fingerprint: 'chrome',
    profileMode: 'auto',
    speedPreset: 'god',
    tlsPorts: [443, 2053, 2083, 2087, 2096, 8443],
    fakeDomains: [...DEFAULT_FAKE_DOMAINS],
    antiDetect: { ...DEFAULT_ANTI_DETECT },
    configGeneration: 1,
    endpoints: [],
    probeResults: {},
    lastProbeAt: 0,
  };
}

/** Merge legacy stored settings with new AMINCK GOD Edition fields. */
export function normalizeSettings(raw: PanelSettings | null | undefined): PanelSettings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const anti: AntiDetectSettings = {
    ...DEFAULT_ANTI_DETECT,
    ...(raw.antiDetect && typeof raw.antiDetect === 'object' ? raw.antiDetect : {}),
  };
  return {
    ...d,
    ...raw,
    brand: raw.brand || d.brand,
    title: raw.title || d.title,
    fakeDomains: Array.isArray(raw.fakeDomains) && raw.fakeDomains.length > 0 ? raw.fakeDomains : d.fakeDomains,
    antiDetect: anti,
    configGeneration: Number(raw.configGeneration) > 0 ? Number(raw.configGeneration) : 1,
    tlsPorts: Array.isArray(raw.tlsPorts) && raw.tlsPorts.length > 0 ? raw.tlsPorts : d.tlsPorts,
    endpoints: Array.isArray(raw.endpoints) ? raw.endpoints : [],
    probeResults: raw.probeResults && typeof raw.probeResults === 'object' ? raw.probeResults : {},
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function maxPathsFor(power: PowerLevel): number {
  return POWER_LEVELS[power].maxPaths;
}

export function permissionsFor(role: AdminRole): Permission[] {
  if (role === 'owner') {
    return [
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
    ];
  }
  return (
    (ROLE_PERMISSIONS as Record<string, Permission[]>)[role] ?? []
  );
}

export function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SanitizedLimits {
  limitBytes: number;
  limitSeconds: number;
  maxConnections: number;
}

/**
 * Sanitize numeric limits. THE RULE: zero stays zero (unlimited) — never
 * replaced by a default. Non-numeric → 0 = unlimited.
 */
export function sanitizeLimits(body: Record<string, unknown>): SanitizedLimits {
  const toNum = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(String(v ?? ''));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  };
  return {
    limitBytes: toNum(body.limitBytes),
    limitSeconds: toNum(body.limitSeconds),
    maxConnections: toNum(body.maxConnections),
  };
}

export function isSafeDoH(url: string): boolean {
  return /^https:\/\/[a-z0-9.-]+(\/|$)/i.test(url) && url.length <= 300;
}

export function orderEndpointsByProbe(endpoints: Endpoint[], results: Record<string, ProbeResult>): Endpoint[] {
  const scored = endpoints.map((ep, i) => {
    const r = results[ep.id];
    return { ep, i, ok: r?.ok ?? false, latency: r?.latencyMs ?? Infinity };
  });
  scored.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    if (a.ok) return a.latency - b.latency || a.i - b.i;
    return a.i - b.i;
  });
  return scored.map((s) => s.ep);
}

export function parseFormats(raw: unknown): ConfigFormat[] {
  const set: Set<ConfigFormat> = new Set();
  const list = Array.isArray(raw) ? raw.map(String) : [String(raw ?? 'v2ray')];
  for (const f of list) {
    if (f === 'v2ray' || f === 'raw' || f === 'clash' || f === 'singbox') set.add(f);
  }
  if (set.size === 0) set.add('v2ray');
  return [...set];
}

function ownerRecord(): Admin {
  return {
    id: 'owner',
    username: OWNER_USERNAME,
    role: 'owner',
    power: 'ultra',
    active: true,
    salt: '',
    hash: '',
    iterations: 0,
    createdAt: Date.now(),
    lastLoginAt: null,
  };
}

export function withoutHash(admin: Admin): Omit<Admin, 'salt' | 'hash' | 'iterations'> {
  const { salt, hash, iterations, ...rest } = admin;
  void salt;
  void hash;
  void iterations;
  return rest;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

type SessionRow = Session & { lastSlideAt?: number };
type audience = NonNullable<MeInfo['admin']>;

// ---------------------------------------------------------------------------
// The Durable Object
// ---------------------------------------------------------------------------

export class AMINCKStore {
  private settingsCache: PanelSettings | null = null;
  private usersCache: User[] = [];
  private adminsCache: Admin[] = [];
  private sessionsCache: SessionRow[] = [];
  private auditCache: AuditEvent[] = [];
  private liveSessions = new Map<string, number>();
  private attemptsByIp = new Map<string, { count: number; lockedUntil: number }>();
  private attemptsByName = new Map<string, { count: number; lockedUntil: number }>();
  private lockTail: Promise<void> = Promise.resolve();
  private loaded = false;

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.lockTail;
    this.lockTail = prev.then(() => next);
    return prev.then(() => fn()).finally(() => release());
  }

  // ------------------------------------------------------------ bootstrap

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const [settings, adminsRaw, sessionsRaw, indexRaw] = await Promise.all([
      this.state.storage.get<PanelSettings>(K.settings),
      this.state.storage.get<Admin[]>(K.admins),
      this.state.storage.get<SessionRow[]>(K.sessions),
      this.state.storage.get<string[]>(K.userIndex),
    ]);
    this.settingsCache = normalizeSettings(settings);
    this.adminsCache = adminsRaw ?? [];
    this.sessionsCache = sessionsRaw ?? [];
    const ids = indexRaw ?? [];
    if (ids.length > 0) {
      const entries = await this.state.storage.get<Record<string, User>>(ids.map((id) => K.user(id)));
      this.usersCache = Object.values(entries).sort((a, b) => a.createdAt - b.createdAt);
    }
    await this.loadAuditChunks();
    if (!this.adminsCache.some((a) => a.role === 'owner')) {
      this.adminsCache.push(ownerRecord());
      await this.state.storage.put(K.admins, this.adminsCache);
    }
    this.loaded = true;
  }

  private async loadAuditChunks(): Promise<void> {
    const info = (await this.state.storage.get<{ count: number }>(K.auditInfo)) ?? { count: 0 };
    if (info.count === 0) {
      this.auditCache = [];
      return;
    }
    const events: AuditEvent[] = [];
    const chunks = Math.ceil(info.count / AUDIT_CHUNK_SIZE);
    for (let c = chunks - 1; c >= 0; c--) {
      const chunk = await this.state.storage.get<AuditEvent[]>(K.auditChunk(c));
      if (chunk) events.unshift(...chunk);
      if (events.length >= MAX_AUDIT_EVENTS) break;
    }
    this.auditCache = events.slice(0, MAX_AUDIT_EVENTS);
  }

  private async persistSettings(): Promise<void> {
    await this.state.storage.put(K.settings, this.settingsCache!);
  }
  private async persistAdmins(): Promise<void> {
    await this.state.storage.put(K.admins, this.adminsCache);
  }
  private async persistSessions(): Promise<void> {
    await this.state.storage.put(K.sessions, this.sessionsCache);
  }
  private async persistUsers(): Promise<void> {
    await this.state.storage.put(
      K.userIndex,
      this.usersCache.map((u) => u.id),
    );
    await Promise.all(this.usersCache.map((u) => this.state.storage.put(K.user(u.id), u)));
  }

  // ----------------------------------------------------------------- audit

  private async audit(
    actor: string,
    action: AuditAction,
    target: string,
    details: string,
    ip: string,
  ): Promise<void> {
    this.auditCache.push({ id: newId(), ts: Date.now(), actor, action, target, details, ip });
    if (this.auditCache.length > MAX_AUDIT_EVENTS) {
      this.auditCache = this.auditCache.slice(-MAX_AUDIT_EVENTS);
    }
    const n = this.auditCache.length;
    const chunkIndex = Math.ceil(n / AUDIT_CHUNK_SIZE) - 1;
    const start = chunkIndex * AUDIT_CHUNK_SIZE;
    const existing = (await this.state.storage.get<AuditEvent[]>(K.auditChunk(chunkIndex))) ?? [];
    const chunk = [...existing, this.auditCache[n - 1]!].slice(-AUDIT_CHUNK_SIZE);
    await this.state.storage.put(K.auditChunk(chunkIndex), chunk);
    await this.state.storage.put(K.auditInfo, { count: n, chunkSize: AUDIT_CHUNK_SIZE });
  }

  // ----------------------------------------------------------------- fetch

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || (parts[0] !== 'int' && parts[0] !== 'api')) {
      return json({ error: 'not-found' }, 404);
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      await this.ensureLoaded();
      if (parts[0] === 'int') return await this.handleInt(parts.slice(1), body);
      return await this.handleApi(parts.slice(1), body);
    } catch (err) {
      return json(
        { error: 'internal', message: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  }

  // ----------------------------------------------------------- internal RPC

  private async handleInt(parts: string[], body: Record<string, unknown>): Promise<Response> {
    switch (parts[0]) {
      case 'login':
        return this.intLogin(String(body.username ?? ''), String(body.password ?? ''), String(body.ip ?? ''));
      case 'session-check':
        return json(await this.checkSession(String(body.sessionId ?? '')));
      case 'session-delete':
        return this.withLock(async () => {
          this.sessionsCache = this.sessionsCache.filter((s) => s.id !== body.sessionId);
          await this.persistSessions();
          return json({ ok: true });
        });
      case 'connect':
        return this.intConnect(String(body.uuid ?? ''), String(body.path ?? ''));
      case 'connect-by-id':
        return this.intConnectById(String(body.userId ?? ''), String(body.path ?? ''));
      case 'sub-fetch':
        return this.subFetch(String(body.token ?? ''), String(body.ua ?? ''), String(body.host ?? ''), String(body.ip ?? ''));
      case 'disconnect': {
        const uuid = String(body.uuid ?? '');
        const cur = this.liveSessions.get(uuid) ?? 0;
        if (cur <= 1) this.liveSessions.delete(uuid);
        else this.liveSessions.set(uuid, cur - 1);
        return json({ ok: true });
      }
      case 'stats':
        return this.intStats(String(body.uuid ?? ''), Number(body.up ?? 0), Number(body.down ?? 0));
      case 'probe-results': {
        const results = (body.results ?? {}) as Record<string, ProbeResult>;
        const s = this.settingsCache!;
        s.probeResults = { ...s.probeResults, ...results };
        s.lastProbeAt = Date.now();
        await this.persistSettings();
        return json({ ok: true, lastProbeAt: s.lastProbeAt });
      }
      case 'cron-probe': {
        const s = this.settingsCache!;
        return json({ ok: true, endpoints: s.endpoints });
      }
      case 'ensure-self': {
        const host = String(body.host ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
        const s = this.settingsCache!;
        if (host && /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(host) && !s.endpoints.some((e) => e.host === host)) {
          if (s.endpoints.length < MAX_ENDPOINTS) {
            s.endpoints.push({
              id: newId(),
              label: `${host}:443`,
              host,
              port: 443,
              createdAt: Date.now(),
            });
            await this.persistSettings();
          }
        }
        return json({ ok: true });
      }
      case 'capabilities':
        return this.capabilitiesResponse();
      default:
        return json({ error: 'not-found' }, 404);
    }
  }

  private async capabilitiesResponse(): Promise<Response> {
    const m = await import('./capabilities');
    return json({
      total: m.CAPABILITIES.length,
      ownerCount: m.ownerCapabilitiesCount(),
      byCategory: m.capabilitiesByCategory(),
      capabilities: m.CAPABILITIES,
    });
  }

  // -------------------------------------------------------------- login

  private async intLogin(username: string, password: string, ip: string): Promise<Response> {
    return this.withLock(async () => {
      const nameKey = (username || OWNER_USERNAME).toLowerCase();
      const tIp = this.attemptsByIp.get(ip);
      const tName = this.attemptsByName.get(nameKey);
      if ((tIp && tIp.lockedUntil > Date.now()) || (tName && tName.lockedUntil > Date.now())) {
        return json({ ok: false, reason: 'locked', delayMs: 500 }, 423);
      }

      const isOwnerName = username === '' || username.toLowerCase() === OWNER_USERNAME.toLowerCase();
      let admin: Admin | undefined;
      let ok = false;

      if (isOwnerName) {
        const envPass = this.env.ADMIN_PASSWORD ?? '';
        ok = envPass.length >= 10 && constantTimeEq(envPass, password);
        admin = this.adminsCache.find((a) => a.role === 'owner');
      } else {
        admin = this.adminsCache.find((a) => a.username.toLowerCase() === nameKey);
        if (admin && admin.active) {
          ok = await verifyPassword(password, {
            salt: admin.salt,
            hash: admin.hash,
            iterations: admin.iterations,
          });
        }
      }

      if (!ok || !admin || !admin.active) {
        await this.recordAttempt(ip, nameKey);
        await this.audit('system', 'admin.login_failed', admin?.username ?? nameKey, 'ورود ناموفق', ip);
        const count = this.attemptsByName.get(nameKey)?.count ?? 1;
        const delayMs = clamp(300 * Math.pow(2, Math.min(count, 5)), 300, 6000);
        await sleep(delayMs); // real login delay before the response
        return json({ ok: false, reason: 'bad-credentials', delayMs }, 401);
      }

      this.attemptsByIp.delete(ip);
      this.attemptsByName.delete(nameKey);
      admin.lastLoginAt = Date.now();
      await this.persistAdmins();

      const sessionId = randomHex(32);
      this.sessionsCache.push({
        id: sessionId,
        adminId: admin.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
      await this.persistSessions();
      await this.audit(admin.username, 'admin.login', admin.username, 'ورود موفق', ip);
      return json({
        ok: true,
        session: await signSessionId(this.env.SESSION_SECRET ?? '', sessionId),
        me: this.meOf(admin),
      });
    });
  }

  private async recordAttempt(ip: string, name: string): Promise<void> {
    const t = this.attemptsByIp.get(ip) ?? { count: 0, lockedUntil: 0 };
    t.count += 1;
    if (t.count >= LOGIN_LOCKOUT_AFTER) t.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    this.attemptsByIp.set(ip, t);
    const n = this.attemptsByName.get(name) ?? { count: 0, lockedUntil: 0 };
    n.count += 1;
    if (n.count >= LOGIN_LOCKOUT_AFTER) n.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    this.attemptsByName.set(name, n);
  }

  private get settings(): PanelSettings {
    return this.settingsCache!;
  }

  private meOf(admin: Admin): NonNullable<MeInfo['admin']> {
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      power: admin.power,
      permissions: permissionsFor(admin.role),
    };
  }

  private async checkSession(
    sessionId: string,
  ): Promise<{ valid: true; me: NonNullable<MeInfo['admin']> } | { valid: false }> {
    const session = this.sessionsCache.find((s) => s.id === sessionId);
    if (!session) return { valid: false };
    if (session.expiresAt <= Date.now()) {
      await this.dropSession(sessionId);
      return { valid: false };
    }
    const admin = this.adminsCache.find((a) => a.id === session.adminId);
    // Instant revoke: sessions of disabled admins die on the next request.
    if (!admin || !admin.active) {
      await this.dropSession(sessionId);
      return { valid: false };
    }
    return { valid: true, me: this.meOf(admin) };
  }

  private async dropSession(sessionId: string): Promise<void> {
    await this.withLock(async () => {
      this.sessionsCache = this.sessionsCache.filter((s) => s.id !== sessionId);
      await this.persistSessions();
    });
  }

  private dropAllSessions(adminId: string): void {
    this.sessionsCache = this.sessionsCache.filter((s) => s.adminId !== adminId);
  }

  // ----------------------------------------------------------- WS gateway

  private async intConnect(uuid: string, path: string): Promise<Response> {
    const user = this.usersCache.find((u) => u.uuid === uuid);
    if (!user) return json({ ok: false, reason: 'unknown-uuid' }, 404);
    if (!user.active) return json({ ok: false, reason: 'user-disabled' }, 403);
    if (user.expiresAt > 0 && user.expiresAt <= Date.now()) {
      return json({ ok: false, reason: 'user-expired' }, 403);
    }
    if (user.limitBytes > 0 && user.usageBytes >= user.limitBytes) {
      return json({ ok: false, reason: 'no-quota' }, 403);
    }
    if (!user.routes.some((r) => r.path === path)) {
      return json({ ok: false, reason: 'unknown-route' }, 404);
    }
    const active = this.liveSessions.get(uuid) ?? 0;
    if (user.maxConnections > 0 && active >= user.maxConnections) {
      return json({ ok: false, reason: 'connection-limit' }, 429);
    }
    this.liveSessions.set(uuid, active + 1);
    const speed = SPEED_PRESETS[user.speedPreset];
    const s = this.settingsCache!;
    return json({
      ok: true,
      policy: {
        dohList: [s.doh, ...(s.dohAlt ?? [])],
        tlsPorts: s.tlsPorts,
        tcpRetries: speed.tcpRetries,
        connectTimeoutMs: speed.probeTimeoutMs,
        maxEarlyData: speed.earlyData,
      },
      limits: {
        bytes: user.limitBytes,
        bytesLeft: user.limitBytes,
        connections: user.maxConnections,
        activeConnections: active + 1,
      },
    });
  }

  private async intConnectById(userId: string, path: string): Promise<Response> {
    const user = this.usersCache.find((u) => u.id === userId);
    if (!user) return json({ ok: false, reason: 'unknown-user' }, 404);
    const r = await this.intConnect(user.uuid, path);
    if (!r.ok) return r;
    const data = (await r.json()) as Record<string, unknown>;
    return json({ ok: true, uuid: user.uuid, ...data });
  }

  private async subFetch(token: string, ua: string, host: string, ip: string): Promise<Response> {
    const user = this.usersCache.find((u) => u.token === token);
    if (!user) return json({ error: 'not-found' }, 404);
    if (!user.active) return json({ error: 'disabled' }, 403);
    if (user.expiresAt > 0 && user.expiresAt <= Date.now()) return json({ error: 'expired' }, 410);
    user.lastSubAt = Date.now();
    await this.persistUsers();
    await this.audit('system', 'config.sub_fetch', user.name, `دریافت ساب (${ua.slice(0, 60) || 'بدون UA'})`, ip);
    const built = buildFormats(this.ctx(user, host), ['v2ray', 'raw', 'clash', 'singbox']);
    const payloads: Record<string, string> = {};
    for (const b of built) payloads[b.format] = b.payload;
    return json({ user: { ...user }, settings: this.settingsCache, payloads });
  }

  private async intStats(uuid: string, up: number, down: number): Promise<Response> {
    const u = this.usersCache.find((x) => x.uuid === uuid);
    if (!u) return json({ ok: false }, 404);
    u.usageBytes = u.usageBytes + Math.max(0, up) + Math.max(0, down);
    u.lastSeenAt = Date.now();
    await this.persistUsers();
    return json({ ok: true });
  }

  // ------------------------------------------------------------------ API

  private async handleApi(parts: string[], body: Record<string, unknown>): Promise<Response> {
    const sessionId = String(body.sessionId ?? '');
    const ip = String(body.ip ?? '');
    const check = await this.checkSession(sessionId);
    if (!check.valid) return json({ error: 'unauthorized', message: 'نشست نامعتبر است' }, 401);
    const me = check.me;
    const need = (p: Permission) => me.permissions.includes(p);
    const deny = () => json({ error: 'forbidden', message: 'دسترسی کافی نیست' }, 403);

    const route = parts[0];

    if (route === 'me') return json({ me });

    if (route === 'stats') {
      if (!need('users:view')) return deny();
      return json({
        users: this.usersCache.length,
        activeUsers: this.usersCache.filter((u) => u.active).length,
        liveSessions: [...this.liveSessions.values()].reduce((a, b) => a + b, 0),
        totalTraffic: this.usersCache.reduce((a, u) => a + u.usageBytes, 0),
        admins: this.adminsCache.length,
        endpoints: this.settingsCache!.endpoints.length,
        lastProbeAt: this.settingsCache!.lastProbeAt,
      });
    }

    if (route === 'capabilities') return this.capabilitiesResponse();

    if (route === 'users') return this.handleUsersRoute(parts, body, me, ip, need, deny);

    if (route === 'user-create') {
      if (!need('users:create')) return deny();
      return this.userCreate(body, me, ip);
    }
    if (route === 'user-update') {
      if (!need('users:edit')) return deny();
      return this.userUpdate(body, me, ip);
    }
    if (route === 'user-delete') {
      if (!need('users:delete')) return deny();
      const id = String(body.id ?? '');
      const idx = this.usersCache.findIndex((u) => u.id === id);
      if (idx < 0) return json({ error: 'not-found' }, 404);
      const removed = this.usersCache.splice(idx, 1)[0]!;
      await this.state.storage.delete(K.user(id));
      await this.persistUsers();
      await this.audit(me.username, 'user.delete', removed.name, 'حذف کاربر', ip);
      return json({ ok: true });
    }

    if (route === 'config-build' || route === 'configs') {
      if (!need('configs:build')) return deny();
      return this.buildConfig(body, me, ip);
    }

    if (route === 'auto-build') {
      if (!need('configs:build') || !need('users:create')) return deny();
      return this.autoBuild(body, me, ip);
    }

    if (route === 'endpoints') {
      if (!need('endpoints:probe')) return deny();
      return this.endpointsApi(String(body.action ?? 'view'), body, me, ip);
    }

    if (route === 'settings') {
      if (!need('settings:manage')) return deny();
      return this.settingsUpdate(body.settings as Partial<PanelSettings> | undefined, me, ip);
    }
    if (route === 'get-settings') {
      if (!need('users:view')) return deny();
      return json({ settings: this.settingsCache });
    }

    if (route === 'admins') {
      if (!need('admins:manage')) return deny();
      return this.adminsApi(parts.slice(1), body, me, ip);
    }

    if (route === 'audit') {
      if (!need('audit:view')) return deny();
      const limit = clamp(Number(body.limit ?? 300) || 300, 10, MAX_AUDIT_EVENTS);
      return json({ events: [...this.auditCache].reverse().slice(0, limit) });
    }

    if (route === 'backup') {
      if (!need('backup:export')) return deny();
      await this.audit(me.username, 'backup.export', 'backup', 'صدور بکاپ کامل', ip);
      return json({
        app: 'AMINCK GOD Edition',
        version: 'AMINCK GOD Edition',
        exportedAt: Date.now(),
        settings: this.settingsCache,
        users: this.usersCache,
        // Full backup includes PBKDF2 hashes so a restore can keep passwords.
        admins: this.adminsCache,
        audit: this.auditCache.slice(-500),
      });
    }

    // One-click hot update: regenerate all user paths / anti-detect without
    // touching the Worker domain or custom hostname (zero domain downtime).
    if (route === 'hot-update' || route === 'panel-update') {
      if (!need('settings:manage')) return deny();
      return this.hotUpdate(body, me, ip);
    }

    return json({ error: 'not-found' }, 404);
  }

  /** Bump config generation + rebuild every subscriber's routes in-place. */
  private async hotUpdate(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const s = this.settingsCache!;
    s.configGeneration = (s.configGeneration || 0) + 1;
    if (body.speedPreset !== undefined && String(body.speedPreset) in SPEED_PRESETS) {
      s.speedPreset = body.speedPreset as SpeedPreset;
    }
    if (body.tlsPorts !== undefined && Array.isArray(body.tlsPorts)) {
      const ports = [...new Set((body.tlsPorts as unknown[]).map(Number).filter((p) => Number.isInteger(p) && p > 0 && p < 65536))];
      if (ports.length > 0) s.tlsPorts = ports.slice(0, 10);
    }
    if (body.fakeDomains !== undefined && Array.isArray(body.fakeDomains)) {
      s.fakeDomains = (body.fakeDomains as unknown[])
        .map((d) => String(d).trim().toLowerCase())
        .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
        .slice(0, 30);
    }
    if (body.antiDetect && typeof body.antiDetect === 'object') {
      s.antiDetect = { ...resolveAntiDetect(s), ...(body.antiDetect as Partial<AntiDetectSettings>) };
    }
    let rebuilt = 0;
    for (const user of this.usersCache) {
      const n = Math.max(1, user.routes.length || s.defaultPaths);
      user.routes = this.buildRoutesFor(user, n);
      rebuilt += 1;
    }
    await this.persistSettings();
    await this.persistUsers();
    await this.audit(
      me.username,
      'panel.hot_update',
      'panel',
      `آپدیت بدون قطعی دامنه — gen=${s.configGeneration} — ${rebuilt} مشترک`,
      ip,
    );
    return json({
      ok: true,
      configGeneration: s.configGeneration,
      rebuiltUsers: rebuilt,
      domainUnchanged: true,
      message: 'کانفیگ‌ها بازسازی شدند؛ دامنه Worker بدون تغییر باقی ماند',
    });
  }

  // ------------------------------------------------------------- users routes

  private async handleUsersRoute(
    parts: string[],
    body: Record<string, unknown>,
    me: NonNullable<MeInfo['admin']>,
    ip: string,
    need: (p: Permission) => boolean,
    deny: () => Response,
  ): Promise<Response> {
    if (parts.length === 1) {
      if (!need('users:view')) return deny();
      const q = String(body.q ?? '').trim().toLowerCase();
      const list = q
        ? this.usersCache.filter(
            (u) => u.name.toLowerCase().includes(q) || u.uuid.includes(q) || u.token.includes(q),
          )
        : this.usersCache;
      return json({ users: list.map((u) => ({ ...u })) });
    }
    const id = parts[1];
    const user = this.usersCache.find((u) => u.id === id);
    if (!user) return json({ error: 'not-found' }, 404);
    if (!need('users:edit')) return deny();
    const action = String(body.action ?? '');
    switch (action) {
      case 'reset_usage':
        user.usageBytes = 0;
        await this.audit(me.username, 'user.reset_usage', user.name, 'ریست مصرف', ip);
        break;
      case 'reset_connections':
        this.liveSessions.delete(user.uuid);
        await this.audit(me.username, 'user.reset_connections', user.name, 'ریست نشستها', ip);
        break;
      case 'rotate_uuid':
        user.uuid = crypto.randomUUID();
        await this.audit(me.username, 'user.rotate_uuid', user.name, 'تعویض UUID', ip);
        break;
      case 'rotate_token':
        user.token = randomHex(32);
        await this.audit(me.username, 'user.rotate_token', user.name, 'تعویض Token', ip);
        break;
      case 'toggle':
        user.active = !user.active;
        await this.audit(me.username, 'user.toggle', user.name, user.active ? 'فعال شد' : 'غیرفعال شد', ip);
        break;
      default:
        return json({ error: 'bad-action', message: 'اکشن نامعتبر' }, 400);
    }
    await this.persistUsers();
    return json({ ok: true, user: { ...user } });
  }

  // --------------------------------------------------------------- user CRUD

  private userCreate(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 80) return Promise.resolve(json({ error: 'bad-name', message: 'نام کاربر معتبر نیست' }, 400));
    const limits = sanitizeLimits(body);
    const maxPaths = maxPathsFor(me.power);
    const wanted = Number.isFinite(Number(body.paths)) ? Number(body.paths) : this.settings!.defaultPaths;
    const paths = clamp(Math.floor(wanted) || 1, 1, maxPaths);
    const user = this.newUser(name, limits, body, paths);
    this.usersCache.push(user);
    return this.persistUsers()
      .then(() => this.audit(me.username, 'user.create', user.name, `ایجاد کاربر — ${paths} مسیر`, ip))
      .then(() => json({ ok: true, user: { ...user } }));
  }

  private userUpdate(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const id = String(body.id ?? '');
    const user = this.usersCache.find((u) => u.id === id);
    if (!user) return Promise.resolve(json({ error: 'not-found' }, 404));
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name && name.length <= 80) user.name = name;
    }
    const limits = sanitizeLimits(body);
    user.limitBytes = limits.limitBytes;
    user.limitSeconds = limits.limitSeconds;
    user.maxConnections = limits.maxConnections;
    if (body.active !== undefined) user.active = Boolean(body.active);
    if (body.profileMode !== undefined && ['auto', 'fallback', 'balance'].includes(String(body.profileMode))) {
      user.profileMode = String(body.profileMode) as ProfileMode;
    }
    if (body.speedPreset !== undefined && (body.speedPreset as string) in SPEED_PRESETS) {
      user.speedPreset = body.speedPreset as SpeedPreset;
    }
    if (body.note !== undefined) user.note = String(body.note).slice(0, 1000);
    if (body.configNameTemplate !== undefined) {
      const v = validateNameTemplate(String(body.configNameTemplate).trim() || DEFAULT_NAME_TEMPLATE);
      if (!v.ok) return Promise.resolve(json({ error: 'bad-template', message: v.error }, 400));
      user.configNameTemplate = String(body.configNameTemplate).trim() === '' ? null : v.value;
    }
    if (body.paths !== undefined) {
      const n = clamp(Math.floor(Number(body.paths)) || 1, 1, maxPathsFor(this.powerOf(me)));
      user.routes = this.buildRoutesFor(user, n);
    }
    return this.persistUsers()
      .then(() => this.audit(me.username, 'user.update', user.name, 'ویرایش کاربر', ip))
      .then(() => json({ ok: true, user: { ...user } }));
  }

  private powerOf(me: audience): PowerLevel {
    return this.adminsCache.find((a) => a.username === me.username)?.power ?? 'ultra';
  }

  private newUser(name: string, limits: SanitizedLimits, body: Record<string, unknown>, paths: number): User {
    const s = this.settings!;
    const user: User = {
      id: newId(),
      name,
      uuid: crypto.randomUUID(),
      token: randomHex(32),
      routes: [],
      limitBytes: limits.limitBytes,
      limitSeconds: limits.limitSeconds,
      maxConnections: limits.maxConnections,
      active: body.active !== false,
      speedPreset: (body.speedPreset as SpeedPreset) in SPEED_PRESETS ? (body.speedPreset as SpeedPreset) : s.speedPreset,
      profileMode: ['auto', 'fallback', 'balance'].includes(String(body.profileMode))
        ? (body.profileMode as ProfileMode)
        : s.profileMode,
      fingerprint: null,
      configNameTemplate: String(body.configNameTemplate ?? '').trim() || null,
      note: String(body.note ?? '').slice(0, 1000),
      createdAt: Date.now(),
      expiresAt: limits.limitSeconds === 0 ? 0 : Date.now() + limits.limitSeconds * 1000,
      usageBytes: 0,
      lastSeenAt: 0,
      lastSubAt: 0,
    };
    if (s.endpoints.length > 0) user.routes = this.buildRoutesFor(user, paths);
    return user;
  }

  private buildRoutesFor(user: User, count: number): Route[] {
    const s = this.settings!;
    const eps = orderEndpointsByProbe(s.endpoints, s.probeResults);
    // Stored routes stay 1:1 with requested path count. Multi-port (Zooz/BPB)
    // expands ports only when emitting configs (see expandRoutesForOutput).
    return buildRoutes(user.id, planRoutes(eps, Math.max(1, count)), s);
  }

  // ------------------------------------------------------------ config build

  private buildConfig(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const id = String(body.id ?? '');
    const user = this.usersCache.find((u) => u.id === id);
    if (!user) return Promise.resolve(json({ error: 'not-found' }, 404));
    const maxPaths = maxPathsFor(this.powerOf(me));
    const requested = clamp(Math.floor(Number(body.paths ?? user.routes.length)) || 1, 1, 200);
    const paths = Math.min(requested, maxPaths);
    const truncated = paths < requested;
    const formats = parseFormats(body.formats);
    const save = body.save === true || body.save === 'true';
    if (save) user.routes = this.buildRoutesFor(user, paths);
    return this.persistUsers()
      .then(() => {
        const built = buildFormats(this.ctx(user, String(body.reqHost ?? body.host ?? '')), formats);
        return this.audit(
          me.username,
          'config.build',
          user.name,
          `${paths} مسیر (${formats.join('،')})${truncated ? ' — محدودشده به قدرت' : ''}`,
          ip,
        ).then(() => json({ ok: true, configs: built, truncated }));
      });
  }

  private ctx(user: User, host: string): BuildContext {
    const s = this.settings!;
    // Zooz/BPB multi-port: clone each route across selected TLS ports for
    // subscription output only — stored path count is unchanged.
    const anti = resolveAntiDetect(s);
    let routes = user.routes;
    if (anti.multiPort && s.tlsPorts.length > 1) {
      routes = expandRoutesMultiPort(user.routes, s.tlsPorts);
    }
    const view: User = { ...user, routes };
    return {
      user: view,
      settings: s,
      speedPreset: user.speedPreset,
      fingerprint: s.fingerprint,
      profileMode: user.profileMode,
      nameTemplate: user.configNameTemplate || s.configNameTemplate || DEFAULT_NAME_TEMPLATE,
      hostForSub: host,
    };
  }

  private autoBuild(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const maxPaths = maxPathsFor(this.powerOf(me));
    const requested = clamp(Math.floor(Number(body.paths ?? this.settings!.defaultPaths)) || 1, 1, 200);
    const paths = Math.min(requested, maxPaths);

    const orderedRaw = Array.isArray(body.orderedEndpoints) ? (body.orderedEndpoints as unknown[]) : [];
    const known = new Set(this.settings!.endpoints.map((e) => e.id));
    const ordered: Endpoint[] = orderedRaw
      .filter((e): e is Endpoint => !!e && typeof (e as Endpoint).id === 'string' && known.has((e as Endpoint).id))
      .map((e) => this.settings!.endpoints.find((x) => x.id === e.id)!)
      .filter((e) => !!e && Number(e.port) > 0)
      .slice(0, MAX_ENDPOINTS);

    if (ordered.length === 0) {
      return Promise.resolve(json({ error: 'no-endpoints', message: 'ابتدا Endpoint اضافه و Probe کنید' }, 400));
    }

    const name = String(body.name ?? 'مشترک جدید').trim() || 'مشترک جدید';
    const limits = sanitizeLimits(body);
    const user = this.newUser(name, limits, body, 1);
    user.speedPreset = (body.speedPreset as SpeedPreset) in SPEED_PRESETS ? (body.speedPreset as SpeedPreset) : this.settings!.speedPreset;
    user.profileMode = ['auto', 'fallback', 'balance'].includes(String(body.profileMode))
      ? (body.profileMode as ProfileMode)
      : this.settings!.profileMode;
    user.routes = buildRoutes(user.id, planRoutes(ordered, paths), this.settings!);
    this.usersCache.push(user);
    return this.persistUsers()
      .then(() => {
        const built = buildFormats(this.ctx(user, String(body.reqHost ?? body.host ?? '')), ['v2ray', 'raw', 'clash', 'singbox']);
        return this.audit(
          me.username,
          'config.auto_build',
          user.name,
          `ساخت اتومات — ${paths} مسیر از ${ordered.length} Endpoint`,
          ip,
        ).then(() => json({ ok: true, user: { ...user }, configs: built }));
      });
  }

  // ------------------------------------------------------------- endpoints

  private async endpointsApi(action: string, body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const s = this.settingsCache!;
    if (action === 'add') return this.addEndpoint(body, me, ip);
    if (action === 'remove') {
      const id = String(body.id ?? '');
      s.endpoints = s.endpoints.filter((e) => e.id !== id);
      delete s.probeResults[id];
      await this.persistSettings();
      await this.audit(me.username, 'endpoints.update', id, 'حذف Endpoint', ip);
      return json({ ok: true, endpoints: s.endpoints, probeResults: s.probeResults });
    }
    return json({ ok: true, endpoints: s.endpoints, probeResults: s.probeResults });
  }

  private async addEndpoint(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const host = String(body.host ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const port = Number(body.port ?? 443);
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host) || host.length > 200) {
      return json({ error: 'bad-host', message: 'Endpoint معتبر نیست' }, 400);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return json({ error: 'bad-port', message: 'پورت نامعتبر' }, 400);
    }
    const s = this.settingsCache!;
    if (s.endpoints.length >= MAX_ENDPOINTS) {
      return json({ error: 'too-many', message: `حداکثر ${MAX_ENDPOINTS} Endpoint مجاز است` }, 422);
    }
    if (s.endpoints.some((e) => e.host === host && e.port === port)) {
      return json({ error: 'duplicate', message: 'Endpoint تکراری' }, 409);
    }
    s.endpoints.push({
      id: newId(),
      label: body.label ? String(body.label).slice(0, 60) : `${host}:${port}`,
      host,
      port,
      createdAt: Date.now(),
    });
    await this.persistSettings();
    await this.audit(me.username, 'endpoints.update', host, `افزودن Endpoint :${port}`, ip);
    return json({ ok: true, endpoints: s.endpoints });
  }

  // ------------------------------------------------------------- settings

  private async settingsUpdate(patch: Partial<PanelSettings> | undefined, me: audience, ip: string): Promise<Response> {
    if (!patch || typeof patch !== 'object') return json({ error: 'bad-settings' }, 400);
    const s = this.settingsCache!;
    if (patch.title !== undefined) s.title = String(patch.title).trim().slice(0, 80) || 'AMINCK GOD Edition';
    if (patch.brand !== undefined) s.brand = String(patch.brand).trim().slice(0, 40) || 'AMINCK GOD Edition';
    if (patch.supportUrl !== undefined) s.supportUrl = String(patch.supportUrl).trim().slice(0, 300);
    if (patch.healthUrl !== undefined) {
      const u = String(patch.healthUrl).trim();
      s.healthUrl = /^https?:\/\//.test(u) ? u.slice(0, 300) : '';
    }
    if (patch.doh !== undefined) {
      const u = String(patch.doh).trim();
      if (u && !isSafeDoH(u)) return json({ error: 'bad-doh', message: 'DoH نامعتبر' }, 400);
      s.doh = u || 'https://cloudflare-dns.com/dns-query';
    }
    if (patch.dohAlt !== undefined) {
      s.dohAlt = (patch.dohAlt as unknown[]).map((x) => String(x).trim()).filter((x) => x.length > 0 && isSafeDoH(x)).slice(0, 6);
    }
    if (patch.configNameTemplate !== undefined) {
      const v = validateNameTemplate(String(patch.configNameTemplate));
      if (!v.ok) return json({ error: 'bad-template', message: v.error }, 400);
      s.configNameTemplate = v.value;
    }
    if (patch.defaultPaths !== undefined) s.defaultPaths = clamp(Math.floor(Number(patch.defaultPaths)) || 1, 1, 200);
    if (patch.updateIntervalHours !== undefined) s.updateIntervalHours = clamp(Math.floor(Number(patch.updateIntervalHours)) || 24, 1, 720);
    if (patch.fingerprint !== undefined) {
      const fp = String(patch.fingerprint);
      if (['chrome', 'firefox', 'safari', 'edge', 'random'].includes(fp)) s.fingerprint = fp as typeof s.fingerprint;
    }
    if (patch.profileMode !== undefined) {
      const pm = String(patch.profileMode);
      if (['auto', 'fallback', 'balance'].includes(pm)) s.profileMode = pm as typeof s.profileMode;
    }
    if (patch.speedPreset !== undefined) {
      const sp = String(patch.speedPreset);
      if (sp in SPEED_PRESETS) s.speedPreset = sp as SpeedPreset;
    }
    if (patch.tlsPorts !== undefined) {
      const ports = [...new Set((patch.tlsPorts as unknown[]).map(Number).filter((p) => Number.isInteger(p) && p > 0 && p < 65536))];
      if (ports.length === 0) return json({ error: 'bad-ports', message: 'حداقل یک پورت TLS لازم است' }, 400);
      s.tlsPorts = ports.slice(0, 10);
    }
    if (patch.fakeDomains !== undefined && Array.isArray(patch.fakeDomains)) {
      const domains = (patch.fakeDomains as unknown[])
        .map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
        .filter((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) && d.length <= 200)
        .slice(0, 30);
      if (domains.length === 0) return json({ error: 'bad-domains', message: 'حداقل یک دامنه جعلی معتبر لازم است' }, 400);
      s.fakeDomains = domains;
    }
    if (patch.antiDetect !== undefined && typeof patch.antiDetect === 'object' && patch.antiDetect) {
      const a = patch.antiDetect as Partial<AntiDetectSettings>;
      const cur = resolveAntiDetect(s);
      if (typeof a.pathPadding === 'boolean') cur.pathPadding = a.pathPadding;
      if (typeof a.pathJitter === 'boolean') cur.pathJitter = a.pathJitter;
      if (typeof a.fragment === 'boolean') cur.fragment = a.fragment;
      if (typeof a.hostCamouflage === 'boolean') cur.hostCamouflage = a.hostCamouflage;
      if (typeof a.multiPort === 'boolean') cur.multiPort = a.multiPort;
      if (Array.isArray(a.fragmentLength) && a.fragmentLength.length === 2) {
        const lo = Math.max(1, Math.floor(Number(a.fragmentLength[0]) || 100));
        const hi = Math.max(lo, Math.floor(Number(a.fragmentLength[1]) || 200));
        cur.fragmentLength = [lo, Math.min(hi, 1500)];
      }
      if (Array.isArray(a.fragmentInterval) && a.fragmentInterval.length === 2) {
        const lo = Math.max(1, Math.floor(Number(a.fragmentInterval[0]) || 10));
        const hi = Math.max(lo, Math.floor(Number(a.fragmentInterval[1]) || 20));
        cur.fragmentInterval = [lo, Math.min(hi, 500)];
      }
      s.antiDetect = cur;
    }
    await this.persistSettings();
    await this.audit(me.username, 'settings.update', 'settings', 'بهروزرسانی تنظیمات', ip);
    return json({ ok: true, settings: s });
  }

  // -------------------------------------------------------------- admins

  private adminsApi(parts: string[], body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const action = parts[0] ?? 'list';
    switch (action) {
      case 'list':
        return Promise.resolve(json({ admins: this.adminsCache.map(withoutHash) }));
      case 'create':
        return this.adminCreate(body, me, ip);
      case 'update':
        return this.adminUpdate(body, me, ip);
      case 'delete':
        return this.adminDelete(body, me, ip);
      default:
        return Promise.resolve(json({ error: 'not-found' }, 404));
    }
  }

  private async adminCreate(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const username = String(body.username ?? '').trim().toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      return json({ error: 'bad-username', message: 'نام کاربری ۳ تا ۳۲ کاراکتر، فقط حروف/اعداد/._' }, 400);
    }
    if (username === OWNER_USERNAME.toLowerCase()) {
      return json({ error: 'reserved', message: 'این نام برای مالک رزرو است' }, 400);
    }
    if (this.adminsCache.some((a) => a.username.toLowerCase() === username)) {
      return json({ error: 'duplicate', message: 'این نام کاربری گرفته شده' }, 409);
    }
    const password = String(body.password ?? '');
    if (password.length < 10) {
      return json({ error: 'weak-password', message: 'رمز حداقل ۱۰ کاراکتر' }, 400);
    }
    const role = String(body.role ?? 'operator') as AdminRole;
    const power = String(body.power ?? 'normal') as PowerLevel;
    if (!['admin', 'operator', 'support'].includes(role)) {
      return json({ error: 'bad-role', message: 'نقش معتبر نیست (owner غیرقابل تخصیص)' }, 400);
    }
    if (!(power in POWER_LEVELS)) return json({ error: 'bad-power', message: 'سطح قدرت معتبر نیست' }, 400);
    const { salt, hash, iterations } = await hashPassword(password);
    const admin: Admin = {
      id: newId(),
      username,
      role,
      power,
      active: true,
      salt,
      hash,
      iterations,
      createdAt: Date.now(),
      lastLoginAt: null,
    };
    this.adminsCache.push(admin);
    await this.persistAdmins();
    await this.audit(me.username, 'admin.create', username, `نقش ${role} — قدرت ${power}`, ip);
    return json({ ok: true, admin: withoutHash(admin) });
  }

  private async adminUpdate(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const id = String(body.id ?? '');
    const admin = this.adminsCache.find((a) => a.id === id);
    if (!admin) return json({ error: 'not-found' }, 404);
    if (admin.role === 'owner') {
      return json({ error: 'owner-protected', message: 'مالک قابل تغییر نیست' }, 400);
    }
    if (body.role !== undefined) {
      const role = String(body.role) as AdminRole;
      if (!['admin', 'operator', 'support'].includes(role)) return json({ error: 'bad-role' }, 400);
      admin.role = role;
    }
    if (body.power !== undefined) {
      const power = String(body.power) as PowerLevel;
      if (!(power in POWER_LEVELS)) return json({ error: 'bad-power' }, 400);
      admin.power = power;
    }
    if (body.active !== undefined && typeof body.active === 'boolean') {
      const was = admin.active;
      admin.active = body.active;
      if (!body.active) {
        // قطع فوری دسترسی: همهٔ نشستها همینجا حذف میشوند.
        this.dropAllSessions(admin.id);
        await this.audit(me.username, 'admin.revoke', admin.username, 'قطع دسترسی', ip);
      } else {
        if (!was) await this.audit(me.username, 'admin.restore', admin.username, 'وصل مجدد دسترسی', ip);
      }
    }
    if (body.password !== undefined && String(body.password).length > 0) {
      const password = String(body.password);
      if (password.length < 10) return json({ error: 'weak-password', message: 'رمز حداقل ۱۰ کاراکتر' }, 400);
      const { salt, hash, iterations } = await hashPassword(password);
      admin.salt = salt;
      admin.hash = hash;
      admin.iterations = iterations;
      this.dropAllSessions(admin.id); // re-login after password change
      await this.audit(me.username, 'admin.password', admin.username, 'تغییر رمز', ip);
    }
    await this.persistAdmins();
    return json({ ok: true, admin: withoutHash(admin) });
  }

  private async adminDelete(body: Record<string, unknown>, me: audience, ip: string): Promise<Response> {
    const id = String(body.id ?? '');
    const admin = this.adminsCache.find((a) => a.id === id);
    if (!admin) return json({ error: 'not-found' }, 404);
    if (admin.role === 'owner') {
      return json({ error: 'owner-protected', message: 'مالک قابل حذف نیست' }, 400);
    }
    this.adminsCache = this.adminsCache.filter((a) => a.id !== id);
    this.dropAllSessions(admin.id);
    await this.persistAdmins();
    await this.audit(me.username, 'admin.delete', admin.username, 'حذف ادمین', ip);
    return json({ ok: true });
  }
}