/**
 * Helpers for building {@link EdgeResponse} objects with consistent headers.
 */

import { safeStringify } from './logger.js';
import type { EdgeResponse, JsonValue } from './types.js';

/** Normalise header names to lowercase so lookups are predictable. */
export function normaliseHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

/** Build a JSON response. */
export function json(
  status: number,
  payload: JsonValue,
  headers: Record<string, string> = {},
): EdgeResponse {
  const body = safeStringify(payload);
  return {
    status,
    headers: normaliseHeaders({
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(body, 'utf8')),
      ...headers,
    }),
    body,
  };
}

/** Build a `text/plain` response. */
export function text(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): EdgeResponse {
  return {
    status,
    headers: normaliseHeaders({
      'content-type': 'text/plain; charset=utf-8',
      'content-length': String(Buffer.byteLength(body, 'utf8')),
      ...headers,
    }),
    body,
  };
}

/** Build an empty `204 No Content` response. */
export function noContent(headers: Record<string, string> = {}): EdgeResponse {
  return { status: 204, headers: normaliseHeaders(headers), body: '' };
}

/** Attach or overwrite a header without mutating the original response. */
export function withHeader(response: EdgeResponse, name: string, value: string): EdgeResponse {
  return {
    ...response,
    headers: { ...response.headers, [name.toLowerCase()]: value },
  };
}
