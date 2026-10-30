# Development

## Daily loop

```bash
docker compose up -d postgres redis   # or local services
pnpm dev                              # turbo runs web, api, worker with persistent streaming logs
```

`pnpm dev` first builds workspace packages (`^build`), then runs each app's `dev` task. Failures are not hidden: turbo
streams every process's output and exits if one crashes.

## Scripts (root)

| Script                        | Does                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `dev` / `build`               | turbo across apps and packages                                       |
| `lint` / `typecheck` / `test` | turbo; `test:e2e` runs Playwright in `apps/web`                      |
| `format` / `format:check`     | Prettier                                                             |
| `db:generate` / `db:validate` | Prisma client / schema validation                                    |
| `db:migrate` / `db:deploy`    | dev migrations / apply committed migrations                          |
| `db:seed` / `db:studio`       | seed (refuses in production) / Prisma Studio                         |
| `api:openapi`                 | build API, write `apps/api/openapi.json`, regenerate TS client types |

## Changing the API contract

1. Edit/add a Zod schema in `packages/contracts` and use `createZodDto(schema)` in the controller.
2. `pnpm --filter @torio/contracts build && pnpm api:openapi`.
3. Commit the updated `openapi.json` and `schema.d.ts`.

## Tests

- API: Vitest + SWC (decorator metadata). In-memory Prisma fake for e2e-style tests with supertest; real Postgres
  tests run when `TEST_DATABASE_URL` is set.
- Worker: unit tests always; real-Redis test when `TEST_REDIS_URL` is set.
- Web: Vitest (jsdom) for model/hooks/components; Playwright for smoke (`playwright.config.ts` serves the production build on :3100).

## Conventions

- Env is validated at startup (API/worker) — add new variables to the Zod schema **and** `.env.example`.
- Never commit `.env`. Seed passwords are generated per run and printed once.
- In `apps/api`, do not auto-convert imports to `import type`; Nest DI needs runtime imports (ESLint rule is off there on purpose).
