# API

Base: `/api/v1`. Interactive docs at `/docs` and raw spec at `/docs/openapi.json` (disabled when `NODE_ENV=production`).
Committed spec: `apps/api/openapi.json` (regenerate with `pnpm api:openapi`).

## Endpoints (current)

| Method   | Path                               | Auth            | Notes                            |
| -------- | ---------------------------------- | --------------- | -------------------------------- |
| GET      | `/health`                          | public          | liveness                         |
| GET      | `/health/ready`                    | public          | DB (+ Redis); 503 when failing   |
| POST     | `/auth/register`                   | public, 5/min   | creates user + workspace (OWNER) |
| POST     | `/auth/login`                      | public, 5/min   |                                  |
| POST     | `/auth/refresh`                    | cookie or body  | rotates refresh token            |
| POST     | `/auth/logout`                     | cookie or body  | revokes the session              |
| GET      | `/users/me`                        | bearer          |                                  |
| GET/POST | `/workspaces`                      | bearer          | list own / create                |
| GET      | `/workspaces/:workspaceId`         | bearer + member | `workspace:read`                 |
| GET      | `/workspaces/:workspaceId/members` | bearer + member | `members:read`, paginated        |

### Inbox (all under `/workspaces/:workspaceId`, bearer + membership required)

| Method          | Path                                  | Permission                                                             | Notes                                                                                                                                                                      |
| --------------- | ------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET             | `/conversations`                      | `conversations:read`                                                   | `status`, `view` (all/mine/unassigned/unread), `channel`, `assigneeId`, `tag`, `priority`, `q`, `order` (waiting/newest/priority), pagination; returns `counts` per status |
| GET             | `/conversations/:id`                  | `conversations:read`                                                   |                                                                                                                                                                            |
| PATCH           | `/conversations/:id`                  | `conversations:manage`                                                 | `status`, `assigneeId` (must be a member), `priority`, `snoozedUntil` (future, required for SNOOZED); writes system events                                                 |
| POST            | `/conversations/:id/read` · `/unread` | `conversations:read`                                                   |                                                                                                                                                                            |
| GET             | `/conversations/:id/messages`         | `conversations:read`                                                   | page 1 = newest page, each page oldest-first                                                                                                                               |
| POST            | `/conversations/:id/messages`         | `conversations:reply`                                                  | `kind` REPLY or NOTE, body 1–4000 chars, optional `replyToId`                                                                                                              |
| POST            | `/conversations/bulk`                 | `conversations:manage`                                                 | ≤100 ids; ASSIGN_ME, MARK_READ, SNOOZE, RESOLVE; ids from other workspaces are ignored                                                                                     |
| PATCH           | `/customers/:customerId`              | `customers:update`                                                     | name, leadStatus, tags (≤20, deduped), notes                                                                                                                               |
| GET/POST/DELETE | `/saved-replies`                      | read: `conversations:read`; write: `savedreplies:manage` (Owner/Admin) | `{name}` variable                                                                                                                                                          |
| GET             | `/search?q=`                          | `conversations:read`                                                   | conversations + customers (orders do not exist yet)                                                                                                                        |

Replies are stored with `deliveryStatus: PENDING`. **Nothing is sent to WhatsApp/Instagram/Messenger yet** — provider
delivery and inbound ingestion are future work (see SECURITY.md webhook guidelines).

Realtime events (`/realtime`): `message:created`, `conversation:updated`, `conversation:read` carry ids only
(`{conversationId, messageId?}`); clients refetch over REST.

### Leads (under `/workspaces/:workspaceId/leads`)

| Method    | Path                                          | Permission                                         | Notes                                                                                                                                                                                                                         |
| --------- | --------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET       | `/`                                           | `leads:read`                                       | `q` (name/email/phone/company), `stages`, `sources` (comma lists), `owner` (`unassigned` or user id), `tag`, `createdFrom/To`, `minScore/maxScore`, `sort` (createdAt/name/score/lastActivityAt/dealValue), `dir`, pagination |
| GET       | `/summary`                                    | `leads:read`                                       | totals by stage, unassigned, conversion rate (Won ÷ (Won+Lost), `null` until a lead is closed), leads created in the last 30 days vs the 30 before                                                                            |
| POST      | `/`                                           | `leads:write`                                      | 409 on duplicate email (case-insensitive) or phone digits within the workspace; optional `customerId` links an Inbox customer                                                                                                 |
| GET/PATCH | `/:leadId`                                    | read / write                                       | stage/owner changes write timeline events and recompute the score                                                                                                                                                             |
| DELETE    | `/:leadId`                                    | `leads:delete`                                     | Owner/Admin only                                                                                                                                                                                                              |
| GET       | `/:leadId/activities` · POST `/:leadId/notes` | read / write                                       | newest first                                                                                                                                                                                                                  |
| POST      | `/bulk`                                       | `leads:write` (`DELETE` also needs `leads:delete`) | ASSIGN, SET_STAGE, ADD_TAGS, DELETE; ≤100 ids, workspace-scoped                                                                                                                                                               |
| GET       | `/export`                                     | `leads:read`                                       | CSV, same filters as the list, or `ids=`; ≤5000 rows; formula-injection safe                                                                                                                                                  |
| POST      | `/import`                                     | `leads:write`                                      | ≤1000 row objects; validated like manual create; duplicates are **skipped**, never merged; per-row error report                                                                                                               |

`conversationId` on a lead is the most recent Inbox conversation of its linked customer (or `null`).

**Lead score** is rules-based (`apps/api/src/modules/leads/lead-score.ts`, version `rules-v1`): email 15, phone 15, company 10,
job title 5, deal value 10, linked customer 10, plus stage points (New 0, Contacted 10, Qualified 20, Proposal 30, Won 35; Lost
capped at 10). It is **not** an AI prediction and the UI says so.

### Customers (under `/workspaces/:workspaceId/customers`)

Customers are the Inbox `Customer` records (one table; no duplicate model). The Inbox-era `PATCH` (name, leadStatus, tags, notes) now lives here.

| Method            | Path                                          | Permission                       | Notes                                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET               | `/`                                           | `customers:read`                 | `q` (name/email/phone/company/handle), `status`, `sources`, `owner`, `tag`, `createdFrom/To`, `segment`, `sort` (createdAt/name), `dir`, pagination. Items include `conversationCount`, newest `conversationId`, and `lastActivityAt` (newest conversation message, else last update) |
| GET               | `/summary`                                    | `customers:read`                 | total, active, with conversations, created in the last 30 days vs the 30 before                                                                                                                                                                                                       |
| POST              | `/`                                           | `customers:update`               | 409 on duplicate email (case-insensitive) or phone digits in the workspace; never merges                                                                                                                                                                                              |
| GET/PATCH         | `/:id`                                        | read / update                    | owner must be a member                                                                                                                                                                                                                                                                |
| DELETE            | `/:id`                                        | `customers:delete` (Owner/Admin) | **409 if the customer has conversations** (deleting would cascade message history); mark Inactive instead                                                                                                                                                                             |
| GET               | `/:id/activity` · `/conversations` · `/notes` | read                             | activity = created + conversations + notes (no tag/field history is recorded yet)                                                                                                                                                                                                     |
| POST/PATCH/DELETE | `/:id/notes[/:noteId]`                        | update                           | authors edit their own notes; delete own, or any with `customers:delete`                                                                                                                                                                                                              |
| POST              | `/bulk`                                       | `customers:update`               | ADD_TAGS, REMOVE_TAGS, ASSIGN, SET_STATUS on the listed ids only (≤100, workspace-scoped)                                                                                                                                                                                             |
| GET               | `/export`                                     | `customers:read`                 | CSV, filtered or `ids=`, ≤5000 rows, formula-injection safe                                                                                                                                                                                                                           |
| POST              | `/import`                                     | `customers:update`               | ≤1000 rows; duplicates skipped and reported per row                                                                                                                                                                                                                                   |

**Segments** (`segment=`): `new` = created ≤30 days ago; `recent` = a conversation message in the last 7 days; `inactive` = status Inactive or no
conversation message in 90 days; `tagged` = has ≥1 tag. Repeat-customer and high-value segments, revenue and lifetime value need Orders and are
shown as unavailable in the UI.

### Team management (under `/workspaces/:workspaceId`)

| Method                | Path                                           | Permission                                  | Notes                                                                                                                                                   |
| --------------------- | ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                   | `/team/summary`                                | `members:read`                              | members, active/suspended, pending invitations, unassigned open conversations (no presence is tracked)                                                  |
| GET                   | `/members`                                     | `members:read`                              | `q`, `role`, `status`, `team`, `sort` (name/role/createdAt, `-` prefix), pagination; each member has teams, `assignedOpenConversations`, `lastSignInAt` |
| GET                   | `/members/:memberId` · `/activity`             | read · `audit:read`                         | detail adds resolved-in-30-days; activity comes from the audit log                                                                                      |
| PATCH/DELETE          | `/members/:memberId`                           | `members:manage`                            | role (ADMIN/AGENT) and status (ACTIVE/SUSPENDED); remove clears the member's assignments and team links                                                 |
| GET/POST              | `/invitations`                                 | `members:manage`                            | POST returns a one-time `inviteUrl` (token stored only as a SHA-256 hash); `emailSent` is `false` — **no email is sent yet**                            |
| POST/DELETE           | `/invitations/:id/resend` · `/invitations/:id` | `members:manage`                            | resend rotates the token (old link dies); delete cancels                                                                                                |
| GET/POST/PATCH/DELETE | `/teams[/:teamId]`                             | read `members:read`, write `members:manage` | name unique per workspace; members and lead must belong to the workspace                                                                                |
| GET                   | `/invitations/preview?token=`                  | public, 10/min                              | workspace, email, role for a valid token                                                                                                                |
| POST                  | `/invitations/accept-new`                      | public, 10/min                              | new user sets name+password; email comes from the invitation; then sign in normally                                                                     |
| POST                  | `/invitations/accept`                          | bearer, 10/min                              | existing account accepts only if its email matches                                                                                                      |

**Role policy** (`@torio/types`): Owner can assign/manage Admin and Agent; Admin can manage Agents only; nobody can grant, change or remove the Owner role;
nobody can change or remove themself. A suspended membership is treated as a non-member everywhere (404), so access ends immediately.

### Brain (under `/workspaces/:workspaceId/brain`)

| Method | Path | Permission                  | Notes                                                                                                                                                                                                                                                                                                                                   |
| ------ | ---- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`  | `brain:read`                | `{ config, version, updatedAt, updatedBy }`. A workspace that never saved returns an **empty** config with `version: 0` (nothing is pre-filled)                                                                                                                                                                                         |
| PUT    | `/`  | `brain:write` (Owner/Admin) | `{ config, baseVersion }`. The document is validated against the shared Zod schema (`@torio/contracts` `brainConfigSchema`) **and** the same completeness rules the UI shows (`issuesOf`); a stale `baseVersion` returns **409** so concurrent edits are never silently overwritten. Writes an audit entry listing the changed sections |

The AI test panel in the web app is a **rule-based preview** (`previewReply` in `@torio/contracts`), not a language model. No AI endpoint exists yet, and
Inbox suggestions do not read Brain yet; when they do, they must use the last _saved_ version only.

### Channels (under `/workspaces/:workspaceId/channels`)

| Method | Path                     | Permission                      | Notes                                                                                                                     |
| ------ | ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                      | `channels:read`                 | Paged list with filters (`q`, `provider`, `status`, `sort`) and real conversation/unread counts                           |
| GET    | `/summary`               | `channels:read`                 | KPI counts by status and conversations in the last 30 days                                                                |
| GET    | `/providers`             | `channels:read`                 | Static catalog. Every provider reports `state: "unavailable"` with a reason, because no provider integration is built yet |
| GET    | `/:channelId`            | `channels:read`                 | Detail, including account mask, `lastHealthCheckAt` (null = never verified), `lastError`, defaults                        |
| GET    | `/:channelId/activity`   | `audit:read`                    | Audit entries for the channel                                                                                             |
| PATCH  | `/:channelId`            | `channels:manage` (Owner/Admin) | Name and default assignee/team. Assignee must be an active member, team must belong to the workspace. Audited             |
| POST   | `/:channelId/disconnect` | `channels:manage`               | Marks `DISCONNECTED`, keeps conversations and history. Audited                                                            |

There is no connect/reconnect endpoint: nothing can truthfully establish a provider connection yet. Seeded channels are labelled `isSample`.

### Orders (under `/workspaces/:workspaceId/orders`)

Money is integer **minor units** (cents) with one currency per order. The server computes and stores every total (`subtotal − discount + shipping + tax`); clients never send one. There is no product catalog or payment provider yet, so line items are custom and payments are **manual records** entered by staff. No refund endpoint exists.

| Method | Path                    | Permission                      | Notes                                                                                                                                                                                                                                          |
| ------ | ----------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                     | `orders:read`                   | Paged list. Filters: `q` (order #, customer name/email/phone), `status`, `paymentStatus`, `fulfillmentStatus` (comma lists), `channel`, `paymentMethod`, `createdFrom/To`, `minTotal/maxTotal`, `customerId`; sort `createdAt`/`total` + `dir` |
| GET    | `/summary`              | `orders:read`                   | KPIs for an optional period (`createdFrom`/`createdTo`). Revenue = payments recorded on non-cancelled orders created in the period, **per currency** (never summed across currencies). Comparison is only reported when a period is selected   |
| GET    | `/export`               | `orders:read`                   | CSV of the filtered set, or `ids=` selection (max 5000 rows, formula-injection safe)                                                                                                                                                           |
| POST   | `/`                     | `orders:write`                  | Create. `requestId` (UUID) makes retries idempotent. Customer and optional conversation must belong to the workspace. Numbers are sequential per workspace from #1001                                                                          |
| GET    | `/:orderId`             | `orders:read`                   | Detail with items, payments, notes, timeline, customer's recent conversations                                                                                                                                                                  |
| PATCH  | `/:orderId`             | `orders:write`                  | Items/discount/shipping/tax only while **Pending** and **no payment recorded** (409 otherwise); address and method until the order is closed                                                                                                   |
| POST   | `/:orderId/status`      | `orders:write`                  | Validated transition: Pending→Confirmed→Processing→Completed, any open state→Cancelled. Completed needs Fulfilled + Paid; Fulfilled orders can’t be cancelled. Stale writes get 409                                                            |
| POST   | `/:orderId/payments`    | `orders:payments` (Owner/Admin) | Records a payment already received (cash, transfer, …). Amount ≤ outstanding balance, not in the future, idempotent on `requestId`. Never contacts a provider                                                                                  |
| PUT    | `/:orderId/fulfillment` | `orders:write`                  | Unfulfilled→Processing→Fulfilled (forward only, needs a confirmed order). Carrier and tracking are staff-entered; tracking links must be http(s)                                                                                               |
| POST   | `/:orderId/notes`       | `orders:write`                  | Internal note. `PATCH`/`DELETE /notes/:noteId`: authors edit their own; delete also by `orders:payments`                                                                                                                                       |
| POST   | `/bulk`                 | `orders:write`                  | `{ ids, action: 'SET_STATUS', status }` (max 100). Each order is checked individually; response lists `updated` and `failed[{id, number, reason}]`                                                                                             |

### Dashboard analytics (under `/workspaces/:workspaceId/dashboard`)

- `GET /analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&compare=none|previous_period|previous_year` (`workspace:read`). Returns revenue (per currency, never summed across currencies), orders, customers (total/new), the point-in-time subscription (only with `billing:read`, otherwise `null`), bucketed series, recent activity and an optional comparison.
- Optional `channel=WHATSAPP|INSTAGRAM|MESSENGER` limits conversations (by channel), leads and customers (by source), and orders/revenue (by the conversation an order came from).
- `messaging` (`total` = conversations with a customer or agent message in the range, `new`, `resolved` via `Conversation.resolvedAt`, current `waiting`/`unread`), `leads.total`, and `series.conversations|newConversations|resolvedConversations|leads`.
- Optional `granularity=day|week|month` (only groupings `granularityOptions(days)` allows for the range; else 400). `byChannel` splits each KPI by channel for the whole range, ignoring the channel filter, with an `unattributed` remainder.
- `attention` (current state, not range-filtered): conversations waiting over 2 hours (with the oldest), waiting for a reply (average wait), open leads scored 70+ idle for 24h, pending orders. Complaints aren't classified, so they're never reported.
- **Date contract:** `from`/`to` are inclusive calendar dates in the workspace's `reportingTimeZone` (default `UTC`, set in Settings → Workspace). The server converts them to half-open UTC bounds `[start, endExclusive)`, so DST days (23h/25h) and month/leap-year boundaries are exact. `to` may not be in the future in that zone; `from <= to`; at most 731 days.
- Granularity is day (≤31 days), week (≤183, Monday start) or month. Revenue counts payments (`paidAt`) on non-cancelled orders.
- Comparison reports `coverage` (`full`/`partial`/`none`) against the workspace's `dataSince`; `% change` is `null` when the previous value is 0 or there is no history, so no misleading percentages.

### WhatsApp (see `docs/WHATSAPP.md`)

- `POST /workspaces/:id/channels/whatsapp/connect` (`channels:manage`): verifies the number with Meta, stores the encrypted token.
- `POST /workspaces/:id/channels/:channelId/health` (`channels:manage`): live check; returns `ok`, `qualityRating`, `error`.
- `POST /workspaces/:id/messages/:messageId/retry` (`conversations:reply`): retries a FAILED outgoing message.
- `GET|POST /webhooks/whatsapp`: public Meta callbacks (verify token; HMAC-signed POST). Not part of the OpenAPI document.
- Messages now include `failureReason` (why a send failed).

### Account and settings

| Method | Path                               | Permission                       | Notes                                                                                                                                                                              |
| ------ | ---------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/users/me`                        | signed in                        | Profile incl. `phone`, `jobTitle`, `timeZone` (IANA, null = browser), `landingPage`                                                                                                |
| PATCH  | `/users/me`                        | signed in                        | Strict body: `name`, `phone`, `jobTitle`, `timeZone`, `landingPage` only. Email, role and status are rejected (400). Omitted fields are left unchanged; `""` clears                |
| POST   | `/users/me/password`               | signed in                        | `{ currentPassword, newPassword }`. Wrong current password → 400 (not 401, so clients don’t treat it as an expired session). Signs out all other devices; throttled 5/min. Audited |
| GET    | `/users/me/sessions`               | signed in                        | One row per signed-in device (token family): device label, IP, last active, `current`. Never returns tokens or hashes                                                              |
| DELETE | `/users/me/sessions/:sessionId`    | signed in                        | Signs that device out. Own sessions only (404 otherwise); the current device is refused                                                                                            |
| POST   | `/users/me/sessions/revoke-others` | signed in                        | Signs out every other device                                                                                                                                                       |
| GET    | `/users/me/export`                 | signed in                        | The caller’s own data as JSON (profile, memberships, devices); no password data or tokens                                                                                          |
| PATCH  | `/workspaces/:workspaceId`         | `workspace:update` (Owner/Admin) | `name`, `description`, `defaultCurrency`, `contactEmail`. The slug never changes. Audited                                                                                          |
| GET    | `/workspaces/:workspaceId/audit`   | `audit:read` (Owner/Admin)       | Paged workspace audit log, optional `q` filter on the action                                                                                                                       |

### Automations (under `/workspaces/:workspaceId/automations`)

A workflow is `trigger → ordered steps`, where a step is a **condition gate** (all conditions must match or the run ends as _skipped_), an **action** or a **wait**. The definition is typed, versioned (`schemaVersion`) and allowlisted: no scripting, branching, loops or external calls. The trigger, field, operator, action and variable registry lives in `@torio/contracts` (`automations.ts`) and is shared by the API (validation + execution) and the editor.

| Method    | Path                             | Permission                          | Notes                                                                                                                    |
| --------- | -------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET       | `/`, `/summary`                  | `automation:read`                   | Directory (filters `q`, `status`, `trigger`; sort `updatedAt`/`name`/`lastRun`) and 30-day metrics from real run records |
| POST      | `/`                              | `automation:write`                  | Create a **draft** from `trigger` or `templateKey`                                                                       |
| GET/PATCH | `/:id`                           | read / write                        | Detail with draft definition and validation issues. PATCH saves the draft (optimistic `baseRevision`, stale → 409)       |
| POST      | `/:id/validate`                  | `automation:write`                  | Server-side validation of the draft (also checks assignees are active members)                                           |
| POST      | `/:id/test`                      | `automation:write`                  | Dry run with explicit sample data. Reads and changes nothing; stored as a test run, excluded from history/metrics        |
| POST      | `/:id/publish`                   | `automation:activate` (Owner/Admin) | Re-validates, snapshots an immutable version and makes it live. Also publishes edits to an active automation             |
| POST      | `/:id/deactivate`                | `automation:activate`               | Stops new runs; waiting/queued runs are cancelled; history kept                                                          |
| POST      | `/:id/duplicate`, DELETE `/:id`  | write / activate                    | Delete is refused while active and removes run history                                                                   |
| GET       | `/executions`, `/executions/:id` | `automation:read`                   | Run history (filters `automationId`, `status`, `includeTests`) and step-by-step timeline with the redacted event context |
| POST      | `/executions/:id/retry`          | `automation:activate`               | Re-queues a FAILED run from the step that failed                                                                         |

**Events emitted today** (after the domain transaction commits): `lead.created`, `lead.stage_changed`, `customer.created`, `order.created`, `order.status_changed`, `order.payment_recorded`, `conversation.assigned`, `conversation.status_changed`. Imports don’t emit. **Actions:** internal notes (conversation/order), assign conversation, set conversation status, add/remove customer tag, set lead stage, assign lead owner, plus **Wait**.

### Billing (under `/workspaces/:workspaceId/billing`; webhook at `/billing/webhooks/stripe`)

Billing is provider-agnostic behind a `BillingProvider` interface (`apps/api/src/modules/billing/provider`). Stripe is implemented over its REST API and is active only when `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `BILLING_PRICE_IDS` are set; otherwise an `UnconfiguredProvider` refuses every payment operation (503). **Subscription, invoice and payment-method state is written only from signature-verified webhook events**: action endpoints ask the provider to change something and return `accepted`, and the UI shows the result once the webhook arrives. The browser never sends a price, amount or status. Card data is never handled: cards are added on the provider's hosted page and Torio keeps brand, last four and expiry.

| Method      | Path                                                   | Permission                   | Notes                                                                                                                                               |
| ----------- | ------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET         | `/overview`, `/plans`, `/usage`, `/profile`            | `billing:read` (Owner/Admin) | Overview (plan, status, next payment, actions allowed), plan catalog, real usage counts vs plan limits, billing profile                             |
| PUT         | `/profile`                                             | `billing:manage` (Owner)     | Strict validation; audited                                                                                                                          |
| GET         | `/payment-methods`                                     | read                         | Display data only                                                                                                                                   |
| POST        | `/payment-methods/session`                             | manage                       | Hosted card-entry link                                                                                                                              |
| POST/DELETE | `/payment-methods/:id/default`, `/payment-methods/:id` | manage                       | Provider call first, then local update; the only card on an active subscription can't be removed                                                    |
| GET         | `/invoices`, `/invoices/:id`, `/invoices/:id/pdf`      | read                         | Mirrored provider invoices (filter `status`, paged); PDF rendered from the stored record                                                            |
| POST        | `/invoices/:id/retry`                                  | manage                       | Failed invoices only; provider retries payment                                                                                                      |
| POST        | `/subscription/preview`                                | read                         | Upgrade/downgrade classification, gained/lost features, usage above new limits, effective date. Proration amounts are the provider's, not estimated |
| POST        | `/subscription/checkout`                               | manage                       | Hosted checkout link for a plan with a configured price id                                                                                          |
| POST        | `/subscription/change`, `/cancel`, `/resume`           | manage                       | Downgrades over the new limits need `acknowledgeOverage`; cancel at period end or immediately; resume a scheduled cancellation                      |
| POST        | `/billing/webhooks/stripe`                             | public + signature           | HMAC-SHA256 over the raw body, 5-minute tolerance. Idempotent on the event id; stale events can't roll state back                                   |

Plans live in `apps/api/src/modules/billing/plans.ts` with **placeholder pricing** (flagged in the API and UI) until real prices are configured.

### Super Admin (`/api/v1/admin`)

A separate system for the platform operator. Admin accounts live in their own table (`PlatformAdmin`) and are created only by the `pnpm admin:create` command: there is no HTTP route that creates or promotes one. Sign-in (`POST /admin/auth/login`, throttled 5/min) issues an opaque, HttpOnly, `SameSite=Strict` cookie (`torio_admin`, path `/api/v1/admin`, 8 h) backed by a server-side session (only its SHA-256 is stored). `AdminGuard` checks the session, the account’s active flag and role on **every** request; state-changing requests also need the `X-Torio-Admin: 1` header. Customer JWTs don't work here and the admin cookie doesn't work on customer routes.

| Area          | Endpoints                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/profile`, `POST /auth/password` (verifies the current password, signs other sessions out) |
| Dashboard     | `GET /dashboard`: counts, MRR per currency, 6-month paid-invoice revenue, recent customers/subscriptions, failed payments                                       |
| Customers     | `GET /customers` (`q`, `status`, `subscription`, paged), `GET /customers/:id`, `POST /customers/:id/suspend` / `reactivate` (reason required)                   |
| Workspaces    | `GET /workspaces`, `GET /workspaces/:id`, `POST …/suspend` / `reactivate` (reason required), `POST …/assign-plan`                                               |
| Subscriptions | `GET /subscriptions` (`status`, `q`), `GET /subscriptions/:id` (invoices + payment events), `POST …/cancel`, `POST …/resume`                                    |
| Plans         | `GET/POST /plans`, `PATCH /plans/:key`, `POST /plans/:key/status` (ACTIVE / DISABLED / ARCHIVED, reason required)                                               |
| Activity      | `GET /activity?source=admin                                                                                                                                     | payments&q=` (read-only) |
| Settings      | `GET/PATCH /settings` (branding, registration switch; provider status shows presence only, never secrets)                                                       |

Provider-backed subscription changes (cancel, resume, plan change) are only **requested**: the response says `pending: true` and local state changes when the signed webhook confirms. A workspace with no paid subscription can be given a complimentary **manual** plan (`source = MANUAL`), applied locally (`pending: false`), excluded from MRR. Suspending a customer revokes all their sessions and blocks every workspace request immediately; suspending a workspace answers 403 for all its members.

MRR = sum of the recorded recurring price (from provider events) of ACTIVE, provider-billed subscriptions, yearly ÷ 12, per currency (never summed across currencies). Canceled, expired, past-due, trialing and manual plans are excluded; subscriptions with no recorded price are reported, not guessed.

## Conventions

- **Success**: the resource, or `{ data: T[], meta: { page, pageSize, total, totalPages } }` for lists. No extra envelope.
- **Errors**: `{ "error": { "code", "message", "statusCode", "requestId", "details?" } }`. Codes: `VALIDATION_ERROR`,
  `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`, …
  `details` (validation only) is `[{ path, message }]`. Stack traces and internals never leave the server.
- **Pagination**: `?page=1&pageSize=20` (max 100).
- **Sorting**: `?sort=createdAt` or `?sort=-createdAt` (allow-listed fields per endpoint).
- **Filtering**: plain query params per endpoint, validated by Zod (none defined yet).
- **IDs**: UUID v7. **Timestamps**: ISO-8601 UTC strings.
- **Tracing**: send `X-Request-Id` (8–64 chars `[A-Za-z0-9._-]`) or one is generated; it is returned in the header.

## Auth contract

- Access token: JWT HS256, 15 min, `Authorization: Bearer`. Payload `{ sub: userId, sid: sessionId }`.
- Refresh token: opaque 384-bit random, stored only as SHA-256, single-use (rotated on every refresh). Replaying a
  rotated token revokes the entire token family.
- Browsers: refresh token in `torio_rt` cookie (HttpOnly, SameSite=Lax, Secure in production, path `/api/v1/auth`);
  never in the response body. Access token is held in memory.
- Mobile: send `X-Torio-Client: mobile`; the refresh token is returned in the body and sent back in the body.
- Authorization: roles `OWNER | ADMIN | AGENT` → permissions (`apps/api/src/modules/authorization/permissions.ts`).
  Workspace-scoped routes take the workspace **only** from `:workspaceId` and check membership server-side; non-members
  receive `404`, members lacking permission `403`.

## Clients

- TypeScript: `@torio/api-client` (openapi-fetch; types generated into `packages/api-client/src/schema.d.ts`).
- Dart: see [MOBILE_READINESS.md](MOBILE_READINESS.md).
