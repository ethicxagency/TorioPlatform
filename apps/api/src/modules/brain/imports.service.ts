import { Injectable, Logger } from '@nestjs/common';
import type { ImportOverview } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';

/** Prisma: "table does not exist" (P2021) or "column does not exist" (P2022), i.e. the migration has not been applied yet. */
const notMigrated = (e: unknown) =>
  typeof e === 'object' && e !== null && ['P2021', 'P2022'].includes((e as { code?: string }).code ?? '');

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
      const [sources, jobs] = await Promise.all([
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
      ]);
      return {
        ready: true,
        sources: sources.map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          url: s.url,
          status: s.status,
          lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
          lastError: s.lastError,
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
      return { ready: false, sources: [], jobs: [] };
    }
  }
}
