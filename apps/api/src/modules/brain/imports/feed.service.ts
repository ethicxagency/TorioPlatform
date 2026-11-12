import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FeedCreateInput, FeedPreview } from '@torio/contracts';
import type { Prisma } from '@torio/database';
import { PrismaService } from '../../../database/prisma.service';
import { safeGet } from './safe-fetch';
import { assertResolvesPublic, parsePublicUrl, UnsafeUrlError } from './url-guard';
import {
  detectedTags,
  effectiveMapping,
  mapItems,
  parseFeed,
  type FeedMapping,
  type MappedProduct,
} from './xml';

const ACTIVE = ['QUEUED', 'RUNNING'] as const;
const MAX_RECORDS = 1000;
const FEED_BYTES = 8_000_000;
const DAY = 86_400_000;

interface FeedState {
  url: string;
  mapping: FeedMapping;
  currency: string;
  warnings: string[];
  lockUntil: number;
}
interface FeedConfig {
  mapping: FeedMapping;
  currency: string;
  frequency: 'manual' | 'daily' | 'weekly';
}

const notMigrated = (e: unknown) =>
  ['P2021', 'P2022'].includes((e as { code?: string }).code ?? '');

/**
 * XML product feeds. A feed is a source (its URL and settings) plus jobs (each fetch). A job reads the whole feed in one
 * time-boxed step, maps and validates it, compares it with what was imported from this source before, and stores only new
 * or changed products as proposals. Nothing reaches Brain without approval, and a changed price is a proposal like any other.
 */
@Injectable()
export class FeedService {
  private readonly log = new Logger(FeedService.name);
  constructor(private readonly prisma: PrismaService) {}

  private async fetchFeed(url: string) {
    let u: URL;
    try {
      u = parsePublicUrl(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);
      await assertResolvesPublic(u.hostname);
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new BadRequestException(e.message);
      throw e;
    }
    let r;
    try {
      r = await safeGet(u.toString(), {
        timeoutMs: 20_000,
        maxBytes: FEED_BYTES,
        accept: /xml|rss|atom|text\/plain|octet-stream/i,
      });
    } catch (e) {
      throw new BadRequestException(
        `The feed could not be read: ${e instanceof Error ? e.message : 'failed'}`,
      );
    }
    if (r.status >= 400)
      throw new BadRequestException(`The feed address answered with an error (HTTP ${r.status}).`);
    if (r.truncated)
      throw new BadRequestException(
        'The feed is larger than 8 MB, which is more than Torio reads at once.',
      );
    const feed = parseFeed(r.body);
    if (!feed.items.length)
      throw new BadRequestException(
        'No products were found. This does not look like a product feed (RSS, Atom or a list of <product> elements).',
      );
    return { url: u.toString(), feed };
  }

  async preview(url: string, mapping: FeedMapping = {}, currency = ''): Promise<FeedPreview> {
    const { feed } = await this.fetchFeed(url);
    const map = effectiveMapping(feed.items, mapping);
    const r = mapItems(feed.items, map, currency);
    return {
      format: feed.format,
      totalItems: feed.items.length,
      valid: r.products.length,
      invalid: r.invalid,
      duplicates: r.duplicates,
      missingPrice: r.missingPrice,
      truncated: feed.truncated,
      tags: detectedTags(feed.items),
      mapping: map as Record<string, string>,
      issues: [
        ...r.issues,
        ...(feed.truncated ? ['Only the first 5,000 items are read.'] : []),
        ...(!map.name ? ['No product name column was found. Choose one in the mapping.'] : []),
      ],
      sample: r.products.slice(0, 5).map((p) => ({ data: p.data, warnings: p.warnings })),
    };
  }

  // ---------- sources and jobs ----------

  async create(workspaceId: string, userId: string, input: FeedCreateInput) {
    try {
      const { url } = await this.validateUrlOnly(input.url);
      const db = this.prisma.client;
      const config: FeedConfig = {
        mapping: (input.mapping ?? {}) as FeedMapping,
        currency: (input.currency ?? '').toUpperCase(),
        frequency: input.frequency,
      };
      let source = await db.importSource.findFirst({
        where: { workspaceId, kind: 'XML_FEED', url },
      });
      if (source)
        source = await db.importSource.update({
          where: { id: source.id },
          data: {
            name: input.name,
            config: config as unknown as Prisma.InputJsonValue,
            status: 'ACTIVE',
          },
        });
      else
        source = await db.importSource.create({
          data: {
            workspaceId,
            kind: 'XML_FEED',
            name: input.name,
            url,
            config: config as unknown as Prisma.InputJsonValue,
            createdById: userId,
          },
        });
      return await this.startJob(workspaceId, userId, source.id);
    } catch (e) {
      if (notMigrated(e))
        throw new ServiceUnavailableException('Feed import is not set up on this server yet.');
      throw e;
    }
  }

  private async validateUrlOnly(raw: string) {
    try {
      const u = parsePublicUrl(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
      await assertResolvesPublic(u.hostname);
      return { url: u.toString() };
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** Starts a fetch of an existing feed source ("Sync now"). One active job per source. */
  async startJob(workspaceId: string, userId: string | null, sourceId: string) {
    const db = this.prisma.client;
    const source = await db.importSource.findFirst({
      where: { id: sourceId, workspaceId, kind: 'XML_FEED' },
    });
    if (!source || !source.url) throw new NotFoundException('Feed not found.');
    if (source.status === 'DISCONNECTED')
      throw new ConflictException('This feed is disconnected. Connect it again to sync.');
    const running = await db.importJob.findFirst({
      where: { workspaceId, sourceId, status: { in: [...ACTIVE] } },
      select: { id: true },
    });
    if (running) throw new ConflictException('This feed is already syncing.');
    const cfg = source.config as unknown as FeedConfig;
    const state: FeedState = {
      url: source.url,
      mapping: cfg?.mapping ?? {},
      currency: cfg?.currency ?? '',
      warnings: [],
      lockUntil: 0,
    };
    const job = await db.importJob.create({
      data: {
        workspaceId,
        sourceId,
        kind: 'XML_FEED',
        createdById: userId,
        state: state as unknown as Prisma.InputJsonValue,
      },
    });
    await db.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'brain.import.feed',
        entityType: 'import_job',
        entityId: job.id,
        metadata: { description: `Started a sync of the feed ${source.name}` },
      },
    });
    return job.id;
  }

  async disconnect(workspaceId: string, sourceId: string) {
    const db = this.prisma.client;
    const s = await db.importSource.findFirst({ where: { id: sourceId, workspaceId } });
    if (!s) throw new NotFoundException('Source not found.');
    await db.importJob.updateMany({
      where: { sourceId, workspaceId, status: { in: [...ACTIVE] } },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    // Knowledge already imported is Brain's own now: disconnecting a source never removes any of it.
    await db.importSource.update({ where: { id: sourceId }, data: { status: 'DISCONNECTED' } });
    return { ok: true };
  }

  // ---------- running ----------

  async step(workspaceId: string, jobId: string) {
    const db = this.prisma.client;
    const job = await db.importJob.findFirst({
      where: { id: jobId, workspaceId, kind: 'XML_FEED' },
    });
    if (!job) throw new NotFoundException('Import not found.');
    if (!ACTIVE.includes(job.status as 'QUEUED')) return;
    const s = job.state as unknown as FeedState;
    if (s.lockUntil > Date.now()) return;
    s.lockUntil = Date.now() + 60_000;
    await db.importJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        startedAt: job.startedAt ?? new Date(),
        state: s as unknown as Prisma.InputJsonValue,
      },
    });
    try {
      const { feed } = await this.fetchFeed(s.url);
      const map = effectiveMapping(feed.items, s.mapping);
      const mapped = mapItems(feed.items, map, s.currency);
      const previous = await this.previousImports(workspaceId, job.sourceId, job.id);
      const fresh: (MappedProduct & { change: 'new' | 'changed'; was?: string })[] = [];
      let unchanged = 0;
      for (const p of mapped.products) {
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
      const kept = fresh.slice(0, MAX_RECORDS);
      if (kept.length)
        await db.importRecord.createMany({
          data: kept.map((p) => {
            const data = { ...p.data, change: p.change };
            return {
              workspaceId,
              jobId,
              category: 'product',
              title: p.data['name']!,
              data: data as Prisma.InputJsonValue,
              original: data as Prisma.InputJsonValue,
              sourceUrl: p.data['url'] ?? s.url,
              confidence: 85 - Math.min(40, p.warnings.length * 10),
              warnings: [
                ...(p.change === 'changed' ? [`Changed since the last import: ${p.was}`] : []),
                ...p.warnings,
              ] as Prisma.InputJsonValue,
            };
          }),
        });
      const w = [...mapped.issues];
      if (feed.truncated) w.push('Only the first 5,000 items of the feed were read.');
      if (fresh.length > MAX_RECORDS)
        w.push(`Only the first ${MAX_RECORDS} new or changed products are proposed this time.`);
      if (unchanged)
        w.push(
          `${unchanged} product${unchanged === 1 ? ' is' : 's are'} unchanged since the last import and were left out.`,
        );
      s.warnings = w;
      s.lockUntil = 0;
      const stats = {
        items: feed.items.length,
        products: kept.filter((p) => p.change === 'new').length,
        changed: kept.filter((p) => p.change === 'changed').length,
        unchanged,
        invalid: mapped.invalid,
        duplicates: mapped.duplicates,
      };
      await db.importJob.update({
        where: { id: jobId },
        data: {
          status: kept.length ? 'NEEDS_REVIEW' : 'COMPLETED',
          finishedAt: new Date(),
          stats,
          state: s as unknown as Prisma.InputJsonValue,
        },
      });
      if (job.sourceId)
        await db.importSource.updateMany({
          where: { id: job.sourceId },
          data: { lastSyncedAt: new Date(), lastError: null, status: 'ACTIVE' },
        });
    } catch (e) {
      const msg =
        e instanceof BadRequestException
          ? String((e.getResponse() as { message?: string }).message ?? e.message)
          : 'The feed sync stopped unexpectedly.';
      if (!(e instanceof BadRequestException))
        this.log.warn(`Feed job ${jobId} failed: ${(e as Error).message}`);
      s.lockUntil = 0;
      await db.importJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error: msg,
          finishedAt: new Date(),
          state: s as unknown as Prisma.InputJsonValue,
        },
      });
      if (job.sourceId)
        await db.importSource.updateMany({
          where: { id: job.sourceId },
          data: { lastError: msg, status: 'ERROR' },
        });
    }
  }

  /** What was imported from this source before, by the feed's own product ID, so a re-sync proposes only real changes. */
  private async previousImports(workspaceId: string, sourceId: string | null, exceptJobId: string) {
    const out = new Map<string, Record<string, string>>();
    if (!sourceId) return out;
    const db = this.prisma.client;
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

  /** For a scheduler: start (and run) syncs for feeds whose daily or weekly time has come. Feeds set to manual never sync here. */
  async tickDue(budget = 1) {
    const db = this.prisma.client;
    const sources = await db.importSource.findMany({
      where: { kind: 'XML_FEED', status: { in: ['ACTIVE', 'ERROR'] } },
      take: 50,
    });
    let started = 0;
    for (const s of sources) {
      const f = (s.config as unknown as FeedConfig | null)?.frequency;
      const every = f === 'daily' ? DAY : f === 'weekly' ? 7 * DAY : 0;
      if (!every || (s.lastSyncedAt && Date.now() - s.lastSyncedAt.getTime() < every - 600_000))
        continue;
      try {
        const id = await this.startJob(s.workspaceId, null, s.id);
        await this.step(s.workspaceId, id);
        if (++started >= budget) break;
      } catch (e) {
        if (!(e instanceof ConflictException))
          this.log.warn(`Scheduled feed ${s.id}: ${(e as Error).message}`);
      }
    }
    return { started };
  }
}
