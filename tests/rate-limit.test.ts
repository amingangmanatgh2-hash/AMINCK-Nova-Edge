import { describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/rate-limit.js';
import { FakeClock } from './helpers.js';

describe('RateLimiter', () => {
  it('allows requests up to the capacity', () => {
    const limiter = new RateLimiter({ capacity: 3, windowMs: 1000, now: new FakeClock().now });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(true);
    const third = limiter.consume('a');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('blocks once the bucket is empty', () => {
    const limiter = new RateLimiter({ capacity: 2, windowMs: 1000, now: new FakeClock().now });
    limiter.consume('a');
    limiter.consume('a');

    const blocked = limiter.consume('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('refills tokens continuously over time', () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ capacity: 10, windowMs: 1000, now: clock.now });

    for (let i = 0; i < 10; i += 1) {
      expect(limiter.consume('a').allowed).toBe(true);
    }
    expect(limiter.consume('a').allowed).toBe(false);

    // 1 token refills per 100ms at 10 tokens / 1000ms.
    clock.advance(100);
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);

    clock.advance(1000);
    expect(limiter.peek('a')).toBe(10);
  });

  it('never refills beyond capacity', () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ capacity: 5, windowMs: 1000, now: clock.now });
    limiter.consume('a');
    clock.advance(1_000_000);
    expect(limiter.peek('a')).toBe(5);
  });

  it('tracks buckets independently per key', () => {
    const limiter = new RateLimiter({ capacity: 1, windowMs: 1000, now: new FakeClock().now });
    expect(limiter.consume('alice').allowed).toBe(true);
    expect(limiter.consume('alice').allowed).toBe(false);
    expect(limiter.consume('bob').allowed).toBe(true);
    expect(limiter.size).toBe(2);
  });

  it('supports a custom cost per request', () => {
    const limiter = new RateLimiter({ capacity: 10, windowMs: 1000, now: new FakeClock().now });
    expect(limiter.consume('a', 7).allowed).toBe(true);
    expect(limiter.consume('a', 7).allowed).toBe(false);
    expect(limiter.consume('a', 3).allowed).toBe(true);
  });

  it('resets a single key and all keys', () => {
    const limiter = new RateLimiter({ capacity: 1, windowMs: 1000, now: new FakeClock().now });
    limiter.consume('a');
    limiter.reset('a');
    expect(limiter.consume('a').allowed).toBe(true);

    limiter.consume('b');
    limiter.resetAll();
    expect(limiter.size).toBe(0);
  });

  it('sweeps fully refilled buckets', () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ capacity: 5, windowMs: 1000, now: clock.now });
    limiter.consume('a');
    limiter.consume('b');
    expect(limiter.sweep()).toBe(0);

    clock.advance(1000);
    expect(limiter.sweep()).toBe(2);
    expect(limiter.size).toBe(0);
  });

  it('reports a resetAt in the future while depleted', () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ capacity: 2, windowMs: 1000, now: clock.now });
    const result = limiter.consume('a');
    expect(result.resetAt).toBeGreaterThan(clock.now());
  });

  it('rejects invalid options', () => {
    expect(() => new RateLimiter({ capacity: 0, windowMs: 1000 })).toThrow(RangeError);
    expect(() => new RateLimiter({ capacity: 1.5, windowMs: 1000 })).toThrow(RangeError);
    expect(() => new RateLimiter({ capacity: 1, windowMs: 0 })).toThrow(RangeError);
    expect(() => new RateLimiter({ capacity: 1, windowMs: 10 }).consume('a', 0)).toThrow(
      RangeError,
    );
  });
});
