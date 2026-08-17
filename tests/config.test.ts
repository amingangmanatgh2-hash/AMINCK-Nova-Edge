import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig, parseInteger, parseLogLevel } from '../src/config.js';

describe('parseInteger', () => {
  it('returns the fallback when unset or blank', () => {
    expect(parseInteger('X', undefined, 7)).toBe(7);
    expect(parseInteger('X', '   ', 7)).toBe(7);
  });

  it('parses valid integers, including negatives', () => {
    expect(parseInteger('X', '42', 0)).toBe(42);
    expect(parseInteger('X', ' 42 ', 0)).toBe(42);
    expect(parseInteger('X', '-3', 0)).toBe(-3);
  });

  it('rejects non-integers', () => {
    expect(() => parseInteger('X', 'abc', 0)).toThrow(ConfigError);
    expect(() => parseInteger('X', '1.5', 0)).toThrow(ConfigError);
    expect(() => parseInteger('X', '1e3', 0)).toThrow(ConfigError);
  });

  it('enforces bounds', () => {
    expect(() => parseInteger('X', '0', 5, { min: 1 })).toThrow(/must be >= 1/);
    expect(() => parseInteger('X', '10', 5, { max: 9 })).toThrow(/must be <= 9/);
    expect(parseInteger('X', '5', 0, { min: 1, max: 9 })).toBe(5);
  });
});

describe('parseLogLevel', () => {
  it('defaults to info', () => {
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('')).toBe('info');
  });

  it('accepts valid levels case-insensitively', () => {
    expect(parseLogLevel('DEBUG')).toBe('debug');
    expect(parseLogLevel(' warn ')).toBe('warn');
    expect(parseLogLevel('silent')).toBe('silent');
  });

  it('rejects unknown levels', () => {
    expect(() => parseLogLevel('verbose')).toThrow(ConfigError);
  });
});

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig({});
    expect(config).toEqual({
      port: 3000,
      host: '0.0.0.0',
      logLevel: 'info',
      rateLimitCapacity: 100,
      rateLimitWindowMs: 60_000,
      cacheMaxEntries: 500,
      cacheTtlMs: 30_000,
    });
  });

  it('reads values from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      RATE_LIMIT_CAPACITY: '10',
      RATE_LIMIT_WINDOW_MS: '5000',
      CACHE_MAX_ENTRIES: '25',
      CACHE_TTL_MS: '1000',
    });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.logLevel).toBe('debug');
    expect(config.rateLimitCapacity).toBe(10);
    expect(config.cacheTtlMs).toBe(1000);
  });

  it('falls back to 0.0.0.0 for a blank host', () => {
    expect(loadConfig({ HOST: '  ' }).host).toBe('0.0.0.0');
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: '-1' })).toThrow(ConfigError);
  });

  it('rejects a zero rate-limit capacity', () => {
    expect(() => loadConfig({ RATE_LIMIT_CAPACITY: '0' })).toThrow(ConfigError);
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });
});
