import { describe, expect, it } from 'vitest';

import { TtlCache } from '../src/cache.js';
import { FakeClock } from './helpers.js';

describe('TtlCache', () => {
  it('stores and retrieves values', () => {
    const cache = new TtlCache<number>();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.has('a')).toBe(true);
  });

  it('returns undefined for missing keys and counts a miss', () => {
    const cache = new TtlCache<number>();
    expect(cache.get('nope')).toBeUndefined();
    expect(cache.stats().misses).toBe(1);
    expect(cache.stats().hits).toBe(0);
  });

  it('expires entries once the TTL elapses', () => {
    const clock = new FakeClock();
    const cache = new TtlCache<string>({ ttlMs: 1000, now: clock.now });
    cache.set('key', 'value');

    clock.advance(999);
    expect(cache.get('key')).toBe('value');

    clock.advance(1);
    expect(cache.get('key')).toBeUndefined();
    expect(cache.stats().expirations).toBe(1);
  });

  it('treats ttlMs of 0 as never expiring', () => {
    const clock = new FakeClock();
    const cache = new TtlCache<string>({ ttlMs: 0, now: clock.now });
    cache.set('immortal', 'value');
    clock.advance(10_000_000);
    expect(cache.get('immortal')).toBe('value');
  });

  it('honours a per-entry TTL override', () => {
    const clock = new FakeClock();
    const cache = new TtlCache<string>({ ttlMs: 10_000, now: clock.now });
    cache.set('short', 'value', 100);
    clock.advance(150);
    expect(cache.get('short')).toBeUndefined();
  });

  it('evicts the least recently used entry when full', () => {
    const cache = new TtlCache<number>({ maxEntries: 2, ttlMs: 0 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' becomes most recently used
    cache.set('c', 3); // evicts 'b'

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.stats().evictions).toBe(1);
  });

  it('does not grow when overwriting an existing key', () => {
    const cache = new TtlCache<number>({ maxEntries: 2, ttlMs: 0 });
    cache.set('a', 1);
    cache.set('a', 2);
    cache.set('b', 3);
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(2);
  });

  it('prunes expired entries in bulk', () => {
    const clock = new FakeClock();
    const cache = new TtlCache<number>({ ttlMs: 100, now: clock.now });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3, 10_000);

    clock.advance(200);
    expect(cache.prune()).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('supports read-through via getOrSet', async () => {
    const cache = new TtlCache<number>({ ttlMs: 0 });
    let calls = 0;
    const factory = (): number => {
      calls += 1;
      return 42;
    };

    expect(await cache.getOrSet('k', factory)).toBe(42);
    expect(await cache.getOrSet('k', factory)).toBe(42);
    expect(calls).toBe(1);
  });

  it('deletes and clears', () => {
    const cache = new TtlCache<number>({ ttlMs: 0 });
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);

    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('resets statistics', () => {
    const cache = new TtlCache<number>({ ttlMs: 0 });
    cache.get('missing');
    cache.resetStats();
    expect(cache.stats().misses).toBe(0);
  });

  it('rejects invalid options', () => {
    expect(() => new TtlCache({ maxEntries: 0 })).toThrow(RangeError);
    expect(() => new TtlCache({ maxEntries: 1.5 })).toThrow(RangeError);
    expect(() => new TtlCache({ ttlMs: -1 })).toThrow(RangeError);
    expect(() => new TtlCache<number>({ ttlMs: 0 }).set('a', 1, -5)).toThrow(RangeError);
  });
});
