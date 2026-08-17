# AMINCK Nova Edge

A dependency-free edge HTTP runtime for Node.js, written in strict TypeScript.

It ships a small, well-tested core: a segment-matching router, a composable
middleware pipeline, a TTL + LRU response cache, and a token-bucket rate
limiter. There are **zero runtime dependencies** — everything is built on the
Node standard library.

> **CI:** the GitHub Actions pipeline is committed at [`docs/github-actions-ci.yml`](./docs/github-actions-ci.yml) and needs one move to activate — see [docs/CI.md](./docs/CI.md).

---

## Features

| Capability         | Notes                                                               |
| ------------------ | ------------------------------------------------------------------- |
| Router             | `:param` and trailing `*wildcard`, static-first matching, 404/405   |
| Middleware         | Koa-style `compose`, double-`next()` protection                     |
| Caching            | TTL expiry + LRU eviction, hit/miss/eviction statistics             |
| Rate limiting      | Per-key token bucket with continuous refill                         |
| Errors             | Typed hierarchy serialised to consistent JSON problem payloads      |
| Logging            | Structured NDJSON with level filtering and cycle-safe serialisation |
| Config             | Environment parsing that validates and fails fast at startup        |
| Transport-agnostic | The app is a pure `handle(request)` function; HTTP is an adapter    |

## Requirements

- Node.js **>= 20.11.0**
- npm 10+

## Quick start

```bash
npm install
npm run check    # typecheck + lint + format:check + tests
npm run build
npm start
```

The server listens on `http://0.0.0.0:3000` by default:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/nodes
```

For local development with automatic reload:

```bash
npm run dev
```

## Configuration

All configuration comes from the environment. Invalid values abort startup with
exit code `78` (`EX_CONFIG`) rather than silently falling back. See
[`.env.example`](./.env.example).

| Variable               | Default   | Range         | Description                     |
| ---------------------- | --------- | ------------- | ------------------------------- |
| `PORT`                 | `3000`    | 0–65535       | `0` picks a free port           |
| `HOST`                 | `0.0.0.0` | —             | Bind interface                  |
| `LOG_LEVEL`            | `info`    | debug…silent  | Verbosity                       |
| `RATE_LIMIT_CAPACITY`  | `100`     | 1–1,000,000   | Requests per window, per client |
| `RATE_LIMIT_WINDOW_MS` | `60000`   | 100–3,600,000 | Refill window in ms             |
| `CACHE_MAX_ENTRIES`    | `500`     | 1–1,000,000   | LRU ceiling                     |
| `CACHE_TTL_MS`         | `30000`   | 0–86,400,000  | `0` disables expiry             |

## API

| Method   | Path              | Description                                    |
| -------- | ----------------- | ---------------------------------------------- |
| `GET`    | `/`               | Service metadata and route listing             |
| `GET`    | `/health`         | Liveness probe with uptime                     |
| `GET`    | `/readyz`         | Plain-text readiness probe                     |
| `GET`    | `/metrics`        | Cache, rate-limit and store counters           |
| `GET`    | `/api/nodes`      | List nodes; filter via `?region=` / `?status=` |
| `GET`    | `/api/nodes/:id`  | Fetch one node                                 |
| `POST`   | `/api/nodes`      | Create (`201`) or update (`200`) a node        |
| `DELETE` | `/api/nodes/:id`  | Delete a node                                  |
| `GET`    | `/api/echo/*rest` | Echo the wildcard path and query               |

Errors share one shape:

```json
{
  "error": "not_found",
  "message": "No node with id \"ghost\"",
  "status": 404,
  "requestId": "0f7c…"
}
```

## Library usage

The package is also consumable as a library:

```ts
import { createApp, loadConfig, createLogger, startServer } from 'aminck-nova-edge';

const config = loadConfig(process.env);
const app = createApp({ config, logger: createLogger({ level: config.logLevel }) });

// Either start an HTTP server…
await startServer({ app, logger: createLogger() });

// …or invoke the pipeline directly, no socket required.
const response = await app.handle({ method: 'GET', path: '/health' /* … */ });
```

Because `app.handle` is a plain function, the entire suite runs without binding
a port — only `tests/server.test.ts` opens a real socket.

## Scripts

| Script                  | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `npm test`              | Run the Vitest suite once                   |
| `npm run test:coverage` | Run with a V8 coverage report               |
| `npm run typecheck`     | `tsc --noEmit` over `src` and `tests`       |
| `npm run lint`          | ESLint with type-aware rules                |
| `npm run format:check`  | Verify Prettier formatting                  |
| `npm run check`         | All of the above, in order                  |
| `npm run build`         | Emit JavaScript and declarations to `dist/` |

## Project layout

```
src/
  app.ts          Application assembly and middleware wiring
  cache.ts        TTL + LRU cache
  config.ts       Environment parsing and validation
  errors.ts       Typed HTTP error hierarchy
  index.ts        Public API surface
  logger.ts       Structured NDJSON logger
  main.ts         Process entry point and graceful shutdown
  middleware.ts   compose() and the built-in middlewares
  rate-limit.ts   Token-bucket rate limiter
  response.ts     Response construction helpers
  router.ts       Segment-matching router
  routes.ts       HTTP surface / handlers
  server.ts       Node http adapter
  types.ts        Shared type definitions
tests/            Vitest suite (159 tests)
```

## Design notes

- **Injectable clocks.** `TtlCache`, `RateLimiter` and the app accept a `now()`
  function, so time-dependent behaviour is tested deterministically with a fake
  clock instead of `setTimeout`.
- **Strict TypeScript.** `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
  and friends are enabled; the code is written to satisfy them rather than
  suppressing them.
- **Graceful shutdown.** `SIGINT`/`SIGTERM` stop accepting connections and drain,
  with a 10s force-exit guard for lingering keep-alive sockets.

## License

MIT
