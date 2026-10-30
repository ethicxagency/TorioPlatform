# Architecture

API-first, multi-tenant **modular monolith** in a pnpm + Turborepo monorepo. No microservices.

## Processes

```
 Browser (Next.js)  ─┐                     ┌── PostgreSQL (Prisma)
 Flutter (later)    ─┼─ REST /api/v1 ─ API ┤
                     └─ Socket.IO ──────── ┼── Redis ── BullMQ ── Worker
```

- **web** only talks to the API through `@torio/api-client`. It uses no Next.js server actions or route handlers for
  business logic, so every capability is available to the mobile app.
- **api** owns all business logic, auth, authorization and data access.
- **worker** consumes BullMQ queues (`system`, `webhooks`, `notifications`, `automation`, `ai`). Long-running work
  (webhook processing, AI, automations) must be enqueued, never run inside an HTTP handler.

## Module boundaries (`apps/api/src`)

| Module                  | Responsibility                                                         |
| ----------------------- | ---------------------------------------------------------------------- |
| `config`                | Zod-validated env, fails fast at startup                               |
| `database`              | `PrismaService` (lazy pg adapter), `RedisService`                      |
| `modules/auth`          | register/login/refresh/logout, Argon2id, JWT access + rotating refresh |
| `modules/users`         | profile                                                                |
| `modules/workspaces`    | workspaces the caller belongs to, members (paginated)                  |
| `modules/authorization` | role → permission matrix, membership lookup                            |
| `modules/health`        | liveness + readiness                                                   |
| `modules/realtime`      | Socket.IO gateway                                                      |
| `common/*`              | decorators, guards, exception filter                                   |

Controllers are thin (parse → call service → return). Services use Prisma directly; add repositories only when a
module earns one.

## Request flow

1. `helmet`, body limit (100 KB), cookie parser, CORS allow-list.
2. pino-http assigns/accepts `X-Request-Id` (correlation id; echoed in responses and error bodies).
3. `ThrottlerGuard` (120/min global, 5/min on login/register, 20/min on refresh).
4. `JwtAuthGuard` (global; opt out with `@Public()`).
5. `WorkspaceAccessGuard` on routes with `@RequirePermission(...)` — loads membership for `:workspaceId` from the DB.
6. `ZodValidationPipe` validates body/query against `@torio/contracts` schemas.
7. Service logic → Prisma.
8. `AllExceptionsFilter` shapes every error into `{ error: { code, message, statusCode, requestId, details? } }`.

## Database responsibilities

PostgreSQL is the source of truth. Constraints (unique, FK, cascade) enforce integrity; application code enforces
authorization. See [DATABASE.md](DATABASE.md).

## Worker

Separate Node process (`apps/worker`). One BullMQ `Worker` per queue, default policy: 5 attempts, exponential backoff
(2 s base), failed jobs retained 7 days, structured JSON logs per job event, `/health` on `WORKER_HEALTH_PORT`.
Handlers are looked up by job name in `processors.ts` and must validate payloads (never trust the queue) and be
**idempotent** — use deterministic `jobId`s (e.g. `webhook:<provider>:<eventId>`) so duplicate enqueues collapse.

## Real-time

Namespace `/realtime`. Clients connect with `auth: { token: <access JWT> }`; the connection is dropped when the token
expires (client refreshes and reconnects). Rooms: `ws:<workspaceId>` and `ws:<workspaceId>:conv:<conversationId>`.
Joining requires a DB-verified membership with `conversations:read`. Event names live in `@torio/types`
(`SOCKET_EVENTS`). Events are **hints**: after any reconnect the server emits `system:resync` and clients refetch via
REST. Today only join/leave/subscribe/ping are implemented; publish helpers exist for the future Inbox service.
Scaling beyond one API instance needs the Socket.IO Redis adapter (not yet wired).

## Web and mobile share one backend

Same endpoints, auth, permissions, OpenAPI contract. See [MOBILE_READINESS.md](MOBILE_READINESS.md).

## Deviations from the brief

- `packages/database` was added so API, worker and seed share one generated Prisma client (Prisma 7 requires explicit
  output; the schema stays at `prisma/schema.prisma`).
- NestJS **11** (not 12): `nestjs-zod` does not yet support Nest 12. Prisma **7.10** (latest stable; 8.x is rc).
- `noUncheckedIndexedAccess` is off in `apps/web` only (all other strict flags on).

## Automation engine

Intake: domain services call `AutomationEngine.emitEvent` after their transaction commits; for each ACTIVE automation with that trigger an execution row is inserted (unique on automation + event key). Execution: the engine claims due rows with `FOR UPDATE SKIP LOCKED` (so queued runs and waits survive restarts and several API instances never double-run), executes step by step, and commits each action together with its progress marker (guarded on the step number). Transient errors retry with backoff (3 attempts); configuration/data errors fail once with a reason. Automation-made changes never emit events, so automations cannot trigger each other. The scheduler is an in-process 10 s tick inside the API; the BullMQ `automation` queue name is reserved but unused because the worker app has no domain services yet. Moving the tick into the worker is the natural next step. Disabled under `NODE_ENV=test` (tests call `tick()`).
