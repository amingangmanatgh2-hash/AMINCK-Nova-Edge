# Security Policy — AMINNOVA

## Supported versions

| Version | Supported |
|---|---|
| main (this repository) | ✅ |
| older releases | ❌ |

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Report privately by
opening a GitHub security advisory on this repository, or contact the repository
owner (`AMINCK`) directly.

We aim to acknowledge reports within 72 hours and ship a fix as soon as possible.

## Security model

### Secrets

- `ADMIN_PASSWORD` is **never** stored in the repository. The official Deploy
  wizard requests it as an encrypted Worker secret; local development uses the
  git-ignored `.dev.vars` file.
- No Cloudflare API token is ever requested, stored, rendered, or proxied by
  the panel. The public update checker reads only the repository `package.json`,
  caches successful results for five minutes, and links to the official Deploy
  button. Deploys happen via that button or Wrangler in CI (encrypted GitHub
  secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`).
- Login fails closed with `503 setup-required` when `ADMIN_PASSWORD` has not
  been configured.

### Authentication & sessions

- Owner login uses the `ADMIN_PASSWORD` secret compared in constant time.
- Staff passwords are stored as **PBKDF2-SHA256** (210,000 iterations) with a
  random 16-byte salt. Minimum password length: 10 characters.
- Sessions are random 32-byte bearer tokens kept server-side in the Durable
  Object; cookies are `HttpOnly; Secure; SameSite=Strict` with a 12-hour Max-Age.
- Disabling or deleting an admin revokes **all** of their sessions; the very
  next request with an old session gets `401`.
- Failed logins incur a server-side delay (300 ms – 6 s exponential backoff);
  after 10 failures the username/IP is locked for 10 minutes.

### Authorization

- Every API operation checks permissions in the backend (the Durable Object):
  `users:view|create|edit|delete`, `configs:build`, `settings:manage`,
  `endpoints:probe`, `backup:export`, `admins:manage`, `audit:view`. The
  conversational `/api/ai-plan` endpoint first validates the server-side
  session and requires `configs:build` before it can consume inference quota.
- Power levels (`Limited 5 / Normal 100 / Strong 500 / Ultra 2000`) are enforced
  in the backend on every config build — a Limited admin cannot exceed 5 paths
  even with hand-crafted API requests. Giant profiles above 200 are explicit
  opt-in because large client files can exhaust mobile memory or health checks.
- The owner is seeded automatically and **cannot** be deleted, disabled,
  demoted, or have their password changed through the admin API.
- Hash/salt/iterations are never returned by the admin-list API. Only an
  owner-created full backup includes staff hashes so disaster recovery can keep
  staff passwords; non-owner exports omit staff records. Treat backups as secrets.
- Restore is owner-only, caps imported users/staff, validates ids/tokens/routes,
  keeps the new deployment's owner, and rebinds subscriber routes to the
  current Worker hostname.

### Proxy hardening (no open proxy)

- Only authenticated subscribers with an active, non-expired account and a
  known route path can open a WebSocket session.
- Target classification rejects:
  - UDP on any port except 53 (DNS only);
  - SMTP ports (25, 465, 587, 2525);
  - TCP ports outside the conservative HTTP/HTTPS destination allow-list;
  - private/reserved IP literals (RFC1918, link-local, CGNAT, TEST-NET,
    multicast, loopback, IPv6 ULA/link-local/mapped, …);
  - hostnames whose DNS answers are private-only (metadata endpoints like
    `169.254.169.254` are blocked before connect).
- DNS is resolved through DoH with resolver failover; UDP/53 client queries are
  answered through the same DoH chain (RFC 8484).
- The validated public IP is dialed with a raw TCP socket. Client TLS passes
  through unchanged; the Worker does not create a broken nested TLS session.
- The parsed VLESS UUID must match the subscriber selected by the private path.
- Per-subscriber live connection caps are enforced at connect time.
- Third-party SNI/Host impersonation is not generated. Optional Host aliases
  must also be configured Endpoint hostnames for this deployment.
- Gaming selections are allow-listed catalogue ids. Only official publisher
  hostname suffixes compiled into the release are emitted; untrusted API values
  cannot inject Clash/sing-box/Xray rules. Arbitrary game UDP remains blocked.
- AI plans are not executable configuration. Prompts are capped at 1,000
  characters; model output is reduced to fixed enums, numeric ceilings,
  booleans and catalogue game ids before the existing Auto Build validation
  path sees it. Model-supplied URLs, domains, SNI/Host values, secrets, code and
  unknown fields are discarded. Invalid, unavailable or timed-out inference
  falls back to the deterministic parser.
- Endpoint location labels are operator-provided display metadata for real
  deployments. The Worker never derives a country claim from an Anycast IP.

### Web

- Mutating requests are checked for Same-Origin (`Origin`/`Sec-Fetch-Site`).
- All responses carry CSP (`default-src 'self'`, no inline scripts),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer` and a restrictive `Permissions-Policy`.
- No third-party CDN, analytics, or tracking is used by the panel.
- When an authenticated user invokes the conversational studio and the `AI`
  binding is available, only that prompt plus the fixed planner instruction and
  public game-id list are sent to Cloudflare Workers AI in the operator's
  account. Passwords, session cookies, subscription tokens, UUIDs and backups
  are not appended. Inference may consume account quota and follows
  Cloudflare's applicable data handling terms. With no binding/model/quota,
  planning remains local to the Worker through the deterministic parser.

### PWA and rolling subscriptions

- The service worker caches only the public shell (HTML, CSS, JavaScript,
  manifest and icons). `/api`, `/sub`, `/healthz`, `/connect` and `/e…`
  WebSocket paths are excluded.
- Subscription responses use `private, no-store, must-revalidate` plus legacy
  `pragma: no-cache`; tokens and generated profiles are not offline-cached.
- Rolling mode keeps the token, UUID and authorized paths stable. Automatically
  rotating credentials every minute would break installed clients and active
  sessions, so only route order and validated Cloudflare connection IPs rotate.
- Manual front IPs must belong to Cloudflare's published IPv4 ranges; TLS SNI
  and WebSocket Host remain the real Worker/custom-domain hostname.
- Client health checks use an independent non-Cloudflare target. Sending a
  tunneled health request back to the same Worker creates a TCP loop, while
  Workers Sockets intentionally block outbound connections to Cloudflare IPs.
- Every hostname-direct route is a no-early-data, no-padding, no-fragment
  `DIRECT SAFE` compatibility route. Socket-open deadlines and concurrent DoH
  failover prevent indefinite pending sessions, but cannot override
  Cloudflare's destination restrictions.
- Rule-capable outputs keep LAN/private traffic direct. When Domestic Direct is
  enabled, Clash also emits `.ir` and Iran GeoIP direct rules, sing-box emits
  `.ir` direct routing, and Xray Iron emits `geosite:ir`/`geoip:ir` rules.
  This split routing occurs in the client and cannot restore traffic during an
  ISP, DNS, domestic-routing or nationwide outage. Raw/Base64 URIs cannot carry
  these policy rules.
- If all configured DoH providers are temporarily unavailable, special-use and
  local hostnames are rejected before Workers Sockets native DNS is used as a
  bounded availability fallback. Cloudflare still blocks private-network and
  same-Worker socket destinations at the platform layer.

### Honest measurements

- The scanner reports HTTPS response-header latency measured from the
  Cloudflare edge — it is **not** the user device's ping, and the UI says so.
- Gaming rules and LOW PING can select the lowest measured healthy candidate
  among deployed routes and shorten failure-detection settings, but cannot
  shorten physical distance to a game server. A faster health interval is not
  the game's RTT. No sub-90 ms ping, foreign geolocation, universal DPI bypass,
  all-service access, speed, uptime, or uninterrupted-session guarantee is
  claimed.

## Dependency policy

`npm audit --audit-level=high` must stay clean in CI. The only runtime
dependencies shipped to the worker are the worker bundle itself; Node-side
packages (wrangler, miniflare, vitest, typescript) are development-only.
