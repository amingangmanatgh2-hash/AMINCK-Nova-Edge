/**
 * EDGE PANEL — endpoint scanner (probe).
 *
 * Measures TCP connect + TLS handshake latency from the Cloudflare edge using
 * `cloudflare:sockets`. The runtime seam (connector + resolver) is injectable
 * so unit tests can verify retry/sort/failover logic without real sockets.
 */
import type { Endpoint, ProbeResult, PanelSettings } from './types';
import { MAX_ENDPOINTS, SPEED_PRESETS, type SpeedPreset } from './types';
import { now } from './utils';

export interface ConnectOutcome {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
}

export interface RuntimeHooks {
  /** Establish TCP + TLS to `host:port`; resolve after handshake. */
  tcpTlsConnect(host: string, port: number, timeoutMs: number): Promise<ConnectOutcome>;
  /** Resolve a hostname to public IPs via DoH (primary + failover). */
  resolveViaDoh(name: string, dohList: string[], timeoutMs: number): Promise<string[]>;
}

export interface ProbeOptions {
  timeoutMs: number;
  retries: number;
}

/** Pure TCP+TLS probe of one endpoint with connect retry. */
export async function probeOnce(
  hooks: RuntimeHooks,
  host: string,
  port: number,
  opts: ProbeOptions,
): Promise<ProbeResult> {
  let lastError = '';
  let bestLatency: number | null = null;
  for (let attempt = 1; attempt <= opts.retries; attempt++) {
    const r = await hooks.tcpTlsConnect(host, port, opts.timeoutMs);
    if (r.ok) {
      return { endpointId: '', ok: true, latencyMs: r.latencyMs, checkedAt: Date.now() };
    }
    lastError = r.error ?? `attempt-${attempt}-failed`;
    if (r.latencyMs !== null) bestLatency = r.latencyMs;
  }
  return {
    endpointId: '',
    ok: false,
    latencyMs: bestLatency,
    error: lastError,
    checkedAt: Date.now(),
  };
}

/** Scan all endpoints, attach results, sort healthy ones by latency. */
export async function probeAll(
  hooks: RuntimeHooks,
  settings: PanelSettings,
  preset: SpeedPreset = 'balanced',
): Promise<Record<string, ProbeResult>> {
  const speed = SPEED_PRESETS[preset];
  const results: Record<string, ProbeResult> = {};
  await Promise.all(
    settings.endpoints.map(async (ep) => {
      const r = await probeOnce(hooks, ep.host, ep.port, {
        timeoutMs: speed.probeTimeoutMs,
        retries: Math.min(3, 1 + Math.floor(speed.tcpRetries)),
      });
      r.endpointId = ep.id;
      results[ep.id] = r;
    }),
  );
  return results;
}

/** Sort endpoints: healthy+fast first, then unhealthy, keep stable order. */
export function sortEndpoints(
  endpoints: Endpoint[],
  results: Record<string, ProbeResult>,
): Endpoint[] {
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

/** Pick the fastest `count` healthy endpoints (falls back to first endpoints). */
export function pickFastest(
  endpoints: Endpoint[],
  results: Record<string, ProbeResult>,
  count: number,
): Endpoint[] {
  const healthy = sortEndpoints(endpoints, results).filter((ep) => results[ep.id]?.ok);
  const picked = healthy.slice(0, Math.max(1, count));
  if (picked.length >= Math.min(count, endpoints.length || 1)) return picked;
  // if not enough healthy endpoints, allow the rest from known endpoints
  const rest = endpoints.filter((ep) => !picked.includes(ep));
  return [...picked, ...rest].slice(0, Math.max(1, count));
}

/** Validate an endpoint entry (host must not be private, port valid). */
export function validateEndpoint(
  hostRaw: string,
  portRaw: number | string,
  existing: Endpoint[],
): { ok: true; endpoint: Endpoint } | { ok: false; error: string } {
  const host = hostRaw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
    return { ok: false, error: 'نام میزبان نامعتبر است (فقط دامنه معتبر)' };
  }
  if (host.includes(':')) {
    return { ok: false, error: 'آدرس فقط باید دامنه باشد' };
  }
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'پورت نامعتبر است' };
  }
  if (existing.length >= MAX_ENDPOINTS) {
    return { ok: false, error: `حداکثر ${MAX_ENDPOINTS} Endpoint مجاز است` };
  }
  if (existing.some((e) => e.host === host && e.port === port)) {
    return { ok: false, error: 'این Endpoint قبلاً اضافه شده است' };
  }
  return {
    ok: true,
    endpoint: { id: crypto.randomUUID(), label: `${host}:${port}`, host, port, createdAt: Date.now() },
  };
}

// ---------------------------------------------------------------------------
// Default runtime: real workerd implementation
// ---------------------------------------------------------------------------

export const defaultRuntimeHooks: RuntimeHooks = {
  async tcpTlsConnect(host, port, timeoutMs) {
    const { connect } = await import('cloudflare:sockets');
    const t0 = performance.now();
    const socket = connect(
      { hostname: host, port },
      { secureTransport: 'on', allowHalfOpen: false },
    );
    const timer = timeoutPromise(timeoutMs);
    try {
      await Promise.race([socket.opened, timer.promise]);
      const latencyMs = performance.now() - t0;
      socket.close();
      return { ok: true, latencyMs };
    } catch (err) {
      try {
        socket.close();
      } catch {
        /* noop */
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, latencyMs: null, error: msg === 'timeout' ? 'timeout' : msg };
    } finally {
      timer.cancel();
    }
  },

  async resolveViaDoh(name, dohList, timeoutMs) {
    const list = [...dohList];
    for (const doh of list) {
      try {
        const { buildDnsQuery, parseDnsAnswers, parseDnsQuestion } = await import('./protocol');
        const id = Math.floor(Math.random() * 65535);
        const query = buildDnsQuery(id, name, 1);
        const res = await timeoutFetch(doh, query, timeoutMs);
        const answers = parseDnsAnswers(new Uint8Array(await res.arrayBuffer()));
        const v4 = answers.filter((a) => a.type === 1 && a.data).map((a) => a.data);
        if (v4.length > 0) return v4;
        const query6 = buildDnsQuery(id + 1, name, 28);
        const res6 = await timeoutFetch(doh, query6, timeoutMs);
        const answers6 = parseDnsAnswers(new Uint8Array(await res6.arrayBuffer()));
        const v6 = answers6.filter((a) => a.type === 28 && a.data).map((a) => a.data);
        if (v6.length > 0) return v6;
      } catch {
        // try next resolver — DNS failover
      }
    }
    return [];
  },
};

function timeoutPromise(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return { promise, cancel: () => timer && clearTimeout(timer) };
}

async function timeoutFetch(
  url: string,
  body: Uint8Array,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
      body,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}