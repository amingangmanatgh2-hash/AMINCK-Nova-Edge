import { describe, expect, it } from 'vitest';

import { createLogger, createNullLogger, safeStringify } from '../src/logger.js';

function collect(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = [];
  return { lines, sink: (line: string) => lines.push(line) };
}

describe('createLogger', () => {
  it('emits structured JSON with a timestamp', () => {
    const { lines, sink } = collect();
    const logger = createLogger({ level: 'debug', sink, now: () => new Date(0) });
    logger.info('hello', { requestId: 'abc' });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      ts: '1970-01-01T00:00:00.000Z',
      level: 'info',
      message: 'hello',
      requestId: 'abc',
    });
  });

  it('filters entries below the configured level', () => {
    const { lines, sink } = collect();
    const logger = createLogger({ level: 'warn', sink });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => (JSON.parse(line) as { level: string }).level)).toEqual([
      'warn',
      'error',
    ]);
  });

  it('suppresses everything at the silent level', () => {
    const { lines, sink } = collect();
    const logger = createLogger({ level: 'silent', sink });
    logger.error('boom');
    expect(lines).toHaveLength(0);
  });

  it('does not let metadata overwrite reserved fields', () => {
    const { lines, sink } = collect();
    const logger = createLogger({ level: 'debug', sink });
    logger.info('original', { message: 'hijacked', level: 'error' });

    const entry = JSON.parse(lines[0]!) as { message: string; level: string };
    expect(entry.message).toBe('original');
    expect(entry.level).toBe('info');
  });

  it('defaults to the info level', () => {
    const { lines, sink } = collect();
    const logger = createLogger({ sink });
    logger.debug('hidden');
    logger.info('shown');
    expect(lines).toHaveLength(1);
  });
});

describe('createNullLogger', () => {
  it('accepts calls without throwing', () => {
    const logger = createNullLogger();
    expect(() => {
      logger.debug('a');
      logger.info('b');
      logger.warn('c');
      logger.error('d');
    }).not.toThrow();
  });
});

describe('safeStringify', () => {
  it('serialises plain values', () => {
    expect(safeStringify({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
  });

  it('handles circular references', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node['self'] = node;
    expect(safeStringify(node)).toContain('[Circular]');
  });

  it('stringifies BigInt values', () => {
    expect(safeStringify({ big: 10n })).toBe('{"big":"10"}');
  });

  it('serialises Error objects', () => {
    const result = JSON.parse(safeStringify({ err: new TypeError('bad') })) as {
      err: { name: string; message: string };
    };
    expect(result.err).toEqual({ name: 'TypeError', message: 'bad' });
  });
});
