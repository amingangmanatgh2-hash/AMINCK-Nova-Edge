/**
 * Middleware pipeline plus the built-in middlewares: error handling, request
 * logging, security headers, CORS, rate limiting and GET response caching.
 */

import type { TtlCache } from './cache.js';
import { HttpError, MethodNotAllowedError, toHttpError, TooManyRequestsError } from './errors.js';
import type { RateLimiter } from './rate-limit.js';
import { json, withHeader } from './response.js';
import type { EdgeRequest, EdgeResponse, Handler, Logger, Middleware } from './types.js';

/**
 * Fold a list of middlewares around a terminal handler.
 *
 * Each middleware may call `next()` at most once; calling it twice is a
 * programming error and throws rather than silently re-running the pipeline.
 */
export function compose(middlewares: readonly Middleware[], handler: Handler): Handler {
  return async function composed(req: EdgeRequest): Promise<EdgeResponse> {
    let index = -1;

    const dispatch = async (i: number): Promise<EdgeResponse> => {
      if (i <= index) {
        throw new Error('next() called multiple times in the same middleware');
      }
      index = i;
      const middleware = middlewares[i];
      if (middleware === undefined) {
        return await handler(req);
      }
      return await middleware(req, () => dispatch(i + 1));
    };

    return await dispatch(0);
  };
}

/** Convert thrown errors into JSON problem responses. */
export function errorHandler(logger: Logger, exposeStack = false): Middleware {
  return async function errorHandlerMiddleware(req, next) {
    try {
      return await next();
    } catch (cause) {
      const error = toHttpError(cause);
      const meta: Record<string, unknown> = {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: error.status,
        code: error.code,
      };
      if (error.status >= 500) {
        logger.error(error.message, { ...meta, stack: error.stack });
      } else {
        logger.warn(error.message, meta);
      }

      const payload = error.toJSON();
      payload['requestId'] = req.requestId;
      if (exposeStack && error.stack !== undefined) {
        payload['stack'] = error.stack;
      }

      const headers: Record<string, string> = {};
      if (error instanceof MethodNotAllowedError) {
        headers['allow'] = error.allow.join(', ');
      }
      if (error instanceof TooManyRequestsError) {
        headers['retry-after'] = String(error.retryAfterSeconds);
      }
      return json(error.status, payload, headers);
    }
  };
}

/** Log one line per completed request, including duration and status. */
export function requestLogger(logger: Logger, now: () => number = Date.now): Middleware {
  return async function requestLoggerMiddleware(req, next) {
    const startedAt = now();
    const response = await next();
    logger.info('request.completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: response.status,
      durationMs: Math.max(0, now() - startedAt),
    });
    return withHeader(response, 'x-request-id', req.requestId);
  };
}

/** Conservative default security headers. */
export function securityHeaders(): Middleware {
  return async function securityHeadersMiddleware(_req, next) {
    const response = await next();
    return {
      ...response,
      headers: {
        ...response.headers,
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'cross-origin-opener-policy': 'same-origin',
      },
    };
  };
}

export interface CorsOptions {
  /** Allowed origins, or `'*'` for any. */
  readonly origins?: readonly string[] | '*';
  readonly methods?: readonly string[];
  readonly headers?: readonly string[];
  readonly maxAgeSeconds?: number;
}

/** Handle CORS preflight and attach CORS headers to responses. */
export function cors(options: CorsOptions = {}): Middleware {
  const origins = options.origins ?? '*';
  const methods = options.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  const allowedHeaders = options.headers ?? ['content-type', 'authorization'];
  const maxAge = options.maxAgeSeconds ?? 600;

  const resolveOrigin = (requestOrigin: string | undefined): string | undefined => {
    if (origins === '*') {
      return '*';
    }
    if (requestOrigin !== undefined && origins.includes(requestOrigin)) {
      return requestOrigin;
    }
    return undefined;
  };

  return async function corsMiddleware(req, next) {
    const allowOrigin = resolveOrigin(req.headers['origin']);
    const corsHeaders: Record<string, string> = {};
    if (allowOrigin !== undefined) {
      corsHeaders['access-control-allow-origin'] = allowOrigin;
      corsHeaders['access-control-allow-methods'] = methods.join(', ');
      corsHeaders['access-control-allow-headers'] = allowedHeaders.join(', ');
      corsHeaders['access-control-max-age'] = String(maxAge);
      if (allowOrigin !== '*') {
        corsHeaders['vary'] = 'Origin';
      }
    }

    if (req.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders, body: '' };
    }

    const response = await next();
    return { ...response, headers: { ...response.headers, ...corsHeaders } };
  };
}

/** Reject requests once a client exhausts its token bucket. */
export function rateLimit(limiter: RateLimiter): Middleware {
  return async function rateLimitMiddleware(req, next) {
    const result = limiter.consume(req.clientKey);
    if (!result.allowed) {
      throw new TooManyRequestsError(
        result.retryAfterSeconds,
        `Rate limit of ${result.limit} requests exceeded`,
      );
    }
    const response = await next();
    return {
      ...response,
      headers: {
        ...response.headers,
        'x-ratelimit-limit': String(result.limit),
        'x-ratelimit-remaining': String(result.remaining),
        'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
      },
    };
  };
}

/** Cache successful GET responses in memory, keyed by method + URL. */
export function responseCache(cache: TtlCache<EdgeResponse>): Middleware {
  return async function responseCacheMiddleware(req, next) {
    if (req.method !== 'GET') {
      return await next();
    }
    const key = `${req.method} ${req.path}?${req.query.toString()}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return withHeader(cached, 'x-cache', 'HIT');
    }
    const response = await next();
    if (response.status >= 200 && response.status < 300) {
      cache.set(key, response);
    }
    return withHeader(response, 'x-cache', 'MISS');
  };
}

/** Fail a request that outlives `timeoutMs`. */
export function timeout(timeoutMs: number): Middleware {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(`timeoutMs must be a positive number, received ${timeoutMs}`);
  }
  return async function timeoutMiddleware(_req, next) {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        next(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new HttpError(503, `Request exceeded ${timeoutMs}ms budget`, 'timeout'));
          }, timeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };
}
