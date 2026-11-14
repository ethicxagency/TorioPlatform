import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  MAX_PRODUCTS,
  type BrainConfig,
  type CatalogFeed,
  type CatalogImportPreview,
  type CatalogImportResult,
  type CatalogMapping,
  type SyncActivity,
} from '@torio/contracts';
import type { Prisma } from '@torio/database';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { BrainService } from '../brain/brain.service';
import { safeGet } from '../brain/imports/safe-fetch';
import { assertResolvesPublic, parsePublicUrl, UnsafeUrlError } from '../brain/imports/url-guard';
import { detectedTags, MAX_FEED_ITEMS, parseFeed, type RawItem } from '../brain/imports/xml';
import { catalogMapping, mapCatalogItems, type CatalogCandidate } from './catalog-map';
import { norm, sourceOf } from './catalog.service';

type Stored = BrainConfig['products'][number];

const FEED_BYTES = 8_000_000;
const DAY = 86_400_000;
const OWNED = ['FEED', 'XML_IMPORT', 'CHANNEL'];
const uid = () => randomUUID().replace(/-/g, '').slice(0, 12);

interface FeedConfig {
  direct: true;
  mapping: CatalogMapping;
  currency: string;
  frequency: 'manual' | 'daily' | 'weekly';
  mode: 'skip' | 'update';
  status: 'ACTIVE' | 'DRAFT';
}

export interface ApplyOptions {
  mode: 'skip' | 'update';
  status: 'ACTIVE' | 'DRAFT';
  sourceId: string | null;
  source: 'XML_IMPORT' | 'FEED';
}
export interface ApplyCounts {
  created: number;
  updated: number;
  skipped: number;
  capped: number;
  notes: string[];
}

/** Finds the product a feed item already is: by the feed's own ID for this source, then SKU, then the normalised title. */
export function findExisting(products: Stored[], c: CatalogCandidate, sourceId: string | null) {
  if (c.externalId) {
    const byExt = products.find(
      (p) => p.externalId === c.externalId && (!sourceId || !p.sourceId || p.sourceId === sourceId),
    );
    if (byExt) return byExt;
  }
  if (c.sku) {
    const bySku = products.find((p) => (p.sku ?? '').toLowerCase() === c.sku.toLowerCase());
    if (bySku) return bySku;
  }
  const n = norm(c.name);
  return products.find((p) => norm(p.name) === n);
}

const UPDATABLE: { field: string; get: (c: CatalogCandidate) => unknown; key: keyof Stored }[] = [
  { field: 'name', get: (c) => c.name, key: 'name' },
  { field: 'description', get: (c) => c.description, key: 'description' },
  { field: 'price', get: (c) => c.price, key: 'price' },
  { field: 'compareAtPrice', get: (c) => c.compareAtPrice, key: 'compareAtPrice' },
  { field: 'stock', get: (c) => c.stock, key: 'stock' },
  { field: 'sku', get: (c) => c.sku, key: 'sku' },
  { field: 'brand', get: (c) => c.brand, key: 'brand' },
  { field: 'category', get: (c) => c.category, key: 'category' },
  { field: 'url', get: (c) => c.url, key: 'url' },
  { field: 'images', get: (c) => (c.images.length ? c.images : ''), key: 'images' },
  { field: 'gtin', get: (c) => c.gtin, key: 'gtin' },
  { field: 'mpn', get: (c) => c.mpn, key: 'mpn' },
  { field: 'colors', get: (c) => c.colors, key: 'colors' },
  { field: 'sizes', get: (c) => c.sizes, key: 'sizes' },
];

/**
 * Applies feed candidates to the product list. Pure with respect to the database so it can be tested on its own.
 * Idempotent: running the same feed again finds every product by its feed ID and changes nothing. A product a person
 * created (or one the feed does not own) is never overwritten, and fields a person edited are skipped.
 */
export function applyCandidates(
  products: Stored[],
  candidates: CatalogCandidate[],
  o: ApplyOptions,
): ApplyCounts {
  const out: ApplyCounts = { created: 0, updated: 0, skipped: 0, capped: 0, notes: [] };
  let keptByHand = 0;
  let lockedFields = 0;
  let noAvailability = 0;
  const now = new Date().toISOString();
  for (const c of candidates) {
    const ex = findExisting(products, c, o.sourceId);
    if (ex) {
      if (o.mode === 'skip') {
        out.skipped++;
        continue;
      }
      if (!OWNED.includes(sourceOf(ex))) {
        keptByHand++;
        out.skipped++;
        continue;
      }
      const edited = new Set(ex.edited ?? []);
      let changed = false;
      for (const u of UPDATABLE) {
        const v = u.get(c);
        if (v === '' || v === undefined) continue; // an empty feed value never blanks what is already there
        if (edited.has(u.field)) {
          lockedFields++;
          continue;
        }
        if (JSON.stringify(ex[u.key] ?? '') !== JSON.stringify(v)) {
          (ex as Record<string, unknown>)[u.key] = v;
          changed = true;
        }
      }
      if (c.externalId && ex.externalId !== c.externalId) {
        ex.externalId = c.externalId;
        changed = true;
      }
      if (o.sourceId && ex.sourceId !== o.sourceId) {
        ex.sourceId = o.sourceId;
        changed = true;
      }
      if (changed) {
        ex.updatedAt = now;
        out.updated++;
      } else out.skipped++;
      continue;
    }
    if (products.length >= MAX_PRODUCTS) {
      out.capped++;
      continue;
    }
    if (!c.stock) noAvailability++;
    products.push({
      id: uid(),
      name: c.name,
      category: c.category,
      description: c.description,
      price: c.price,
      variants: '',
      sizes: c.sizes,
      colors: c.colors,
      stock: c.stock || 'In stock',
      benefits: '',
      usage: '',
      limitations: '',
      faqs: '',
      status: o.status,
      source: o.source,
      ...(o.sourceId && { sourceId: o.sourceId }),
      ...(c.externalId && { externalId: c.externalId }),
      ...(c.sku && { sku: c.sku }),
      ...(c.compareAtPrice && { compareAtPrice: c.compareAtPrice }),
      ...(c.images.length && { images: c.images }),
      ...(c.url && { url: c.url }),
      ...(c.brand && { brand: c.brand }),
      ...(c.gtin && { gtin: c.gtin }),
      ...(c.mpn && { mpn: c.mpn }),
      createdAt: now,
      updatedAt: now,
    });
    out.created++;
  }
  if (keptByHand)
    out.notes.push(
      `${keptByHand} matched product${keptByHand === 1 ? ' was' : 's were'} created by hand or on the Intelligent page, so the feed left ${keptByHand === 1 ? 'it' : 'them'} as is.`,
    );
  if (lockedFields)
    out.notes.push(
      `${lockedFields} field${lockedFields === 1 ? '' : 's'} you edited by hand ${lockedFields === 1 ? 'was' : 'were'} not overwritten.`,
    );
  if (noAvailability)
    out.notes.push(
      `${noAvailability} new product${noAvailability === 1 ? ' has' : 's have'} no availability in the feed and ${noAvailability === 1 ? 'was' : 'were'} added as In stock. Check them.`,
    );
  if (out.capped)
    out.notes.push(`${out.capped} not added: a workspace holds up to ${MAX_PRODUCTS} products.`);
  return out;
}

@Injectable()
export class CatalogImportService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CatalogImportService.name);
  private timer: NodeJS.Timeout | null = null;
  onModuleInit() {
    // Scheduled feeds sync by themselves where the API is a long-running process; serverless hosts use the tick endpoint.
    this.timer = setInterval(() => void this.tickDue().catch(() => undefined), 15 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
  ) {}

  // ---------- reading the XML ----------

  /** Fetches (securely) or accepts the XML text, and reads it without ever resolving a DTD, entity or external reference. */
  private async read(src: { url?: string; xml?: string }) {
    let body = src.xml ?? '';
    if (src.url) {
      let u: URL;
      try {
        u = parsePublicUrl(/^[a-z]+:\/\//i.test(src.url) ? src.url : `https://${src.url}`);
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
        throw new BadRequestException(
          `The feed address answered with an error (HTTP ${r.status}).`,
        );
      if (r.truncated)
        throw new BadRequestException(
          'The feed is larger than 8 MB, which is more than Torio reads at once.',
        );
      body = r.body;
    }
    if (!/<\s*(rss|feed|products?|catalog|offers?|items?|channel)[\s>]/i.test(body.slice(0, 5000)))
      throw new BadRequestException(
        'This does not look like a product XML feed (RSS, Atom, Google Merchant or a list of <product> elements).',
      );
    const feed = parseFeed(body);
    if (!feed.items.length) throw new BadRequestException('No products were found in this XML.');
    return feed;
  }

  async preview(
    workspaceId: string,
    src: { url?: string; xml?: string; mapping?: CatalogMapping; currency?: string },
  ): Promise<CatalogImportPreview> {
    const feed = await this.read(src);
    const mapping = catalogMapping(feed.items, src.mapping);
    const mapped = mapCatalogItems(feed.items, mapping, src.currency ?? '');
    const products = (await this.brain.get(workspaceId)).config.products;
    const items = mapped.items.map((c) => ({
      key: c.key,
      externalId: c.externalId,
      name: c.name,
      price: c.price,
      image: c.images[0] ?? '',
      sku: c.sku,
      match: findExisting(products, c, null) ? ('existing' as const) : ('new' as const),
      warnings: c.warnings,
    }));
    return {
      format: feed.format,
      totalItems: feed.items.length,
      valid: mapped.items.length,
      invalid: mapped.invalid,
      duplicatesInFeed: mapped.duplicates,
      existing: items.filter((i) => i.match === 'existing').length,
      truncated: feed.truncated,
      tags: detectedTags(feed.items),
      mapping: mapping as Record<string, string>,
      issues: [
        ...mapped.issues,
        ...(feed.truncated ? [`Only the first ${MAX_FEED_ITEMS} items are read.`] : []),
        ...(!mapping.name ? ['No title column was found. Choose one in the mapping.'] : []),
      ],
      items: items.slice(0, 500),
    };
  }

  // ---------- running ----------

  private async execute(
    workspaceId: string,
    userId: string | null,
    items: RawItem[],
    cfg: Pick<FeedConfig, 'mapping' | 'currency' | 'mode' | 'status'>,
    opts: { keys?: string[]; sourceId: string | null; kind: 'XML_FEED' | 'MANUAL'; jobId: string },
  ): Promise<CatalogImportResult> {
    const mapping = catalogMapping(items, cfg.mapping);
    const mapped = mapCatalogItems(items, mapping, cfg.currency);
    const wanted = opts.keys ? new Set(opts.keys) : null;
    const chosen = wanted ? mapped.items.filter((c) => wanted.has(c.key)) : mapped.items;
    const counts = await this.brain.mutateProducts(
      workspaceId,
      userId,
      `Imported ${chosen.length} product(s) from XML`,
      (products) =>
        applyCandidates(products, chosen, {
          mode: cfg.mode,
          status: cfg.status,
          sourceId: opts.sourceId,
          source: opts.sourceId ? 'FEED' : 'XML_IMPORT',
        }),
    );
    const notes = [...mapped.issues, ...counts.notes];
    const result: CatalogImportResult = {
      jobId: opts.jobId,
      created: counts.created,
      updated: counts.updated,
      skipped: counts.skipped,
      failed: mapped.invalid,
      capped: counts.capped,
      notes,
      feedId: opts.sourceId,
    };
    await this.prisma.client.importJob.update({
      where: { id: opts.jobId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        stats: {
          items: items.length,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
          capped: result.capped,
          notes,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    if (opts.sourceId)
      await this.prisma.client.importSource.updateMany({
        where: { id: opts.sourceId },
        data: { lastSyncedAt: new Date(), lastError: null, status: 'ACTIVE' },
      });
    return result;
  }

  private startJob(
    workspaceId: string,
    userId: string | null,
    sourceId: string | null,
    kind: 'XML_FEED' | 'MANUAL',
  ) {
    return this.prisma.client.importJob.create({
      data: {
        workspaceId,
        sourceId,
        kind,
        status: 'RUNNING',
        startedAt: new Date(),
        createdById: userId,
        state: { direct: true } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
  }

  private async failJob(jobId: string, sourceId: string | null, e: unknown) {
    const msg =
      e instanceof BadRequestException
        ? String((e.getResponse() as { message?: string }).message ?? e.message)
        : 'The import stopped unexpectedly.';
    if (!(e instanceof BadRequestException))
      this.log.warn(`Catalog import ${jobId} failed: ${(e as Error).message}`);
    await this.prisma.client.importJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: msg, finishedAt: new Date() },
    });
    if (sourceId)
      await this.prisma.client.importSource.updateMany({
        where: { id: sourceId },
        data: { status: 'ERROR', lastError: msg },
      });
  }

  async run(
    workspaceId: string,
    userId: string,
    b: {
      url?: string;
      xml?: string;
      mapping?: CatalogMapping;
      currency?: string;
      keys?: string[];
      mode: 'skip' | 'update';
      status: 'ACTIVE' | 'DRAFT';
      saveAsFeed?: { name: string; frequency: 'manual' | 'daily' | 'weekly' };
    },
  ): Promise<CatalogImportResult> {
    const feed = await this.read(b);
    const cfg: FeedConfig = {
      direct: true,
      mapping: b.mapping ?? {},
      currency: (b.currency ?? '').toUpperCase(),
      frequency: b.saveAsFeed?.frequency ?? 'manual',
      mode: b.mode,
      status: b.status,
    };
    let sourceId: string | null = null;
    if (b.saveAsFeed && b.url) {
      const url = parsePublicUrl(
        /^[a-z]+:\/\//i.test(b.url) ? b.url : `https://${b.url}`,
      ).toString();
      const existing = await this.prisma.client.importSource.findFirst({
        where: { workspaceId, kind: 'XML_FEED', url },
      });
      const data = {
        name: b.saveAsFeed.name,
        config: cfg as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE' as const,
      };
      const s = existing
        ? await this.prisma.client.importSource.update({ where: { id: existing.id }, data })
        : await this.prisma.client.importSource.create({
            data: { workspaceId, kind: 'XML_FEED', url, createdById: userId, ...data },
          });
      sourceId = s.id;
    }
    const job = await this.startJob(workspaceId, userId, sourceId, b.url ? 'XML_FEED' : 'MANUAL');
    try {
      return await this.execute(workspaceId, userId, feed.items, cfg, {
        keys: b.keys,
        sourceId,
        kind: b.url ? 'XML_FEED' : 'MANUAL',
        jobId: job.id,
      });
    } catch (e) {
      await this.failJob(job.id, sourceId, e);
      throw e;
    }
  }

  // ---------- saved feeds ----------

  private view(
    s: {
      id: string;
      name: string;
      url: string | null;
      status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCONNECTED';
      config: unknown;
      lastSyncedAt: Date | null;
      lastError: string | null;
      createdAt: Date;
    },
    productCount: number,
  ): CatalogFeed {
    const c = (s.config ?? {}) as Partial<FeedConfig>;
    return {
      id: s.id,
      name: s.name,
      url: s.url ?? '',
      status: s.status,
      frequency: c.frequency ?? 'manual',
      mode: c.mode ?? 'skip',
      lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
      lastError: s.lastError,
      productCount,
      createdAt: s.createdAt.toISOString(),
    };
  }

  private async directSources(workspaceId: string) {
    const rows = await this.prisma.client.importSource.findMany({
      where: { workspaceId, kind: 'XML_FEED', status: { not: 'DISCONNECTED' } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return rows.filter((r) => (r.config as { direct?: boolean } | null)?.direct);
  }

  async feeds(workspaceId: string): Promise<CatalogFeed[]> {
    const rows = await this.directSources(workspaceId);
    const products = (await this.brain.get(workspaceId)).config.products;
    return rows.map((r) => this.view(r, products.filter((p) => p.sourceId === r.id).length));
  }

  private async mine(workspaceId: string, id: string) {
    const s = await this.prisma.client.importSource.findFirst({
      where: { id, workspaceId, kind: 'XML_FEED' },
    });
    if (!s || !(s.config as { direct?: boolean } | null)?.direct || s.status === 'DISCONNECTED')
      throw new NotFoundException('Feed not found.');
    return s;
  }

  async updateFeed(
    workspaceId: string,
    id: string,
    b: {
      name?: string;
      frequency?: FeedConfig['frequency'];
      mode?: FeedConfig['mode'];
      mapping?: CatalogMapping;
      currency?: string;
    },
  ) {
    const s = await this.mine(workspaceId, id);
    const c = { ...(s.config as unknown as FeedConfig) };
    if (b.frequency) c.frequency = b.frequency;
    if (b.mode) c.mode = b.mode;
    if (b.mapping) c.mapping = b.mapping;
    if (b.currency) c.currency = b.currency.toUpperCase();
    await this.prisma.client.importSource.update({
      where: { id },
      data: { ...(b.name && { name: b.name }), config: c as unknown as Prisma.InputJsonValue },
    });
    return (await this.feeds(workspaceId)).find((f) => f.id === id)!;
  }

  async setPaused(workspaceId: string, id: string, paused: boolean) {
    await this.mine(workspaceId, id);
    await this.prisma.client.importSource.update({
      where: { id },
      data: { status: paused ? 'PAUSED' : 'ACTIVE' },
    });
    return (await this.feeds(workspaceId)).find((f) => f.id === id)!;
  }

  /** Stops syncing. Products already imported stay in the catalog, and the external feed is never touched. */
  async deleteFeed(workspaceId: string, id: string) {
    await this.mine(workspaceId, id);
    await this.prisma.client.importSource.update({
      where: { id },
      data: { status: 'DISCONNECTED' },
    });
    return { ok: true };
  }

  /** "Sync now" and the scheduled sync: one active run per feed, one retry on a failed fetch. */
  async sync(workspaceId: string, userId: string | null, id: string): Promise<CatalogImportResult> {
    const s = await this.mine(workspaceId, id);
    if (s.status === 'PAUSED')
      throw new ConflictException('This feed is paused. Resume it to sync.');
    const busy = await this.prisma.client.importJob.findFirst({
      where: {
        workspaceId,
        sourceId: id,
        status: 'RUNNING',
        startedAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
      select: { id: true },
    });
    if (busy) throw new ConflictException('This feed is already syncing.');
    const cfg = s.config as unknown as FeedConfig;
    const job = await this.startJob(workspaceId, userId, id, 'XML_FEED');
    try {
      let feed;
      try {
        feed = await this.read({ url: s.url! });
      } catch (e) {
        if (!(e instanceof BadRequestException)) throw e;
        await new Promise((r) => setTimeout(r, 1500));
        feed = await this.read({ url: s.url! });
      }
      return await this.execute(workspaceId, userId, feed.items, cfg, {
        sourceId: id,
        kind: 'XML_FEED',
        jobId: job.id,
      });
    } catch (e) {
      await this.failJob(job.id, id, e);
      throw e;
    }
  }

  /** For a scheduler: syncs feeds whose daily or weekly time has come. Feeds set to manual, paused or disconnected never sync here. */
  async tickDue(budget = 2) {
    const sources = await this.prisma.client.importSource.findMany({
      where: { kind: 'XML_FEED', status: { in: ['ACTIVE', 'ERROR'] } },
      take: 100,
    });
    let started = 0;
    for (const s of sources) {
      const c = s.config as Partial<FeedConfig> | null;
      if (!c?.direct) continue;
      const every = c.frequency === 'daily' ? DAY : c.frequency === 'weekly' ? 7 * DAY : 0;
      if (!every || (s.lastSyncedAt && Date.now() - s.lastSyncedAt.getTime() < every - 600_000))
        continue;
      try {
        await this.sync(s.workspaceId, null, s.id);
      } catch (e) {
        if (!(e instanceof ConflictException))
          this.log.warn(`Scheduled catalog feed ${s.id}: ${(e as Error).message}`);
      }
      if (++started >= budget) break;
    }
    return { catalogFeedsSynced: started };
  }

  async activity(workspaceId: string): Promise<SyncActivity[]> {
    const jobs = await this.prisma.client.importJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const ids = [...new Set(jobs.map((j) => j.sourceId).filter((x): x is string => !!x))];
    const sources = await this.prisma.client.importSource.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, name: true },
    });
    const name = new Map(sources.map((s) => [s.id, s.name]));
    return jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      sourceName: j.sourceId ? (name.get(j.sourceId) ?? null) : null,
      status: j.status,
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
      error: j.error,
      stats: (j.stats as Record<string, unknown> | null) ?? null,
    }));
  }
}
