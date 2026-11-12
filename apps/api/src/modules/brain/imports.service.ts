import { Injectable, Logger } from '@nestjs/common';
import type { ImportOverview, Provenance } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { POLICY_Q } from './imports/policy-questions';

/** Prisma: "table does not exist" (P2021) or "column does not exist" (P2022), i.e. the migration has not been applied yet. */
const notMigrated = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  ['P2021', 'P2022'].includes((e as { code?: string }).code ?? '');

/**
 * Import sources and their recent jobs for one store. The tables arrive with a migration the operator applies on their own
 * schedule, so a database without them is a normal state: the overview is then empty and says it is not ready, instead of
 * failing the Intelligence page. Every query is scoped to the workspace.
 */
@Injectable()
export class ImportsService {
  private readonly log = new Logger(ImportsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async overview(workspaceId: string): Promise<ImportOverview> {
    try {
      const [sources, jobs, imported, importedProducts, pending, failed] = await Promise.all([
        this.prisma.client.importSource.findMany({
          where: { workspaceId },
          orderBy: { createdAt: 'asc' },
          take: 50,
        }),
        this.prisma.client.importJob.findMany({
          where: { workspaceId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.client.importRecord.count({ where: { workspaceId, status: 'IMPORTED' } }),
        this.prisma.client.importRecord.count({
          where: { workspaceId, status: 'IMPORTED', category: 'product' },
        }),
        this.prisma.client.importRecord.count({
          where: { workspaceId, status: { in: ['PENDING', 'APPROVED'] } },
        }),
        // Failed in the last 30 days; an old failure that was retried successfully is history, not a problem.
        this.prisma.client.importJob.count({
          where: {
            workspaceId,
            status: 'FAILED',
            createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
          },
        }),
      ]);
      return {
        ready: true,
        totals: {
          importedProducts,
          importedEntries: imported,
          pendingReview: pending,
          failedImports: failed,
        },
        sources: sources.map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          url: s.url,
          status: s.status,
          lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
          lastError: s.lastError,
          frequency:
            ((s.config as { frequency?: string } | null)?.frequency as string | undefined) ?? null,
        })),
        jobs: jobs.map((j) => ({
          id: j.id,
          sourceId: j.sourceId,
          kind: j.kind,
          status: j.status,
          stats: (j.stats as Record<string, number> | null) ?? null,
          error: j.error,
          startedAt: j.startedAt?.toISOString() ?? null,
          finishedAt: j.finishedAt?.toISOString() ?? null,
          createdAt: j.createdAt.toISOString(),
        })),
      };
    } catch (e) {
      if (!notMigrated(e)) throw e;
      this.log.warn('Import tables are not in this database yet; serving an empty overview.');
      return {
        ready: false,
        totals: { importedProducts: 0, importedEntries: 0, pendingReview: 0, failedImports: 0 },
        sources: [],
        jobs: [],
      };
    }
  }

  /**
   * Where imported knowledge came from. Built from the records that were approved and imported, so it only ever says what
   * actually happened: the source, the page it came from, when, and whether the person edited it before importing.
   */
  async provenance(workspaceId: string): Promise<Provenance> {
    const out: Provenance = { products: {}, faqs: {} };
    try {
      const db = this.prisma.client;
      const rows = await db.importRecord.findMany({
        where: { workspaceId, status: 'IMPORTED', category: { in: ['product', 'faq', 'policy'] } },
        orderBy: { updatedAt: 'asc' },
        take: 2000,
      });
      if (!rows.length) return out;
      const jobs = await db.importJob.findMany({
        where: { workspaceId, id: { in: [...new Set(rows.map((r) => r.jobId))] } },
      });
      const sources = await db.importSource.findMany({
        where: {
          workspaceId,
          id: { in: jobs.map((j) => j.sourceId).filter((x): x is string => !!x) },
        },
      });
      const KIND: Record<string, string> = {
        WEBSITE: 'Website scan',
        XML_FEED: 'XML feed',
        META_CATALOG: 'Meta Catalog',
        GOOGLE_MERCHANT: 'Google Merchant Center',
        MANUAL: 'CSV import',
      };
      const info = new Map(
        jobs.map(
          (j) =>
            [
              j.id,
              {
                kind: j.kind,
                name: sources.find((s) => s.id === j.sourceId)?.name ?? KIND[j.kind] ?? j.kind,
              },
            ] as const,
        ),
      );
      const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
      for (const r of rows) {
        const d = r.data as Record<string, string>;
        const o = r.original as Record<string, string>;
        const src = info.get(r.jobId);
        if (!src) continue;
        const entry = {
          source: { kind: src.kind, name: src.name },
          url: d['url'] ?? r.sourceUrl ?? null,
          importedAt: r.updatedAt.toISOString(),
          edited:
            JSON.stringify({ ...d, change: undefined }) !==
            JSON.stringify({ ...o, change: undefined }),
        };
        // later imports win, so a product re-imported from another source shows where it last came from
        if (r.category === 'product') out.products[norm(r.title)] = entry;
        else
          out.faqs[
            norm(
              r.category === 'faq' ? (d['q'] ?? r.title) : (POLICY_Q[d['kind'] ?? ''] ?? r.title),
            )
          ] = entry;
      }
      return out;
    } catch (e) {
      if (!notMigrated(e)) throw e;
      return out;
    }
  }
}
