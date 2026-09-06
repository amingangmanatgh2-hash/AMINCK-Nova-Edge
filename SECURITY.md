# Security & privacy — NOVA Guard 2.1

## Rotate exposed secrets first

Never deploy a token that was posted in a chat or public repository. Revoke it through BotFather and install the replacement through the authenticated HTTPS setup page on your own deployed Worker (or keep using existing Cloudflare secret bindings). Do not open an issue or send a support message containing a token, phone login code, 2FA password, `api_hash`, pairing credential, or session file.

The only required deployment secret for a new installation is `PANEL_PASSWORD`. The panel accepts the bot token after owner login, validates it with Telegram and generates the webhook secret. Existing `BOT_TOKEN` / `WEBHOOK_SECRET` environment bindings remain supported until a panel-managed configuration is saved. `.dev.vars`/`.env`, Python sessions, dependency trees and local Wrangler storage are ignored by Git. Example files contain a deliberately invalid panel-password placeholder. Owner login is fail-closed without a valid panel password; webhooks are fail-closed until usable bot credentials and a webhook secret exist.

## Authenticated bot-token setup (2.1)

This version intentionally adds a bot-token form because manual Secret/webhook setup was error-prone. It is **not** an unauthenticated first-visitor setup page. `PANEL_PASSWORD` must be chosen in the trusted Cloudflare deployment flow first.

- `POST /api/setup` is owner-authenticated, JSON-only, same-origin for browser cookies, rate-limited and rejects non-HTTPS URLs. It never accepts a Cloudflare API token, phone number, personal Telegram login code or MTProto session.
- Validate `getMe`, token-prefix/response identity and existing bot binding before changing credentials. Wrong/revoked tokens do not overwrite the working configuration. A different bot ID cannot silently take over an existing wallet/group database.
- Store `{botToken, webhookSecret}` only as an AES-256-GCM authenticated envelope with random 128-bit salt, 96-bit nonce, a fixed service-purpose AAD and PBKDF2-SHA256 at 100,000 iterations (validated in the pinned Workers runtime). The key is derived from `PANEL_PASSWORD`, not stored alongside the ciphertext. Use a long random unique panel password; length alone is not entropy.
- Password-rotation tracking stores a separately salted PBKDF2 stamp at the same work factor; its computed value is also cached per instance. It does not leave a fast SHA-256 verifier of the panel password alongside the encrypted vault. Upgrading the old rotation-stamp format invalidates existing browser sessions once; log in again with the same password.
- Credential plaintext and derived keys exist transiently in the Worker runtime to call Telegram. A per-instance cache avoids repeating expensive derivation on every webhook. This does not protect against compromise of the running Worker or its Cloudflare account.
- The token form is masked and cleared before its network submission. No token echo endpoint, masked-token suffix, localStorage persistence, URL token, audit token or settings-export credential is provided. The read-only demo disables this input entirely.
- A token verified by Telegram is saved before registration, so an ambiguous/failed `setWebhook` can be repaired without pasting it again. Responses distinguish `saved`, webhook registration and actual incoming-update receipt; a saved token is not presented as a working connection.
- Webhook health compares the actual target to this Worker's HTTPS endpoint, not merely a nonempty URL. Other webhook targets are shown as origin + redacted path; webhook error descriptions redact known secrets.
- Changing `PANEL_PASSWORD` invalidates panel sessions **and makes the existing credential envelope unreadable**. Re-enter the same bot's new/current token to encrypt it under the new password; group/wallet data remain intact. The runtime fails closed instead of falling back to a potentially stale environment token when an envelope exists but cannot be decrypted.
- Group recovery via a public Telegram username/link or numeric ID calls only Telegram's fixed Bot API host; arbitrary URL fetching and private-invite auto-join are not supported. Membership is checked before registering a group. A deliberate owner block is not silently undone.
- Missing Restrict/Ban rights are diagnosed independently of panel/send rights. The default add-group link does not demand Ban rights; a second explicit link requests broader admin permissions. Both are official Telegram group-picker links, not autonomous bot joins.

## Authentication and authority

- Telegram webhook authentication uses `X-Telegram-Bot-Api-Secret-Token`, checked through constant-length digest comparison. The public URL does not contain a credential.
- Update IDs are durably deduplicated for seven days. The raw pending update is wiped after processing. A bounded queue rejects new requests with 503 when full, allowing Telegram to retry.
- Group permissions come from Telegram `getChatMember`, not a client-supplied role. Admin identity is checked anew per update, callback and queued-operation execution. Specific rights (delete, restrict, pin, change info, invite, promote) are enforced for corresponding operations.
- The two configured numeric owners have deliberate global authority over groups known to this bot. Group owners should understand this operator trust model before adding it. These owners cannot bypass actual Telegram permissions or delete-message age limits.
- Anonymous/channel sender identities and forwarded/edited commands never gain authority. Edits are still moderated. Merely trusting a user exempts them from filters, not authorization.
- Shared panel password gives global-owner authority and is attributed to the first owner in audit logs. Store it accordingly; this is **not** a multi-tenant, per-group web login system.
- Panel sessions are random 256-bit tokens, stored as hashes, HttpOnly, SameSite=Strict, Secure on HTTPS, with a 12-hour expiry. Mutation requests require JSON and a matching Origin. Password/webhook-secret rotation invalidates existing panel sessions on the next authentication check.
- Login and pairing attempts are rate-limited. In production Cloudflare supplies the client-IP header. For public high-volume deployments add Cloudflare WAF/rate limits as another layer.
- Console and self credentials are separately scoped, randomly generated, hashed server-side, expire in 30 days and are revocable. Pairing codes have 128 bits of entropy, expire in ten minutes and can be consumed once. The bot gives codes only in private chats; self codes are bound to the requesting Telegram user ID.
- A self bearer cannot read groups, adjust balances, export settings, or execute owner API operations. The local account ID must match its pairing identity. No unauthenticated endpoint grants a role based on a claimed owner ID.
- Owner messages only target active groups already seen by this bot. Deletion requires actor/chat-bound, expiring, one-use confirmation. Pending scheduled messages recheck the actor's admin and pin rights before execution.

## Economy and replay resistance

The SQLite ledger, escrow, duel state, refunds, awards, daily cooldowns and hourly leases are changed in synchronous transactions. Insufficient funds cannot produce negative balances. Repeating a heartbeat during an already-paid hour does not charge again.

Native dice must be fresh, from one of two participants, with the correct emoji and a reply to the stored challenge message in the same chat. Forwarded/edited/bot/inline dice, another player's dice and second rolls do not count. A player cannot avoid losing by withholding their roll after seeing the opponent: the player who did roll wins on timeout. Forfeit wins do not receive rare diamonds.

Rare rewards use Web Crypto with rejection sampling, a minimum stake, rolling 24-hour per-user and opponent limits. These are useful friction against simplistic farming, not Sybil-proof identity or guaranteed collusion prevention. Virtual credits have no purchase/redemption or monetary transfer interface.

## External API effects and failure boundaries

SQLite transactions cannot make Telegram network calls transactional. We do **not** promise exactly-once delivery of outbound Telegram messages. Interrupted update processing is marked `uncertain`, not blindly replayed. A challenge that fails to post is cancelled and its escrow is returned; a possibly delivered ghost challenge cannot be joined after cancellation. Open games expire with a refund or forfeit settlement.

Scheduled sends mark `sending` before network I/O. A crash in that window becomes `uncertain`, and an ambiguous send error is terminal rather than an automatic duplicate. A purge can be retried because deletion is idempotent; retries are bounded and requests are paced. Audit logs expose failures without printing tokens or raw incoming texts.

## Data storage and retention

| Data | Default retention / purpose |
|---|---|
| Panel-managed bot token + webhook secret | Persistent AES-GCM ciphertext until replaced; excluded from settings exports |
| Last webhook receipt/processing/group timestamps | Diagnostics only; no message contents |
| Group IDs/titles, settings, trusted IDs | Until changed by operator; required for management |
| User ID/name, balances, group statistics | Persistent; no phone/email required |
| Message ID, chat ID, timestamp, sender ID | 48 hours, metadata only, for bounded purge |
| Pending webhook body | Until processing; no persistent message-body history index |
| Completed/failed/uncertain update ID | 7 days; payload erased |
| Captcha | Until answer/expiry handling |
| Confirmation | 90 seconds, one-use |
| Pairing code | 10 minutes, hash only, one-use |
| Panel token | 12 hours, hash only |
| Console/self token | 30 days, hash only |
| Scheduled-message body | Until delivery/cancellation; completed jobs normally erase it |
| Completed job metadata | 7 days |
| Audit | 30 days |
| Duel history | 30 days; active duels retained to settle |
| Ledger | 90 days; aggregate balances remain |
| Notes, automatic replies, blacklist text/sticker IDs | Intentional group configuration; retained until removed |

Cleanup runs through the Durable Object alarm, approximately hourly when idle. Expired rows can remain until a scheduled cleanup but are not valid credentials after expiry. Operator-initiated `/export` and `/api/export` export **settings, notes, replies and blacklist only** — not a full account/economy backup, and never tokens or local account sessions. Treat configuration exports as private group data.

There is no external analytics, advertising script, third-party AI inference or browser CDN dependency. The dashboard uses locally hosted Vazirmatn (SIL OFL) and local assets. Server observability is off in Wrangler by default; enabling additional platform logging is an operator decision.

## Local self-client boundary

Personal-account login happens directly between Telethon and Telegram on the user's device. The worker receives a one-time Nova pairing code and numeric Telegram ID, not phone, login code, 2FA password, API hash, or session. Local files are private (`700` directory / `600` config / `umask 077`) but not encrypted against a compromised OS. Session files are credentials. Terminate a leaked session using Telegram Settings → Devices.

The self client is open source. Its heartbeat is an entitlement mechanism for the provided client, **not unbreakable DRM** on software running on someone else's machine. A modified client can remove local checks; this does not give it authority to mutate the server ledger or call owner routes. The server does not accept a user-supplied billing exemption.

The companion accepts commands only from the account's outgoing messages. Private auto-replies are opt-in, skip bots/Telegram's service account, and are limited to one per peer per 30 minutes. Cleanup only targets that account's own outgoing messages. No bulk unsolicited messaging, member scraping or third-party login collection is implemented.

## Demo and production

`DEMO_MODE=true` serves an isolated synthetic dataset, disables the token form, rejects all mutations and Telegram webhooks, and enables limited frame embedding for live preview. **Remove it in production.** Production uses frame-ancestors none / X-Frame-Options DENY. All HTTP responses add CSP, no-sniff and no-referrer; HTTPS additionally adds HSTS. API/session responses are not cached.

## Reporting

Report vulnerabilities privately through the repository's private vulnerability reporting feature if available. Otherwise contact the maintainer without including exploit secrets or personal session data. Include affected version, minimal reproduction with dummy data, impact, and relevant redacted logs. Do not publish live credentials in an issue or PR.
