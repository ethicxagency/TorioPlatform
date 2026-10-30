# Database

PostgreSQL 16 via Prisma 7. Schema: `prisma/schema.prisma` (one copy). Migrations: `prisma/migrations`.
Config: `prisma.config.ts` (datasource URL from `DATABASE_URL`). Generated client: `packages/database/src/generated`
(git-ignored, produced by `pnpm db:generate` / the `database` package build).

## Current models

- `User` — unique lower-cased `email`, Argon2id `passwordHash`, `status`, `emailVerifiedAt`.
- `Workspace` — tenant; unique `slug`; `createdById` (SET NULL on user delete).
- `WorkspaceMembership` — `(workspaceId, userId)` **unique**, `role` enum (OWNER/ADMIN/AGENT), cascades from both
  sides, indexed by `userId` and `(workspaceId, role)`. A user may belong to many workspaces.
- `Session` — one row per refresh token: `familyId`, SHA-256 `refreshTokenHash` (unique), `expiresAt`, `revokedAt`.
- `EmailToken` — hashed one-time tokens for `EMAIL_VERIFICATION` / `PASSWORD_RESET` (model ready; endpoints not built).
- `AuditLog` — append-only security/audit events (`workspaceId`, `actorId`, `action`, `metadata`).

Inbox models (migration `…_inbox`): `Channel` (provider enum, status; **no credentials stored**), `Customer` (lead status,
tags, notes, `isSample` flag for seed data), `Conversation` (status OPEN/SNOOZED/RESOLVED, priority, `assigneeId`,
`unreadCount`, `waitingSince`, denormalised `lastMessageAt/Preview`), `Message` (kind INBOUND/OUTBOUND/NOTE/EVENT,
`deliveryStatus`, `externalId` unique per conversation for idempotent ingestion), `SavedReply`. All carry `workspaceId`;
services always filter by it. Cross-tenant references (e.g. a conversation's channel) are validated in services, not by FK.

Leads (migration `…_leads`): `Lead` (stage enum New→Lost, source enum, owner, tags, `dealValue` in whole currency units,
server-computed `score`, optional `customerId` → Inbox `Customer`) with `@@unique([workspaceId, email])` and
`@@unique([workspaceId, phoneKey])` (digits-only phone) for duplicate protection, and `LeadActivity` (CREATED,
STAGE_CHANGED, OWNER_CHANGED, NOTE). The Inbox `Customer.leadStatus` is a separate, lighter field used in the Inbox
profile; the two are not synchronised yet.

Customers (migration `…_customers`): `Customer` gained `company`, `address`, `source` (reuses `LeadSource`), `status` (ACTIVE/INACTIVE),
`ownerId`, digits-only `phoneKey`, and unique `(workspaceId, email)` / `(workspaceId, phoneKey)`; the migration backfills keys from existing rows
(older duplicates keep NULL). `CustomerNote` stores team-only notes with an author. `Customer.notes` (single scratch text) remains for the Inbox profile.

Team (migration `…_team`): `WorkspaceMembership.status` (ACTIVE/SUSPENDED); `Invitation` (hashed token, role, optional team, expiry, accepted/revoked timestamps; a partial
unique index allows one live invitation per workspace+email); `Team` (name unique per workspace, lead) and `TeamMembership`. Membership, invitation and team changes write `AuditLog` rows.

Brain (migration `…_brain`): `BrainConfig` — exactly one row per workspace (`workspaceId` unique) holding the validated JSON document in `data`, an optimistic-concurrency `version`,
and `updatedById`. A document (not relational tables) keeps the many nested, user-shaped structures (custom fields, rule trees) atomic with one save; the schema and limits live in `@torio/contracts/src/brain.ts`.

Channels (migration `…_channels`): `Channel` gains `accountName`, `accountMask` (never a full identifier or token), `connectedAt`, `disconnectedAt`, `lastHealthCheckAt`, `lastError`, `defaultAssigneeId`, `defaultTeamId` and `isSample`; the status enum is now `CONNECTED | DISCONNECTED | NEEDS_ATTENTION | EXPIRED`. No credentials are stored.

Orders (migration `…_orders`): `Order` (money in integer minor units, one `currency`, frozen `subtotal/discount/shipping/tax/total`, `paidMinor`, three **separate** states `status` / `paymentStatus` / `fulfillmentStatus`, manual shipment fields, idempotency `requestId`, per-workspace `number` unique with `workspaceId`), `OrderItem`, `OrderPayment` (a manual record, not a provider transaction), `OrderNote`, `OrderEvent` (append-only timeline). `Workspace.orderSeq` issues numbers inside the create transaction. Orders reference `Customer` (restrict delete) and optionally `Conversation` (set null). There are no product, inventory, refund or payment-provider tables.

Settings (migration `…_settings`): `User` gains `phone`, `jobTitle`, `timeZone`, `landingPage`; `Workspace` gains `description`, `defaultCurrency`, `contactEmail`. Sessions (`Session`) are listed per token family; revoking a device revokes its whole family.

Automation (migration `…_automation`): `Automation` (draft definition JSON, `draftRevision`, live `publishedVersion`), `AutomationVersion` (immutable snapshots), `AutomationExecution` (one run; `eventKey` is unique per automation so a replayed event can’t start twice; per-step log, `currentStep`, `attempts`, `resumeAt` for waits/retries, redacted `context`). Test runs are rows with `isTest = true`.

All ids are UUID v7 (`@db.Uuid`); all tables have `createdAt`/`updatedAt` where mutable.
Roles are an enum; role → permission mapping is in code (see ARCHITECTURE).

## Migration status

`20261029000000_init` was generated with `prisma migrate diff` and **applied successfully** to a local PostgreSQL 16
(`prisma migrate deploy`), after which the seed ran. Use `pnpm db:migrate` for new development migrations.

## Planned domain (not created yet)

Every tenant-owned table gets `workspaceId` (NOT NULL, FK, indexed first in composite indexes) so isolation can be
enforced in queries and, later, optionally with Postgres row-level security.

```
(Channel, Customer, Conversation, Message, SavedReply now exist — see above.)
Customer 1─* Lead,  Customer 1─* Order 1─* OrderItem,  Conversation 0..1─* Order/Lead (attribution)
Workspace 1─* BrainKnowledge, CustomBrainField, BrainInstruction, BrainRule
Workspace 1─* AutomationWorkflow 1─* AutomationRun
User 1─* Notification (workspaceId),  Workspace 1─1 Subscription (billing) 1─* Invoice
```

Add these feature by feature, each with a migration and tenant-isolation tests.
