#!/usr/bin/env node
// Explicit database release step: applies pending Prisma migrations, once per release, and nothing else.
//
//   pnpm db:deploy            check, then apply only if something is pending
//   pnpm db:migrate:status    read-only status (no changes)
//
// Run it from the platform's release / pre-deploy phase (or by hand) BEFORE the new application version takes traffic.
// It is never attached to dev, build, start, postinstall or a health check, and application code never runs it.
//
// - Reads DATABASE_URL from the environment (prisma.config.ts); it is never printed.
// - Does nothing when the database is already up to date.
// - Stops (exit 1) on a failed or unrecognised migration state: a human must look at that, nothing is guessed or marked applied.
// - `prisma migrate deploy` takes Postgres' advisory lock itself, so two release processes cannot apply at once.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prisma = createRequire(resolve(root, 'package.json')).resolve('prisma/build/index.js');
const log = (m) => console.log(`[db-deploy] ${m}`);

if (!process.env.DATABASE_URL) {
  log('DATABASE_URL is not set; nothing to do.');
  process.exit(1);
}

const run = (args, inherit) =>
  spawnSync(process.execPath, [prisma, ...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });

// 1. Read-only status.
const st = run(['migrate', 'status']);
const out = `${st.stdout ?? ''}${st.stderr ?? ''}`;
if (/Database schema is up to date/i.test(out)) {
  log('database is up to date; no migration needed.');
  process.exit(0);
}
if (
  /failed|rolled back|P3009|P3018|drift|diverge/i.test(out) &&
  !/have not yet been applied/i.test(out)
) {
  console.error(out);
  log(
    'a migration is in a failed or inconsistent state. Not applying anything; resolve it by hand.',
  );
  process.exit(1);
}
if (!/have not yet been applied|not been applied|pending/i.test(out)) {
  console.error(out);
  log(
    'could not tell whether migrations are pending (is the database reachable?). Not applying anything.',
  );
  process.exit(1);
}
const pending = out
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^\d{14}_/.test(l));
log(`pending migrations: ${pending.length ? pending.join(', ') : '(see status)'}`);

// 2. Apply, once.
const r = run(['migrate', 'deploy'], true);
if (r.status !== 0) {
  log('migrate deploy failed; the release must not continue.');
  process.exit(r.status ?? 1);
}
log('migrations applied.');
