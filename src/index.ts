/**
 * AMINCK GOD Edition — Cloudflare Worker entry.
 *
 * Routing:
 *   GET  /healthz            public health check (CORS)
 *   GET  /                   API-only landing (no full admin UI)
 *   GET  /app.js /app.css    minimal static assets
 *   POST /api/login …        JSON admin API (proxied to the Durable Object)
 *   POST /api/hot-update     one-click config regen without domain downtime
 *   GET  /sub/:token         subscriptions (v2ray base64 / clash / sing-box / raw)
 *   WS   /e<slug><userid>    VLESS over WebSocket proxy (random path + jitter)
 *
 * Security: Same-Origin checks on mutating requests, HMAC-signed HttpOnly
 * cookies, security headers (CSP, X-Frame-Options, Referrer-Policy,
 * Permissions-Policy) and server-side permission enforcement in the DO.
 */
import type { Env } from './store';
import { AMINCKStore } from './store';
import type { ConfigFormat, Endpoint, PanelSettings, User } from './types';
import { classifyTarget, VlessSession } from './proxy';
import type { SessionHooks, TcpSocket } from './proxy';
import type { VlessTarget } from './protocol';
import { parseVlessHeader } from './protocol';
import { verifySessionId, isPrivateLiteral } from './utils';
import { defaultRuntimeHooks, probeAll } from './probe';
import { UI_APP_CSS, UI_APP_JS, uiShell } from './ui';

export { AMINCKStore };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.host;
    const path = url.pathname;

    if (path === '/healthz') {
      return withHeaders(
        new Response(JSON.stringify({ ok: true, app: 'AMINCK GOD Edition', ts: Date.now() }), {
          headers: { 'content-type': 'application/json' },
        }),
        { cors: true },
      );
    }

    if (request.method === 'GET' && (path === '/' || path === '/app.js' || path === '/app.css')) {
      // API-only landing: static assets from public/ (generated from src/ui.ts)
      // still go through the Worker so security headers apply.
      if (env.ASSETS) {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status !== 404) return withHeaders(assetRes, {});
      }
      if (path === '/') return withHeaders(html(uiShell('AMINCK GOD Edition')), {});
      if (path === '/app.js') {
        return withHeaders(
          new Response(UI_APP_JS, { headers: { 'content-type': 'application/javascript; charset=utf-8' } }),
          {},
        );
      }
      return withHeaders(new Response(UI_APP_CSS, { headers: { 'content-type': 'text/css; charset=utf-8' } }), {});
    }
    if (request.method === 'GET' && (path === '/favicon.ico' || path === '/robots.txt')) {
      return new Response('', { status: 204 });
    }

    if (path.startsWith('/api/')) {
      return handleApi(request, env, ctx, host);
    }

    const subMatch = path.match(/^\/sub\/([0-9a-f]{64})(?:\/(raw|clash|singbox|v2ray))?\/?$/i);
    if (subMatch) {
      return handleSub(request, env, ctx, host, subMatch[1]!, (subMatch[2] ?? '') as ConfigFormat | '');
    }

    // Anti-detect path jitter: slug length 6–12
    if (path.match(/^\/e[a-z0-9]{6,12}[0-9a-f]{24}$/i)) {
      return handleWs(request, env, ctx, host, path);
    }

    return withHeaders(json({ error: 'not-found', message: 'مسیر یافت نشد' }, 404), {});
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCronProbe(env));
  },
};

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function handleApi(request: Request, env: Env, ctx: ExecutionContext, host: string): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (MUTATING.has(request.method) && !sameOriginOk(request, host)) {
    return withHeaders(json({ error: 'forbidden', message: 'درخواست از مبدأ خارجی رد شد' }, 403), {});
  }

  await ensureSelfEndpoint(env, host);

  if (path === '/api/login' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const doRes = await callDo(env, '/int/login', {
      username: body.username ?? '',
      password: body.password ?? '',
      ip: clientIp(request),
    });
    const data = await doRes.json().catch(() => ({}));
    const headers = new Headers();
    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok && typeof (data as { session?: string }).session === 'string') {
      headers.set(
        'set-cookie',
        `nova_session=${(data as { session: string }).session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${12 * 60 * 60}`,
      );
    }
    return withHeaders(new Response(JSON.stringify(data), { status: doRes.status, headers }), {});
  }

  if (path === '/api/logout' && request.method === 'POST') {
    const sessionId = await cookieSession(request, env);
    if (sessionId) await callDo(env, '/int/session-delete', { sessionId });
    const headers = new Headers({
      'set-cookie': 'nova_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    });
    return withHeaders(new Response(JSON.stringify({ ok: true }), { status: 200, headers }), {});
  }

  // on-demand probe: session-gated, executes from the worker (has sockets)
  if (path === '/api/probe' && request.method === 'POST') {
    return handleProbe(request, env);
  }

  const sessionId = (await cookieSession(request, env)) ?? '';
  const rest = path.slice('/api'.length) || '/';
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const payload: Record<string, unknown> = { ...body, sessionId, ip: clientIp(request), reqHost: host };
  const doRes = await callDo(env, `/api${rest}`, payload);
  return withHeaders(doRes, {});
}

async function cookieSession(request: Request, env: Env): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)nova_session=([^;]+)/);
  if (!m) return null;
  return verifySessionId(env.SESSION_SECRET ?? '', m[1]);
}

/** Run an on-demand endpoint probe from the worker edge and store results. */
async function handleProbe(request: Request, env: Env): Promise<Response> {
  const sessionId = (await cookieSession(request, env)) ?? '';
  if (!sessionId) return withHeaders(json({ error: 'unauthorized' }, 401), {});
  const meRes = await callDo(env, '/api/me', { sessionId });
  const meData = (await meRes.json()) as { me?: { permissions?: string[] } };
  const perms = meData.me?.permissions ?? [];
  if (!perms.includes('endpoints:probe')) {
    return withHeaders(json({ error: 'forbidden', message: 'دسترسی کافی نیست' }, 403), {});
  }
  const res = await callDo(env, '/int/cron-probe', {});
  const data = (await res.json()) as { ok: boolean; endpoints: Endpoint[] };
  const endpoints = data.endpoints ?? [];
  const settingsLike = { endpoints } as PanelSettings;
  const results = await probeAll(defaultRuntimeHooks, settingsLike, 'balanced');
  await callDo(env, '/int/probe-results', { results });
  const ordered = endpoints
    .slice()
    .sort((a, b) => {
      const ra = results[a.id];
      const rb = results[b.id];
      const okA = ra?.ok ? 0 : 1;
      const okB = rb?.ok ? 0 : 1;
      if (okA !== okB) return okA - okB;
      if (ra?.ok && rb?.ok) return (ra.latencyMs ?? Infinity) - (rb.latencyMs ?? Infinity);
      return 0;
    });
  return withHeaders(json({ ok: true, results, ordered }), {});
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '';
}

function sameOriginOk(request: Request, host: string): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') return false;
  const origin = request.headers.get('origin');
  if (origin) {
    let o: URL;
    try {
      o = new URL(origin);
    } catch {
      return false;
    }
    if (o.host !== host) return false;
  }
  return true;
}

export async function callDo(env: Env, path: string, body: Record<string, unknown>): Promise<Response> {
  const id = env.AMINCK_STORE.idFromName('global');
  const stub = env.AMINCK_STORE.get(id);
  return stub.fetch(`https://nova-edge.internal${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const seededHosts = new Set<string>();

/** Make sure this deployment's own host is a known endpoint (workers.dev default). */
async function ensureSelfEndpoint(env: Env, host: string): Promise<void> {
  const clean = host.replace(/:\d+$/, '').toLowerCase();
  if (!clean || seededHosts.has(clean)) return;
  seededHosts.add(clean);
  await callDo(env, '/int/ensure-self', { host: clean }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

async function handleSub(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  host: string,
  token: string,
  forcedFormat: ConfigFormat | '',
): Promise<Response> {
  const ua = request.headers.get('user-agent') ?? '';
  const doRes = await callDo(env, '/int/sub-fetch', {
    token,
    ua: ua.slice(0, 200),
    ip: clientIp(request),
    host,
  });
  if (!doRes.ok) {
    return withHeaders(new Response('not-found', { status: doRes.status >= 400 ? doRes.status : 404 }), {});
  }
  const data = (await doRes.json()) as {
    user: User;
    settings: PanelSettings;
    payloads: Record<ConfigFormat, string>;
  };

  let format: ConfigFormat;
  const fmtParam = forcedFormat || (request.headers.get('x-format') ?? '');
  if (fmtParam && ['v2ray', 'raw', 'clash', 'singbox'].includes(fmtParam)) {
    format = fmtParam as ConfigFormat;
  } else {
    const u = ua.toLowerCase();
    if (u.includes('clash') || u.includes('mihomo') || u.includes('stash')) format = 'clash';
    else if (u.includes('sing-box') || u.includes('singbox')) format = 'singbox';
    else format = 'v2ray';
  }

  const payload = data.payloads[format] ?? data.payloads.v2ray;
  const user = data.user;
  const settings = data.settings;

  const headers = new Headers();
  headers.set('content-type', contentTypeFor(format));
  const safeName = user.name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'sub';
  headers.set('content-disposition', `attachment; filename="AMINCK-Nova-Edge-${safeName}.txt"`);
  headers.set(
    'subscription-userinfo',
    `upload=0; download=${user.usageBytes}; total=${user.limitBytes}; expire=${user.expiresAt}`,
  );
  headers.set('profile-update-interval', `${settings.updateIntervalHours || 24}h`);
  if (settings.supportUrl) headers.set('support-url', settings.supportUrl);
  headers.set('cache-control', 'no-store');
  return withHeaders(new Response(payload, { status: 200, headers }), {});
}

function contentTypeFor(format: ConfigFormat): string {
  if (format === 'clash') return 'text/yaml; charset=utf-8';
  if (format === 'singbox') return 'application/json; charset=utf-8';
  if (format === 'raw') return 'text/plain; charset=utf-8';
  return 'application/octet-stream; charset=utf-8';
}

// ---------------------------------------------------------------------------
// VLESS over WebSocket
// ---------------------------------------------------------------------------

async function handleWs(request: Request, env: Env, ctx: ExecutionContext, host: string, path: string): Promise<Response> {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return withHeaders(json({ error: 'bad-request', message: 'اتصال باید WebSocket باشد' }, 400), {});
  }
  const m = path.match(/^\/e([a-z0-9]{6,12})([0-9a-f]{24})$/i);
  if (!m) return withHeaders(json({ error: 'not-found' }, 404), {});
  const userId = m[2]!.toLowerCase();

  const connectRes = await callDo(env, '/int/connect-by-id', { userId, path, ip: clientIp(request) });
  const conn = (await connectRes.json()) as {
    ok: boolean;
    reason?: string;
    uuid?: string;
    policy?: {
      dohList: string[];
      tlsPorts: number[];
      tcpRetries: number;
      connectTimeoutMs: number;
      maxEarlyData: number;
    };
  };

  if (!conn.ok) {
    return withHeaders(json({ ok: false, reason: conn.reason ?? 'denied' }, connectRes.status >= 400 ? connectRes.status : 403), {});
  }

  const pair = new WebSocketPair();
  const server = pair[0];
  server.accept();
  const client = pair[1];

  const bridge = new WsVlessBridge(server, env, ctx, conn.uuid!, conn.policy!);
  server.addEventListener('message', (ev: MessageEvent) => {
    if (typeof ev.data === 'string') return;
    bridge.feed(ev.data as ArrayBuffer | ArrayBufferView);
  });
  server.addEventListener('close', () => bridge.shutdown());
  server.addEventListener('error', () => bridge.shutdown());
  ctx.waitUntil(bridge.finished());

  return withHeaders(new Response(null, { status: 101, webSocket: client }), {});
}

/** Bridges one WebSocket client to one VLESS session. */
class WsVlessBridge {
  private engine: VlessSession | null = null;
  private headerBuf: Uint8Array = new Uint8Array(0);
  private settled = false;
  private closed = false;
  private resolveFinished!: (r: unknown) => void;
  readonly finishedPromise: Promise<unknown>;

  constructor(
    private server: WebSocket,
    private env: Env,
    private ctx: ExecutionContext,
    private uuid: string,
    private policy: {
      dohList: string[];
      tlsPorts: number[];
      tcpRetries: number;
      connectTimeoutMs: number;
      maxEarlyData: number;
    },
  ) {
    this.finishedPromise = new Promise((resolve) => {
      this.resolveFinished = resolve;
    });
  }

  async finished(): Promise<unknown> {
    return this.finishedPromise;
  }

  feed(data: ArrayBuffer | ArrayBufferView): void {
    if (this.closed) return;
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
    if (!this.engine) {
      this.headerBuf = this.headerBuf.length === 0 ? bytes : concatBytes(this.headerBuf, bytes);
      const parsed = parseVlessHeader(this.headerBuf);
      if (parsed.state === 'need-more') return;
      if (parsed.state === 'invalid') {
        this.close(1002, parsed.reason);
        return;
      }
      const decision = classifyTarget(parsed.target, this.policy.tlsPorts);
      if (!decision.allowed) {
        this.close(1008, decision.reason);
        return;
      }
      this.headerBuf = new Uint8Array(0);
      this.engine = this.createEngine(parsed.target);
      void this.engine.start();
      if (parsed.payload.length > 0) this.engine.feed(parsed.payload);
      return;
    }
    this.engine.feed(bytes);
  }

  private createEngine(target: VlessTarget): VlessSession {
    return new VlessSession(target, {
      client: {
        send: (data) => {
          try {
            this.server.send(data);
          } catch {
            /* closed */
          }
        },
      },
      hooks: makeSessionHooks(this.policy),
      policy: {
        tlsPorts: this.policy.tlsPorts,
        dohList: this.policy.dohList,
        tcpRetries: this.policy.tcpRetries,
        connectTimeoutMs: this.policy.connectTimeoutMs,
      },
      onStats: (up, down) => {
        if (up + down > 0) {
          this.ctx.waitUntil(callDo(this.env, '/int/stats', { uuid: this.uuid, up, down }).catch(() => undefined));
        }
      },
    });
  }

  shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.engine) this.engine.clientClosed();
    this.ctx.waitUntil(callDo(this.env, '/int/disconnect', { uuid: this.uuid }).catch(() => undefined));
    this.resolveFinished(undefined);
  }

  private close(code: number, reason: string): void {
    if (this.closed) return;
    try {
      this.server.close(code, reason);
    } catch {
      /* already closed */
    }
    this.shutdown();
  }
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function makeSessionHooks(policy: {
  dohList: string[];
  tlsPorts: number[];
  tcpRetries: number;
  connectTimeoutMs: number;
  maxEarlyData: number;
}): SessionHooks {
  return {
    async tcpConnect(host, port, opts) {
      let ip = host;
      const isIpLiteral = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
      if (!isIpLiteral) {
        const resolved = await resolvePublic(host, policy.dohList, opts.timeoutMs);
        if (!resolved) throw new Error('dns-unresolvable');
        ip = resolved;
      }
      const { connect } = await import('cloudflare:sockets');
      // Connect via the original hostname so the TLS SNI is the real
      // destination domain (never a fake/third-party SNI).
      const socket = connect(
        { hostname: host, port },
        { secureTransport: 'on', allowHalfOpen: false },
      );
      return socketAdapter(socket);
    },
    async dohQuery(packet) {
      for (const doh of policy.dohList) {
        try {
          const res = await fetch(doh, {
            method: 'POST',
            headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
            body: packet,
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) return new Uint8Array(await res.arrayBuffer());
        } catch {
          // resolver down — DNS failover
        }
      }
      return null;
    },
  };
}

function socketAdapter(socket: Socket): TcpSocket {
  const dataCbs: Array<(d: Uint8Array) => void> = [];
  const closeCbs: Array<() => void> = [];
  const errorCbs: Array<(e: unknown) => void> = [];
  const writer = socket.writable.getWriter();
  void (async () => {
    const reader = socket.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const cb of dataCbs) cb(value);
      }
    } catch (err) {
      for (const cb of errorCbs) cb(err);
    } finally {
      for (const cb of closeCbs) cb();
    }
  })();
  return {
    opened: socket.opened as Promise<unknown>,
    write: (d) => {
      writer.write(d).catch(() => undefined);
    },
    end: () => {
      socket.close().catch(() => undefined);
    },
    onData: (cb) => dataCbs.push(cb),
    onClose: (cb) => closeCbs.push(cb),
    onError: (cb) => errorCbs.push(cb),
  };
}

async function resolvePublic(hostname: string, dohList: string[], timeoutMs: number): Promise<string | null> {
  const { buildDnsQuery, parseDnsAnswers } = await import('./protocol');
  const id = Math.floor(Math.random() * 65535);
  for (const doh of dohList) {
    try {
      const res = await fetch(doh, {
        method: 'POST',
        headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
        body: buildDnsQuery(id, hostname, 1),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const answers = parseDnsAnswers(new Uint8Array(await res.arrayBuffer()));
      const ip = answers.find((a) => a.type === 1 && a.data && !isPrivateLiteral(a.data))?.data;
      if (ip) return ip;
    } catch {
      // failover
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cron probe (every 30 minutes)
// ---------------------------------------------------------------------------

async function runCronProbe(env: Env): Promise<void> {
  try {
    const res = await callDo(env, '/int/cron-probe', {});
    const data = (await res.json()) as { ok: boolean; endpoints: Endpoint[] };
    if (!data.ok || data.endpoints.length === 0) return;
    const settingsLike = { endpoints: data.endpoints } as PanelSettings;
    const results = await probeAll(defaultRuntimeHooks, settingsLike, 'balanced');
    await callDo(env, '/int/probe-results', { results });
  } catch {
    // never break the schedule
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function html(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'x-robots-tag': 'noindex, nofollow',
};

function withHeaders(resp: Response, extra: { cors?: boolean }): Response {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  if (extra.cors) {
    headers.set('access-control-allow-origin', '*');
    headers.set('access-control-allow-methods', 'GET, OPTIONS');
    headers.set('access-control-max-age', '86400');
  }
  return new Response(resp.body, { status: resp.status, headers });
}