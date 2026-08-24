/**
 * AMINCK GOD Edition — Cloudflare Worker entry.
 *
 * Routing:
 *   GET  /healthz            public health check (CORS)
 *   GET  /                   Persian RTL browser admin panel
 *   GET  /app.js /app.css    minimal static assets
 *   POST /api/login …        JSON admin API (proxied to the Durable Object)
 *   POST /api/hot-update     one-click config regen without domain downtime
 *   GET  /sub/:token         subscriptions (v2ray base64 / clash / sing-box / raw)
 *   WS   /e<slug><userid>    VLESS over WebSocket proxy (random path + jitter)
 *
 * Security: Same-Origin checks on mutating requests, opaque server-stored
 * 256-bit HttpOnly session cookies, security headers (CSP, X-Frame-Options, Referrer-Policy,
 * Permissions-Policy) and server-side permission enforcement in the DO.
 */
import type { Env } from './store';
import { AMINCKStore } from './store';
import type { ConfigFormat, Endpoint, PanelSettings, User } from './types';
import { MAX_PATHS } from './types';
import { classifyTarget, VlessSession } from './proxy';
import type { SessionHooks, TcpSocket } from './proxy';
import type { VlessTarget } from './protocol';
import { parseVlessHeader } from './protocol';
import { isPrivateLiteral } from './utils';
import { defaultRuntimeHooks, probeAll } from './probe';
import { aiGameIdReference, deterministicAiBuildPlan, parseAiBuildPlan } from './ai';
import {
  ARENA_SERVICES,
  arenaModelInstruction,
  arenaServiceSpec,
  arenaSummaryFromModel,
  deterministicArenaRun,
  isArenaServiceId,
  sanitizeArenaContext,
} from './arena';
import {
  UI_APP_CSS,
  UI_APP_JS,
  UI_ICON_SVG,
  UI_MANIFEST_JSON,
  UI_SW_JS,
  uiShell,
} from './ui';

export { AMINCKStore };

const AMINNOVA_RELEASE = '2026.08.23-arena-ai-services.5';
const AMINNOVA_VERSION = '1.4.0';
const DNS_CACHE = new Map<string, { ip: string; expiresAt: number }>();
let UPDATE_CACHE: { expiresAt: number; value: Record<string, unknown> } | null = null;

const PANEL_ASSETS = new Set([
  '/', '/app.js', '/app.css', '/manifest.webmanifest', '/sw.js',
  '/icon.svg', '/icon-192.png', '/icon-512.png', '/favicon.ico',
]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.host;
    const path = url.pathname;

    if (path === '/healthz') {
      return withHeaders(
        new Response(JSON.stringify({ ok: true, app: 'AMINNOVA', version: AMINNOVA_VERSION, release: AMINNOVA_RELEASE, ts: Date.now() }), {
          headers: { 'content-type': 'application/json', 'x-aminck-release': AMINNOVA_RELEASE },
        }),
        { cors: true },
      );
    }

    if (request.method === 'GET' && PANEL_ASSETS.has(path)) {
      // Static PWA assets are generated from src/ui.ts and still go through
      // the Worker so security headers apply. API/subscription responses are
      // deliberately excluded from the service-worker cache.
      if (env.ASSETS && path !== '/favicon.ico') {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status !== 404) {
          const headers = new Headers(assetRes.headers);
          if (path === '/sw.js') {
            headers.set('cache-control', 'no-cache, no-store, must-revalidate');
            headers.set('service-worker-allowed', '/');
          }
          return withHeaders(new Response(assetRes.body, { status: assetRes.status, headers }), {});
        }
      }
      if (path === '/') return withHeaders(html(uiShell('AMINNOVA')), {});
      if (path === '/app.js') {
        return withHeaders(new Response(UI_APP_JS, { headers: { 'content-type': 'application/javascript; charset=utf-8' } }), {});
      }
      if (path === '/app.css') {
        return withHeaders(new Response(UI_APP_CSS, { headers: { 'content-type': 'text/css; charset=utf-8' } }), {});
      }
      if (path === '/manifest.webmanifest') {
        return withHeaders(new Response(UI_MANIFEST_JSON, { headers: { 'content-type': 'application/manifest+json; charset=utf-8' } }), {});
      }
      if (path === '/sw.js') {
        return withHeaders(new Response(UI_SW_JS, { headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'no-cache, no-store, must-revalidate',
          'service-worker-allowed': '/',
        } }), {});
      }
      if (path === '/icon-192.png' || path === '/icon-512.png') {
        return withHeaders(json({ error: 'asset-binding-required' }, 404), {});
      }
      return withHeaders(new Response(UI_ICON_SVG, { headers: { 'content-type': 'image/svg+xml; charset=utf-8' } }), {});
    }
    if (request.method === 'GET' && path === '/robots.txt') return new Response('', { status: 204 });

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

type AiProfileAdvice = {
  speedPreset: 'stable' | 'balanced' | 'turbo' | 'god' | 'latency';
  profileMode: 'auto' | 'fallback' | 'balance';
};

export function parseAiProfileAdvice(value: unknown): AiProfileAdvice | null {
  const response = value && typeof value === 'object'
    ? String((value as { response?: unknown; output_text?: unknown }).response
      ?? (value as { output_text?: unknown }).output_text ?? '')
    : String(value ?? '');
  const match = response.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<AiProfileAdvice>;
    if (!['stable', 'balanced', 'turbo', 'god', 'latency'].includes(String(parsed.speedPreset))) return null;
    if (!['auto', 'fallback', 'balance'].includes(String(parsed.profileMode))) return null;
    return parsed as AiProfileAdvice;
  } catch {
    return null;
  }
}

async function createAiBuildPlan(prompt: string, env: Env): Promise<Record<string, unknown>> {
  const fallback = deterministicAiBuildPlan(prompt);
  if (!env.AI) {
    return {
      ok: true,
      plan: fallback,
      cloudflareAiUsed: false,
      deterministicFallback: true,
      message: 'Binding هوش مصنوعی در دسترس نیست؛ موتور امن فارسی همان طرح را به‌صورت محلی ساخت.',
    };
  }
  try {
    const instruction = [
      'You are the constrained AMINNOVA subscription planner. Return one JSON object only.',
      'Allowed fields: paths, subscriptionCount, usageMode, gameIds, ironMode, ironCount, domesticDirect, speedPreset, profileMode, dynamicPool, rotationMinutes, useCleanCatalog.',
      'speedPreset must be stable|balanced|turbo|god|latency; profileMode auto|fallback|balance; usageMode normal|gaming.',
      'Use latency for lowest measured route selection, fallback for interruption resistance, and domesticDirect for explicitly requested Iranian/national-network continuity.',
      'Never promise a ping, location, universal access, censorship bypass, or uptime. Never return URLs, domains, secrets, code, or extra keys.',
      `Valid game ids: ${aiGameIdReference()}`,
    ].join('\n');
    const result = await Promise.race([
      env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: prompt },
        ],
        max_tokens: 450,
        temperature: 0,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ai-timeout')), 5000)),
    ]);
    const parsed = parseAiBuildPlan(result, fallback);
    if (!parsed) throw new Error('ai-invalid-plan');
    return {
      ok: true,
      plan: parsed,
      cloudflareAiUsed: true,
      deterministicFallback: false,
      message: 'Cloudflare AI طرح را ساخت و Backend همه فیلدها و Game IDها را دوباره محدود و اعتبارسنجی کرد.',
    };
  } catch {
    return {
      ok: true,
      plan: fallback,
      cloudflareAiUsed: false,
      deterministicFallback: true,
      message: 'AI ابری پاسخ معتبر نداد؛ موتور امن فارسی بدون متوقف‌کردن ساخت، طرح محدودشده را آماده کرد.',
    };
  }
}

/**
 * Run one AMINNOVA Arena service. The deterministic engine always produces
 * the result; when a Workers AI binding is available the model may only
 * rephrase the Persian summary, and only if the scrubbed output survives
 * validation. Timeouts/quota/model errors fail open to the local engine.
 */
async function runArenaService(
  serviceId: 'build-plan' | 'profile-coach' | 'endpoint-analyst' | 'security-review',
  prompt: string,
  rawContext: unknown,
  env: Env,
): Promise<Record<string, unknown>> {
  const context = sanitizeArenaContext(rawContext);
  const result = deterministicArenaRun(serviceId, { prompt, context });
  const spec = arenaServiceSpec(serviceId);
  if (!env.AI) {
    return {
      ok: true,
      arena: 'AMINNOVA Arena',
      service: spec,
      result,
      cloudflareAiUsed: false,
      deterministicFallback: true,
      message: 'Binding هوش مصنوعی در دسترس نیست؛ موتور تعیین‌پذیر امن AMINNOVA نتیجه معتبر را ساخت.',
    };
  }
  try {
    const inference = env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
      messages: [{ role: 'user', content: arenaModelInstruction(spec, result) }],
      max_tokens: 220,
      temperature: 0,
    });
    const modelOut = await Promise.race([
      inference,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ai-timeout')), 4000)),
    ]);
    const rewritten = arenaSummaryFromModel(modelOut);
    if (!rewritten) throw new Error('ai-invalid-summary');
    return {
      ok: true,
      arena: 'AMINNOVA Arena',
      service: spec,
      result: { ...result, summary: rewritten },
      cloudflareAiUsed: true,
      deterministicFallback: false,
      message: 'Cloudflare AI فقط متن خلاصه را بازنویسی کرد؛ اعداد و یافته‌ها از موتور تعیین‌پذیر امن است.',
    };
  } catch {
    return {
      ok: true,
      arena: 'AMINNOVA Arena',
      service: spec,
      result,
      cloudflareAiUsed: false,
      deterministicFallback: true,
      message: 'AI ابری پاسخ قابل‌قبول نداد؛ نتیجه موتور تعیین‌پذیر امن بدون وقفه برگردانده شد.',
    };
  }
}

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
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok && typeof (data as { session?: string }).session === 'string') {
      headers.set(
        'set-cookie',
        `nova_session=${(data as { session: string }).session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${12 * 60 * 60}`,
      );
    }
    return withHeaders(new Response(JSON.stringify(data), { status: doRes.status, headers }), {});
  }

  if (path === '/api/launch' && (request.method === 'GET' || request.method === 'POST')) {
    return withHeaders(json(launchInfo()), {});
  }

  if (path === '/api/update-check' && request.method === 'GET') {
    return withHeaders(json(await checkForSourceUpdate()), {});
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

  if (path === '/api/ai-plan' && request.method === 'POST') {
    if (!sessionId) return withHeaders(json({ error: 'unauthorized' }, 401), {});
    const meResponse = await callDo(env, '/api/me', { sessionId });
    if (!meResponse.ok) return withHeaders(json({ error: 'unauthorized' }, 401), {});
    const meData = await meResponse.json() as { me?: { permissions?: string[] } };
    if (!meData.me?.permissions?.includes('configs:build')) {
      return withHeaders(json({ error: 'forbidden', message: 'دسترسی ساخت کانفیگ لازم است' }, 403), {});
    }
    const prompt = String(body.prompt ?? '').trim().slice(0, 1000);
    if (prompt.length < 3) {
      return withHeaders(json({ error: 'bad-prompt', message: 'درخواست خود را حداقل در سه کاراکتر توضیح دهید' }, 400), {});
    }
    return withHeaders(json(await createAiBuildPlan(prompt, env)), {});
  }

  // AMINNOVA Arena — the constrained AI services hub. Session + configs:build
  // only; the deterministic engines are authoritative and the optional model
  // call may only rephrase the summary after scrubbing.
  if (path === '/api/arena') {
    if (!sessionId) return withHeaders(json({ error: 'unauthorized' }, 401), {});
    const meResponse = await callDo(env, '/api/me', { sessionId });
    if (!meResponse.ok) return withHeaders(json({ error: 'unauthorized' }, 401), {});
    const meData = await meResponse.json() as { me?: { permissions?: string[] } };
    if (!meData.me?.permissions?.includes('configs:build')) {
      return withHeaders(json({ error: 'forbidden', message: 'دسترسی ساخت کانفیگ لازم است' }, 403), {});
    }
    if (request.method === 'GET') {
      return withHeaders(json({
        ok: true,
        arena: 'AMINNOVA Arena',
        version: AMINNOVA_VERSION,
        release: AMINNOVA_RELEASE,
        services: ARENA_SERVICES,
      }), {});
    }
    if (request.method !== 'POST') {
      return withHeaders(json({ error: 'method-not-allowed' }, 405), {});
    }
    if (!isArenaServiceId(body.service)) {
      return withHeaders(json({
        error: 'bad-service',
        message: 'سرویس Arena ناشناخته است؛ یکی از سرویس‌های کاتالوگ را انتخاب کنید',
        services: ARENA_SERVICES.map((spec) => spec.id),
      }, 400), {});
    }
    const spec = arenaServiceSpec(body.service);
    const prompt = String(body.prompt ?? '').slice(0, 1000);
    if (spec.needsPrompt && prompt.trim().length < 3) {
      return withHeaders(json({ error: 'bad-prompt', message: `سرویس «${spec.title}» به توضیح حداقل سه‌کاراکتری نیاز دارد` }, 400), {});
    }
    return withHeaders(json(await runArenaService(spec.id, prompt, body.context, env)), {});
  }

  // Auto Build must always measure endpoints immediately before choosing them,
  // including direct API calls (not only clicks coming from our browser UI).
  // Only measured-healthy endpoints are passed as a preference; if none pass,
  // the store safely falls back to the deployment's own registered hostname.
  if (path === '/api/auto-build' && request.method === 'POST' && sessionId) {
    delete body.aiApplied;
    delete body.aiRecommendation;
    let healthyForAdvice: Array<{ latencyMs: number }> = [];
    let mayUseAi = false;
    try {
      const probeResponse = await handleProbe(request, env);
      if (probeResponse.ok) {
        // handleProbe has validated both the session and endpoints:probe
        // permission, preventing forged cookies from consuming AI quota.
        mayUseAi = true;
        const probe = (await probeResponse.json()) as {
          results?: Record<string, { ok?: boolean; latencyMs?: number }>;
          ordered?: Endpoint[];
        };
        const selectedIds = new Set((Array.isArray(body.endpointIds) ? body.endpointIds : []).map(String));
        const healthy = (probe.ordered ?? []).filter((endpoint) =>
          probe.results?.[endpoint.id]?.ok === true && (selectedIds.size === 0 || selectedIds.has(endpoint.id)),
        );
        healthyForAdvice = healthy.map((endpoint) => ({
          latencyMs: Math.max(0, Math.round(Number(probe.results?.[endpoint.id]?.latencyMs ?? 0))),
        }));
        if (healthy.length > 0) body.orderedEndpoints = healthy;
      }
    } catch {
      // Fresh deployments still have their own hostname as a safe fallback.
    }

    if (body.useCloudflareAi === true && mayUseAi && env.AI) {
      try {
        const prompt = [
          'You select conservative AMINNOVA client profile settings from measured data.',
          'Return only JSON with speedPreset (stable|balanced|turbo|god|latency) and profileMode (auto|fallback|balance).',
          `routeCount=${Math.max(1, Math.min(MAX_PATHS, Number(body.paths ?? 20) || 20))}`,
          `healthyEndpointLatenciesMs=${healthyForAdvice.map((item) => item.latencyMs).join(',') || 'none'}`,
          'Use latency/auto for Gaming or lowest measured delay; prefer fallback/stable when measurements are sparse or interruption resistance is requested. Never claim guaranteed connectivity or ping.',
        ].join('\n');
        const inference = env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 80,
          temperature: 0,
        });
        const result = await Promise.race([
          inference,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ai-timeout')), 4000)),
        ]);
        const advice = parseAiProfileAdvice(result);
        if (advice) {
          body.speedPreset = advice.speedPreset;
          body.profileMode = advice.profileMode;
          body.aiApplied = true;
          body.aiRecommendation = `${advice.speedPreset}/${advice.profileMode}`;
        }
      } catch {
        // AI is optional and can be quota/model restricted. Deterministic probe
        // defaults remain authoritative and Auto Build must still succeed.
      }
    }
  }

  const payload: Record<string, unknown> = { ...body, sessionId, ip: clientIp(request), reqHost: host };
  const doRes = await callDo(env, `/api${rest}`, payload);
  return withHeaders(doRes, {});
}

async function cookieSession(request: Request, _env: Env): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)nova_session=([0-9a-f]{64})(?:;|$)/i);
  // The cookie itself is a cryptographically random 256-bit bearer token.
  // The Durable Object checks that it exists, is active and has not expired.
  return m ? m[1]!.toLowerCase() : null;
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
  // Mark the host as seeded only after Durable Object persistence succeeds.
  // A transient cold-start failure must not poison this isolate and leave the
  // deployment's own (known-working) hostname absent from generated routes.
  try {
    const response = await callDo(env, '/int/ensure-self', { host: clean });
    if (response.ok) seededHosts.add(clean);
  } catch {
    // Retry on the next API request.
  }
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
    rotation?: {
      enabled: boolean;
      epoch: number;
      nextRotationAt: number;
      rotationMinutes: number;
      activeRoutes: number;
    };
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
  // Keep payload visible when the operator opens a test/raw link in a browser;
  // subscription clients still consume the exact same response body.
  headers.set('content-disposition', `inline; filename="AMINCK-Nova-Edge-${safeName}.txt"`);
  headers.set(
    'subscription-userinfo',
    `upload=0; download=${user.usageBytes}; total=${user.limitBytes}; expire=${user.expiresAt}`,
  );
  headers.set('profile-update-interval', `${settings.updateIntervalHours || 24}h`);
  if (settings.supportUrl) headers.set('support-url', settings.supportUrl);
  const rotation = data.rotation;
  if (rotation?.enabled) {
    headers.set('x-aminck-pool-mode', 'rolling');
    headers.set('x-aminck-rotation-epoch', String(rotation.epoch));
    headers.set('x-aminck-rotation-minutes', String(rotation.rotationMinutes));
    headers.set('x-aminck-next-rotation', String(rotation.nextRotationAt));
    headers.set('x-aminck-active-routes', String(rotation.activeRoutes));
    headers.set('x-aminck-refresh-seconds', String(rotation.rotationMinutes * 60));
  } else {
    headers.set('x-aminck-pool-mode', 'fixed');
  }
  headers.set('etag', `W/"aminnova-${data.user.id}-${settings.configGeneration}-${rotation?.epoch ?? 0}-${format}"`);
  headers.set('x-aminck-release', AMINNOVA_RELEASE);
  headers.set('x-aminck-version', AMINNOVA_VERSION);
  headers.set('cache-control', 'private, no-store, max-age=0, must-revalidate');
  headers.set('pragma', 'no-cache');
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
      tcpPorts: number[];
      tcpRetries: number;
      connectTimeoutMs: number;
      maxEarlyData: number;
    };
  };

  if (!conn.ok) {
    return withHeaders(json({ ok: false, reason: conn.reason ?? 'denied' }, connectRes.status >= 400 ? connectRes.status : 403), {});
  }

  const pair = new WebSocketPair();
  // WebSocketPair[0] is returned to the client; [1] is the Worker-side socket.
  // Reversing them still produced HTTP 101 but Worker message handlers never
  // received client frames, so every valid VLESS config stalled until timeout.
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const bridge = new WsVlessBridge(server, env, ctx, conn.uuid!, conn.policy!);
  server.addEventListener('message', (ev: MessageEvent) => {
    if (typeof ev.data === 'string') return;
    if (ev.data instanceof ArrayBuffer || ArrayBuffer.isView(ev.data)) {
      bridge.feed(ev.data as ArrayBuffer | ArrayBufferView);
      return;
    }
    // Some local/runtime WebSocket adapters surface binary frames as Blob.
    // Accepting it prevents a successful 101 followed by an empty VLESS parser.
    if (ev.data instanceof Blob) {
      void ev.data.arrayBuffer().then((data) => bridge.feed(data)).catch(() => bridge.shutdown());
    }
  });
  server.addEventListener('close', () => bridge.shutdown());
  server.addEventListener('error', () => bridge.shutdown());
  const earlyData = decodeWsEarlyData(
    request.headers.get('sec-websocket-protocol'),
    conn.policy!.maxEarlyData,
  );
  if (earlyData) bridge.feed(earlyData);
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
      tcpPorts: number[];
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
      if (parsed.uuid.toLowerCase() !== this.uuid.toLowerCase()) {
        this.close(1008, 'uuid-mismatch');
        return;
      }
      const decision = classifyTarget(parsed.target, this.policy.tcpPorts);
      if (!decision.allowed) {
        this.close(1008, decision.reason);
        return;
      }
      this.headerBuf = new Uint8Array(0);
      const engine = this.createEngine(parsed.target);
      this.engine = engine;
      void engine.start().then(() => engine.report).then((report) => {
        if (this.closed) return;
        if (report.status === 'ok') this.close(1000, 'upstream-closed');
        else this.close(1011, safeWsReason(report.reason ?? report.status));
      }).catch((error: unknown) => {
        if (!this.closed) this.close(1011, safeWsReason(error instanceof Error ? error.message : 'upstream-error'));
      });
      if (parsed.payload.length > 0) engine.feed(parsed.payload);
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
        tcpPorts: this.policy.tcpPorts,
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

function safeWsReason(reason: string): string {
  const safe = reason.replace(/[^\x20-\x7e]/g, '').slice(0, 100);
  return safe || 'upstream-error';
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Decode Xray-style base64url WebSocket early data, rejecting large headers. */
export function decodeWsEarlyData(value: string | null, maxBytes: number): Uint8Array | null {
  if (!value || value.includes(',') || value.length > Math.max(32, maxBytes * 2)) return null;
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    if (binary.length === 0 || binary.length > maxBytes) return null;
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function makeSessionHooks(policy: {
  dohList: string[];
  tcpPorts: number[];
  tcpRetries: number;
  connectTimeoutMs: number;
  maxEarlyData: number;
}): SessionHooks {
  return {
    async tcpConnect(host, port, opts) {
      let ip = host;
      const isIpLiteral = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
      if (!isIpLiteral) {
        // Prefer a public IP validated through DoH. If every configured DoH
        // provider is temporarily unreachable, let the Workers Sockets runtime
        // resolve the already policy-checked public hostname instead of making
        // every website fail with dns-unresolvable. Cloudflare still blocks
        // private-network and same-Worker socket targets at the platform layer.
        const resolved = await resolvePublic(host, policy.dohList, Math.min(opts.timeoutMs, 2500));
        ip = resolved || host;
      }
      const { connect } = await import('cloudflare:sockets');
      // VLESS carries the client's own TLS handshake. The Worker must open a
      // raw TCP socket; wrapping it in another TLS layer breaks HTTPS.
      const socket = connect(
        { hostname: ip, port },
        { secureTransport: 'off', allowHalfOpen: false },
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
      writer.write(d).catch((error) => {
        for (const cb of errorCbs) cb(error);
      });
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
  const cacheKey = hostname.toLowerCase().replace(/\.$/, '');
  const cached = DNS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.ip;
  if (cached) DNS_CACHE.delete(cacheKey);
  const { buildDnsQuery, parseDnsAnswers } = await import('./protocol');
  const resolvers = [...new Set(dohList.filter((doh) => /^https:\/\//i.test(doh)))];
  // Run resolver failover concurrently. The old serial loop could consume
  // three full timeout windows before even opening TCP, which mobile clients
  // correctly surfaced as a tunnel timeout.
  const answers = await Promise.all(resolvers.map(async (doh) => {
    try {
      const id = Math.floor(Math.random() * 65535);
      const res = await fetch(doh, {
        method: 'POST',
        headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
        body: buildDnsQuery(id, hostname, 1),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const parsed = parseDnsAnswers(new Uint8Array(await res.arrayBuffer()));
      return parsed.find((answer) => answer.type === 1 && answer.data && !isPrivateLiteral(answer.data))?.data ?? null;
    } catch {
      return null;
    }
  }));
  const ip = answers.find((answer): answer is string => typeof answer === 'string' && answer.length > 0) ?? null;
  if (ip) {
    if (DNS_CACHE.size >= 512) DNS_CACHE.delete(DNS_CACHE.keys().next().value as string);
    DNS_CACHE.set(cacheKey, { ip, expiresAt: Date.now() + 60_000 });
  }
  return ip;
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

const REPO = 'https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge';
const CF_DEPLOY_URL = `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(REPO)}`;

function launchInfo(): Record<string, unknown> {
  return {
    ok: true,
    repo: REPO,
    deployUrl: CF_DEPLOY_URL,
    dashUrl: 'https://dash.cloudflare.com/?to=/:account/workers-and-pages',
    workerName: 'aminnova',
    version: AMINNOVA_VERSION,
    release: AMINNOVA_RELEASE,
    hint: 'Deploy رسمی را باز کنید؛ توکن کلودفلر هرگز داخل پنل وارد یا ارسال نمی‌شود.',
  };
}

async function checkForSourceUpdate(): Promise<Record<string, unknown>> {
  if (UPDATE_CACHE && UPDATE_CACHE.expiresAt > Date.now()) return UPDATE_CACHE.value;
  const source = 'https://raw.githubusercontent.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/refs/heads/main/package.json';
  try {
    const response = await fetch(source, {
      headers: { accept: 'application/json', 'user-agent': 'AMINNOVA-Update-Check' },
      signal: AbortSignal.timeout(5000),
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`github-${response.status}`);
    const remote = await response.json() as { version?: unknown };
    const latestVersion = /^\d+\.\d+\.\d+$/.test(String(remote.version)) ? String(remote.version) : AMINNOVA_VERSION;
    const value = {
      ok: true,
      currentVersion: AMINNOVA_VERSION,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, AMINNOVA_VERSION) > 0,
      release: AMINNOVA_RELEASE,
      source,
      deployUrl: CF_DEPLOY_URL,
      checkedAt: Date.now(),
      autoUpdate: false,
      message: 'بررسی نسخه خودکار است؛ نصب کد جدید فقط از Deploy امن Cloudflare/Git Integration انجام می‌شود و پنل توکن Cloudflare دریافت نمی‌کند.',
    };
    UPDATE_CACHE = { expiresAt: Date.now() + 5 * 60_000, value };
    return value;
  } catch (error) {
    return {
      ok: false,
      currentVersion: AMINNOVA_VERSION,
      latestVersion: null,
      updateAvailable: false,
      release: AMINNOVA_RELEASE,
      source,
      deployUrl: CF_DEPLOY_URL,
      checkedAt: Date.now(),
      autoUpdate: false,
      message: `GitHub فعلاً قابل بررسی نیست: ${error instanceof Error ? error.message : 'network-error'}`,
    };
  }
}

export function compareVersions(a: string, b: string): number {
  const av = a.split('.').map(Number);
  const bv = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

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
  const init: ResponseInit = { status: resp.status, statusText: resp.statusText, headers };
  if (resp.webSocket) init.webSocket = resp.webSocket;
  return new Response(resp.body, init);
}
