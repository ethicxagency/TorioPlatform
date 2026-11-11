# Torio: working rules for Claude Code

## Database migrations (read before touching Prisma)

Prisma Client generation and database migration are different things. `prisma generate` (`pnpm db:generate`) only writes
the client and never touches a database. A migration changes a database. See `docs/DATABASE.md#migrations-workflow`.

1. Never run `prisma migrate deploy` automatically after a code change, or "to be safe".
2. Never run production migrations while debugging. A production error is diagnosed by reading status and logs first.
3. Before proposing a migration, check whether `prisma/schema.prisma` actually changed.
4. If the schema did not change, do not create a migration.
5. If a schema change is needed, create a proper migration (`pnpm db:migrate`), explain what it does, and commit it.
6. Run a production migration only when explicitly preparing a database deployment, and only when the user has said to.
   Use `pnpm db:migrate:status` (read-only) first; run `pnpm db:deploy` only if something is genuinely pending.
7. Do not re-run a migration that has been applied. `db:deploy` skips an up-to-date database; so should you.
8. Always say which one you mean: Prisma Client generation (`db:generate`) or a database migration (`db:deploy`).

Also: never `prisma migrate reset` or `prisma db push` against production, never edit or delete an applied migration, never
mark a migration applied without checking the real schema, and never print or log `DATABASE_URL` or other secrets. Production
database or environment changes need an explicit instruction. The user applies Neon migrations themselves unless they ask otherwise.

Migrations never belong in `dev`, `build`, `start`, `postinstall`, workers, health checks or request handling.

## Local development

- API: `pnpm --filter @torio/api dev` (port 4000). Web: `pnpm --filter @torio/web dev` (port 3000).
- After pulling or switching branches, check `pnpm db:migrate:status` on the local database; apply with `pnpm db:migrate`
  (development) only if something is pending.
- API tests use a real PostgreSQL: set `TEST_DATABASE_URL` to a local `torio_test` database.
