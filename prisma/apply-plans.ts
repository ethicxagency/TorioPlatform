import 'reflect-metadata';
import 'dotenv/config';
import { createPrismaClient } from '@torio/database';
import { applyOfficialPlans } from '../apps/api/src/modules/billing/official-plans';

/**
 * Writes the official Starter / Growth / Scale plans to the database. Dry run unless --apply is passed.
 *
 *   pnpm plans:apply            # show what would change
 *   pnpm plans:apply -- --apply # write it
 *
 * Existing subscribers are snapshotted first and keep what they signed up with. Run it only against the database you mean
 * to change; it never touches payments, invoices or the Free plan.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createPrismaClient(url);
  try {
    const report = await applyOfficialPlans(db, { dryRun: !process.argv.includes('--apply') });
    console.log(JSON.stringify(report, null, 2));
    if (report.dryRun) console.log('Dry run: nothing was written. Re-run with --apply to write.');
  } finally {
    await db.$disconnect();
  }
}
void main();
