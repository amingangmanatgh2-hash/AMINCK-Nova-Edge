# Architecture and operational boundaries

## Shape

```text
Telegram Bot API ──authenticated POST /telegram──► Worker
Browser ──owner HttpOnly session─────────────────► Worker
Termux console ──scoped bearer───────────────────► Worker
                                                       │
                                             singleton NovaBot DO
                                             SQLite + durable alarm
                                                       │
                                                  Telegram Bot API

User's device: Telethon ◄────MTProto────► Telegram account
                 │
                 └────scoped /api/self/lease────► Worker (billing only)
```

No D1, KV, remote MTProto session store, cron slot, AI provider or payment gateway is required. New deployments require only `PANEL_PASSWORD`; the owner supplies the bot token in the authenticated setup wizard. The Durable Object's SQLite class is provisioned through the Wrangler migration. **Deploy as a new Worker name** when replacing the old subscription/proxy application; its old Durable Object class/data are not automatically migrated or deleted.

## Setup and credential lifecycle (2.1)

`BotConnection` resolves panel-managed encrypted credentials first, then legacy environment bindings only when there is no credential envelope. `vault.ts` uses authenticated AES-GCM encryption and PBKDF2 derivation from the deployment's panel password. See SECURITY.md for the password-rotation/re-entry tradeoff.

The same resolved credentials are used by HTTP owner operations, queued updates, alarms and webhook secret validation; the wizard does not configure only its own test client. Bot-token input is validated through `getMe` and bound to one Telegram bot ID before storage. A generated webhook secret is never sent to the browser. Token rotation for that bot retains groups and economic state; switching to another bot requires a separate deployment.

Connection status distinguishes missing/invalid/locked credentials, unreachable Telegram, missing/wrong webhook URL, recent delivery error, registered-but-not-tested and a real authenticated update receipt. The last receipt, processing and group-update timestamps have no message body. Diagnostics do not infer live connectivity from a nonempty webhook URL or from a synthetic ping.

The normal `startgroup=setup` link opens Telegram's group chooser without demanding restrictive rights. An optional admin-rights link is separate. A `my_chat_member` arrival registers the group and sends a short acknowledgement with an authorized panel callback; `/start setup` works for deep-link joins and private connectivity tests. Slash commands explicitly addressed to the bot help in Privacy Mode. Anonymous admins get an explanation instead of silently obtaining an identity bypass.

Groups joined before webhook registration can be recovered by sending a fresh command, using the Telegram group picker, or an owner-initiated membership-verified public-link/ID lookup. The Bot API cannot enumerate all old memberships or automatically join a private invite link. On-demand group diagnostics separate missing restrict/delete/pin rights. Without restrict rights, captcha/raid handling skips the restriction and reports that limitation rather than preventing ordinary join welcomes.

## Serialization and durable work

The single `nova-guard-v1` object owns the global wallet. Mutating API requests, update execution and alarm work use a promise mutex across asynchronous Telegram operations. Webhooks only validate and enqueue after durable persistence, then acknowledge quickly. SQLite `transactionSync` protects economic invariants. Incoming-message indexes contain metadata, never arbitrary body history.

At most three updates, five duel-expiry notifications, three captcha expirations and two job batches are handled in an alarm turn. Large join events are durably split into batches of five members, rather than ignoring remaining users. Purge batches submit up to 100 IDs each, with at least two seconds before the same job's next batch. Telegram rate-limit / permission failures cause bounded retry delay for purge, not a tight retry loop. Notification delivery is best-effort after committed financial settlement.

A crash during an external send cannot be made atomic with Telegram. The system records uncertainty rather than claiming exactly-once external effects. Do not replay `uncertain` commands blindly. Resolve them by inspecting group state and audit, then issue a new intentional command if needed.

## Honest limits

- This is a coherent, tested baseline with 132 canonical bot commands, 35 owner commands within that number, 24 locks and six native games. It is not a claim of 1,000 independent implemented features.
- One globally serialized object is appropriate for a modest deployment, **not thousands of busy groups with a throughput SLA**. A production scaling project would shard group moderation per chat and use an explicit economy coordinator/outbox. Telegram API limits, Workers CPU/subrequest quotas, storage allowances and account costs apply independently.
- Webhook queue cap: 2,000 pending updates. Under overload, 503 asks Telegram to retry; an outage can still exceed Telegram's own update-retention window. Monitor queue failures in the owner dashboard.
- This version expects manageable group/user counts: dashboard group list is limited to 200; user/leader/duel/audit/job lists to 100. The Telegram `groups` command shows 30 recent groups. Pagination and high-cardinality search are future work.
- Purge is an index-based operation on eligible messages less than 48 hours old, with a two-minute safety margin. It cannot read historical Telegram messages that were never delivered to the bot, delete messages from before it joined, or defeat protected Telegram service-message rules. One operation selects up to 5,000 oldest indexed candidates.
- Ordinary Telegram admin status can be observed only through the API, not magically guaranteed during an in-flight request. Specific rights are checked when action is executed; owner authority does not grant missing bot permissions.
- Captcha is a simple per-user emoji button challenge, not advanced anti-bot identity verification. The mute has a Telegram-side expiration so a worker outage does not create a permanent silent member. Expired captcha cleanup attempts kick/unban; failures are logged instead of retried forever.
- Night mode filters ordinary members' messages based on a fixed UTC-minute offset. Tehran defaults to +210 minutes. Equal start/end means all hours; there is no timezone/DST database per group. Night mode does not rewrite Telegram's global chat permissions.
- `cooldown` deletes messages sent too soon; it does not call an unsupported native Bot API slow-mode method.
- Reply templates and playful chatter are deterministic local content, not general-purpose AI. Chatter is opt-in, responds to a reply to the bot, and is rate-limited per chat. The three response styles are configurable; no user content is sent to an AI provider.
- Emoji game animations and dice values come from Telegram. Slot scores are a documented local scoring rule, not Telegram's cash casino.
- No monetary wagering, real-money credits, cash-out, cryptocurrency integration or diamond marketplace exists. Native dice bots cannot guarantee fair behavior by users running multiple accounts; reward caps only reduce obvious farming.
- Durable schedules are one-shot group messages, at most 20 pending jobs per group and seven days ahead. The personal self client's reminders are different: local, in-memory and dependent on a running process.
- Browser password authentication is for the global owner, not individual group admins. Group admins use Telegram's authenticated identity and in-group panel.
- The settings export is **not full disaster-recovery backup/restore** of economic balances. Account/session secrets are intentionally excluded. Use the Cloudflare platform's storage recovery facilities for operational disaster recovery and validate them for your account.

## Test commands

```bash
npm ci
npm run check
npm run check:termux
npm test
npm run dry-run
npm audit --audit-level=moderate
```

Node 22 or newer is required; tests use `node:sqlite` for fast database invariants and Miniflare's actual SQLite Durable Object runtime for HTTP/secret/scope/queue integration. `npm run catalog` regenerates the actual command manifest; `npm run check` rejects a stale document.

An optional GitHub Actions template lives in `docs/ci.yml.example`. It is not an installed workflow: the connected GitHub App lacks workflow-write permission. Reconnect with the required permission or install the template yourself before expecting remote CI checks.

The browser is a dependency-free static application with a strict CSP. The setup wizard uses bounded polling only while completing onboarding and on return from Telegram; it never replaces a typed token or unsaved modal in a background refresh. QA should cover:

1. `npm run dev:demo`, then desktop and 390px mobile viewports.
2. All navigation pages, command search, group modal tabs, owner wallet forms, mobile drawer and theme toggle.
3. Password-only bootstrap → masked token input → registration → real message receipt → group chooser, plus failed-token and wrong-webhook repair paths.
4. Explicit sample-data banner and 409 on mutation, rather than fake success.
5. No browser console errors, horizontal mobile overflow or third-party network requests.
6. A separately configured test Worker with a **throwaway test bot**, owner login and actual admin permissions. Verify one low-stake duel, both timeout paths, permission revocation, sticker matching and a small confirmed purge before enabling real groups.

The automated Telegram adapter mocks outbound API calls; passing tests is not evidence that a real bot was deployed or logged in. The project never uses a leaked chat token for testing.

## Extension points

- Add one real command to `src/commands.ts`, implement its handler in `handlers.ts` or `owner.ts`, add authorization/negative/positive tests, regenerate the catalog.
- Add content filters only with explicit detection logic, an allowed settings key and tests for false positives and edited messages.
- Prefer adding persistent game types with explicit state machines and settlement invariants, not a larger collection of aliases.
- Improvements worth doing next: per-chat actor sharding, authenticated Telegram web login for group-specific admins, paginated search, full backup/recovery tooling, stronger anti-raid join-rate policy, tournament seasons, permission-change announcements and richer tested admin presets. These are **ideas, not features claimed to exist in this release**.
