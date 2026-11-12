import type { Prisma } from '@torio/database';
import type { PrismaService } from '../../../database/prisma.service';
import type { MappedProduct } from './xml';

export const MAX_RECORDS = 1000;

export type Proposal = MappedProduct & { change: 'new' | 'changed'; was?: string };

/** What was imported from this source before, by the source's own product ID, so a re-sync proposes only real changes. */
export async function previousImports(
  prisma: PrismaService,
  workspaceId: string,
  sourceId: string | null,
  exceptJobId: string,
) {
  const out = new Map<string, Record<string, string>>();
  if (!sourceId) return out;
  const db = prisma.client;
  const jobs = await db.importJob.findMany({
    where: { workspaceId, sourceId, id: { not: exceptJobId } },
    select: { id: true },
  });
  if (!jobs.length) return out;
  const rows = await db.importRecord.findMany({
    where: { workspaceId, jobId: { in: jobs.map((j) => j.id) }, status: 'IMPORTED' },
    orderBy: { createdAt: 'asc' },
  });
  for (const r of rows) {
    const d = r.data as Record<string, string>;
    if (d['externalId']) out.set(d['externalId'], d);
  }
  return out;
}

/** Splits mapped products into new or changed ones (proposed) and unchanged ones (left out). */
export function classify(products: MappedProduct[], previous: Map<string, Record<string, string>>) {
  const fresh: Proposal[] = [];
  let unchanged = 0;
  for (const p of products) {
    const prev = p.externalId ? previous.get(p.externalId) : undefined;
    if (!prev) {
      fresh.push({ ...p, change: 'new' });
      continue;
    }
    const diffs = Object.entries(p.data).filter(
      ([k, v]) => !['url', 'image'].includes(k) && prev[k] !== v,
    );
    if (!diffs.length) {
      unchanged++;
      continue;
    }
    fresh.push({
      ...p,
      change: 'changed',
      was: diffs.map(([k, v]) => `${k}: ${prev[k] ?? '—'} → ${v}`).join('; '),
    });
  }
  return { fresh, unchanged };
}

/** Stores proposals as reviewable records. Nothing here touches Brain. */
export async function insertProposals(
  prisma: PrismaService,
  workspaceId: string,
  jobId: string,
  list: Proposal[],
  fallbackUrl: string,
) {
  if (!list.length) return;
  await prisma.client.importRecord.createMany({
    data: list.map((p) => {
      const data = { ...p.data, change: p.change };
      return {
        workspaceId,
        jobId,
        category: 'product',
        title: p.data['name']!,
        data: data as Prisma.InputJsonValue,
        original: data as Prisma.InputJsonValue,
        sourceUrl: p.data['url'] ?? fallbackUrl,
        confidence: 85 - Math.min(40, p.warnings.length * 10),
        warnings: [
          ...(p.change === 'changed' ? [`Changed since the last import: ${p.was}`] : []),
          ...p.warnings,
        ] as Prisma.InputJsonValue,
      };
    }),
  });
}
