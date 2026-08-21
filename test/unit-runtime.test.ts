import { describe, expect, it } from 'vitest';
import { compareVersions, decodeWsEarlyData, parseAiProfileAdvice } from '../src/index';
import { AMINCKStore, defaultSettings } from '../src/store';
import { defaultRuntimeHooks } from '../src/probe';
import type { Admin, User } from '../src/types';
import { VlessSession, type TcpSocket } from '../src/proxy';
import { ATYP_DOMAIN, CMD_TCP, type VlessTarget } from '../src/protocol';

describe('WebSocket early data', () => {
  it('decodes base64url and enforces the configured maximum', () => {
    const bytes = Uint8Array.from([0, 255, 10, 20, 30]);
    const encoded = Buffer.from(bytes).toString('base64url');
    expect(Array.from(decodeWsEarlyData(encoded, 16) ?? [])).toEqual(Array.from(bytes));
    expect(decodeWsEarlyData(encoded, 2)).toBeNull();
    expect(decodeWsEarlyData('not,a,protocol-list', 100)).toBeNull();
    expect(decodeWsEarlyData('***', 100)).toBeNull();
  });
});

describe('source update version comparison', () => {
  it('compares validated semantic versions without lexicographic mistakes', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('1.1.9', '1.2.0')).toBeLessThan(0);
  });
});

describe('optional Workers AI advice validation', () => {
  it('accepts only the fixed profile enums from model output', () => {
    expect(parseAiProfileAdvice({ response: '```json\n{"speedPreset":"balanced","profileMode":"auto"}\n```' }))
      .toEqual({ speedPreset: 'balanced', profileMode: 'auto' });
    expect(parseAiProfileAdvice({ response: '{"speedPreset":"fast","profileMode":"auto"}' })).toBeNull();
    expect(parseAiProfileAdvice({ response: '{"speedPreset":"god","profileMode":"unsafe"}' })).toBeNull();
  });
});

describe('endpoint ownership probe', () => {
  it('accepts only a healthy AMINNOVA /healthz marker', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, app: 'AMINNOVA' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
      expect((await defaultRuntimeHooks.tcpTlsConnect('owned.example', 443, 1000)).ok).toBe(true);

      globalThis.fetch = (async () => new Response('<html>unrelated site</html>', { status: 200 })) as typeof fetch;
      const unrelated = await defaultRuntimeHooks.tcpTlsConnect('third-party.example', 443, 1000);
      expect(unrelated.ok).toBe(false);
      expect(unrelated.error).toBe('not-aminnova-worker');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Durable Object cold-start persistence', () => {
  it('rehydrates users from the Map returned by storage multi-get', async () => {
    const id = 'a'.repeat(24);
    const token = 'b'.repeat(64);
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    const settings = defaultSettings();
    settings.endpoints = [{ id: 'ep1', label: 'worker:443', host: 'edge.example.workers.dev', port: 443, createdAt: 1 }];
    const user: User = {
      id,
      name: 'cold-start-user',
      uuid,
      token,
      routes: [{
        path: `/eabcdef${id}`,
        endpointId: 'ep1',
        host: 'edge.example.workers.dev',
        port: 443,
        index: 1,
        sni: 'edge.example.workers.dev',
        wsHost: 'edge.example.workers.dev',
      }],
      limitBytes: 0,
      limitSeconds: 0,
      maxConnections: 0,
      limitRequests: 0,
      requestCount: 0,
      active: true,
      speedPreset: 'god',
      profileMode: 'auto',
      fingerprint: null,
      configNameTemplate: null,
      note: '',
      createdAt: 1,
      expiresAt: 0,
      usageBytes: 0,
      lastSeenAt: 0,
      lastSubAt: 0,
    };
    const owner: Admin = {
      id: 'owner', username: 'AMINCK', role: 'owner', power: 'ultra', active: true,
      salt: '', hash: '', iterations: 0, createdAt: 1, lastLoginAt: null,
    };
    const db = new Map<string, unknown>([
      ['settings', settings],
      ['admins', [owner]],
      ['sessions', []],
      ['users:index', [id]],
      [`users:${id}`, user],
      ['audit:info', { count: 0 }],
    ]);
    let usedMapMultiGet = false;
    const storage = {
      async get(key: string | string[]) {
        if (Array.isArray(key)) {
          usedMapMultiGet = true;
          return new Map(key.filter((k) => db.has(k)).map((k) => [k, db.get(k)]));
        }
        return db.get(key);
      },
      async put(key: string | Record<string, unknown>, value?: unknown) {
        if (typeof key === 'string') db.set(key, value);
        else for (const [k, v] of Object.entries(key)) db.set(k, v);
      },
      async delete(key: string | string[]) {
        const keys = Array.isArray(key) ? key : [key];
        let deleted = 0;
        for (const k of keys) if (db.delete(k)) deleted++;
        return Array.isArray(key) ? deleted : deleted > 0;
      },
    };
    const state = { storage } as unknown as DurableObjectState;
    const store = new AMINCKStore(state, {} as never);
    const response = await store.fetch(new Request('https://nova-edge.internal/int/sub-fetch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, host: 'edge.example.workers.dev', ua: 'test', ip: '' }),
    }));
    expect(usedMapMultiGet).toBe(true);
    expect(response.status).toBe(200);
    const data = await response.json() as { payloads: { raw: string; v2ray: string } };
    expect(data.payloads.raw).toContain('vless://');
    expect(Buffer.from(data.payloads.v2ray, 'base64').toString('utf8')).toContain(`path=%2Feabcdef${id}`);
  });
});

describe('VLESS downstream framing', () => {
  it('ends a socket that never opens instead of leaving clients to time out forever', async () => {
    let ended = 0;
    const socket: TcpSocket = {
      opened: new Promise(() => undefined),
      write: () => undefined,
      end: () => { ended += 1; },
      onData: () => undefined,
      onClose: () => undefined,
      onError: () => undefined,
    };
    const target: VlessTarget = { command: CMD_TCP, port: 443, addressType: ATYP_DOMAIN, address: 'example.com' };
    const session = new VlessSession(target, {
      client: { send: () => undefined },
      hooks: { tcpConnect: async () => socket, dohQuery: async () => null },
      policy: { tcpPorts: [443], dohList: [], tcpRetries: 1, connectTimeoutMs: 20 },
    });
    await session.start();
    const report = await session.report;
    expect(report.status).toBe('error');
    expect(report.reason).toBe('socket-open-timeout');
    expect(ended).toBe(1);
  });

  it('prefixes only the first upstream frame with the VLESS response header', async () => {
    const dataCallbacks: Array<(data: Uint8Array) => void> = [];
    const closeCallbacks: Array<() => void> = [];
    const errorCallbacks: Array<(error: unknown) => void> = [];
    const writes: Uint8Array[] = [];
    const socket: TcpSocket = {
      opened: Promise.resolve(),
      write: (data) => writes.push(data),
      end: () => undefined,
      onData: (cb) => dataCallbacks.push(cb),
      onClose: (cb) => closeCallbacks.push(cb),
      onError: (cb) => errorCallbacks.push(cb),
    };
    const sent: Uint8Array[] = [];
    const target: VlessTarget = {
      command: CMD_TCP,
      port: 443,
      addressType: ATYP_DOMAIN,
      address: 'example.com',
    };
    const session = new VlessSession(target, {
      client: { send: (data) => sent.push(data) },
      hooks: {
        tcpConnect: async () => socket,
        dohQuery: async () => null,
      },
      policy: {
        tcpPorts: [80, 443],
        dohList: ['https://cloudflare-dns.com/dns-query'],
        tcpRetries: 1,
        connectTimeoutMs: 1000,
      },
    });

    session.feed(Uint8Array.from([9, 8]));
    await session.start();
    expect(Array.from(writes[0] ?? [])).toEqual([9, 8]);

    dataCallbacks[0]!(Uint8Array.from([1, 2, 3]));
    dataCallbacks[0]!(Uint8Array.from([4, 5]));
    expect(Array.from(sent[0] ?? [])).toEqual([0, 0, 1, 2, 3]);
    expect(Array.from(sent[1] ?? [])).toEqual([4, 5]);

    session.clientClosed();
    await session.report;
    expect(closeCallbacks.length).toBeGreaterThan(0);
    expect(errorCallbacks.length).toBeGreaterThan(0);
  });
});
