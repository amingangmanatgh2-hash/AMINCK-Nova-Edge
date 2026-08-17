/**
 * Public API surface of AMINCK Nova Edge.
 *
 * @packageDocumentation
 */

export { createApp, type App, type AppOptions } from './app.js';
export { TtlCache, type CacheOptions, type CacheStats } from './cache.js';
export { ConfigError, loadConfig, parseInteger, parseLogLevel } from './config.js';
export {
  BadRequestError,
  HttpError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadTooLargeError,
  TooManyRequestsError,
  toHttpError,
} from './errors.js';
export { createLogger, createNullLogger, safeStringify, type LoggerOptions } from './logger.js';
export {
  compose,
  cors,
  errorHandler,
  rateLimit,
  requestLogger,
  responseCache,
  securityHeaders,
  timeout,
  type CorsOptions,
} from './middleware.js';
export { RateLimiter, type RateLimiterOptions, type RateLimitResult } from './rate-limit.js';
export { json, noContent, normaliseHeaders, text, withHeader } from './response.js';
export { Router, splitPath, type RouteMatch } from './router.js';
export { parseNodeInput, registerRoutes, type EdgeNode, type RouteContext } from './routes.js';
export {
  clientKeyOf,
  createHttpServer,
  MAX_BODY_BYTES,
  readBody,
  startServer,
  toEdgeRequest,
  type RunningServer,
  type ServerOptions,
} from './server.js';
export {
  HTTP_METHODS,
  isHttpMethod,
  type AppConfig,
  type EdgeRequest,
  type EdgeResponse,
  type Handler,
  type HttpMethod,
  type JsonValue,
  type LogLevel,
  type Logger,
  type Middleware,
  type Next,
  type PathParams,
} from './types.js';
