/**
 * Shared type definitions for the AMINCK Nova Edge runtime.
 *
 * @packageDocumentation
 */

/** HTTP methods the router understands. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** All HTTP methods, as a runtime-checkable list. */
export const HTTP_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

/** Narrowing guard for {@link HttpMethod}. */
export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

/** A JSON-serialisable value. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Immutable map of path parameters extracted from a route pattern. */
export type PathParams = Readonly<Record<string, string>>;

/** Normalised inbound request handed to middleware and handlers. */
export interface EdgeRequest {
  /** Uppercased HTTP method. */
  readonly method: HttpMethod;
  /** Path portion of the URL, without query string. */
  readonly path: string;
  /** Fully parsed URL, resolved against the request host. */
  readonly url: URL;
  /** Lowercased header names mapped to their values. */
  readonly headers: Readonly<Record<string, string>>;
  /** Query string parameters. */
  readonly query: URLSearchParams;
  /** Parameters captured from the matched route pattern. */
  readonly params: PathParams;
  /** Raw request body as a UTF-8 string; empty when there is no body. */
  readonly body: string;
  /** Stable identifier used for tracing a single request. */
  readonly requestId: string;
  /** Best-effort client identifier used for rate limiting. */
  readonly clientKey: string;
  /** Millisecond timestamp captured when the request arrived. */
  readonly receivedAt: number;
}

/** Response produced by a handler or middleware. */
export interface EdgeResponse {
  /** HTTP status code. */
  status: number;
  /** Response headers; names are normalised to lowercase on write. */
  headers: Record<string, string>;
  /** Response body, already serialised. */
  body: string;
}

/** Terminal request handler. */
export type Handler = (req: EdgeRequest) => EdgeResponse | Promise<EdgeResponse>;

/** Continuation passed to a middleware. */
export type Next = () => Promise<EdgeResponse>;

/** Middleware wrapping the downstream pipeline. */
export type Middleware = (req: EdgeRequest, next: Next) => EdgeResponse | Promise<EdgeResponse>;

/** Supported log levels, ordered from most to least verbose. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** Minimal structured logger interface. */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Fully resolved runtime configuration. */
export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly logLevel: LogLevel;
  readonly rateLimitCapacity: number;
  readonly rateLimitWindowMs: number;
  readonly cacheMaxEntries: number;
  readonly cacheTtlMs: number;
}
