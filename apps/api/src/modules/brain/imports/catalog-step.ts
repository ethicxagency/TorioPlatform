import { HttpException, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@torio/database';
import type { PrismaService } from '../../../database/prisma.service';
import { classify, insertProposals, MAX_RECORDS, previousImports } from './propose';
import { mapItems, type FeedMapping, type RawItem } from './xml';

export const ACTIVE = ['QUEUED', 'RUNNING'] as const;
const MAX_ITEMS = 5000;
const STEP_MS = 30_000;
const MAX_STEP_PAGES = 12;

/** Progress of a catalog sync (Meta Catalog, Google Merchant Center): where it is in the product list and what it has found. */
export interface CatalogState {
  /** The catalog (Meta) or merchant account (Google) being read. */
  catalogId: string;
  cursor: string | null;
  seen: string[];
  items: number;
  proposed: number;
  newCount: number;
  changed: number;
  unchanged: number;
  invalid: number;
  duplicates: number;
  warnings: string[];
  lockUntil: number;
}

export const newCatalogState = (catalogId: string): CatalogState => ({
  catalogId,
  cursor: null,
  seen: [],
  items: 0,
  proposed: 0,
  newCount: 0,
  changed: 0,
  unchanged: 0,
  invalid: 0,
  duplicates: 0,
  warnings: [],
  lockUntil: 0,
});

export interface StepDeps {
  prisma: PrismaService;
  log: Logger;
  kind: 'META_CATALOG' | 'GOOGLE_MERCHANT';
  workspaceId: string;
  jobId: string;
  /** Fetches one page after `cursor` (null for the first). Throws on provider errors. */
  fetchPage: (state: CatalogState) => Promise<{ items: RawItem[]; next: string | null }>;
  mapping: FeedMapping;
  /** Used as a product's source link when the provider gives none. */
  fallbackUrl: string;
  /** Turns a failure into words for the person, and says whether the connection needs to be re-authorized. */
  describe: (e: unknown) => { message: string; reconnect: boolean };
}

/**
 * Reads a provider's product list for a bounded time, proposing new or changed products and carrying on from the cursor on
 * the next call. Shared by the catalog sources so they behave identically: change-only re-syncs, duplicate handling,
 * caps, and nothing reaching Brain without approval.
 */
export async function stepCatalog(d: StepDeps) {
  const db = d.prisma.client;
  const job = await db.importJob.findFirst({
    where: { id: d.jobId, workspaceId: d.workspaceId, kind: d.kind },
  });
  if (!job) throw new NotFoundException('Import not found.');
  if (!ACTIVE.includes(job.status as 'QUEUED')) return;
  const s = job.state as unknown as CatalogState;
  if (s.lockUntil > Date.now()) return;
  s.lockUntil = Date.now() + STEP_MS + 15_000;
  const save = () =>
    db.importJob.update({
      where: { id: job.id },
      data: { state: s as unknown as Prisma.InputJsonValue },
    });
  await db.importJob.update({
    where: { id: job.id },
    data: {
      status: 'RUNNING',
      startedAt: job.startedAt ?? new Date(),
      state: s as unknown as Prisma.InputJsonValue,
    },
  });
  try {
    const previous = await previousImports(d.prisma, d.workspaceId, job.sourceId, job.id);
    const t0 = Date.now();
    let done = false;
    for (let page = 0; page < MAX_STEP_PAGES && Date.now() - t0 < STEP_MS; page++) {
      const fresh = await db.importJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (fresh?.status !== 'RUNNING') return;
      const r = await d.fetchPage(s);
      s.items += r.items.length;
      const mapped = mapItems(r.items, d.mapping);
      s.invalid += mapped.invalid;
      const seen = new Set(s.seen);
      const batch = mapped.products.filter((p) => {
        const k = p.externalId ? `id:${p.externalId}` : `n:${p.data['name']!.toLowerCase()}`;
        if (seen.has(k)) {
          s.duplicates++;
          return false;
        }
        seen.add(k);
        s.seen.push(k);
        return true;
      });
      const { fresh: proposals, unchanged } = classify(batch, previous);
      s.unchanged += unchanged;
      const kept = proposals.slice(0, Math.max(0, MAX_RECORDS - s.proposed));
      await insertProposals(d.prisma, d.workspaceId, job.id, kept, d.fallbackUrl);
      s.proposed += kept.length;
      s.newCount += kept.filter((p) => p.change === 'new').length;
      s.changed += kept.filter((p) => p.change === 'changed').length;
      s.cursor = r.next;
      await save();
      if (!r.next || s.items >= MAX_ITEMS) {
        done = true;
        break;
      }
    }
    if (!done) {
      s.lockUntil = 0;
      await save();
      return;
    }
    const w: string[] = [];
    if (s.invalid)
      w.push(`${s.invalid} item${s.invalid === 1 ? ' has' : 's have'} no name and were skipped.`);
    if (s.duplicates) w.push(`${s.duplicates} duplicate${s.duplicates === 1 ? '' : 's'} ignored.`);
    if (s.unchanged)
      w.push(
        `${s.unchanged} product${s.unchanged === 1 ? ' is' : 's are'} unchanged since the last import and were left out.`,
      );
    if (s.items >= MAX_ITEMS) w.push('Only the first 5,000 products were read.');
    if (s.proposed >= MAX_RECORDS)
      w.push(`Only the first ${MAX_RECORDS} new or changed products are proposed this time.`);
    s.warnings = w;
    s.lockUntil = 0;
    await db.importJob.update({
      where: { id: job.id },
      data: {
        status: s.proposed ? 'NEEDS_REVIEW' : 'COMPLETED',
        finishedAt: new Date(),
        stats: {
          items: s.items,
          products: s.newCount,
          changed: s.changed,
          unchanged: s.unchanged,
          invalid: s.invalid,
          duplicates: s.duplicates,
        },
        state: s as unknown as Prisma.InputJsonValue,
      },
    });
    if (job.sourceId)
      await db.importSource.updateMany({
        where: { id: job.sourceId },
        data: { lastSyncedAt: new Date(), lastError: null, status: 'ACTIVE' },
      });
  } catch (e) {
    const known = e instanceof HttpException;
    const { message, reconnect } = known
      ? {
          message: String((e.getResponse() as { message?: string }).message ?? e.message),
          reconnect: false,
        }
      : d.describe(e);
    if (!known) d.log.warn(`Catalog job ${d.jobId} failed: ${(e as Error).message}`);
    s.lockUntil = 0;
    await db.importJob.update({
      where: { id: d.jobId },
      data: {
        status: 'FAILED',
        error: message,
        finishedAt: new Date(),
        state: s as unknown as Prisma.InputJsonValue,
      },
    });
    if (job.sourceId)
      await db.importSource.updateMany({
        where: { id: job.sourceId },
        data: { lastError: message, ...(reconnect && { status: 'ERROR' as const }) },
      });
  }
}
