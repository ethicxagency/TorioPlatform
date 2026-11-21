import { Prisma, type PrismaClient } from '@torio/database';
import { PLANS } from './plans';

/** The plans this applies. Free is the built-in default for unsubscribed workspaces and is never touched. */
export const OFFICIAL_KEYS = ['starter', 'growth', 'scale'] as const;

export interface ApplyReport {
  dryRun: boolean;
  /** Subscriptions that had no plan snapshot and were given one from the plan they are on today. */
  snapshotted: number;
  created: string[];
  updated: { key: string; changed: string[] }[];
}

/**
 * Brings the paid plans in the database in line with the official catalog, safely and repeatably.
 *
 *  - Subscribers first: any subscription without a plan snapshot is given one from its current plan, BEFORE prices or limits
 *    change, so nobody's entitlements or price move because the catalog did. Subscriptions that already have a snapshot are
 *    not touched at all (they are held to what they signed up with). Payments and invoices are never read or written.
 *  - Plans are upserted by key: running it twice changes nothing the second time and never creates duplicates.
 *  - Provider price ids, and a plan an admin disabled or archived, are left exactly as they are.
 *  - `dryRun` (the default for the CLI) reports what would change and writes nothing.
 */
export async function applyOfficialPlans(
  db: PrismaClient,
  opts: { dryRun: boolean },
): Promise<ApplyReport> {
  const report: ApplyReport = { dryRun: opts.dryRun, snapshotted: 0, created: [], updated: [] };
  const official = PLANS.filter((p) => (OFFICIAL_KEYS as readonly string[]).includes(p.key));

  const unsnapshotted = await db.subscription.findMany({
    where: { planSnapshot: { equals: Prisma.DbNull } },
    select: { id: true, planKey: true },
  });
  const current = new Map((await db.planDefinition.findMany()).map((p) => [p.key, p]));
  for (const s of unsnapshotted) {
    const p = current.get(s.planKey);
    if (!p) continue; // an unknown plan key has nothing to snapshot from
    report.snapshotted++;
    if (!opts.dryRun)
      await db.subscription.update({
        where: { id: s.id },
        data: {
          planSnapshot: {
            name: p.name,
            description: p.description,
            limits: p.limits,
            features: p.features,
            entitlements: p.entitlements,
            aiCredits: p.aiCredits,
            monthlyMinor: p.monthlyMinor,
            yearlyMinor: p.yearlyMinor,
            currency: p.currency,
            placeholderPricing: p.placeholderPricing,
          } as Prisma.InputJsonValue,
        },
      });
  }

  for (const p of official) {
    const data = {
      name: p.name,
      description: p.description,
      rank: p.rank,
      recommended: p.recommended,
      currency: p.currency,
      monthlyMinor: p.monthlyMinor,
      yearlyMinor: p.yearlyMinor,
      placeholderPricing: p.placeholderPricing,
      limits: p.limits as Prisma.InputJsonValue,
      features: p.features,
      entitlements: p.entitlements,
    };
    const cur = current.get(p.key);
    if (!cur) {
      report.created.push(p.key);
      if (!opts.dryRun) await db.planDefinition.create({ data: { key: p.key, ...data } });
      continue;
    }
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
      (k) => JSON.stringify(cur[k]) !== JSON.stringify(data[k]),
    );
    if (!changed.length) continue;
    report.updated.push({ key: p.key, changed });
    if (!opts.dryRun) await db.planDefinition.update({ where: { key: p.key }, data });
  }
  return report;
}
