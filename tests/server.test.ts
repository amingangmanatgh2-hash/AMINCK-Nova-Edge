/**
 * End-to-end tests over a real TCP socket, exercising the Node http adapter.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createNullLogger } from '../src/logger.js';
import { clientKeyOf, startServer, type RunningServer } from '../src/server.js';
import type { IncomingMessage } from 'node:http';

let running: RunningServer;
let baseUrl: string;

beforeAll(async () => {
  const config = loadConfig({ PORT: '0', HOST: '127.0.0.1', CACHE_TTL_MS: '0' });
  const app = createApp({ config, logger: createNullLogger() });
  running = await startServer({ app, logger: createNullLogger() });
  baseUrl = `http://127.0.0.1:${running.port}`;
});

afterAll(async () => {
  await running.close();
});

describe('HTTP server', () => {
  it('binds to an ephemeral port', () => {
    expect(running.port).toBeGreaterThan(0);
  });

  it('serves GET /health', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('returns security and request-id headers', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('honours a caller-supplied x-request-id', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { 'x-request-id': 'caller-supplied-id' },
    });
    expect(response.headers.get('x-request-id')).toBe('caller-supplied-id');
  });

  it('generates a unique request id per request', async () => {
    const [a, b] = await Promise.all([fetch(`${baseUrl}/health`), fetch(`${baseUrl}/health`)]);
    expect(a.headers.get('x-request-id')).not.toBe(b.headers.get('x-request-id'));
  });

  it('creates a node over POST', async () => {
    const response = await fetch(`${baseUrl}/api/nodes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'nova-http-1', region: 'us-east', latencyMs: 5 }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('location')).toBe('/api/nodes/nova-http-1');
  });

  it('rejects an invalid POST body with 400', async () => {
    const response = await fetch(`${baseUrl}/api/nodes`, {
      method: 'POST',
      body: 'not json',
    });
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown path', async () => {
    const response = await fetch(`${baseUrl}/does-not-exist`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'not_found' });
  });

  it('returns 405 with an Allow header', async () => {
    const response = await fetch(`${baseUrl}/api/nodes`, { method: 'PUT' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toContain('GET');
  });

  it('answers HEAD with headers but no body', async () => {
    const response = await fetch(`${baseUrl}/health`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('answers OPTIONS preflight with 204', async () => {
    const response = await fetch(`${baseUrl}/api/nodes`, { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('parses query parameters', async () => {
    const response = await fetch(`${baseUrl}/api/nodes?region=us-west`);
    expect(await response.json()).toMatchObject({ count: 1 });
  });

  it('handles URL-encoded path segments', async () => {
    const response = await fetch(`${baseUrl}/api/echo/a%2Fb/c`);
    expect(response.status).toBe(200);
  });

  it('rejects a body larger than the limit with 413', async () => {
    const config = loadConfig({ PORT: '0', HOST: '127.0.0.1' });
    const app = createApp({ config, logger: createNullLogger() });
    const small = await startServer({ app, logger: createNullLogger(), maxBodyBytes: 16 });
    try {
      const response = await fetch(`http://127.0.0.1:${small.port}/api/nodes`, {
        method: 'POST',
        body: 'x'.repeat(1024),
      });
      expect(response.status).toBe(413);
    } finally {
      await small.close();
    }
  });

  it('rejects a second bind on the same port', async () => {
    const config = loadConfig({ PORT: String(running.port), HOST: '127.0.0.1' });
    const app = createApp({ config, logger: createNullLogger() });
    await expect(startServer({ app, logger: createNullLogger() })).rejects.toThrow();
  });
});

describe('clientKeyOf', () => {
  const fake = (headers: Record<string, string | string[]>, remote?: string): IncomingMessage =>
    ({ headers, socket: { remoteAddress: remote } }) as unknown as IncomingMessage;

  it('prefers the first x-forwarded-for entry', () => {
    expect(clientKeyOf(fake({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, '9.9.9.9'))).toBe('1.1.1.1');
  });

  it('handles an array-valued header', () => {
    expect(clientKeyOf(fake({ 'x-forwarded-for': ['3.3.3.3'] }))).toBe('3.3.3.3');
  });

  it('falls back to the socket address', () => {
    expect(clientKeyOf(fake({}, '4.4.4.4'))).toBe('4.4.4.4');
  });

  it('falls back to "unknown"', () => {
    expect(clientKeyOf(fake({}))).toBe('unknown');
  });
});
