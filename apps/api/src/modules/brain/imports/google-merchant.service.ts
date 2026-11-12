import {
  BadRequestException,
  ConflictException,
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
import { ChannelCryptoService } from '../../whatsapp/channel-crypto.service';
import { ACTIVE, newCatalogState, stepCatalog } from './catalog-step';
import {
  explainGoogle,
  GoogleApiError,
  GoogleMerchantClient,
  toRaw,
} from './google-merchant.client';
import { signState, verifyState } from './signed-state';
import { effectiveMapping, mapItems, type FeedMapping, type RawItem } from './xml';

/** The Merchant API fields land under these names, so the shared mapping and validation apply unchanged. */
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

interface AccountConfig {
  catalogId?: string;
  catalogName?: string;
}
interface Secret {
  refreshToken: string;
}

/**
 * Google Merchant Center import. The person authorizes Torio's Google app for the Merchant API scope; the refresh token is
 * stored encrypted on the server and exchanged for short-lived access tokens when needed, never sent to the browser.
 * Products are read with the Merchant API, mapped and validated like feed products, and proposed for review.
 * Sign-in with Google is a separate flow and is not used or changed here.
 */
@Injectable()
export class GoogleMerchantService {
  private readonly log = new Logger(GoogleMerchantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly api: GoogleMerchantClient,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  // ---------- availability and status ----------

  private get unavailableReason(): string | null {
    const c = this.cfg;
    if (!c.GOOGLE_MERCHANT_ENABLED)
      return 'Merchant Center import is switched off on this server. It needs a Google OAuth app approved for the Merchant API scope (Google OAuth verification).';
    if (
      !c.GOOGLE_CLIENT_ID ||
      !c.GOOGLE_CLIENT_SECRET ||
      !c.GOOGLE_MERCHANT_REDIRECT_URI ||
      !this.crypto.configured
    )
      return 'The Torio Google app is not configured yet (client ID and secret, the Merchant Center redirect address and the server encryption key).';
    return null;
  }

  private source(workspaceId: string) {
    return this.prisma.client.importSource.findFirst({
      where: { workspaceId, kind: 'GOOGLE_MERCHANT' },
      include: { secret: { select: { id: true } } },
    });
  }

  async status(workspaceId: string): Promise<MetaCatalogStatus> {
    const reason = this.unavailableReason;
    let s: Awaited<ReturnType<GoogleMerchantService['source']>> = null;
    try {
      s = await this.source(workspaceId);
    } catch (e) {
      if (!['P2021', 'P2022'].includes((e as { code?: string }).code ?? '')) throw e;
    }
    const cfg = (s?.config ?? {}) as AccountConfig;
    return {
      available: reason === null,
      reason,
      connected: !!s && s.status !== 'DISCONNECTED' && !!s.secret,
      sourceId: s?.id ?? null,
      status: s?.status ?? null,
      lastError: s?.lastError ?? null,
      catalog: cfg.catalogId ? { id: cfg.catalogId, name: cfg.catalogName ?? cfg.catalogId } : null,
      lastSyncedAt: s?.lastSyncedAt?.toISOString() ?? null,
    };
  }

  // ---------- connecting ----------

  connect(workspaceId: string, userId: string) {
    const reason = this.unavailableReason;
    if (reason) throw new ServiceUnavailableException(reason);
    const state = signState({ w: workspaceId, u: userId }, this.cfg.GOOGLE_CLIENT_SECRET!);
    return {
      url: this.api.authUrl({
        clientId: this.cfg.GOOGLE_CLIENT_ID!,
        redirectUri: this.cfg.GOOGLE_MERCHANT_REDIRECT_URI!,
        state,
      }),
    };
  }

  /** The browser comes back here from Google. Nothing is trusted until the signed state verifies. Returns the web URL to go to. */
  async callback(q: { code?: string; state?: string; error?: string }) {
    const base = `${this.cfg.WEB_URL.replace(/\/$/, '')}/brain?tab=intelligence`;
    if (this.unavailableReason) return `${base}&google_merchant=not_configured`;
    const st = q.state ? verifyState(q.state, this.cfg.GOOGLE_CLIENT_SECRET!) : null;
    if (!st) return `${base}&google_merchant=invalid_state`;
    if (q.error || !q.code) return `${base}&google_merchant=denied`;
    try {
      const t = await this.api.exchangeCode({
        clientId: this.cfg.GOOGLE_CLIENT_ID!,
        clientSecret: this.cfg.GOOGLE_CLIENT_SECRET!,
        redirectUri: this.cfg.GOOGLE_MERCHANT_REDIRECT_URI!,
        code: q.code,
      });
      if (!t.scope?.includes('auth/content')) return `${base}&google_merchant=missing_permissions`;
      if (!t.refresh_token) return `${base}&google_merchant=no_refresh_token`;
      const db = this.prisma.client;
      const existing = await db.importSource.findFirst({
        where: { workspaceId: st.w, kind: 'GOOGLE_MERCHANT' },
      });
      const source = existing
        ? await db.importSource.update({
            where: { id: existing.id },
            data: { status: 'ACTIVE', lastError: null },
          })
        : await db.importSource.create({
            data: {
              workspaceId: st.w,
              kind: 'GOOGLE_MERCHANT',
              name: 'Google Merchant Center',
              createdById: st.u,
            },
          });
      const ciphertext = this.crypto.encrypt(
        JSON.stringify({ refreshToken: t.refresh_token } satisfies Secret),
      );
      await db.importSourceSecret.upsert({
        where: { sourceId: source.id },
        create: { sourceId: source.id, workspaceId: st.w, ciphertext },
        update: { ciphertext },
      });
      await db.auditLog.create({
        data: {
          workspaceId: st.w,
          actorId: st.u,
          action: 'brain.import.google_connect',
          entityType: 'import_source',
          entityId: source.id,
          metadata: { description: 'Connected a Google Merchant Center account' },
        },
      });
      return `${base}&google_merchant=connected`;
    } catch (e) {
      this.log.warn(`Google Merchant authorization failed: ${(e as Error).name}`);
      return `${base}&google_merchant=exchange_failed`;
    }
  }

  /** A fresh short-lived access token from the stored refresh token. A rejected one marks the source so the page says to reconnect. */
  private async access(workspaceId: string): Promise<{ accessToken: string; sourceId: string }> {
    const reason = this.unavailableReason;
    if (reason) throw new ServiceUnavailableException(reason);
    const s = await this.prisma.client.importSource.findFirst({
      where: { workspaceId, kind: 'GOOGLE_MERCHANT', status: { not: 'DISCONNECTED' } },
      include: { secret: true },
    });
    if (!s?.secret) throw new ConflictException('Google is not connected. Connect it first.');
    const { refreshToken } = JSON.parse(this.crypto.decrypt(s.secret.ciphertext)) as Secret;
    try {
      const accessToken = await this.api.accessToken({
        clientId: this.cfg.GOOGLE_CLIENT_ID!,
        clientSecret: this.cfg.GOOGLE_CLIENT_SECRET!,
        refreshToken,
      });
      return { accessToken, sourceId: s.id };
    } catch (e) {
      return this.fail(s.id, e);
    }
  }

  private async fail(sourceId: string, e: unknown): Promise<never> {
    const msg = explainGoogle(e);
    if (e instanceof GoogleApiError && e.reconnect)
      await this.prisma.client.importSource.update({
        where: { id: sourceId },
        data: { status: 'ERROR', lastError: msg },
      });
    throw new BadRequestException(msg);
  }

  // ---------- choosing an account ----------

  async accounts(workspaceId: string): Promise<MetaCatalogList> {
    const { accessToken, sourceId } = await this.access(workspaceId);
    try {
      const list = await this.api.accounts(accessToken);
      return {
        data: list.map((a) => ({ id: a.id, name: a.name, businessName: null, productCount: null })),
      };
    } catch (e) {
      return this.fail(sourceId, e);
    }
  }

  async select(workspaceId: string, accountId: string) {
    const list = await this.accounts(workspaceId);
    const found = list.data.find((a) => a.id === accountId);
    if (!found)
      throw new BadRequestException(
        'That Merchant Center account is not available to the connected Google account.',
      );
    const s = await this.source(workspaceId);
    await this.prisma.client.importSource.update({
      where: { id: s!.id },
      data: {
        name: `Google Merchant Center: ${found.name}`.slice(0, 120),
        config: { catalogId: found.id, catalogName: found.name } as Prisma.InputJsonValue,
      },
    });
    return this.status(workspaceId);
  }

  async disconnect(workspaceId: string) {
    const db = this.prisma.client;
    const s = await db.importSource.findFirst({
      where: { workspaceId, kind: 'GOOGLE_MERCHANT' },
      include: { secret: true },
    });
    if (!s) throw new NotFoundException('Google is not connected.');
    await db.importJob.updateMany({
      where: { sourceId: s.id, workspaceId, status: { in: [...ACTIVE] } },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    if (s.secret && this.crypto.configured) {
      // Best effort: ask Google to revoke the grant too, so it disappears from the person's Google account permissions.
      try {
        await this.api.revoke(
          (JSON.parse(this.crypto.decrypt(s.secret.ciphertext)) as Secret).refreshToken,
        );
      } catch {
        /* the local token is deleted regardless */
      }
    }
    await db.importSourceSecret.deleteMany({ where: { sourceId: s.id } });
    await db.importSource.update({ where: { id: s.id }, data: { status: 'DISCONNECTED' } });
    return { ok: true };
  }

  // ---------- preview and sync ----------

  async preview(workspaceId: string): Promise<FeedPreview> {
    const { accessToken, sourceId } = await this.access(workspaceId);
    const accountId = ((await this.source(workspaceId))?.config as AccountConfig | null)?.catalogId;
    if (!accountId) throw new ConflictException('Choose a Merchant Center account first.');
    try {
      const items: RawItem[] = [];
      let next: string | undefined;
      for (let i = 0; i < 2; i++) {
        const r = await this.api.products(accessToken, accountId, next);
        items.push(...r.products.map(toRaw));
        if (!r.next) break;
        next = r.next;
      }
      const mapped = mapItems(items, effectiveMapping(items, MAPPING));
      return {
        format: 'google-merchant',
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
          ...(items.length >= 500
            ? ['Showing a sample of the first 500 products; the full list is read when you import.']
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
    const cfg = (s?.config ?? {}) as AccountConfig;
    if (!s || s.status === 'DISCONNECTED') throw new ConflictException('Google is not connected.');
    if (!cfg.catalogId) throw new ConflictException('Choose a Merchant Center account first.');
    const db = this.prisma.client;
    const running = await db.importJob.findFirst({
      where: { workspaceId, sourceId: s.id, status: { in: [...ACTIVE] } },
      select: { id: true },
    });
    if (running) throw new ConflictException('This account is already syncing.');
    const job = await db.importJob.create({
      data: {
        workspaceId,
        sourceId: s.id,
        kind: 'GOOGLE_MERCHANT',
        createdById: userId,
        state: newCatalogState(cfg.catalogId) as unknown as Prisma.InputJsonValue,
      },
    });
    await db.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'brain.import.google_sync',
        entityType: 'import_job',
        entityId: job.id,
        metadata: {
          description: `Started a sync of Merchant Center ${cfg.catalogName ?? cfg.catalogId}`,
        },
      },
    });
    return job.id;
  }

  async step(workspaceId: string, jobId: string) {
    let accessToken = '';
    let early: unknown = null;
    try {
      accessToken = (await this.access(workspaceId)).accessToken;
    } catch (e) {
      early = e;
    }
    await stepCatalog({
      prisma: this.prisma,
      log: this.log,
      kind: 'GOOGLE_MERCHANT',
      workspaceId,
      jobId,
      mapping: MAPPING,
      fallbackUrl: 'https://merchants.google.com',
      fetchPage: async (s) => {
        if (early) throw early;
        const r = await this.api.products(accessToken, s.catalogId, s.cursor ?? undefined);
        return { items: r.products.map(toRaw), next: r.next };
      },
      describe: (e) => ({
        message: explainGoogle(e),
        reconnect: e instanceof GoogleApiError && e.reconnect,
      }),
    });
  }
}
