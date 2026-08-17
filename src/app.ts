/**
 * Application assembly: wires the router, middleware stack and shared state
 * into a single `handle(request)` function that is transport-agnostic and can
 * therefore be unit-tested without opening a socket.
 */

import { TtlCache } from './cache.js';
import {
  compose,
  cors,
  errorHandler,
  rateLimit,
  requestLogger,
  responseCache,
  securityHeaders,
} from './middleware.js';
import { RateLimiter } from './rate-limit.js';
import { registerRoutes } from './routes.js';
import { Router } from './router.js';
import { createNullLogger } from './logger.js';
import type { AppConfig, EdgeRequest, EdgeResponse, Handler, Logger } from './types.js';

export interface AppOptions {
  readonly config: AppConfig;
  readonly logger?: Logger;
  /** Injectable clock, in ms — tests use it to drive TTL and rate limits. */
  readonly now?: () => number;
}

/** A fully wired application instance. */
export interface App {
  readonly router: Router;
  readonly cache: TtlCache<EdgeResponse>;
  readonly limiter: RateLimiter;
  readonly config: AppConfig;
  readonly startedAt: number;
  /** Run a request through the whole pipeline. */
  handle: Handler;
}

/** Build the application. */
export function createApp(options: AppOptions): App {
  const { config } = options;
  const logger = options.logger ?? createNullLogger();
  const now = options.now ?? Date.now;

  const cache = new TtlCache<EdgeResponse>({
    maxEntries: config.cacheMaxEntries,
    ttlMs: config.cacheTtlMs,
    now,
  });

  const limiter = new RateLimiter({
    capacity: config.rateLimitCapacity,
    windowMs: config.rateLimitWindowMs,
    now,
  });

  const router = new Router();
  const startedAt = now();

  const app: App = {
    router,
    cache,
    limiter,
    config,
    startedAt,
    handle: async (req: EdgeRequest) => await Promise.resolve(pipeline(req)),
  };

  registerRoutes({ router, cache, limiter, config, startedAt, now });

  const dispatch: Handler = async (req) => {
    const match = router.match(req.method, req.path);
    const scoped: EdgeRequest = { ...req, params: match.params };
    return await match.handler(scoped);
  };

  const pipeline = compose(
    [
      errorHandler(logger),
      requestLogger(logger, now),
      securityHeaders(),
      cors(),
      rateLimit(limiter),
      responseCache(cache),
    ],
    dispatch,
  );

  return { ...app, handle: pipeline };
}
