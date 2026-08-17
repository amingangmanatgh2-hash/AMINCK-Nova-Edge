/**
 * Shared test utilities: a controllable clock and an EdgeRequest factory.
 */

import { createApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { AppConfig, EdgeRequest, HttpMethod } from '../src/types.js';

/** Manually advanced clock so TTL/rate-limit behaviour is deterministic. */
export class FakeClock {
  #current: number;

  public constructor(start = 1_700_000_000_000) {
    this.#current = start;
  }

  public now = (): number => this.#current;

  public advance(ms: number): void {
    this.#current += ms;
  }

  public set(ms: number): void {
    this.#current = ms;
  }
}

export interface RequestInit {
  readonly method?: HttpMethod;
  readonly path?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly clientKey?: string;
  readonly requestId?: string;
}

/** Build an {@link EdgeRequest} without going through the HTTP layer. */
export function makeRequest(init: RequestInit = {}): EdgeRequest {
  const method = init.method ?? 'GET';
  const path = init.path ?? '/';
  const url = new URL(path, 'http://edge.test');

  return {
    method,
    path: url.pathname,
    url,
    headers: init.headers ?? {},
    query: url.searchParams,
    params: Object.freeze({}),
    body: init.body ?? '',
    requestId: init.requestId ?? 'test-request-id',
    clientKey: init.clientKey ?? '127.0.0.1',
    receivedAt: 0,
  };
}

/** Build a config with test-friendly overrides. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig({}), ...overrides };
}

/** Build an app wired to a fake clock. */
export function makeApp(overrides: Partial<AppConfig> = {}, clock = new FakeClock()): App {
  return createApp({ config: testConfig(overrides), now: clock.now });
}

/** Parse a JSON response body. */
export function parseJson(body: string): unknown {
  return JSON.parse(body);
}
