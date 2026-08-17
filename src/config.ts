/**
 * Environment parsing with validation. Invalid values fail loudly at startup
 * rather than silently degrading at runtime.
 */

import type { AppConfig, LogLevel } from './types.js';

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

/** Thrown when the environment cannot be turned into a valid {@link AppConfig}. */
export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ParseIntegerOptions {
  readonly min?: number;
  readonly max?: number;
}

/** Parse an integer env var, falling back to `fallback` when unset or blank. */
export function parseInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  options: ParseIntegerOptions = {},
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new ConfigError(`${name} must be an integer, received "${raw}"`);
  }
  const value = Number.parseInt(trimmed, 10);
  const { min, max } = options;
  if (min !== undefined && value < min) {
    throw new ConfigError(`${name} must be >= ${min}, received ${value}`);
  }
  if (max !== undefined && value > max) {
    throw new ConfigError(`${name} must be <= ${max}, received ${value}`);
  }
  return value;
}

/** Parse and validate a {@link LogLevel}. */
export function parseLogLevel(raw: string | undefined, fallback: LogLevel = 'info'): LogLevel {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(value)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, received "${raw}"`);
  }
  return value as LogLevel;
}

/** Build an {@link AppConfig} from a raw environment record. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = env['HOST']?.trim();

  return Object.freeze({
    port: parseInteger('PORT', env['PORT'], 3000, { min: 0, max: 65535 }),
    host: host === undefined || host === '' ? '0.0.0.0' : host,
    logLevel: parseLogLevel(env['LOG_LEVEL']),
    rateLimitCapacity: parseInteger('RATE_LIMIT_CAPACITY', env['RATE_LIMIT_CAPACITY'], 100, {
      min: 1,
      max: 1_000_000,
    }),
    rateLimitWindowMs: parseInteger('RATE_LIMIT_WINDOW_MS', env['RATE_LIMIT_WINDOW_MS'], 60_000, {
      min: 100,
      max: 3_600_000,
    }),
    cacheMaxEntries: parseInteger('CACHE_MAX_ENTRIES', env['CACHE_MAX_ENTRIES'], 500, {
      min: 1,
      max: 1_000_000,
    }),
    cacheTtlMs: parseInteger('CACHE_TTL_MS', env['CACHE_TTL_MS'], 30_000, {
      min: 0,
      max: 86_400_000,
    }),
  });
}
