import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  STOCK_STATES,
  type BrainConfig,
  type ImportCategory,
  type WebsiteScanInput,
} from '@torio/contracts';
import type { Prisma } from '@torio/database';
import { APP_CONFIG, type AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../database/prisma.service';
import { BrainService } from '../brain.service';
import { FeedService } from './feed.service';
import { GoogleMerchantService } from './google-merchant.service';
import { MetaCatalogService } from './meta-catalog.service';
import { aiCandidates } from './ai';
import {
  candidatesFromPage,
  contactOf,
  linkPriority,
  parsePage,
  type Candidate,
  type PageInfo,
} from './extract';
import { parseRobots, type Robots } from './robots';
import { safeGet } from './safe-fetch';
import {
  isSitemapIndex,
  pickSitemapPages,
  productSitemaps,
  sitemapLocs,
  sitemapsFromRobots,
} from './sitemap';
import { assertResolvesPublic, parsePublicUrl, UnsafeUrlError } from './url-guard';

export const MAX_PAGES = 15;
const MAX_DEPTH = 2;
const ACTIVE = ['QUEUED', 'RUNNING'] as const;

interface ScanState {
  origin: string;
  start: string;
  options: Pick<WebsiteScanInput, 'country' | 'category' | 'instructions'>;
  frontier: { url: string; depth: number }[];
  visited: string[];
  keys: string[];
  warnings: string[];
  robotsTxt: string | null;
  /** Trimmed text of the most useful pages, kept only until the optional AI step has run. */
  texts: { url: string; text: string }[];
  contact: { emails: string[]; phones: string[]; socials: string[] };
  lockUntil: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const keyOf = (c: Candidate) =>
  `${c.category}:${norm(c.category === 'faq' ? c.data['q']! : c.category === 'policy' ? c.data['kind']! : c.title)}`;
const uid = () => randomUUID().replace(/-/g, '').slice(0, 12);

/**
 * Website discovery. A scan is a job that advances in small, time-boxed steps (a few pages each), so no request ever runs a
 * whole crawl. Everything it finds is stored as a proposal (an ImportRecord) with its source URL and confidence; nothing
 * reaches Brain until a person approves it and imports it. Every query is scoped to the workspace.
 */
@Injectable()
export class ScanService {
  private readonly log = new Logger(ScanService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly feeds: FeedService,
    private readonly catalog: MetaCatalogService,
    private readonly google: GoogleMerchantService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  // ---------- starting ----------

  async start(workspaceId: string, userId: string, input: WebsiteScanInput) {
    try {
      return await this.startScan(workspaceId, userId, input);
    } catch (e) {
      // The import tables arrive with a migration the operator applies; until then say so plainly instead of failing.
      const code = (e as { code?: string }).code;
      if (code === 'P2021' || code === 'P2022')
        throw new ServiceUnavailableException('Website scanning is not set up on this server yet.');
      throw e;
    }
  }

  private async startScan(workspaceId: string, userId: string, input: WebsiteScanInput) {
    let url: URL;
    try {
      url = parsePublicUrl(/^[a-z]+:\/\//i.test(input.url) ? input.url : `https://${input.url}`);
      await assertResolvesPublic(url.hostname);
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new BadRequestException(e.message);
      throw e;
    }
    const db = this.prisma.client;
    const running = await db.importJob.findFirst({
      where: { workspaceId, kind: 'WEBSITE', status: { in: [...ACTIVE] } },
      select: { id: true },
    });
    if (running)
      throw new ConflictException(
        'A website scan is already running for this store. Wait for it to finish or cancel it.',
      );
    const origin = url.origin;
    const source =
      (await db.importSource.findFirst({ where: { workspaceId, kind: 'WEBSITE', url: origin } })) ??
      (await db.importSource.create({
        data: {
          workspaceId,
          kind: 'WEBSITE',
          name: url.hostname,
          url: origin,
          createdById: userId,
        },
      }));
    const state: ScanState = {
      origin,
      start: url.toString(),
      options: {
        country: input.country,
        category: input.category,
        instructions: input.instructions,
      },
      frontier: [{ url: url.toString(), depth: 0 }],
      visited: [],
      keys: [],
      warnings: [],
      robotsTxt: null,
      texts: [],
      contact: { emails: [], phones: [], socials: [] },
      lockUntil: 0,
    };
    const job = await db.importJob.create({
      data: {
        workspaceId,
        sourceId: source.id,
        kind: 'WEBSITE',
        createdById: userId,
        state: state as unknown as Prisma.InputJsonValue,
      },
    });
    await db.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'brain.import.scan',
        entityType: 'import_job',
        entityId: job.id,
        metadata: { description: `Started a website scan of ${url.hostname}` },
      },
    });
    return this.detail(workspaceId, job.id);
  }

  // ---------- reading ----------

  private view(j: {
    id: string;
    sourceId: string | null;
    kind: 'WEBSITE' | 'XML_FEED' | 'META_CATALOG' | 'GOOGLE_MERCHANT' | 'MANUAL';
    status: 'QUEUED' | 'RUNNING' | 'NEEDS_REVIEW' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    stats: unknown;
    error: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: j.id,
      sourceId: j.sourceId,
      kind: j.kind,
      status: j.status,
      stats: (j.stats as Record<string, number> | null) ?? null,
      error: j.error,
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
    };
  }

  private async load(workspaceId: string, jobId: string) {
    let j;
    try {
      j = await this.prisma.client.importJob.findFirst({ where: { id: jobId, workspaceId } });
    } catch (e) {
      // Without the import tables no import can exist, so it is simply not found.
      const code = (e as { code?: string }).code;
      if (code === 'P2021' || code === 'P2022') j = null;
      else throw e;
    }
    if (!j) throw new NotFoundException('Import not found.');
    return j;
  }

  async detail(workspaceId: string, jobId: string) {
    const j = await this.load(workspaceId, jobId);
    const s = j.state as unknown as ScanState | null;
    return {
      job: this.view(j),
      progress:
        j.kind === 'XML_FEED' || j.kind === 'META_CATALOG' || j.kind === 'GOOGLE_MERCHANT'
          ? {
              pages: (j.stats as { items?: number } | null)?.items ?? 0,
              maxPages: (j.stats as { items?: number } | null)?.items ?? 0,
            }
          : {
              pages: s?.visited?.length ?? (j.stats as { pages?: number } | null)?.pages ?? 0,
              maxPages: MAX_PAGES,
            },
      warnings: s?.warnings ?? [],
      url: s?.start ?? (s as unknown as { url?: string } | null)?.url ?? null,
    };
  }

  async records(workspaceId: string, jobId: string) {
    await this.load(workspaceId, jobId);
    const rows = await this.prisma.client.importRecord.findMany({
      where: { workspaceId, jobId },
      orderBy: [{ category: 'asc' }, { confidence: 'desc' }, { createdAt: 'asc' }],
      take: 1000,
    });
    return {
      data: rows.map((r) => {
        const data = r.data as Record<string, string>;
        const original = r.original as Record<string, string>;
        return {
          id: r.id,
          jobId: r.jobId,
          category: r.category as ImportCategory,
          title: r.title,
          data,
          original,
          edited: JSON.stringify(data) !== JSON.stringify(original),
          sourceUrl: r.sourceUrl,
          confidence: r.confidence,
          warnings: (r.warnings as string[] | null) ?? [],
          status: r.status,
        };
      }),
    };
  }

  // ---------- running ----------

  /**
   * Advances an active scan for at most `budgetMs`: fetch a few pages, store what they contain, queue their best links.
   * Safe to call repeatedly and from several places; a short lock makes overlapping calls do nothing.
   */
  async step(workspaceId: string, jobId: string, budgetMs = 9000) {
    const db = this.prisma.client;
    const job = await this.load(workspaceId, jobId);
    if (job.kind === 'XML_FEED' || job.kind === 'META_CATALOG' || job.kind === 'GOOGLE_MERCHANT') {
      if (job.kind === 'XML_FEED') await this.feeds.step(workspaceId, jobId);
      else if (job.kind === 'META_CATALOG') await this.catalog.step(workspaceId, jobId);
      else await this.google.step(workspaceId, jobId);
      return this.detail(workspaceId, jobId);
    }
    if (!ACTIVE.includes(job.status as 'QUEUED')) return this.detail(workspaceId, jobId);
    const s = job.state as unknown as ScanState;
    if (s.lockUntil > Date.now()) return this.detail(workspaceId, jobId);
    s.lockUntil = Date.now() + budgetMs + 8000;
    await db.importJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        startedAt: job.startedAt ?? new Date(),
        state: s as unknown as Prisma.InputJsonValue,
      },
    });
    const t0 = Date.now();
    try {
      if (s.robotsTxt === null) {
        s.robotsTxt = await this.fetchRobots(s.origin);
        await this.seedFromSitemap(s);
      }
      const robots: Robots = parseRobots(s.robotsTxt);
      const delay = Math.min(3000, Math.max(700, (robots.crawlDelay ?? 0) * 1000));
      while (s.frontier.length && s.visited.length < MAX_PAGES && Date.now() - t0 < budgetMs) {
        // a cancel from another request must stop the crawl at the next page
        const fresh = await db.importJob.findUnique({
          where: { id: job.id },
          select: { status: true },
        });
        if (fresh?.status !== 'RUNNING') return this.detail(workspaceId, jobId);
        s.frontier.sort((a, b) => linkPriority(b.url) - linkPriority(a.url) || a.depth - b.depth);
        const next = s.frontier.shift()!;
        if (s.visited.includes(next.url)) continue;
        s.visited.push(next.url);
        const path = new URL(next.url).pathname + new URL(next.url).search;
        if (!robots.allowed(path)) {
          s.warnings.push(`Skipped ${path}: the site's robots.txt does not allow it.`);
          continue;
        }
        try {
          const r = await safeGet(next.url, { timeoutMs: 8000 });
          if (r.status === 429 || r.status === 503) {
            // The site is asking crawlers to slow down. Stop politely and keep what was already found.
            s.warnings.push(
              `The site asked us to slow down (HTTP ${r.status}), so the scan stopped early with what it had read.`,
            );
            s.frontier = [];
            break;
          }
          if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
          const page = parsePage(r.url, r.body);
          await this.store(workspaceId, job.id, s, page);
          if (next.depth < MAX_DEPTH)
            for (const l of page.links) {
              let u: URL;
              try {
                u = parsePublicUrl(l);
              } catch {
                continue;
              }
              if (u.origin.replace('://www.', '://') !== s.origin.replace('://www.', '://'))
                continue;
              u.search = '';
              const href = u.toString();
              if (
                linkPriority(href) < 0 ||
                s.visited.includes(href) ||
                s.frontier.some((f) => f.url === href)
              )
                continue;
              if (s.frontier.length < 60) s.frontier.push({ url: href, depth: next.depth + 1 });
            }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'failed';
          if (s.visited.length === 1) {
            await this.finish(job.id, s, 'FAILED', `The website could not be read: ${msg}`);
            return this.detail(workspaceId, jobId);
          }
          if (s.warnings.length < 20) s.warnings.push(`Could not read ${next.url}: ${msg}`);
        }
        await db.importJob.update({
          where: { id: job.id },
          data: { state: s as unknown as Prisma.InputJsonValue },
        });
        await new Promise((r) => setTimeout(r, delay));
      }
      if (!s.frontier.length || s.visited.length >= MAX_PAGES)
        await this.complete(workspaceId, job.id, s);
      else {
        s.lockUntil = 0;
        await db.importJob.update({
          where: { id: job.id },
          data: { state: s as unknown as Prisma.InputJsonValue },
        });
      }
    } catch (e) {
      this.log.warn(`Scan ${job.id} step failed: ${(e as Error).message}`);
      await this.finish(job.id, s, 'FAILED', 'The scan stopped unexpectedly. You can retry it.');
    }
    return this.detail(workspaceId, jobId);
  }

  /**
   * Many storefronts draw product grids with scripts, so their product pages are not linked in the HTML. The sitemap lists
   * them. A few well-spread product pages and help pages from it are queued so the scan can read real product data.
   */
  private async seedFromSitemap(s: ScanState) {
    try {
      const listed = sitemapsFromRobots(s.robotsTxt ?? '');
      const roots = listed.length ? listed : [`${s.origin}/sitemap.xml`];
      const urls: string[] = [];
      for (const root of roots.slice(0, 2)) {
        const first = await safeGet(root, {
          timeoutMs: 8000,
          maxBytes: 3_000_000,
          accept: /xml|text\/plain|octet-stream/i,
        });
        if (first.status >= 400) continue;
        if (isSitemapIndex(first.body)) {
          for (const child of productSitemaps(sitemapLocs(first.body))) {
            const c = await safeGet(child, {
              timeoutMs: 8000,
              maxBytes: 3_000_000,
              accept: /xml|text\/plain|octet-stream/i,
            });
            if (c.status < 400) urls.push(...sitemapLocs(c.body));
          }
        } else urls.push(...sitemapLocs(first.body));
      }
      for (const u of pickSitemapPages(urls, s.origin)) {
        try {
          const href = parsePublicUrl(u).toString();
          if (!s.frontier.some((f) => f.url === href))
            s.frontier.push({ url: href, depth: MAX_DEPTH });
        } catch {
          /* skip an address that is not allowed */
        }
      }
    } catch {
      // no usable sitemap: the scan simply continues with the pages it can reach by links
    }
  }

  private async fetchRobots(origin: string) {
    try {
      const r = await safeGet(`${origin}/robots.txt`, {
        timeoutMs: 5000,
        maxBytes: 100_000,
        accept: /text\/|application\/octet/i,
      });
      return r.status < 400 ? r.body.slice(0, 20_000) : '';
    } catch {
      return '';
    }
  }

  private async store(workspaceId: string, jobId: string, s: ScanState, page: PageInfo) {
    const c = contactOf([page]);
    for (const k of ['emails', 'phones', 'socials'] as const)
      s.contact[k] = [...new Set([...s.contact[k], ...c[k]])].slice(0, 6);
    if (page.text.length > 200 && s.texts.length < 10)
      s.texts.push({ url: page.url, text: page.text.slice(0, 2500) });
    const fresh = candidatesFromPage(page).filter(
      (c) => !s.keys.includes(keyOf(c)) || c.category === 'business',
    );
    for (const c of fresh) if (c.category !== 'business') s.keys.push(keyOf(c));
    if (fresh.length)
      await this.prisma.client.importRecord.createMany({
        data: fresh.map((c) => ({
          workspaceId,
          jobId,
          category: c.category,
          title: c.title,
          data: c.data as Prisma.InputJsonValue,
          original: c.data as Prisma.InputJsonValue,
          sourceUrl: c.sourceUrl,
          confidence: c.confidence,
          warnings: c.warnings as Prisma.InputJsonValue,
        })),
      });
  }

  /** End of the crawl: optional AI structuring, one merged business entry, then hand over for review. */
  private async complete(workspaceId: string, jobId: string, s: ScanState) {
    const db = this.prisma.client;
    if (this.cfg.ANTHROPIC_API_KEY && s.texts.length) {
      try {
        const ai = await aiCandidates({
          apiKey: this.cfg.ANTHROPIC_API_KEY,
          model: this.cfg.ANTHROPIC_MODEL,
          pages: s.texts,
          context: s.options,
        });
        const existing = await db.importRecord.findMany({
          where: { jobId },
          select: { category: true, title: true, data: true },
        });
        const have = new Set(
          existing.map((r) =>
            keyOf({
              category: r.category as ImportCategory,
              title: r.title,
              data: r.data as Record<string, string>,
            } as Candidate),
          ),
        );
        const add = ai.filter((c) => c.category === 'business' || !have.has(keyOf(c)));
        if (add.length)
          await db.importRecord.createMany({
            data: add.map((c) => ({
              workspaceId,
              jobId,
              category: c.category,
              title: c.title,
              data: c.data as Prisma.InputJsonValue,
              original: c.data as Prisma.InputJsonValue,
              sourceUrl: c.sourceUrl,
              confidence: c.confidence,
              warnings: c.warnings as Prisma.InputJsonValue,
            })),
          });
        s.warnings.push(
          `AI structuring added ${add.length} ${add.length === 1 ? 'entry' : 'entries'}; each was checked against its page.`,
        );
      } catch (e) {
        s.warnings.push(
          `AI structuring was skipped: ${e instanceof Error ? e.message : 'unavailable'}.`,
        );
      }
    } else if (!this.cfg.ANTHROPIC_API_KEY) {
      s.warnings.push(
        'AI structuring is not configured, so only structured data and clearly marked pages were read.',
      );
    }
    // One business entry: the strongest one, filled in from the others and from contact links found on the pages.
    const biz = await db.importRecord.findMany({
      where: { jobId, category: 'business' },
      orderBy: { confidence: 'desc' },
    });
    if (biz.length) {
      const [best, ...rest] = biz;
      const data = { ...(best!.data as Record<string, string>) };
      for (const r of rest)
        for (const [k, v] of Object.entries(r.data as Record<string, string>))
          if (!data[k]) data[k] = v;
      if (!data['email'] && s.contact.emails[0]) data['email'] = s.contact.emails[0];
      if (!data['phone'] && s.contact.phones[0]) data['phone'] = s.contact.phones[0];
      if (!data['website']) data['website'] = s.origin;
      if (s.contact.socials.length) data['social'] = s.contact.socials.join(', ');
      await db.importRecord.update({ where: { id: best!.id }, data: { data, original: data } });
      if (rest.length)
        await db.importRecord.deleteMany({ where: { id: { in: rest.map((r) => r.id) } } });
    }
    const counts = await db.importRecord.groupBy({
      by: ['category'],
      where: { jobId },
      _count: true,
    });
    const stats: Record<string, number> = { pages: s.visited.length };
    for (const c of counts)
      stats[
        c.category === 'business' ? 'business' : `${c.category}s`.replace('policys', 'policies')
      ] = c._count;
    const total = counts.reduce((n, c) => n + c._count, 0);
    if (total === 0)
      s.warnings.push(
        'Nothing recognisable was found. Pages without structured data, FAQs or policy text yield no entries, and nothing is guessed.',
      );
    s.texts = [];
    s.frontier = [];
    s.lockUntil = 0;
    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: total ? 'NEEDS_REVIEW' : 'COMPLETED',
        finishedAt: new Date(),
        stats,
        state: s as unknown as Prisma.InputJsonValue,
      },
    });
    await db.importSource.updateMany({
      where: {
        id:
          (await db.importJob.findUnique({ where: { id: jobId }, select: { sourceId: true } }))
            ?.sourceId ?? '',
      },
      data: { lastSyncedAt: new Date(), lastError: null },
    });
  }

  private async finish(
    jobId: string,
    s: ScanState,
    status: 'FAILED' | 'CANCELLED',
    error: string | null,
  ) {
    const db = this.prisma.client;
    s.texts = [];
    s.lockUntil = 0;
    const j = await db.importJob.update({
      where: { id: jobId },
      data: { status, error, finishedAt: new Date(), state: s as unknown as Prisma.InputJsonValue },
      select: { sourceId: true },
    });
    if (status === 'FAILED' && j.sourceId)
      await db.importSource.updateMany({ where: { id: j.sourceId }, data: { lastError: error } });
  }

  async cancel(workspaceId: string, jobId: string) {
    const j = await this.load(workspaceId, jobId);
    if (!ACTIVE.includes(j.status as 'QUEUED'))
      throw new ConflictException('This scan has already finished.');
    await this.finish(j.id, j.state as unknown as ScanState, 'CANCELLED', null);
    return this.detail(workspaceId, jobId);
  }

  async retry(workspaceId: string, userId: string, jobId: string) {
    const j = await this.load(workspaceId, jobId);
    if (j.status !== 'FAILED' && j.status !== 'CANCELLED')
      throw new ConflictException('Only a failed or cancelled scan can be retried.');
    if (j.kind === 'GOOGLE_MERCHANT')
      return this.detail(workspaceId, await this.google.startJob(workspaceId, userId));
    if (j.kind === 'META_CATALOG')
      return this.detail(workspaceId, await this.catalog.startJob(workspaceId, userId));
    if (j.kind === 'XML_FEED') {
      if (!j.sourceId) throw new ConflictException('This feed is no longer connected.');
      return this.detail(workspaceId, await this.feeds.startJob(workspaceId, userId, j.sourceId));
    }
    const s = j.state as unknown as ScanState;
    return this.start(workspaceId, userId, { url: s.start, ...s.options });
  }

  // ---------- review ----------

  async review(
    workspaceId: string,
    recordId: string,
    body: { status?: 'PENDING' | 'APPROVED' | 'REJECTED'; data?: Record<string, string> },
  ) {
    const db = this.prisma.client;
    const r = await db.importRecord.findFirst({ where: { id: recordId, workspaceId } });
    if (!r) throw new NotFoundException('Entry not found.');
    if (r.status === 'IMPORTED')
      throw new ConflictException('This entry was already imported. Edit it in Knowledge instead.');
    const data: Record<string, unknown> = {};
    if (body.status) data['status'] = body.status;
    if (body.data) {
      const orig = r.original as Record<string, string>;
      const merged: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.data)) if (k in orig || v.trim()) merged[k] = v;
      for (const k of Object.keys(orig))
        if (!(k in merged) && !(k in body.data))
          merged[k] = (r.data as Record<string, string>)[k] ?? orig[k]!;
      data['data'] = merged;
      data['title'] = merged['name'] ?? merged['q'] ?? r.title;
    }
    await db.importRecord.update({ where: { id: r.id }, data });
    return (await this.records(workspaceId, r.jobId)).data.find((x) => x.id === r.id)!;
  }

  async bulk(
    workspaceId: string,
    jobId: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    categories?: ImportCategory[],
  ) {
    await this.load(workspaceId, jobId);
    const res = await this.prisma.client.importRecord.updateMany({
      where: {
        workspaceId,
        jobId,
        status: { in: ['PENDING', 'APPROVED', 'REJECTED'] },
        ...(categories?.length && { category: { in: categories } }),
      },
      data: { status },
    });
    return { updated: res.count };
  }

  // ---------- importing ----------

  /**
   * Adds the approved entries to Brain. Existing knowledge is never overwritten: business details only fill blanks, and a
   * product or FAQ that is already there (same name or question) is skipped and reported.
   */
  async importApproved(
    workspaceId: string,
    userId: string,
    jobId: string | null,
    categories?: ImportCategory[],
  ) {
    const db = this.prisma.client;
    if (jobId) await this.load(workspaceId, jobId);
    const rows = await db.importRecord.findMany({
      where: {
        workspaceId,
        ...(jobId && { jobId }),
        status: 'APPROVED',
        ...(categories?.length && { category: { in: categories } }),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!rows.length) throw new BadRequestException('Approve at least one entry first.');
    const doc = await this.brain.get(workspaceId);
    const cfg: BrainConfig = structuredClone(doc.config);
    const notes: string[] = [];
    let skipped = 0;
    let updated = 0;
    let capped = 0;
    const done: string[] = [];
    const prodNames = new Set(cfg.products.map((p) => norm(p.name)));
    const faqQs = new Set(cfg.faqs.map((f) => norm(f.q)));
    const FAQ_CAT: Record<string, BrainConfig['faqs'][number]['cat']> = {
      shipping: 'Delivery',
      returns: 'Returns',
      exchange: 'Returns',
      payment: 'Payments',
      terms: 'General',
      privacy: 'General',
    };
    const POLICY_Q: Record<string, string> = {
      shipping: 'What is your shipping and delivery policy?',
      returns: 'What is your return and refund policy?',
      exchange: 'What is your exchange policy?',
      payment: 'Which payment methods do you accept?',
      terms: 'What are your terms and conditions?',
      privacy: 'What is your privacy policy?',
    };
    for (const r of rows) {
      const d = r.data as Record<string, string>;
      if (r.category === 'business') {
        const fill = (
          k: 'name' | 'description' | 'category' | 'country' | 'website',
          max: number,
          from = k,
        ) => {
          if (d[from] && !cfg.identity[k].trim()) cfg.identity[k] = d[from]!.slice(0, max);
        };
        fill('name', 120);
        fill('description', 1000);
        fill('category', 80);
        fill('country', 80);
        fill('website', 200);
        done.push(r.id);
      } else if (r.category === 'product') {
        const key = norm(d['name'] ?? '');
        const existing = cfg.products.find((p) => norm(p.name) === key);
        if (d['change'] === 'changed' && existing) {
          // A changed product from a feed: the approval is the permission to update the matching product.
          // A currency on its own never changes the price: only a given price does.
          if (d['price'])
            existing.price = [d['price'], d['currency']].filter(Boolean).join(' ').slice(0, 20);
          if (d['description']) existing.description = d['description'].slice(0, 1000);
          if (d['category']) existing.category = d['category'].slice(0, 60);
          if (d['colors']) existing.colors = d['colors'].slice(0, 300);
          if ((STOCK_STATES as readonly string[]).includes(d['stock'] ?? ''))
            existing.stock = d['stock'] as (typeof STOCK_STATES)[number];
          updated++;
          done.push(r.id);
          continue;
        }
        if (existing) {
          skipped++;
          continue;
        }
        if (cfg.products.length >= 300) {
          capped++;
          continue;
        }
        prodNames.add(norm(d['name']!));
        const price = [d['price'], d['currency']].filter(Boolean).join(' ').slice(0, 20);
        cfg.products.push({
          id: uid(),
          name: d['name']!.slice(0, 120),
          category: (d['category'] ?? '').slice(0, 60),
          description: (d['description'] ?? '').slice(0, 1000),
          price,
          variants: '',
          sizes: '',
          colors: (d['colors'] ?? '').slice(0, 300),
          stock: (STOCK_STATES as readonly string[]).includes(d['stock'] ?? '')
            ? (d['stock'] as (typeof STOCK_STATES)[number])
            : 'In stock',
          benefits: '',
          usage: '',
          limitations: '',
          faqs: '',
        });
        done.push(r.id);
      } else if (r.category === 'faq' || r.category === 'policy') {
        const q =
          r.category === 'faq' ? d['q']! : (POLICY_Q[d['kind'] ?? ''] ?? `About ${r.title}`);
        const a = r.category === 'faq' ? d['a']! : d['text']!;
        if (!q || !a || faqQs.has(norm(q)) || cfg.faqs.length >= 500) {
          skipped++;
          continue;
        }
        faqQs.add(norm(q));
        cfg.faqs.push({
          id: uid(),
          q: q.slice(0, 300),
          a: a.slice(0, 2000),
          cat: r.category === 'faq' ? 'General' : (FAQ_CAT[d['kind'] ?? ''] ?? 'General'),
          active: true,
        });
        done.push(r.id);
      }
    }
    if (!done.length) {
      await db.importRecord.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: 'IMPORTED' },
      });
      return {
        imported: 0,
        skippedDuplicates: skipped,
        notes: ['Everything approved was already in your Brain.'],
      };
    }
    await this.brain.save(workspaceId, userId, cfg, doc.version);
    await db.importRecord.updateMany({
      where: {
        id: { in: [...done, ...rows.filter((r) => !done.includes(r.id)).map((r) => r.id)] },
      },
      data: { status: 'IMPORTED' },
    });
    // A job is finished once nothing in it is waiting for review any more.
    const open = await db.importJob.findMany({
      where: { workspaceId, status: 'NEEDS_REVIEW' },
      select: { id: true },
    });
    for (const jid of new Set([...rows.map((r) => r.jobId), ...open.map((j) => j.id)])) {
      const left = await db.importRecord.count({
        where: { jobId: jid, status: { in: ['PENDING', 'APPROVED'] } },
      });
      if (left === 0)
        await db.importJob.updateMany({
          where: { id: jid, status: 'NEEDS_REVIEW' },
          data: { status: 'COMPLETED' },
        });
    }
    await db.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'brain.import',
        entityType: 'import_job',
        entityId: jobId ?? rows[0]!.jobId,
        metadata: {
          description: `Imported ${done.length} approved ${done.length === 1 ? 'entry' : 'entries'}${jobId ? '' : ' from the product review'}`,
        },
      },
    });
    if (skipped) notes.push(`${skipped} already in your Brain, so they were left alone.`);
    if (updated)
      notes.push(`${updated} existing product${updated === 1 ? ' was' : 's were'} updated.`);
    if (capped) notes.push(`${capped} not added: Brain holds up to 300 products.`);
    return { imported: done.length, skippedDuplicates: skipped, notes };
  }

  /** For a scheduler: resume the oldest active scan that nobody is advancing. */
  async tick(budgetMs = 25_000) {
    const job = await this.prisma.client.importJob.findFirst({
      where: { kind: 'WEBSITE', status: { in: [...ACTIVE] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, workspaceId: true },
    });
    if (!job) return { advanced: false };
    await this.step(job.workspaceId, job.id, budgetMs);
    return { advanced: true };
  }
}
