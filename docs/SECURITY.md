# Security

This is a foundation. It has **not** had a security review and must not be called production-ready until it has.

## Implemented

- Argon2id password hashing (`@node-rs/argon2`, library defaults m=19 MiB, t=2, p=1). Login equalises timing for unknown emails.
- Short-lived JWT access tokens; opaque, hashed, single-use refresh tokens with rotation and family revocation on replay.
- Browser refresh token only in an HttpOnly cookie scoped to `/api/v1/auth`; access token in memory; nothing secret in localStorage.
- Rate limiting: global 120/min, login/register 5/min, refresh 20/min (in-memory store — move to Redis storage before running >1 API instance).
- Tenant isolation: workspace taken only from the route, membership verified in the DB on every request, 404 for non-members; covered by tests.
- Zod validation on every body/query; Prisma parameterised queries only (no raw SQL except `SELECT 1`).
- `helmet`, 100 KB body limit, explicit CORS allow-list (wildcard rejected at startup), `x-powered-by` removed.
- Env validation at startup: secret ≥ 32 chars, `COOKIE_SECURE` required in production; error messages never echo values.
- Pino redaction of `Authorization`, cookies, `password`, tokens. 500s return a generic message in production; details only in logs.
- Swagger UI disabled in production.
- Real-time: JWT-authenticated sockets, DB-checked room joins, disconnect on token expiry.

## Inbox security notes

- Every inbox query is scoped by the route's `workspaceId`; lookups by id alone are never used. Covered by real-PostgreSQL tests (non-member 404, cross-tenant ids ignored in bulk, assignee must be a member).
- Message bodies are validated server-side (trimmed, 1–4000) and rendered as plain text in the web app (no HTML).
- Composer drafts are stored in the browser's localStorage (they can contain customer text) and are cleared on sign-out.
- Socket events carry ids only; no message content is broadcast.
- Web access token is renewed transparently on 401 via the refresh cookie; the socket reconnects with the renewed token.

## Leads security notes

- All lead queries/mutations are workspace-scoped; bulk and export ignore ids from other workspaces (tested against real PostgreSQL). Owners and linked customers must belong to the workspace.
- Delete (single/bulk) requires `leads:delete`, enforced server-side even for the bulk endpoint.
- CSV export prefixes cells starting with `= + - @` to prevent spreadsheet formula injection. Import is parsed in the browser and re-validated on the server.
- Duplicate leads are rejected at the database level (unique email / phone key), not just in the UI.

## Customers security notes

- Workspace-scoped everywhere; cross-tenant ids return 404 and are ignored by bulk/export (tested on PostgreSQL). Delete is Owner/Admin only and refused for customers with conversations.
- Notes: only the author may edit; delete needs authorship or `customers:delete`. Duplicates are blocked by database unique indexes. CSV export defuses formula injection.

## Team & invitation security notes

- Privilege escalation is blocked server-side by one shared policy (see API.md); tested on PostgreSQL, including admin→admin, owner changes and self-changes.
- Invitation tokens are 256-bit random, stored hashed, single-use, expire in 7 days, rotate on resend and are never logged or listed. Accept endpoints are rate limited and return one generic error for any bad token.
- The invitee's email comes from the invitation, never from the request; existing accounts must match it.
- Removing a member clears their assignments in that workspace; suspended members lose access on the next request.

## Brain security notes

- Per-workspace isolation on every read/write; agents read, only Owner/Admin write. Documents are size-limited by schema (e.g. ≤500 FAQs, ≤300 products) and re-validated when read.
- Optimistic concurrency prevents silent overwrites; changes are audited. Configuration text is rendered as plain text in the UI (never HTML).
- The test panel runs entirely in the browser against the current form state; nothing is sent to an AI provider and no keys exist client-side.

## Channels security notes

- Reads need `channels:read`; edits and disconnect need `channels:manage` (Owner/Admin). Every query is scoped by workspace; other tenants' channels return 404.
- No provider tokens or full account identifiers are stored or returned (only a masked account label). Default assignee/team are validated against the workspace.
- Connect is not implemented, and the UI says so; health is shown as "not monitored" unless a real check timestamp exists.

## Orders security notes

- Every query is scoped by workspace; customers and conversations referenced by an order must belong to the same workspace. Other tenants get 404.
- `orders:read` / `orders:write` for Owner, Admin and Agent; recording payments (`orders:payments`) is Owner/Admin only. Totals are computed server-side and clients can’t set paid amounts, so a request cannot mark an order paid.
- Payments are manual records. No card data, CVV or provider secrets are accepted or stored (the reference field is free text, labelled "never a card number"). Payment and create requests are idempotent via `requestId`; status, payment and fulfillment writes use optimistic guards to reject stale updates (409).
- Cancelling a paid order does not refund it (no provider); the UI and timeline say so. Status changes, payments, fulfillment and cancellations are audited and shown on the order timeline.
- CSV export prefixes cells starting with `= + - @` to defuse spreadsheet formula injection. Tracking links are restricted to http(s) and rendered with `rel="noopener noreferrer"`.

## Settings and account security notes

- Profile updates use a strict schema, so a request can’t change email, role, status or memberships. Workspace updates need `workspace:update` and can’t change the slug.
- Changing a password requires the current one (Argon2id verify), is rate-limited, revokes all other devices’ refresh tokens and is audited. A signed-out device keeps a valid access token for up to its lifetime (15 min) because access tokens aren’t checked against the session table.
- Device lists expose a coarse browser/OS label and IP only; refresh tokens and hashes never leave the server. Users can only see and revoke their own sessions.
- Data export is limited to the caller’s own account. Not provided (and not faked): two-factor authentication, sign-in history, account deletion, email change, notification delivery, billing.

## Automation security notes

- Definitions are validated server-side with a strict schema and an allowlisted registry; user text is only substituted into internal notes through allowlisted variables, as plain text. There is no code execution.
- Permissions: read for all members, create/edit/test for Owner/Admin, activate/delete/retry for Owner/Admin. Every query is workspace-scoped, and actions re-fetch their target by id **within the workspace** at run time and re-check that assignees are still active members, so a removed member or a foreign id can’t be acted on.
- Nothing sends customer messages (no provider delivery exists). Run context stores ids, enums and names only (no email, phone, message text or tokens). Activation always needs an explicit confirmation; tests are simulations.
- Safeguards: idempotency per event, 60 runs/hour/automation cap (extra events recorded as skipped), step and wait limits, no automation-triggered events, audited activate/publish/deactivate/delete/retry.

## Known gaps

- No email-verification / password-reset endpoints yet (data model exists). Invitations work but **are not emailed** (no mail provider): admins share the link. Registration reveals whether an email is taken (409).
- No account lockout, MFA, or CSRF token (SameSite=Lax + JSON-only API + CORS allow-list is the current mitigation; revisit when adding cookie-authenticated mutations).
- Access tokens cannot be revoked before expiry (15 min); session `sid` is carried so a revocation check can be added.
- Web routes are gated client-side (redirect to /login when the refresh cookie is missing); server-side route protection (middleware) is not implemented, and the dashboard still shows only fictional demo data.
- No channel delivery/ingestion yet: replies stay `PENDING`; inbound messages exist only as seed data.
- No audit-log read API, no Socket.IO Redis adapter, no dependency/SAST scanning in CI.

## Webhook guidelines (for future channel integrations)

1. **Verify before parsing**: validate the provider signature (e.g. HMAC-SHA256 of the **raw** body with the app secret, constant-time compare, reject stale timestamps) in a dedicated controller using the raw-body buffer. Reject with 401 and do no work.
2. **Ack fast, process async**: persist the raw event + enqueue to the `webhooks` queue, return 200 immediately. No AI/automation work in the HTTP request.
3. **Idempotency**: unique `(provider, externalEventId)` constraint + deterministic BullMQ `jobId`; duplicates are no-ops.
4. **Retries**: providers retry on non-2xx — return 2xx once the event is durably stored. Worker retries use the default exponential backoff; exhausted jobs stay in the failed set for inspection/replay.
5. **Tenant resolution**: map the provider account/page id to a workspace server-side; never accept a workspace id from the payload.
6. **Secrets**: store provider tokens encrypted (KMS/app key), never log payloads containing PII/tokens.
