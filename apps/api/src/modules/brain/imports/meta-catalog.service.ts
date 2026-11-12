import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FeedPreview, MetaCatalogList, MetaCatalogStatus } from '@torio/contracts';
import type { Prisma } from '@torio/database';
import { APP_CONFIG, type AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../database/prisma.service';
import { MetaConfigService } from '../../meta-config/meta-config.service';
import { explain, MetaConnectionService } from '../../meta/meta.connection.service';
import { MetaGraphProvider } from '../../meta/meta.graph-provider';
import type { MetaCatalogProduct } from '../../meta/meta.graph';
import { ChannelCryptoService } from '../../whatsapp/channel-crypto.service';
import { classify, insertProposals, MAX_RECORDS, previousImports } from './propose';
import { effectiveMapping, mapItems, type FeedMapping, type RawItem } from './xml';

const ACTIVE = ['QUEUED', 'RUNNING'] as const;
const MAX_ITEMS = 5000;
const STEP_MS = 30_000;
const MAX_STEP_PAGES = 12;
/** The catalog's fields land under these names, so the shared mapping and validation apply unchanged. */
const MAPPING: FeedMapping = {
  externalId: 'id',
  name: 'title',
  description: 'description',
  price: 'price',
  category: 'product_type',
  stock: 'availability',
  colors: 'color',
  sizes: 'size',
  url: 'link',
  image: 'image_link',
};

interface CatalogConfig {
  catalogId?: string;
  catalogName?: string;
}
interface CatalogState {
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
interface Secret {
  token: string;
}

export const toRaw = (p: MetaCatalogProduct): RawItem => {
  const out: RawItem = {};
  const set = (k: string, v: string | undefined) => v && (out[k] = v);
  set('id', p.retailer_id || p.id);
  set('title', p.name);
  set('description', p.description);
  // Meta returns a formatted price ("$15.00", "15.00 USD"); the separate currency code is appended so it is never lost.
  set(
    'price',
    p.price
      ? `${p.price}${p.currency && !p.price.includes(p.currency) ? ` ${p.currency}` : ''}`
      : undefined,
  );
  set('availability', p.availability);
  set('link', p.url);
  set('image_link', p.image_url);
  set('product_type', p.category);
  set('color', p.color);
  set('size', p.size);
  return out;
};

/**
 * Meta Catalog import. The person authorizes Torio's Meta app with catalog permissions (the same app and redirect as the
 * channel connections, with a state that can only be completed here). The long-lived token is stored encrypted and never
 * leaves the server. Products are fetched with the Graph API, mapped and validated like feed products, and proposed for
 * review; nothing reaches Brain without approval.
 */
@Injectable()
export class MetaCatalogService {
  private readonly log = new Logger(MetaCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaConnectionService,
    private readonly graph: MetaGraphProvider,
    private readonly mc: MetaConfigService,
    private readonly crypto: ChannelCryptoService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {
    this.meta.registerCatalogHandler((st, code) => this.complete(st, code));
  }

  // ---------- availability and status ----------

  private async unavailableReason(): Promise<string | null> {
    await this.mc.load();
    if (!this.cfg.META_CATALOG_ENABLED)
      return 'Catalog import is switched off on this server. It needs the Torio Meta app to have Advanced access to the catalog_management permission (Meta App Review).';
    if (!this.meta.catalogOauthReady)
      return 'The Torio Meta app is not configured yet (App ID, secret, redirect and the server encryption key).';
    return null;
  }

  private async source(workspaceId: string) {
    return this.prisma.client.importSource.findFirst({
      where: { workspaceId, kind: 'META_CATALOG' },
      include: { secret: { select: { id: true, expiresAt: true } } },
    });
  }

  async status(workspaceId: string): Promise<MetaCatalogStatus> {
    const reason = await this.unavailableReason();
    let s: Awaited<ReturnType<MetaCatalogService['source']>> = null;
    try {
      s = await this.source(workspaceId);
    } catch (e) {
      if (!['P2021', 'P2022'].includes((e as { code?: string }).code ?? '')) throw e;
    }
    const cfg = (s?.config ?? {}) as CatalogConfig;
    const connected = !!s && s.status !== 'DISCONNECTED' && !!s.secret;
    return {
      available: reason === null,
      reason,
      connected,
      sourceId: s?.id ?? null,
      status: s?.status ?? null,
      lastError: s?.lastError ?? null,
      catalog: cfg.catalogId ? { id: cfg.catalogId, name: cfg.catalogName ?? cfg.catalogId } : null,
      lastSyncedAt: s?.lastSyncedAt?.toISOString() ?? null,
    };
  }

  // ---------- connecting ----------

  async connect(workspaceId: string, userId: string) {
    const reason = await this.unavailableReason();
    if (reason) throw new ServiceUnavailableException(reason);
    return this.meta.startCatalog(workspaceId, userId);
  }

  /** Called by the shared Meta redirect once the state is verified. Returns the web URL to send the browser to. */
  private async complete(st: { w: string; u: string }, code: string): Promise<string> {
    const base = `${this.mc.current.webUrl.replace(/\/$/, '')}/brain?tab=intelligence`;
    if (await this.unavailableReason()) return `${base}&meta_catalog=not_configured`;
    const c = this.mc.current;
    try {
      const g = this.graph.get();
      const short = await g.exchangeCode({
        appId: c.appId!,
        appSecret: c.appSecret!,
        redirectUri: c.oauthRedirectUri!,
        code,
      });
      const long = await g.longLivedUserToken({
        appId: c.appId!,
        appSecret: c.appSecret!,
        token: short.access_token,
      });
      const granted = await g.grantedPermissions(long.access_token);
      if (!granted.has('catalog_management') || !granted.has('business_management'))
        return `${base}&meta_catalog=missing_permissions`;
      const db = this.prisma.client;
      const existing = await db.importSource.findFirst({
        where: { workspaceId: st.w, kind: 'META_CATALOG' },
      });
      const source = existing
        ? await db.importSource.update({
            where: { id: existing.id },
            data: { status: 'ACTIVE', lastError: null },
          })
        : await db.importSource.create({
            data: {
              workspaceId: st.w,
              kind: 'META_CATALOG',
              name: 'Meta Catalog',
              createdById: st.u,
            },
          });
      const ciphertext = this.crypto.encrypt(
        JSON.stringify({ token: long.access_token } satisfies Secret),
      );
      const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;
      await db.importSourceSecret.upsert({
        where: { sourceId: source.id },
        create: { sourceId: source.id, workspaceId: st.w, ciphertext, expiresAt },
        update: { ciphertext, expiresAt },
      });
      await db.auditLog.create({
        data: {
          workspaceId: st.w,
          actorId: st.u,
          action: 'brain.import.meta_connect',
          entityType: 'import_source',
          entityId: source.id,
          metadata: { description: 'Connected a Meta product catalog account' },
        },
      });
      return `${base}&meta_catalog=connected`;
    } catch (e) {
      this.log.warn(`Meta catalog authorization failed: ${(e as Error).name}`);
      return `${base}&meta_catalog=exchange_failed`;
    }
  }

  private async token(workspaceId: string): Promise<{ token: string; sourceId: string }> {
    const reason = await this.unavailableReason();
    if (reason) throw new ServiceUnavailableException(reason);
    const s = await this.prisma.client.importSource.findFirst({
      where: { workspaceId, kind: 'META_CATALOG', status: { not: 'DISCONNECTED' } },
      include: { secret: true },
    });
    if (!s?.secret) throw new ConflictException('Meta is not connected. Connect it first.');
    return {
      token: (JSON.parse(this.crypto.decrypt(s.secret.ciphertext)) as Secret).token,
      sourceId: s.id,
    };
  }

  /** Meta failures in words a person can act on. A rejected token marks the source so the page says to reconnect. */
  private async fail(sourceId: string, e: unknown): Promise<never> {
    const msg = explain(e);
    if ((e as { tokenExpired?: boolean }).tokenExpired)
      await this.prisma.client.importSource.update({
        where: { id: sourceId },
        data: { status: 'ERROR', lastError: msg },
      });
    throw new BadRequestException(msg);
  }

  // ---------- choosing a catalog ----------

  async catalogs(workspaceId: string): Promise<MetaCatalogList> {
    const { token, sourceId } = await this.token(workspaceId);
    try {
      const g = this.graph.get();
      const out: MetaCatalogList['data'] = [];
      for (const b of await g.businesses(token)) {
        for (const c of await g.ownedCatalogs(token, b.id))
          out.push({
            id: c.id,
            name: c.name ?? c.id,
            businessName: b.name ?? null,
            productCount: c.product_count ?? null,
          });
      }
      return { data: out };
    } catch (e) {
      return this.fail(sourceId, e);
    }
  }

  async select(workspaceId: string, catalogId: string) {
    // Only a catalog this person's account can actually see may be chosen, whatever id the browser sends.
    const list = await this.catalogs(workspaceId);
    const found = list.data.find((c) => c.id === catalogId);
    if (!found)
      throw new BadRequestException('That catalog is not available to the connected Meta account.');
    const s = await this.source(workspaceId);
    await this.prisma.client.importSource.update({
      where: { id: s!.id },
      data: {
        name: `Meta Catalog: ${found.name}`.slice(0, 120),
        config: { catalogId: found.id, catalogName: found.name } as Prisma.InputJsonValue,
      },
    });
    return this.status(workspaceId);
  }

  async disconnect(workspaceId: string) {
    const db = this.prisma.client;
    const s = await db.importSource.findFirst({ where: { workspaceId, kind: 'META_CATALOG' } });
    if (!s) throw new NotFoundException('Meta is not connected.');
    await db.importJob.updateMany({
      where: { sourceId: s.id, workspaceId, status: { in: [...ACTIVE] } },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    // The stored token is removed; knowledge already imported stays in Brain.
    await db.importSourceSecret.deleteMany({ where: { sourceId: s.id } });
    await db.importSource.update({ where: { id: s.id }, data: { status: 'DISCONNECTED' } });
    return { ok: true };
  }

  // ---------- preview and sync ----------

  async preview(workspaceId: string): Promise<FeedPreview> {
    const { token, sourceId } = await this.token(workspaceId);
    const s = await this.source(workspaceId);
    const catalogId = (s?.config as CatalogConfig | null)?.catalogId;
    if (!catalogId) throw new ConflictException('Choose a catalog first.');
    try {
      const g = this.graph.get();
      const items: RawItem[] = [];
      let after: string | undefined;
      for (let i = 0; i < 2; i++) {
        const r = await g.catalogProducts(token, catalogId, after);
        items.push(...r.products.map(toRaw));
        if (!r.next) break;
        after = r.next;
      }
      const mapped = mapItems(items, effectiveMapping(items, MAPPING));
      return {
        format: 'meta-catalog',
        totalItems: items.length,
        valid: mapped.products.length,
        invalid: mapped.invalid,
        duplicates: mapped.duplicates,
        missingPrice: mapped.missingPrice,
        truncated: false,
        tags: [],
        mapping: {},
        issues: [
          ...mapped.issues,
          ...(items.length >= 200
            ? [
                'Showing a sample of the first 200 products; the full catalog is read when you import.',
              ]
            : []),
        ],
        sample: mapped.products.slice(0, 5).map((p) => ({ data: p.data, warnings: p.warnings })),
      };
    } catch (e) {
      return this.fail(sourceId, e);
    }
  }

  async startJob(workspaceId: string, userId: string | null) {
    const s = await this.source(workspaceId);
    const cfg = (s?.config ?? {}) as CatalogConfig;
    if (!s || s.status === 'DISCONNECTED') throw new ConflictException('Meta is not connected.');
    if (!cfg.catalogId) throw new ConflictException('Choose a catalog first.');
    const db = this.prisma.client;
    const running = await db.importJob.findFirst({
      where: { workspaceId, sourceId: s.id, status: { in: [...ACTIVE] } },
      select: { id: true },
    });
    if (running) throw new ConflictException('This catalog is already syncing.');
    const state: CatalogState = {
      catalogId: cfg.catalogId,
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
    };
    const job = await db.importJob.create({
      data: {
        workspaceId,
        sourceId: s.id,
        kind: 'META_CATALOG',
        createdById: userId,
        state: state as unknown as Prisma.InputJsonValue,
      },
    });
    await db.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'brain.import.meta_sync',
        entityType: 'import_job',
        entityId: job.id,
        metadata: {
          description: `Started a sync of the Meta catalog ${cfg.catalogName ?? cfg.catalogId}`,
        },
      },
    });
    return job.id;
  }

  /** Reads catalog pages for a bounded time, proposing new or changed products, and carries on from the cursor next call. */
  async step(workspaceId: string, jobId: string) {
    const db = this.prisma.client;
    const job = await db.importJob.findFirst({
      where: { id: jobId, workspaceId, kind: 'META_CATALOG' },
    });
    if (!job) throw new NotFoundException('Import not found.');
    if (!ACTIVE.includes(job.status as 'QUEUED')) return;
    const s = job.state as unknown as CatalogState;
    if (s.lockUntil > Date.now()) return;
    s.lockUntil = Date.now() + STEP_MS + 15_000;
    await db.importJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        startedAt: job.startedAt ?? new Date(),
        state: s as unknown as Prisma.InputJsonValue,
      },
    });
    try {
      const { token } = await this.token(workspaceId);
      const g = this.graph.get();
      const previous = await previousImports(this.prisma, workspaceId, job.sourceId, job.id);
      const t0 = Date.now();
      let done = false;
      for (let page = 0; page < MAX_STEP_PAGES && Date.now() - t0 < STEP_MS; page++) {
        const fresh = await db.importJob.findUnique({
          where: { id: job.id },
          select: { status: true },
        });
        if (fresh?.status !== 'RUNNING') return;
        const r = await g.catalogProducts(token, s.catalogId, s.cursor ?? undefined);
        const raws = r.products.map(toRaw);
        s.items += raws.length;
        const mapped = mapItems(raws, MAPPING);
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
        const room = MAX_RECORDS - s.proposed;
        const kept = proposals.slice(0, Math.max(0, room));
        await insertProposals(
          this.prisma,
          workspaceId,
          job.id,
          kept,
          'https://business.facebook.com',
        );
        s.proposed += kept.length;
        s.newCount += kept.filter((p) => p.change === 'new').length;
        s.changed += kept.filter((p) => p.change === 'changed').length;
        s.cursor = r.next;
        await db.importJob.update({
          where: { id: job.id },
          data: { state: s as unknown as Prisma.InputJsonValue },
        });
        if (!r.next || s.items >= MAX_ITEMS) {
          done = true;
          break;
        }
      }
      if (!done) {
        s.lockUntil = 0;
        await db.importJob.update({
          where: { id: job.id },
          data: { state: s as unknown as Prisma.InputJsonValue },
        });
        return;
      }
      const w: string[] = [];
      if (s.invalid)
        w.push(`${s.invalid} item${s.invalid === 1 ? ' has' : 's have'} no name and were skipped.`);
      if (s.duplicates)
        w.push(`${s.duplicates} duplicate${s.duplicates === 1 ? '' : 's'} ignored.`);
      if (s.unchanged)
        w.push(
          `${s.unchanged} product${s.unchanged === 1 ? ' is' : 's are'} unchanged since the last import and were left out.`,
        );
      if (s.items >= MAX_ITEMS) w.push('Only the first 5,000 products of the catalog were read.');
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
      const msg =
        e instanceof HttpException
          ? String((e.getResponse() as { message?: string }).message ?? e.message)
          : explain(e);
      if (!(e instanceof HttpException))
        this.log.warn(`Catalog job ${jobId} failed: ${(e as Error).message}`);
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
          data: {
            lastError: msg,
            ...((e as { tokenExpired?: boolean }).tokenExpired && { status: 'ERROR' as const }),
          },
        });
    }
  }
}
