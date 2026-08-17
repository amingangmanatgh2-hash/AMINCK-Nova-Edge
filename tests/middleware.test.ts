import { describe, expect, it } from 'vitest';

import { TtlCache } from '../src/cache.js';
import { BadRequestError, HttpError, MethodNotAllowedError } from '../src/errors.js';
import { createNullLogger } from '../src/logger.js';
import {
  compose,
  cors,
  errorHandler,
  rateLimit,
  requestLogger,
  responseCache,
  securityHeaders,
  timeout,
} from '../src/middleware.js';
import { RateLimiter } from '../src/rate-limit.js';
import { json, text } from '../src/response.js';
import type { EdgeResponse, Middleware } from '../src/types.js';
import { FakeClock, makeRequest } from './helpers.js';

const okHandler = () => json(200, { ok: true });

describe('compose', () => {
  it('runs middlewares in order, outermost first', async () => {
    const order: string[] = [];
    const tag =
      (name: string): Middleware =>
      async (_req, next) => {
        order.push(`${name}:before`);
        const res = await next();
        order.push(`${name}:after`);
        return res;
      };

    const handler = compose([tag('a'), tag('b')], () => {
      order.push('handler');
      return json(200, {});
    });
    await handler(makeRequest());

    expect(order).toEqual(['a:before', 'b:before', 'handler', 'b:after', 'a:after']);
  });

  it('invokes the handler directly with no middlewares', async () => {
    const response = await compose([], okHandler)(makeRequest());
    expect(response.status).toBe(200);
  });

  it('allows a middleware to short-circuit', async () => {
    let reached = false;
    const short: Middleware = async () => await Promise.resolve(text(401, 'nope'));
    const handler = compose([short], () => {
      reached = true;
      return json(200, {});
    });

    expect((await handler(makeRequest())).status).toBe(401);
    expect(reached).toBe(false);
  });

  it('throws when next() is called twice', async () => {
    const twice: Middleware = async (_req, next) => {
      await next();
      return await next();
    };
    await expect(compose([twice], okHandler)(makeRequest())).rejects.toThrow(/multiple times/);
  });

  it('propagates errors to outer middlewares', async () => {
    const thrower: Middleware = () => {
      throw new BadRequestError('nope');
    };
    await expect(compose([thrower], okHandler)(makeRequest())).rejects.toThrow(BadRequestError);
  });
});

describe('errorHandler', () => {
  const logger = createNullLogger();

  it('passes successful responses through', async () => {
    const handler = compose([errorHandler(logger)], okHandler);
    expect((await handler(makeRequest())).status).toBe(200);
  });

  it('converts an HttpError into a JSON problem response', async () => {
    const handler = compose([errorHandler(logger)], () => {
      throw new BadRequestError('invalid input', { issues: ['id required'] });
    });
    const response = await handler(makeRequest());

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'bad_request',
      message: 'invalid input',
      status: 400,
      details: { issues: ['id required'] },
      requestId: 'test-request-id',
    });
  });

  it('converts an unknown throw into a 500', async () => {
    const handler = compose([errorHandler(logger)], () => {
      throw new Error('kaboom');
    });
    const response = await handler(makeRequest());
    expect(response.status).toBe(500);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'internal_server_error' });
  });

  it('handles non-Error throws', async () => {
    const handler = compose([errorHandler(logger)], () => {
      // Deliberately throwing a non-Error to exercise the coercion path.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'a string';
    });
    expect((await handler(makeRequest())).status).toBe(500);
  });

  it('adds an Allow header for 405s', async () => {
    const handler = compose([errorHandler(logger)], () => {
      throw new MethodNotAllowedError(['GET', 'POST']);
    });
    const response = await handler(makeRequest());
    expect(response.headers['allow']).toBe('GET, POST');
  });

  it('omits the stack unless explicitly enabled', async () => {
    const boom = (): never => {
      throw new Error('boom');
    };
    const hidden = await compose([errorHandler(logger)], boom)(makeRequest());
    expect(JSON.parse(hidden.body)).not.toHaveProperty('stack');

    const shown = await compose([errorHandler(logger, true)], boom)(makeRequest());
    expect(JSON.parse(shown.body)).toHaveProperty('stack');
  });
});

describe('requestLogger', () => {
  it('logs a completion line and stamps the request id', async () => {
    const lines: Record<string, unknown>[] = [];
    const logger = {
      ...createNullLogger(),
      info: (message: string, meta?: Record<string, unknown>) => {
        lines.push({ message, ...meta });
      },
    };
    const clock = new FakeClock();
    const handler = compose([requestLogger(logger, clock.now)], () => {
      clock.advance(5);
      return json(201, {});
    });

    const response = await handler(makeRequest({ path: '/x' }));
    expect(response.headers['x-request-id']).toBe('test-request-id');
    expect(lines[0]).toMatchObject({
      message: 'request.completed',
      status: 201,
      path: '/x',
      durationMs: 5,
    });
  });
});

describe('securityHeaders', () => {
  it('adds hardening headers', async () => {
    const response = await compose([securityHeaders()], okHandler)(makeRequest());
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });
});

describe('cors', () => {
  it('allows any origin by default', async () => {
    const response = await compose([cors()], okHandler)(makeRequest());
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('answers preflight requests without calling the handler', async () => {
    let reached = false;
    const handler = compose([cors()], () => {
      reached = true;
      return json(200, {});
    });
    const response = await handler(makeRequest({ method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(reached).toBe(false);
  });

  it('echoes an allow-listed origin and varies on Origin', async () => {
    const middleware = cors({ origins: ['https://app.test'] });
    const response = await compose(
      [middleware],
      okHandler,
    )(makeRequest({ headers: { origin: 'https://app.test' } }));
    expect(response.headers['access-control-allow-origin']).toBe('https://app.test');
    expect(response.headers['vary']).toBe('Origin');
  });

  it('omits CORS headers for a disallowed origin', async () => {
    const middleware = cors({ origins: ['https://app.test'] });
    const response = await compose(
      [middleware],
      okHandler,
    )(makeRequest({ headers: { origin: 'https://evil.test' } }));
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rateLimit', () => {
  it('adds rate-limit headers while allowed', async () => {
    const limiter = new RateLimiter({ capacity: 5, windowMs: 1000, now: new FakeClock().now });
    const response = await compose([rateLimit(limiter)], okHandler)(makeRequest());
    expect(response.headers['x-ratelimit-limit']).toBe('5');
    expect(response.headers['x-ratelimit-remaining']).toBe('4');
  });

  it('throws once the budget is exhausted', async () => {
    const limiter = new RateLimiter({ capacity: 1, windowMs: 1000, now: new FakeClock().now });
    const handler = compose([rateLimit(limiter)], okHandler);
    await handler(makeRequest());
    await expect(handler(makeRequest())).rejects.toThrow(/Rate limit/);
  });

  it('limits each client key separately', async () => {
    const limiter = new RateLimiter({ capacity: 1, windowMs: 1000, now: new FakeClock().now });
    const handler = compose([rateLimit(limiter)], okHandler);
    await handler(makeRequest({ clientKey: 'a' }));
    await expect(handler(makeRequest({ clientKey: 'b' }))).resolves.toMatchObject({ status: 200 });
  });
});

describe('responseCache', () => {
  it('serves the second GET from cache', async () => {
    const cache = new TtlCache<EdgeResponse>({ ttlMs: 1000 });
    let calls = 0;
    const handler = compose([responseCache(cache)], () => {
      calls += 1;
      return json(200, { calls });
    });

    const first = await handler(makeRequest({ path: '/cached' }));
    const second = await handler(makeRequest({ path: '/cached' }));

    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(calls).toBe(1);
  });

  it('keys the cache on the query string', async () => {
    const cache = new TtlCache<EdgeResponse>({ ttlMs: 1000 });
    let calls = 0;
    const handler = compose([responseCache(cache)], () => {
      calls += 1;
      return json(200, { calls });
    });

    await handler(makeRequest({ path: '/list?page=1' }));
    await handler(makeRequest({ path: '/list?page=2' }));
    expect(calls).toBe(2);
  });

  it('bypasses non-GET requests', async () => {
    const cache = new TtlCache<EdgeResponse>({ ttlMs: 1000 });
    let calls = 0;
    const handler = compose([responseCache(cache)], () => {
      calls += 1;
      return json(200, { calls });
    });

    await handler(makeRequest({ method: 'POST', path: '/x' }));
    await handler(makeRequest({ method: 'POST', path: '/x' }));
    expect(calls).toBe(2);
  });

  it('does not cache error responses', async () => {
    const cache = new TtlCache<EdgeResponse>({ ttlMs: 1000 });
    let calls = 0;
    const handler = compose([responseCache(cache)], () => {
      calls += 1;
      return json(500, { calls });
    });

    await handler(makeRequest({ path: '/err' }));
    await handler(makeRequest({ path: '/err' }));
    expect(calls).toBe(2);
  });

  it('re-invokes the handler after the entry expires', async () => {
    const clock = new FakeClock();
    const cache = new TtlCache<EdgeResponse>({ ttlMs: 100, now: clock.now });
    let calls = 0;
    const handler = compose([responseCache(cache)], () => {
      calls += 1;
      return json(200, { calls });
    });

    await handler(makeRequest({ path: '/t' }));
    clock.advance(200);
    await handler(makeRequest({ path: '/t' }));
    expect(calls).toBe(2);
  });
});

describe('timeout', () => {
  it('passes fast responses through', async () => {
    const response = await compose([timeout(1000)], okHandler)(makeRequest());
    expect(response.status).toBe(200);
  });

  it('fails a slow request with a 503', async () => {
    const slow = compose([timeout(10)], async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return json(200, {});
    });
    await expect(slow(makeRequest())).rejects.toThrow(HttpError);
  });

  it('rejects an invalid timeout', () => {
    expect(() => timeout(0)).toThrow(RangeError);
  });
});
