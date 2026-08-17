# Security Policy — EDGE PANEL

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

- `ADMIN_PASSWORD` (owner password) and `SESSION_SECRET` (session-signing key)
  are **never** stored in the repository. They are Cloudflare Worker secrets
  (`wrangler secret put …`) or local `.dev.vars` (git-ignored).
- No Cloudflare API token is ever requested, stored, or rendered by the panel.
  Deploys happen via the official Deploy button or Wrangler in CI (secrets
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` on GitHub).

### Authentication & sessions

- Owner login uses the `ADMIN_PASSWORD` secret compared in constant time.
- Staff passwords are stored as **PBKDF2-SHA256** (210,000 iterations) with a
  random 16-byte salt. Minimum password length: 10 characters.
- Sessions are random 32-byte ids signed with HMAC-SHA256; cookies are
  `HttpOnly; Secure; SameSite=Strict` with a 12-hour Max-Age (sliding).
- Disabling or deleting an admin revokes **all** of their sessions; the very
  next request with an old session gets `401`.
- Failed logins incur a server-side delay (300 ms – 6 s exponential backoff);
  after 10 failures the username/IP is locked for 10 minutes.

### Authorization

- Every API operation checks permissions in the backend (the Durable Object):
  `users:view|create|edit|delete`, `configs:build`, `settings:manage`,
  `endpoints:probe`, `backup:export`, `admins:manage`, `audit:view`.
- Power levels (`Limited 5 / Normal 30 / Strong 80 / Ultra 200`) are enforced
  in the backend on every config build — a Limited admin cannot exceed 5 paths
  even with hand-crafted API requests.
- The owner is seeded automatically and **cannot** be deleted, disabled,
  demoted, or have their password changed through the admin API.
- Hash/salt/iterations are never returned by the API. Only the full backup
  export (an explicitly privileged operation) includes them so a restore can
  keep passwords — treat backups as secrets.

### Proxy hardening (no open proxy)

- Only authenticated subscribers with an active, non-expired account and a
  known route path can open a WebSocket session.
- Target classification rejects:
  - UDP on any port except 53 (DNS only);
  - SMTP ports (25, 465, 587, 2525);
  - TCP ports outside the Cloudflare TLS port allow-list;
  - private/reserved IP literals (RFC1918, link-local, CGNAT, TEST-NET,
    multicast, loopback, IPv6 ULA/link-local/mapped, …);
  - hostnames whose DNS answers are private-only (metadata endpoints like
    `169.254.169.254` are blocked before connect).
- DNS is resolved through DoH with resolver failover; UDP/53 client queries are
  answered through the same DoH chain (RFC 8484).
- Per-subscriber live connection caps are enforced at connect time.

### Web

- Mutating requests are checked for Same-Origin (`Origin`/`Sec-Fetch-Site`).
- All responses carry CSP (`default-src 'self'`, no inline scripts),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer` and a restrictive `Permissions-Policy`.
- No third-party CDN, analytics, or tracking is used by the panel.

### Honest measurements

- The scanner reports TCP connect + TLS handshake time measured from the
  Cloudflare edge — it is **not** the user device's ping, and the UI says so.
- No speed/uptime guarantees are claimed anywhere in code or UI.

## Dependency policy

`npm audit --audit-level=high` must stay clean in CI. The only runtime
dependencies shipped to the worker are the worker bundle itself; Node-side
packages (wrangler, miniflare, vitest, typescript) are development-only.
