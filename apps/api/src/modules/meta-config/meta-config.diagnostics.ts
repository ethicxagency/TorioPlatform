import { BadRequestException, Injectable } from '@nestjs/common';
import { META_CALLBACK_PATH, META_WEBHOOK_PATH } from '@torio/contracts';
import { Prisma } from '@torio/database';
import { PrismaService } from '../../database/prisma.service';
import { AdminAudit } from '../admin/admin-audit.service';
import type { AdminContext } from '../admin/admin-auth';
import { SCOPES } from '../meta/meta.connection.service';
import { MetaGraphProvider } from '../meta/meta.graph-provider';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { GraphError } from '../whatsapp/whatsapp.api';
import { MetaConfigService } from './meta-config.service';

export interface TestResult {
  ok: boolean;
  checkedAt: string;
  httpStatus: number | null;
  metaCode: number | null;
  message: string;
  resolution: string | null;
  details: { label: string; value: string }[];
}

const RESOLUTION: Record<number, string> = {
  100: 'Check that the App ID is the numeric id from Meta → App settings → Basic.',
  101: 'The App ID doesn’t exist or the app is restricted. Check it in Meta.',
  190: 'The credentials were rejected. Re-copy the App Secret from Meta → App settings → Basic.',
  102: 'The app access token is invalid. Check the App ID and App Secret match the same app.',
  4: 'Meta is rate-limiting this app. Wait a few minutes and retry.',
};

/** Real server-side checks against Meta, plus operational health. Secrets never appear in any result. */
@Injectable()
export class MetaDiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: MetaConfigService,
    private readonly graph: MetaGraphProvider,
    private readonly crypto: ChannelCryptoService,
    private readonly audit: AdminAudit,
  ) {}

  private result(r: Partial<TestResult> & { ok: boolean; message: string }): TestResult {
    return {
      checkedAt: new Date().toISOString(),
      httpStatus: null,
      metaCode: null,
      resolution: null,
      details: [],
      ...r,
    };
  }

  private fromError(e: unknown, fallback: string): TestResult {
    if (e instanceof GraphError)
      return this.result({
        ok: false,
        httpStatus: e.status,
        metaCode: e.code ?? null,
        message:
          e.status >= 500
            ? 'Meta returned a server error.'
            : `Meta rejected the request: ${e.message.replace(/(access_token|secret)=[^&\s]+/gi, '$1=…')}`.slice(
                0,
                280,
              ),
        resolution: (e.code && RESOLUTION[e.code]) || (e.transient ? 'Try again shortly.' : null),
      });
    return this.result({
      ok: false,
      message: fallback,
      resolution: 'Check the server’s network access to graph.facebook.com.',
    });
  }

  private async record(admin: AdminContext, action: string, r: TestResult, ip?: string) {
    await this.audit.log({
      admin,
      action,
      targetType: 'meta_configuration',
      targetId: 'default',
      ip,
      metadata: {
        category: 'diagnostics',
        status: r.ok ? 'success' : 'failed',
        httpStatus: r.httpStatus,
        metaCode: r.metaCode,
      },
    });
  }

  /**
   * Before a new Business Messaging App Secret replaces the stored one, Meta must accept it for this app. Throws (and the
   * stored secret stays untouched) otherwise. The secret is never part of any message.
   */
  async assertSecretAccepted(secret: string) {
    const rt = await this.cfg.load(true);
    if (!rt.appId) throw new BadRequestException('Save the App ID first.');
    try {
      await this.graph.get().appInfo(rt.appId, secret);
    } catch (e) {
      throw new BadRequestException(
        e instanceof GraphError
          ? `Meta did not accept this App Secret for app ${rt.appId}. The saved secret was not changed.`
          : 'Could not reach Meta to check the new App Secret, so the saved secret was not changed. Try again shortly.',
      );
    }
  }

  /** Asks Meta whether this App ID and App Secret are a valid pair. */
  async testCredentials(admin: AdminContext, ip?: string): Promise<TestResult> {
    const rt = await this.cfg.load(true);
    let r: TestResult;
    if (!rt.appId || !rt.appSecret)
      r = this.result({
        ok: false,
        message: 'App ID and App Secret must both be configured first.',
        resolution: 'Fill them in under App Configuration.',
      });
    else
      try {
        const info = await this.graph.get().appInfo(rt.appId, rt.appSecret);
        const nameNote =
          rt.appName && info.name && rt.appName !== info.name
            ? `Meta calls this app “${info.name}”, not “${rt.appName}”.`
            : null;
        r = this.result({
          ok: true,
          httpStatus: 200,
          message: 'Meta accepted the App ID and App Secret.',
          resolution: nameNote,
          details: [
            { label: 'App name at Meta', value: info.name ?? '—' },
            { label: 'API version used', value: rt.apiVersion },
          ],
        });
      } catch (e) {
        r = this.fromError(e, 'Could not reach Meta to check the credentials.');
      }
    await this.record(admin, 'meta.test.credentials', r, ip);
    return r;
  }

  /** The parts of the OAuth setup Torio can verify itself; whether Meta has the URI registered can't be read from its API. */
  async testOAuth(admin: AdminContext, ip?: string): Promise<TestResult> {
    const rt = await this.cfg.load(true);
    const problems = this.cfg
      .validate(rt)
      .filter((p) =>
        [
          'appId',
          'appSecret',
          'oauthRedirectUri',
          'successUrl',
          'failureUrl',
          'encryption',
        ].includes(p.field),
      );
    const errors = problems.filter((p) => p.severity === 'error');
    const r = this.result({
      ok: errors.length === 0,
      message: errors.length
        ? errors.map((p) => p.message).join(' ')
        : 'Torio’s side of the OAuth setup is valid.',
      resolution: errors.length
        ? null
        : 'Meta’s Valid OAuth Redirect URIs can’t be read through its API: confirm the URI below is registered there.',
      details: [
        { label: 'Redirect URI to register', value: rt.oauthRedirectUri ?? '—' },
        { label: 'Callback route served by the API', value: META_CALLBACK_PATH },
        { label: 'Login link expires after', value: `${Math.round(rt.stateTtlMs / 60_000)} min` },
        {
          label: 'Trusted redirect domains',
          value: [new URL(rt.webUrl).hostname, ...rt.allowedDomains].join(', '),
        },
      ],
    });
    await this.record(admin, 'meta.test.oauth', r, ip);
    return r;
  }

  /** Compares the callback URLs Meta has registered for this app with the ones Torio serves. */
  async testWebhook(admin: AdminContext, ip?: string): Promise<TestResult> {
    const rt = await this.cfg.load(true);
    const urls = this.cfg.webhookUrls(rt);
    let r: TestResult;
    if (!rt.verifyToken || !rt.appSecret || !rt.appId)
      r = this.result({
        ok: false,
        message: 'Verify token, App ID and App Secret must be configured first.',
      });
    else if (!rt.webhookEnabled)
      r = this.result({
        ok: false,
        message: 'Webhooks are disabled in Torio, so Meta’s verification would be refused.',
        resolution: 'Enable webhooks under Webhook Configuration.',
      });
    else
      try {
        const subs = await this.graph.get().appSubscriptions(rt.appId, rt.appSecret);
        const want: [string, string][] = [
          ['page', urls.meta],
          ['instagram', urls.meta],
          ['whatsapp_business_account', urls.whatsapp],
        ];
        const details = want.map(([obj, url]) => {
          const s = subs.find((x) => x.object === obj);
          return {
            label: obj,
            value: !s
              ? 'not subscribed at Meta'
              : s.callback_url === url
                ? `OK · ${(s.fields ?? []).map((f) => f.name).join(', ') || 'no fields'}`
                : `callback differs: ${s.callback_url}`,
          };
        });
        const allOk = details.every((d) => d.value.startsWith('OK'));
        r = this.result({
          ok: allOk,
          httpStatus: 200,
          message: allOk
            ? 'Meta’s registered webhooks match Torio’s URLs.'
            : 'Meta’s registered webhooks don’t match what Torio serves.',
          resolution: allOk
            ? null
            : `In Meta, set each product’s callback URL to ${urls.meta} (Page, Instagram) / ${urls.whatsapp} (WhatsApp) with the verify token from this page.`,
          details,
        });
      } catch (e) {
        r = this.fromError(e, 'Could not read webhook subscriptions from Meta.');
      }
    await this.record(admin, 'meta.test.webhook', r, ip);
    return r;
  }

  /** Is Graph reachable from this server, and does it accept the configured API version? */
  async testConnectivity(admin: AdminContext, ip?: string): Promise<TestResult> {
    const rt = await this.cfg.load(true);
    let r: TestResult;
    try {
      const p = await this.graph.get().ping();
      const badVersion = p.status === 400 && p.code === 2635;
      r = this.result({
        ok: !badVersion && p.status < 500,
        httpStatus: p.status,
        metaCode: p.code,
        message: badVersion
          ? `Meta doesn’t support API version ${rt.apiVersion} any more.`
          : p.status >= 500
            ? 'Meta returned a server error.'
            : 'graph.facebook.com is reachable from the server.',
        resolution: badVersion
          ? 'Choose a current version under App Configuration (see Meta’s Graph API changelog).'
          : null,
        details: [{ label: 'API version', value: rt.apiVersion }],
      });
    } catch {
      r = this.result({
        ok: false,
        message: 'The server could not reach graph.facebook.com.',
        resolution: 'Check outbound network/firewall rules.',
      });
    }
    await this.record(admin, 'meta.test.connectivity', r, ip);
    return r;
  }

  async diagnostics() {
    const rt = await this.cfg.load(true);
    const db = this.prisma.client;
    const since = new Date(Date.now() - 24 * 3600_000);
    const metaProviders = ['MESSENGER', 'INSTAGRAM', 'WHATSAPP'] as const;
    const [last, processed, failed, pending, recent, channelStats] = await Promise.all([
      db.providerWebhookEvent.findFirst({
        where: { provider: { in: [...metaProviders] } },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
      db.providerWebhookEvent.count({
        where: {
          provider: { in: [...metaProviders] },
          status: 'PROCESSED',
          receivedAt: { gte: since },
        },
      }),
      db.providerWebhookEvent.count({
        where: {
          provider: { in: [...metaProviders] },
          status: 'FAILED',
          receivedAt: { gte: since },
        },
      }),
      db.providerWebhookEvent.count({
        where: { provider: { in: [...metaProviders] }, status: 'RECEIVED' },
      }),
      db.providerWebhookEvent.findMany({
        where: { provider: { in: [...metaProviders] }, status: 'FAILED' },
        orderBy: { receivedAt: 'desc' },
        take: 5,
        select: { receivedAt: true, provider: true, error: true },
      }),
      db.channel.groupBy({
        by: ['provider', 'status'],
        where: { isSample: false, provider: { in: [...metaProviders] } },
        _count: { _all: true },
      }),
    ]);
    const count = (p: string, ok: boolean) =>
      channelStats
        .filter(
          (c) =>
            c.provider === p &&
            (ok
              ? c.status === 'CONNECTED'
              : c.status === 'NEEDS_ATTENTION' || c.status === 'EXPIRED'),
        )
        .reduce((a, c) => a + c._count._all, 0);
    const problems = this.cfg.validate(rt);
    const checks = [
      {
        key: 'credentials',
        label: 'App ID and App Secret',
        status: rt.appId && rt.appSecret ? ('ok' as const) : ('fail' as const),
        detail:
          rt.appId && rt.appSecret
            ? 'Configured. Use “Test Meta App Credentials” to confirm Meta accepts them.'
            : 'Missing.',
      },
      {
        key: 'encryption',
        label: 'Encryption key',
        status: this.crypto.configured ? ('ok' as const) : ('fail' as const),
        detail: this.crypto.configured
          ? 'Master key present; secrets are stored encrypted.'
          : 'CHANNEL_ENCRYPTION_KEY is not set.',
      },
      {
        key: 'oauth',
        label: 'OAuth redirect URI',
        status: problems.some((p) => p.field === 'oauthRedirectUri' && p.severity === 'error')
          ? ('fail' as const)
          : rt.oauthRedirectUri
            ? ('ok' as const)
            : ('fail' as const),
        detail: rt.oauthRedirectUri ?? 'Not configured.',
      },
      {
        key: 'webhookVerify',
        label: 'Webhook verified by Meta',
        status: rt.lastWebhookVerifiedAt ? ('ok' as const) : ('unknown' as const),
        detail: rt.lastWebhookVerifiedAt
          ? `Meta last verified the callback ${rt.lastWebhookVerifiedAt.toISOString()}.`
          : 'Meta hasn’t verified the callback URL yet (or it was verified before this was tracked).',
      },
      {
        key: 'webhookTraffic',
        label: 'Webhook events arriving',
        status: last ? ('ok' as const) : ('unknown' as const),
        detail: last ? `Last event ${last.receivedAt.toISOString()}.` : 'No events received yet.',
      },
      {
        key: 'webhookErrors',
        label: 'Webhook processing (24h)',
        status: failed > 0 ? ('warning' as const) : ('ok' as const),
        detail: `${processed} processed, ${failed} failed, ${pending} waiting.`,
      },
    ];
    const product = (
      key: 'LOGIN' | 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP',
      label: string,
      enabled: boolean,
      perms: string[],
      provider?: string,
    ) => {
      const w: string[] = [];
      if (key === 'WHATSAPP' && !rt.whatsappConfigId)
        w.push('No Embedded Signup configuration ID: only the pasted-token connection is offered.');
      if (key === 'WHATSAPP' && !rt.discoverWhatsapp)
        w.push('WhatsApp discovery in the Facebook login is off.');
      if (!enabled && key !== 'LOGIN')
        w.push('Disabled in Torio: hidden from the connect screen and events are ignored.');
      return {
        key,
        label,
        enabled,
        requiredPermissions: perms,
        connectedChannels: provider ? count(provider, true) : 0,
        attention: provider ? count(provider, false) : 0,
        appReview: 'unknown' as const,
        warnings: w,
      };
    };
    return {
      checkedAt: new Date().toISOString(),
      checks,
      webhook: {
        lastVerifiedAt: rt.lastWebhookVerifiedAt?.toISOString() ?? null,
        lastReceivedAt: last?.receivedAt.toISOString() ?? null,
        processed24h: processed,
        failed24h: failed,
        pending,
        recentErrors: recent.map((e) => ({
          at: e.receivedAt.toISOString(),
          provider: e.provider,
          error: (e.error ?? 'Unknown error').slice(0, 200),
        })),
      },
      products: [
        product('LOGIN', 'Facebook Login for Business', true, [
          ...new Set([...SCOPES.MESSENGER, ...SCOPES.INSTAGRAM]),
        ]),
        product('MESSENGER', 'Messenger', rt.messengerEnabled, SCOPES.MESSENGER, 'MESSENGER'),
        product('INSTAGRAM', 'Instagram API', rt.instagramEnabled, SCOPES.INSTAGRAM, 'INSTAGRAM'),
        product(
          'WHATSAPP',
          'WhatsApp Business Platform',
          rt.whatsappEnabled,
          SCOPES.WHATSAPP,
          'WHATSAPP',
        ),
      ],
    };
  }

  // ----- security -----

  private async blobs() {
    const db = this.prisma.client;
    const [creds, pins, cfg, authCfg, sessions] = await Promise.all([
      db.channelCredential.findMany({ select: { id: true, ciphertext: true } }),
      db.channel.findMany({
        where: { phonePinCiphertext: { not: null } },
        select: { id: true, phonePinCiphertext: true },
      }),
      db.metaConfiguration.findUnique({ where: { id: 'default' } }),
      // The Torio Auth app's secret is sealed with the same master key, so rotation covers it too.
      db.metaConfiguration.findUnique({ where: { id: 'auth' } }),
      db.channelOAuthSession.findMany({
        where: { consumedAt: null },
        select: { id: true, candidates: true },
      }),
    ]);
    return { creds, pins, cfg, authCfg, sessions };
  }

  async securityStatus() {
    const rt = this.cfg.current;
    const { creds, pins, cfg, authCfg, sessions } = await this.blobs();
    const tally = { current: 0, previous: 0, unreadable: 0 };
    const add = (b?: string | null) => b && tally[this.crypto.keyOf(b)]++;
    creds.forEach((c) => add(c.ciphertext));
    pins.forEach((p) => add(p.phonePinCiphertext));
    add(cfg?.appSecretCiphertext);
    add(cfg?.verifyTokenCiphertext);
    add(authCfg?.appSecretCiphertext);
    for (const s of sessions)
      for (const c of (s.candidates as { list?: { tokenCiphertext: string }[] })?.list ?? [])
        add(c.tokenCiphertext);
    const notes = [
      'The master key (CHANNEL_ENCRYPTION_KEY) is a deployment secret: it must be available before the database can be read, so it can’t be stored in the database.',
      'To rotate it: set the NEW key as CHANNEL_ENCRYPTION_KEY and keep the OLD one as CHANNEL_ENCRYPTION_KEY_PREVIOUS, redeploy, then run Re-encrypt here. Remove the previous key only when nothing is sealed with it.',
    ];
    if (!this.crypto.configured)
      notes.unshift('No master key is configured: secrets can’t be stored.');
    return {
      algorithm: 'AES-256-GCM (per-secret random IV, authenticated)',
      masterKeyConfigured: this.crypto.configured,
      previousKeyConfigured: this.crypto.hasPreviousKey,
      secretsSealedWith: tally,
      rotationPending: tally.previous > 0,
      lastKeyRotationAt: rt.lastKeyRotationAt?.toISOString() ?? null,
      notes,
    };
  }

  /**
   * Re-seals every stored secret with the current master key. Nothing is deleted or guessed: a blob that can't be read
   * with either key is reported and left untouched, and every row is updated independently so a failure can't corrupt
   * the others. Connected channels keep working throughout (both keys decrypt until this finishes).
   */
  async reencrypt(admin: AdminContext, ip?: string) {
    const db = this.prisma.client;
    const out = { reencrypted: 0, alreadyCurrent: 0, failed: 0 };
    const redo = (blob: string): string | null => {
      const k = this.crypto.keyOf(blob);
      if (k === 'current') {
        out.alreadyCurrent++;
        return null;
      }
      if (k === 'unreadable') {
        out.failed++;
        return null;
      }
      out.reencrypted++;
      return this.crypto.encrypt(this.crypto.decrypt(blob));
    };
    const { creds, pins, cfg, authCfg, sessions } = await this.blobs();
    for (const c of creds) {
      const n = redo(c.ciphertext);
      if (n) await db.channelCredential.update({ where: { id: c.id }, data: { ciphertext: n } });
    }
    for (const p of pins) {
      const n = redo(p.phonePinCiphertext!);
      if (n) await db.channel.update({ where: { id: p.id }, data: { phonePinCiphertext: n } });
    }
    if (cfg) {
      const data: Prisma.MetaConfigurationUpdateInput = {};
      const a = cfg.appSecretCiphertext ? redo(cfg.appSecretCiphertext) : null;
      const v = cfg.verifyTokenCiphertext ? redo(cfg.verifyTokenCiphertext) : null;
      if (a) data.appSecretCiphertext = a;
      if (v) data.verifyTokenCiphertext = v;
      if (Object.keys(data).length)
        await db.metaConfiguration.update({ where: { id: 'default' }, data });
    }
    if (authCfg?.appSecretCiphertext) {
      const a = redo(authCfg.appSecretCiphertext);
      if (a)
        await db.metaConfiguration.update({
          where: { id: 'auth' },
          data: { appSecretCiphertext: a },
        });
    }
    for (const s of sessions) {
      const d = s.candidates as { list?: { tokenCiphertext: string }[]; missing?: unknown };
      let changed = false;
      for (const c of d.list ?? []) {
        const n = redo(c.tokenCiphertext);
        if (n) {
          c.tokenCiphertext = n;
          changed = true;
        }
      }
      if (changed)
        await db.channelOAuthSession.update({
          where: { id: s.id },
          data: { candidates: d as unknown as Prisma.InputJsonValue },
        });
    }
    if (out.reencrypted > 0 && out.failed === 0)
      await db.metaConfiguration.upsert({
        where: { id: 'default' },
        create: { id: 'default', lastKeyRotationAt: new Date() },
        update: { lastKeyRotationAt: new Date() },
      });
    this.cfg.invalidate();
    await this.audit.log({
      admin,
      action: 'meta.security.reencrypt',
      targetType: 'meta_configuration',
      targetId: 'default',
      ip,
      metadata: { category: 'security', status: out.failed ? 'partial' : 'success', ...out },
    });
    return out;
  }

  /** Paginated Meta configuration history from the existing admin audit log. */
  async activity(q: { page: number; pageSize: number; action?: string }) {
    const where: Prisma.AdminAuditLogWhereInput = {
      targetType: 'meta_configuration',
      ...(q.action && { action: { startsWith: q.action } }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.adminAuditLog.count({ where }),
      this.prisma.client.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        adminEmail: r.adminEmail,
        reason: r.reason,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page: q.page, pageSize: q.pageSize, total },
    };
  }
}
void META_WEBHOOK_PATH;
