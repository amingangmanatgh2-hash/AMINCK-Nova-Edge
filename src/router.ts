/**
 * Trie-free, segment-matching router supporting `:param` and a trailing
 * `*wildcard` segment. Routes are matched in registration order, with static
 * segments preferred over dynamic ones at equal specificity.
 */

import { MethodNotAllowedError, NotFoundError } from './errors.js';
import { type Handler, type HttpMethod, type PathParams } from './types.js';

interface Segment {
  readonly kind: 'static' | 'param' | 'wildcard';
  readonly value: string;
}

interface Route {
  readonly method: HttpMethod;
  readonly pattern: string;
  readonly segments: readonly Segment[];
  readonly handler: Handler;
  readonly specificity: number;
}

/** Successful match returned by {@link Router.match}. */
export interface RouteMatch {
  readonly handler: Handler;
  readonly params: PathParams;
  readonly pattern: string;
}

/** Split a path into normalised, decoded segments. */
export function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function parsePattern(pattern: string): Segment[] {
  if (!pattern.startsWith('/')) {
    throw new Error(`Route pattern must start with "/", received "${pattern}"`);
  }
  const raw = splitPath(pattern);
  const segments: Segment[] = [];

  raw.forEach((segment, index) => {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (name.length === 0) {
        throw new Error(`Named parameter in "${pattern}" must have a name`);
      }
      segments.push({ kind: 'param', value: name });
      return;
    }
    if (segment.startsWith('*')) {
      if (index !== raw.length - 1) {
        throw new Error(`Wildcard in "${pattern}" must be the final segment`);
      }
      const name = segment.slice(1);
      segments.push({ kind: 'wildcard', value: name.length > 0 ? name : 'wildcard' });
      return;
    }
    segments.push({ kind: 'static', value: segment });
  });

  return segments;
}

function scoreOf(segments: readonly Segment[]): number {
  return segments.reduce((total, segment) => {
    if (segment.kind === 'static') return total + 3;
    if (segment.kind === 'param') return total + 2;
    return total;
  }, 0);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Registry mapping method + path patterns to handlers. */
export class Router {
  readonly #routes: Route[] = [];

  /** Register a handler. Returns `this` so calls can be chained. */
  public add(method: HttpMethod, pattern: string, handler: Handler): this {
    const segments = parsePattern(pattern);
    const duplicate = this.#routes.find(
      (route) => route.method === method && route.pattern === normalisePattern(pattern),
    );
    if (duplicate !== undefined) {
      throw new Error(`Duplicate route registered: ${method} ${pattern}`);
    }
    this.#routes.push({
      method,
      pattern: normalisePattern(pattern),
      segments,
      handler,
      specificity: scoreOf(segments),
    });
    return this;
  }

  public get(pattern: string, handler: Handler): this {
    return this.add('GET', pattern, handler);
  }

  public post(pattern: string, handler: Handler): this {
    return this.add('POST', pattern, handler);
  }

  public put(pattern: string, handler: Handler): this {
    return this.add('PUT', pattern, handler);
  }

  public patch(pattern: string, handler: Handler): this {
    return this.add('PATCH', pattern, handler);
  }

  public delete(pattern: string, handler: Handler): this {
    return this.add('DELETE', pattern, handler);
  }

  /** All registered patterns, for diagnostics. */
  public list(): { method: HttpMethod; pattern: string }[] {
    return this.#routes.map((route) => ({ method: route.method, pattern: route.pattern }));
  }

  /**
   * Resolve a method and path to a handler.
   *
   * @throws {MethodNotAllowedError} when the path matches under other methods.
   * @throws {NotFoundError} when nothing matches.
   */
  public match(method: HttpMethod, path: string): RouteMatch {
    const parts = splitPath(path).map(safeDecode);
    const candidates = [...this.#routes].sort((a, b) => b.specificity - a.specificity);

    const allowed = new Set<HttpMethod>();
    let pathMatched = false;

    for (const route of candidates) {
      const params = matchSegments(route.segments, parts);
      if (params === undefined) {
        continue;
      }
      pathMatched = true;
      allowed.add(route.method);
      if (route.method === method) {
        return { handler: route.handler, params: Object.freeze(params), pattern: route.pattern };
      }
      // HEAD falls back to GET semantics.
      if (method === 'HEAD' && route.method === 'GET') {
        return { handler: route.handler, params: Object.freeze(params), pattern: route.pattern };
      }
    }

    if (pathMatched) {
      const allow = [...allowed].sort();
      if (allowed.has('GET')) {
        allow.push('HEAD');
      }
      throw new MethodNotAllowedError(
        [...new Set(allow)].sort(),
        `${method} is not allowed for ${path}`,
      );
    }
    throw new NotFoundError(`No route matches ${method} ${path}`);
  }
}

function matchSegments(
  segments: readonly Segment[],
  parts: readonly string[],
): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  const hasWildcard = segments.at(-1)?.kind === 'wildcard';

  if (!hasWildcard && segments.length !== parts.length) {
    return undefined;
  }
  if (hasWildcard && parts.length < segments.length - 1) {
    return undefined;
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      return undefined;
    }
    if (segment.kind === 'wildcard') {
      params[segment.value] = parts.slice(index).join('/');
      return params;
    }
    const part = parts[index];
    if (part === undefined) {
      return undefined;
    }
    if (segment.kind === 'static') {
      if (segment.value !== part) {
        return undefined;
      }
      continue;
    }
    params[segment.value] = part;
  }

  return params;
}

function normalisePattern(pattern: string): string {
  const segments = splitPath(pattern);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}
