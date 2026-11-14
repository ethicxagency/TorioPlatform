import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { z } from 'zod';
import { Prisma } from '@torio/database';
import type { workspacePixelSaveSchema } from '@torio/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { INTEGRATIONS } from '../admin/integrations/definitions';
import { checkMetaPixel, sendMetaTestEvent } from '../admin/integrations/provider-checks';
import {
  fingerprintOf,
  isLive,
  problemsOf,
  statusOf,
  type Stored,
} from '../admin/integrations/state';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { MetaEventsService, type PixelTarget } from './meta-events.service';

const KEY = 'meta_pixel';
/** The workspace Pixel uses the same field rules as Torio's own (id, test code, a server switch, a token), kept in its own table. */
const DEF = 'torio_meta_pixel' as const;
export type PixelSave = z.infer<typeof workspacePixelSaveSchema>;

const empty = (): Stored => ({ values: {}, secrets: {}, secretVersions: {}, enabled: false });

/**
 * A workspace's own Meta Pixel and Conversions API. It is stored per workspace, encrypted like every other credential, verified by a real
 * call to Meta, and only used while that verification still matches what is saved. Its events carry the workspace's id as owner, so
 * they can never mix with another workspace's or with Torio's own tracking.
 */
@Injectable()
export class WorkspacePixelService {
  fetch: typeof fetch = (...a) => fetch(...a);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly events: MetaEventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async load(ws: string): Promise<Stored> {
    const row = await this.prisma.client.workspaceIntegration.findUnique({
      where: { workspaceId_key: { workspaceId: ws, key: KEY } },
    });
    return { ...empty(), ...((row?.data ?? {}) as Partial<Stored>) };
  }
  private async store(ws: string, s: Stored) {
    s.updatedAt = new Date().toISOString();
    const data = JSON.parse(JSON.stringify(s)) as Prisma.InputJsonValue;
    await this.prisma.client.workspaceIntegration.upsert({
      where: { workspaceId_key: { workspaceId: ws, key: KEY } },
      create: { workspaceId: ws, key: KEY, data },
      update: { data },
    });
  }
  private audit(ws: string, actor: string, action: string, description: string) {
    return this.prisma.client.auditLog.create({
      data: {
        workspaceId: ws,
        actorId: actor,
        action: `integration.meta_pixel.${action}`,
        entityType: 'integration',
        entityId: ws,
        metadata: { description },
      },
    });
  }

  async view(ws: string) {
    const s = await this.load(ws);
    const status = statusOf(DEF, s);
    const problems = problemsOf(DEF, s);
    return {
      status,
      enabled: s.enabled && status === 'VERIFIED',
      encryptionReady: this.crypto.configured,
      pixelId: typeof s.values.pixelId === 'string' ? s.values.pixelId : null,
      testEventCode: typeof s.values.testEventCode === 'string' ? s.values.testEventCode : null,
      conversionsApi: s.values.serverTracking === true,
      hasToken: !!s.secrets.accessToken,
      lastTestedAt: s.lastTestedAt ?? null,
      lastSuccessAt: s.lastSuccessAt ?? null,
      lastError: status === 'FAILED' ? (s.verification?.error ?? null) : null,
      problems,
      canTest: problems.length === 0 && this.crypto.configured,
      canEnable: status === 'VERIFIED',
      extra: s.extra ?? {},
    };
  }

  async save(ws: string, actor: string, input: PixelSave) {
    const s = await this.load(ws);
    const before = fingerprintOf(DEF, s);
    if (input.pixelId !== undefined) {
      const v = input.pixelId?.trim() || null;
      if (v && !/^\d{8,20}$/.test(v)) throw new BadRequestException('A Pixel ID is 8 to 20 digits');
      s.values.pixelId = v;
    }
    if (input.testEventCode !== undefined) {
      const v = input.testEventCode?.trim() || null;
      if (v && !/^[A-Za-z0-9_-]{3,40}$/.test(v))
        throw new BadRequestException('A test event code uses letters and digits only');
      s.values.testEventCode = v;
    }
    if (input.conversionsApi !== undefined) s.values.serverTracking = input.conversionsApi;
    // Browser tracking is not offered: Torio hosts no customer-facing pages that could carry a workspace's Pixel yet.
    s.values.browserTracking = false;
    if (fingerprintOf(DEF, s) !== before) s.enabled = false; // a changed Pixel must be tested again
    await this.store(ws, s);
    await this.audit(ws, actor, 'saved', 'Meta Pixel settings changed');
    return this.view(ws);
  }

  async setToken(ws: string, actor: string, value: string) {
    if (!this.crypto.configured)
      throw new ServiceUnavailableException(
        'Secrets cannot be stored: CHANNEL_ENCRYPTION_KEY is not configured on the server.',
      );
    const s = await this.load(ws);
    const had = !!s.secrets.accessToken;
    s.secrets.accessToken = this.crypto.encrypt(value);
    s.secretVersions.accessToken = (s.secretVersions.accessToken ?? 0) + 1;
    s.enabled = false;
    await this.store(ws, s);
    await this.audit(
      ws,
      actor,
      had ? 'token_replaced' : 'token_set',
      had ? 'Conversions API token replaced' : 'Conversions API token saved',
    );
    return this.view(ws);
  }

  /** Removes the token and switches the integration off, leaving the Pixel id so it can be reconnected. */
  async disconnect(ws: string, actor: string) {
    const s = await this.load(ws);
    delete s.secrets.accessToken;
    s.secretVersions.accessToken = (s.secretVersions.accessToken ?? 0) + 1;
    s.enabled = false;
    s.verification = undefined;
    await this.store(ws, s);
    await this.audit(ws, actor, 'disconnected', 'Meta Pixel disconnected');
    return this.view(ws);
  }

  async setEnabled(ws: string, actor: string, enabled: boolean) {
    const s = await this.load(ws);
    if (enabled && statusOf(DEF, s) !== 'VERIFIED')
      throw new BadRequestException('Test the connection successfully before turning this on.');
    s.enabled = enabled;
    await this.store(ws, s);
    await this.audit(
      ws,
      actor,
      enabled ? 'enabled' : 'disabled',
      enabled ? 'Meta Pixel turned on' : 'Meta Pixel turned off',
    );
    return this.view(ws);
  }

  private token(s: Stored) {
    const c = s.secrets.accessToken;
    if (!c) throw new BadRequestException('Add the Conversions API access token first');
    return this.crypto.decrypt(c);
  }
  private values(s: Stored) {
    return Object.fromEntries(
      INTEGRATIONS[DEF].fields.map((f) => [f.key, s.values[f.key] ?? f.default ?? null]),
    );
  }

  async test(ws: string, actor: string) {
    const s = await this.load(ws);
    const problems = problemsOf(DEF, s);
    if (problems.length) throw new BadRequestException(problems[0]);
    const r = await checkMetaPixel(
      this.fetch,
      this.config.META_GRAPH_VERSION,
      this.values(s),
      this.token(s),
    );
    const now = new Date().toISOString();
    s.lastTestedAt = now;
    s.verification = {
      status: r.ok ? 'VERIFIED' : 'FAILED',
      at: now,
      fingerprint: fingerprintOf(DEF, s),
      error: r.ok ? null : r.message,
    };
    if (r.ok) s.lastSuccessAt = now;
    else s.enabled = false;
    await this.store(ws, s);
    await this.audit(
      ws,
      actor,
      r.ok ? 'test_passed' : 'test_failed',
      r.ok ? 'Meta Pixel connection verified' : 'Meta Pixel connection test failed',
    );
    return { ok: r.ok, status: s.verification.status, message: r.message, checks: r.checks };
  }

  async testEvent(ws: string, actor: string) {
    const s = await this.load(ws);
    if (statusOf(DEF, s) !== 'VERIFIED')
      throw new BadRequestException('Test the connection successfully first.');
    if (!s.values.testEventCode)
      throw new BadRequestException(
        'Add a test event code from Events Manager first, so the event stays out of your real data.',
      );
    const r = await sendMetaTestEvent(
      this.fetch,
      this.config.META_GRAPH_VERSION,
      this.values(s),
      this.token(s),
      this.config.WEB_URL,
    );
    s.extra = { ...s.extra, lastTestEventAt: new Date().toISOString(), lastTestEventOk: r.ok };
    await this.store(ws, s);
    await this.audit(ws, actor, 'test_event', 'Meta Pixel test event sent');
    return {
      ok: r.ok,
      status: statusOf(DEF, s),
      message: r.message,
      checks: [{ label: 'Event received by Meta', ok: r.ok, detail: r.eventId }],
    };
  }

  /** The workspace's server-side target, only while the connection is verified, switched on and Conversions API is enabled. */
  async target(ws: string): Promise<PixelTarget | null> {
    const s = await this.load(ws);
    if (
      !isLive(DEF, s) ||
      s.values.serverTracking !== true ||
      !this.crypto.configured ||
      !s.secrets.accessToken
    )
      return null;
    try {
      return {
        ownerKey: ws,
        pixelId: String(s.values.pixelId),
        token: this.crypto.decrypt(s.secrets.accessToken),
      };
    } catch {
      return null;
    }
  }

  async eventLog(ws: string, page: number, pageSize: number, status?: string) {
    const [list, t] = await Promise.all([
      this.events.list(ws, page, pageSize, status),
      this.target(ws),
    ]);
    return {
      ...list,
      summary: { ...list.summary, serverTrackingOn: !!t, browserTrackingOn: false },
    };
  }

  async retry(ws: string) {
    const t = await this.target(ws);
    if (!t) throw new BadRequestException('Conversions API is off or the Pixel is not verified.');
    return this.events.retry(t);
  }

  /**
   * A Purchase for an order that is fully paid, from the order's own payment record. One per order, ever: the event id is the order's,
   * so editing, reopening, repeated status changes or a retried request cannot send it twice. Unpaid, partially paid, cancelled and
   * draft orders never produce one. Best-effort: it never affects the payment it describes.
   */
  async trackOrderPaid(ws: string, orderId: string): Promise<void> {
    try {
      const target = await this.target(ws);
      if (!target) return;
      const o = await this.prisma.client.order.findFirst({
        where: { id: orderId, workspaceId: ws },
        include: {
          customer: { select: { email: true, phone: true, id: true } },
          conversation: { select: { id: true } },
        },
      });
      if (!o || o.paymentStatus !== 'PAID' || o.status === 'CANCELLED' || o.isSample) return;
      await this.events.track(target, {
        eventName: 'Purchase',
        eventId: `purchase-order-${o.id}`,
        eventTime: new Date(),
        // Meta's value for a sale made in a chat; orders entered by hand are system-generated.
        actionSource: o.conversationId ? 'chat' : 'system_generated',
        user: { email: o.customer.email, phone: o.customer.phone, externalId: o.customer.id },
        custom: { value: o.totalMinor / 100, currency: o.currency, orderId: String(o.number) },
      });
    } catch {
      /* tracking is best-effort by design */
    }
  }
}
