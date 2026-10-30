# Torio

AI-powered omnichannel messaging, CRM and sales SaaS for eCommerce businesses.

This repository is the **foundation**: monorepo, API, database, worker, auth/multi-tenancy core, and the web
dashboard shell. It is not a finished product — see [What is not built yet](#what-is-not-built-yet).

| App / package         | What it is                                                                       |
| --------------------- | -------------------------------------------------------------------------------- |
| `apps/web`            | Next.js 16 (React 19, Tailwind v4) web app — dashboard shell                     |
| `apps/api`            | NestJS 11 REST API, OpenAPI docs, Socket.IO gateway                              |
| `apps/worker`         | BullMQ worker (separate process)                                                 |
| `packages/contracts`  | Zod schemas shared by API validation, OpenAPI and web forms                      |
| `packages/types`      | Shared TS types/constants (roles, permissions, error envelope, events)           |
| `packages/api-client` | Typed REST client generated from the API's OpenAPI document                      |
| `packages/database`   | Prisma client factory (Prisma 7 + `pg` adapter); generated client is git-ignored |
| `packages/config`     | Shared ESLint config                                                             |
| `prisma/`             | Schema, migrations, seed (single source of truth)                                |

## Requirements

- Node.js ≥ 22 (developed on 24), pnpm ≥ 11
- PostgreSQL 16 and Redis 7 — via Docker (`docker compose`) **or** installed locally
- Flutter is **not** required yet (mobile comes after the web app is stable)

## Setup

```bash
pnpm install
cp .env.example .env        # never overwrite an existing .env
# edit .env: set a real JWT_ACCESS_SECRET (openssl rand -base64 48) and DB password
```

### Infrastructure

With Docker:

```bash
docker compose up -d postgres redis
```

Without Docker, install PostgreSQL 16 and Redis locally (e.g. `brew install postgresql@16 redis`), create a
database/user matching `DATABASE_URL`, and start both. Nothing in this repo pretends Docker is running; the API
`/api/v1/health/ready` endpoint reports the real state of each dependency.

### Database

```bash
pnpm db:generate     # generate the Prisma client
pnpm db:migrate      # create/apply migrations in development
pnpm db:seed         # demo workspace + owner/admin/agent users (prints a dev password once)
```

Production/CI uses `pnpm db:deploy` (applies committed migrations only).

### Run

```bash
pnpm dev             # web :3000, api :4000, worker (health :4100) — all in one stream
```

- Web: http://localhost:3000 (dashboard), `/inbox`, `/leads`, `/customers`, `/team`, `/brain`, `/channels`, `/orders`, `/automation`, `/settings` (profile, preferences, security, workspace, audit log), `/status` (live API readiness via the typed client), `/login`
- API docs (non-production): http://localhost:4000/docs
- Dashboard state previews: `/?demo=loading`, `/?demo=empty`, `/?demo=error`

### Test, lint, build

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e                      # Playwright smoke tests (needs a prior `pnpm build`; uses system Chrome)
TEST_DATABASE_URL=postgresql://… pnpm test   # also runs the real-Postgres integration tests
TEST_REDIS_URL=redis://localhost:6379 pnpm test   # also runs the real-Redis worker test
pnpm api:openapi                   # regenerate apps/api/openapi.json and the TypeScript client types
```

## What is not built yet

Channel delivery/ingestion (the Inbox UI and API exist; replies are stored but not sent), AI execution (Brain stores configuration and has a rule-based preview; Inbox AI Assist is not connected), product catalog, payment provider and refunds, carrier integration, two-factor auth, notification delivery, billing, provider connection/OAuth for channels, message-sending automation actions, branching workflows, billing, push notifications, Flutter app.
Auth gaps: email-verification and password-reset **endpoints** (tables and token model exist), account lockout,
MFA, invitation email delivery, presence/availability, bulk member actions. The web dashboard shows **fictional demo data** and its route is
not auth-gated yet. See [docs/SECURITY.md](docs/SECURITY.md).

## Troubleshooting

- `P1001 Can't reach database` — Postgres not running or wrong `DATABASE_URL`/port.
- `/health/ready` returns 503 — a required dependency is down; the body says which. Set `REDIS_REQUIRED=false` to
  run without Redis (the worker still needs it).
- `Invalid environment configuration` at API start — variable names are listed, values never are.
- pnpm warns about ignored build scripts — allow-list lives in `pnpm-workspace.yaml` (`allowBuilds`).

More: [ARCHITECTURE](docs/ARCHITECTURE.md) · [API](docs/API.md) · [DATABASE](docs/DATABASE.md) ·
[DEVELOPMENT](docs/DEVELOPMENT.md) · [SECURITY](docs/SECURITY.md) · [MOBILE_READINESS](docs/MOBILE_READINESS.md) ·
[DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md)
