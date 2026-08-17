import { beforeEach, describe, expect, it } from 'vitest';

import type { App } from '../src/app.js';
import { parseNodeInput } from '../src/routes.js';
import { BadRequestError } from '../src/errors.js';
import { FakeClock, makeApp, makeRequest } from './helpers.js';

describe('application routes', () => {
  let app: App;
  let clock: FakeClock;

  beforeEach(() => {
    clock = new FakeClock();
    app = makeApp({ cacheTtlMs: 0, rateLimitCapacity: 1000 }, clock);
  });

  it('serves the service index', async () => {
    const response = await app.handle(makeRequest({ path: '/' }));
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { name: string; endpoints: string[] };
    expect(body.name).toBe('AMINCK Nova Edge');
    expect(body.endpoints.length).toBeGreaterThan(0);
  });

  it('reports health with uptime', async () => {
    clock.advance(1500);
    const response = await app.handle(makeRequest({ path: '/health' }));
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok', uptimeMs: 1500 });
  });

  it('serves a plain-text readiness probe', async () => {
    const response = await app.handle(makeRequest({ path: '/readyz' }));
    expect(response.body).toBe('ready');
    expect(response.headers['content-type']).toContain('text/plain');
  });

  it('exposes metrics', async () => {
    const response = await app.handle(makeRequest({ path: '/metrics' }));
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      cache: expect.any(Object) as unknown,
      rateLimit: { capacity: 1000 },
      nodes: 4,
    });
  });

  it('lists seeded nodes sorted by id', async () => {
    const response = await app.handle(makeRequest({ path: '/api/nodes' }));
    const body = JSON.parse(response.body) as { count: number; items: { id: string }[] };
    expect(body.count).toBe(4);
    expect(body.items.map((node) => node.id)).toEqual([...body.items.map((n) => n.id)].sort());
  });

  it('filters nodes by region and status', async () => {
    const byRegion = await app.handle(makeRequest({ path: '/api/nodes?region=us-east' }));
    expect((JSON.parse(byRegion.body) as { count: number }).count).toBe(1);

    const byStatus = await app.handle(makeRequest({ path: '/api/nodes?status=degraded' }));
    expect((JSON.parse(byStatus.body) as { count: number }).count).toBe(1);

    const none = await app.handle(makeRequest({ path: '/api/nodes?region=antarctica' }));
    expect((JSON.parse(none.body) as { count: number }).count).toBe(0);
  });

  it('fetches a node by id', async () => {
    const response = await app.handle(makeRequest({ path: '/api/nodes/nova-iad-1' }));
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ id: 'nova-iad-1', region: 'us-east' });
  });

  it('returns 404 for an unknown node', async () => {
    const response = await app.handle(makeRequest({ path: '/api/nodes/ghost' }));
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'not_found' });
  });

  it('creates a node with 201 and a Location header', async () => {
    const response = await app.handle(
      makeRequest({
        method: 'POST',
        path: '/api/nodes',
        body: JSON.stringify({ id: 'nova-new-1', region: 'ap-south', latencyMs: 30 }),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers['location']).toBe('/api/nodes/nova-new-1');

    const fetched = await app.handle(makeRequest({ path: '/api/nodes/nova-new-1' }));
    expect(fetched.status).toBe(200);
  });

  it('updates an existing node with 200', async () => {
    const payload = JSON.stringify({ id: 'nova-iad-1', region: 'us-east', latencyMs: 99 });
    const response = await app.handle(
      makeRequest({ method: 'POST', path: '/api/nodes', body: payload }),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ latencyMs: 99 });
  });

  it('rejects an invalid node payload with 400', async () => {
    const response = await app.handle(
      makeRequest({ method: 'POST', path: '/api/nodes', body: JSON.stringify({ region: 'x' }) }),
    );
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'bad_request' });
  });

  it('deletes a node and then 404s', async () => {
    const deleted = await app.handle(
      makeRequest({ method: 'DELETE', path: '/api/nodes/nova-sfo-1' }),
    );
    expect(deleted.status).toBe(200);

    const again = await app.handle(
      makeRequest({ method: 'DELETE', path: '/api/nodes/nova-sfo-1' }),
    );
    expect(again.status).toBe(404);
  });

  it('echoes a wildcard path and query', async () => {
    const response = await app.handle(makeRequest({ path: '/api/echo/a/b/c?x=1' }));
    expect(JSON.parse(response.body)).toMatchObject({ path: 'a/b/c', query: { x: '1' } });
  });

  it('returns 404 for an unknown route', async () => {
    const response = await app.handle(makeRequest({ path: '/nope' }));
    expect(response.status).toBe(404);
  });

  it('returns 405 with an Allow header for a wrong method', async () => {
    const response = await app.handle(makeRequest({ method: 'PUT', path: '/api/nodes' }));
    expect(response.status).toBe(405);
    expect(response.headers['allow']).toContain('GET');
  });

  it('applies security, CORS and request-id headers globally', async () => {
    const response = await app.handle(makeRequest({ path: '/health' }));
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['x-request-id']).toBe('test-request-id');
  });

  it('enforces the rate limit end to end', async () => {
    const limited = makeApp({ rateLimitCapacity: 2, cacheTtlMs: 0 }, new FakeClock());
    expect((await limited.handle(makeRequest({ path: '/health' }))).status).toBe(200);
    expect((await limited.handle(makeRequest({ path: '/health' }))).status).toBe(200);

    const blocked = await limited.handle(makeRequest({ path: '/health' }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('caches GET responses when a TTL is configured', async () => {
    const cached = makeApp({ cacheTtlMs: 10_000, rateLimitCapacity: 100 }, clock);
    const first = await cached.handle(makeRequest({ path: '/health' }));
    clock.advance(500);
    const second = await cached.handle(makeRequest({ path: '/health' }));

    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    // Uptime is frozen because the cached body was replayed.
    expect(second.body).toBe(first.body);
  });

  it('answers CORS preflight with 204', async () => {
    const response = await app.handle(makeRequest({ method: 'OPTIONS', path: '/api/nodes' }));
    expect(response.status).toBe(204);
  });
});

describe('parseNodeInput', () => {
  it('accepts a minimal valid payload and applies defaults', () => {
    expect(parseNodeInput(JSON.stringify({ id: 'a', region: 'r' }))).toEqual({
      id: 'a',
      region: 'r',
      status: 'online',
      latencyMs: 0,
    });
  });

  it('trims whitespace around strings', () => {
    expect(parseNodeInput(JSON.stringify({ id: '  a  ', region: ' r ' }))).toMatchObject({
      id: 'a',
      region: 'r',
    });
  });

  it('rejects an empty body', () => {
    expect(() => parseNodeInput('')).toThrow(BadRequestError);
    expect(() => parseNodeInput('   ')).toThrow(/required/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseNodeInput('{ not json')).toThrow(/valid JSON/);
  });

  it('rejects non-object JSON', () => {
    expect(() => parseNodeInput('[]')).toThrow(/JSON object/);
    expect(() => parseNodeInput('null')).toThrow(/JSON object/);
    expect(() => parseNodeInput('"a string"')).toThrow(/JSON object/);
  });

  it('collects every validation issue', () => {
    try {
      parseNodeInput(JSON.stringify({ id: '', region: 5, status: 'weird', latencyMs: -1 }));
      expect.unreachable('should have thrown');
    } catch (error) {
      const details = (error as BadRequestError).details as { issues: string[] };
      expect(details.issues).toHaveLength(4);
    }
  });
});
