/**
 * Structured JSON logger with level filtering. Writing NDJSON keeps output
 * greppable locally and ingestible by log collectors in production.
 */

import type { Logger, LogLevel } from './types.js';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** Sink receiving one serialised log line at a time. */
export type LogSink = (line: string) => void;

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly sink?: LogSink;
  readonly now?: () => Date;
}

/** Create a level-filtered structured logger. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const sink: LogSink = options.sink ?? ((line) => process.stdout.write(`${line}\n`));
  const now = options.now ?? ((): Date => new Date());
  const threshold = LEVEL_WEIGHT[level];

  const emit = (entryLevel: Exclude<LogLevel, 'silent'>) => {
    return (message: string, meta?: Record<string, unknown>): void => {
      if (LEVEL_WEIGHT[entryLevel] < threshold) {
        return;
      }
      const entry: Record<string, unknown> = {
        ts: now().toISOString(),
        level: entryLevel,
        message,
      };
      if (meta !== undefined) {
        for (const [key, value] of Object.entries(meta)) {
          if (!(key in entry)) {
            entry[key] = value;
          }
        }
      }
      sink(safeStringify(entry));
    };
  };

  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
  };
}

/** A logger that discards everything — handy in tests. */
export function createNullLogger(): Logger {
  const noop = (): void => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}

/** JSON stringify that tolerates cycles, BigInt and Error values. */
export function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val: unknown) => {
    if (typeof val === 'bigint') {
      return val.toString();
    }
    if (val instanceof Error) {
      return { name: val.name, message: val.message };
    }
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }
    return val;
  });
}
