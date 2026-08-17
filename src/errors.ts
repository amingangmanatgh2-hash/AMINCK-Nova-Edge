/**
 * Typed error hierarchy. Any error thrown inside the pipeline is converted into
 * a JSON problem payload; {@link HttpError} lets a caller pick the status code.
 */

import type { JsonValue } from './types.js';

/** Error carrying an explicit HTTP status code. */
export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: JsonValue | undefined;

  public constructor(status: number, message: string, code?: string, details?: JsonValue) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code ?? defaultCodeFor(status);
    this.details = details;
    Error.captureStackTrace?.(this, HttpError);
  }

  /** Serialise into the wire format returned to clients. */
  public toJSON(): Record<string, JsonValue> {
    const payload: Record<string, JsonValue> = {
      error: this.code,
      message: this.message,
      status: this.status,
    };
    if (this.details !== undefined) {
      payload['details'] = this.details;
    }
    return payload;
  }
}

/** 400 — the request was malformed or failed validation. */
export class BadRequestError extends HttpError {
  public constructor(message = 'Bad Request', details?: JsonValue) {
    super(400, message, 'bad_request', details);
    this.name = 'BadRequestError';
  }
}

/** 404 — no route matched, or the addressed resource does not exist. */
export class NotFoundError extends HttpError {
  public constructor(message = 'Not Found', details?: JsonValue) {
    super(404, message, 'not_found', details);
    this.name = 'NotFoundError';
  }
}

/** 405 — the path exists but not for this method. */
export class MethodNotAllowedError extends HttpError {
  public readonly allow: readonly string[];

  public constructor(allow: readonly string[], message = 'Method Not Allowed') {
    super(405, message, 'method_not_allowed', { allow: [...allow] });
    this.name = 'MethodNotAllowedError';
    this.allow = allow;
  }
}

/** 429 — the client exceeded its rate-limit budget. */
export class TooManyRequestsError extends HttpError {
  public readonly retryAfterSeconds: number;

  public constructor(retryAfterSeconds: number, message = 'Too Many Requests') {
    super(429, message, 'too_many_requests', { retryAfterSeconds });
    this.name = 'TooManyRequestsError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 413 — request body exceeded the configured limit. */
export class PayloadTooLargeError extends HttpError {
  public constructor(limitBytes: number, message = 'Payload Too Large') {
    super(413, message, 'payload_too_large', { limitBytes });
    this.name = 'PayloadTooLargeError';
  }
}

function defaultCodeFor(status: number): string {
  const codes: Record<number, string> = {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    405: 'method_not_allowed',
    409: 'conflict',
    413: 'payload_too_large',
    422: 'unprocessable_entity',
    429: 'too_many_requests',
    500: 'internal_server_error',
    503: 'service_unavailable',
  };
  return codes[status] ?? (status >= 500 ? 'internal_server_error' : 'error');
}

/** Coerce an unknown thrown value into an {@link HttpError}. */
export function toHttpError(cause: unknown): HttpError {
  if (cause instanceof HttpError) {
    return cause;
  }
  if (cause instanceof Error) {
    const wrapped = new HttpError(500, cause.message || 'Internal Server Error');
    if (cause.stack !== undefined) {
      wrapped.stack = cause.stack;
    }
    return wrapped;
  }
  return new HttpError(500, 'Internal Server Error', 'internal_server_error', {
    thrown: String(cause),
  });
}
