import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  checkRedirectUri,
  isRetiredMetaAppId,
  META_APP_IDS,
  META_CALLBACK_PATH,
  META_WEBHOOK_PATH,
  WHATSAPP_WEBHOOK_PATH,
  metaConfigPatchSchema,
  type MetaConfigPatch,
} from '@torio/contracts';
import { Prisma } from '@torio/database';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { AdminAudit } from '../admin/admin-audit.service';
import type { AdminContext } from '../admin/admin-auth';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';

/** What the running Meta integration uses right now: saved settings first, then the deployment environment. */
export interface MetaRuntime {
  appName: string | null;
  appId: string | null;
  /** Retired App IDs found in saved or environment settings and skipped. */
  ignoredRetiredAppIds: string[];
  appSecret: string | null;
  apiVersion: string;
  businessId: string | null;
  appMode: 'DEVELOPMENT' | 'LIVE' | null;
  appDomain: string | null;
  websiteUrl: string | null;
  oauthRedirectUri: string | null;
  allowedRedirectUris: string[];
  stateTtlMs: number;
  allowedDomains: string[];
  successUrl: string | null;
  failureUrl: string | null;
  webhookBaseUrl: string | null;
  webhookEnabled: boolean;
  verifyToken: string | null;
  whatsappConfigId: string | null;
  discoverWhatsapp: boolean;
  messengerEnabled: boolean;
  instagramEnabled: boolean;
  whatsappEnabled: boolean;
  webUrl: string;
  sources: Record<string, 'database' | 'environment' | 'default' | 'unset'>;
  updatedAt: Date | null;
  updatedBy: string | null;
  lastWebhookVerifiedAt: Date | null;
  lastKeyRotationAt: Date | null;
}

type Row = Prisma.MetaConfigurationGetPayload<object>;
const CACHE_MS = 5_000;
const LABEL: Record<string, string> = {
  appName: 'App name',
  appId: 'App ID',
  apiVersion: 'API version',
  businessId: 'Business Portfolio ID',
  appMode: 'App mode',
  appDomain: 'App domain',
  websiteUrl: 'Website URL',
  oauthRedirectUri: 'OAuth redirect URI',
  allowedRedirectUris: 'Allowed redirect URIs',
  oauthStateTtlMinutes: 'OAuth state expiry',
  allowedDomains: 'Allowed domains',
  successUrl: 'Success URL',
  failureUrl: 'Failure URL',
  webhookBaseUrl: 'Webhook base URL',
  webhookEnabled: 'Webhooks enabled',
  whatsappConfigId: 'WhatsApp configuration ID',
  discoverWhatsapp: 'WhatsApp discovery',
  messengerEnabled: 'Messenger',
  instagramEnabled: 'Instagram',
  whatsappEnabled: 'WhatsApp',
};
const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

export interface Problem {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * The single source of Meta app settings. Saved (Super Admin) values override the deployment environment, so existing
 * deployments keep working untouched. Reads are cached for a few seconds and the cache is dropped on every save, so
 * other instances pick changes up within seconds without a redeploy. Secrets exist in memory only, never in responses.
 */
@Injectable()
export class MetaConfigService {
  private readonly log = new Logger(MetaConfigService.name);
  private rt: MetaRuntime;
  private loadedAt = 0;
  private inflight?: Promise<MetaRuntime>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly audit: AdminAudit,
    @Inject(APP_CONFIG) private readonly env: AppConfig,
  ) {
    this.rt = this.build(null);
  }

  /** The most recently loaded settings (environment-derived until the first load). Await `load()` first on request paths. */
  get current(): MetaRuntime {
    return this.rt;
  }

  async load(force = false): Promise<MetaRuntime> {
    if (!force && Date.now() - this.loadedAt < CACHE_MS) return this.rt;
    this.inflight ??= (async () => {
      try {
        const row = await this.prisma.client.metaConfiguration.findUnique({
          where: { id: 'default' },
        });
        this.rt = this.build(row);
        this.loadedAt = Date.now();
      } catch (e) {
        // Keep the last known configuration if the database read fails.
        this.log.error(`Meta configuration reload failed: ${String(e)}`);
      } finally {
        this.inflight = undefined;
      }
      return this.rt;
    })();
    return this.inflight;
  }

  invalidate() {
    this.loadedAt = 0;
  }

  /** Webhook callback URLs Meta must be given, derived from the base URL (or the web URL when none is set). */
  webhookUrls(rt = this.rt) {
    const base = (rt.webhookBaseUrl ?? rt.webUrl).replace(/\/$/, '');
    return { meta: `${base}${META_WEBHOOK_PATH}`, whatsapp: `${base}${WHATSAPP_WEBHOOK_PATH}` };
  }

  private decryptOpt(c: string | null | undefined) {
    if (!c) return null;
    try {
      return this.crypto.decrypt(c);
    } catch {
      this.log.error(
        'A stored Meta secret could not be decrypted (wrong or missing CHANNEL_ENCRYPTION_KEY?)',
      );
      return null;
    }
  }

  private build(row: Row | null): MetaRuntime {
    const env = this.env;
    const src: MetaRuntime['sources'] = {};
    const pick = <T>(
      field: string,
      db: T | null | undefined,
      fromEnv: T | null | undefined,
      dflt?: T,
    ): T | null => {
      if (db !== null && db !== undefined && !(Array.isArray(db) && db.length === 0)) {
        src[field] = 'database';
        return db;
      }
      if (fromEnv !== null && fromEnv !== undefined) {
        src[field] = 'environment';
        return fromEnv;
      }
      if (dflt !== undefined) {
        src[field] = 'default';
        return dflt;
      }
      src[field] = 'unset';
      return null;
    };
    // A retired App ID (from the old shared configuration) is never resolved: it is skipped, not used as a fallback.
    const ignoredRetiredAppIds = [row?.appId, env.META_APP_ID].filter((v): v is string =>
      isRetiredMetaAppId(v),
    );
    const savedId = isRetiredMetaAppId(row?.appId) ? null : (row?.appId ?? null);
    const envId = isRetiredMetaAppId(env.META_APP_ID) ? null : (env.META_APP_ID ?? null);
    const secret = this.decryptOpt(row?.appSecretCiphertext);
    const verify = this.decryptOpt(row?.verifyTokenCiphertext);
    const appSecret = pick('appSecret', secret, env.META_APP_SECRET ?? null);
    const verifyToken = pick('webhookVerifyToken', verify, env.META_WEBHOOK_VERIFY_TOKEN ?? null);
    return {
      appName: pick('appName', row?.appName, null),
      // Torio Platform is the suggested Business Messaging app when nothing else is configured.
      appId: pick('appId', savedId, envId, META_APP_IDS.BUSINESS_MESSAGING),
      ignoredRetiredAppIds,
      appSecret,
      apiVersion: pick('apiVersion', row?.apiVersion, env.META_GRAPH_VERSION)!,
      businessId: pick('businessId', row?.businessId, null),
      appMode: pick('appMode', row?.appMode as 'DEVELOPMENT' | 'LIVE' | null, null),
      appDomain: pick('appDomain', row?.appDomain, null),
      websiteUrl: pick('websiteUrl', row?.websiteUrl, null),
      oauthRedirectUri: pick(
        'oauthRedirectUri',
        row?.oauthRedirectUri,
        env.META_OAUTH_REDIRECT_URI ?? null,
      ),
      allowedRedirectUris: pick(
        'allowedRedirectUris',
        row?.allowedRedirectUris,
        null,
        [] as string[],
      )!,
      stateTtlMs:
        (pick('oauthStateTtlMinutes', row?.oauthStateTtlMinutes, null, 10) ?? 10) * 60_000,
      allowedDomains: pick('allowedDomains', row?.allowedDomains, null, [] as string[])!,
      successUrl: pick('successUrl', row?.successUrl, null),
      failureUrl: pick('failureUrl', row?.failureUrl, null),
      webhookBaseUrl: pick('webhookBaseUrl', row?.webhookBaseUrl, null),
      webhookEnabled: pick('webhookEnabled', row?.webhookEnabled, null, true)!,
      verifyToken,
      whatsappConfigId: pick(
        'whatsappConfigId',
        row?.whatsappConfigId,
        env.META_WA_CONFIG_ID ?? null,
      ),
      discoverWhatsapp: pick(
        'discoverWhatsapp',
        row?.discoverWhatsapp,
        env.META_DISCOVER_WHATSAPP ? true : null,
        false,
      )!,
      messengerEnabled: row?.messengerEnabled ?? true,
      instagramEnabled: row?.instagramEnabled ?? true,
      whatsappEnabled: row?.whatsappEnabled ?? true,
      webUrl: env.WEB_URL,
      sources: src,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedByEmail ?? null,
      lastWebhookVerifiedAt: row?.lastWebhookVerifiedAt ?? null,
      lastKeyRotationAt: row?.lastKeyRotationAt ?? null,
    };
  }

  /** Redirect destinations are only ever the configured success/failure URLs or the web app, on explicitly trusted hosts. */
  isTrustedDestination(u: string, rt = this.rt) {
    const h = host(u);
    if (!h) return false;
    const trusted = new Set([host(rt.webUrl), ...rt.allowedDomains.map((d) => d.toLowerCase())]);
    return trusted.has(h);
  }

  /** Hosts a callback may live on: the web app's own host, the Meta app domain and every trusted application domain. */
  trustedHosts(rt: MetaRuntime = this.rt): string[] {
    return [
      host(rt.webUrl),
      host(this.env.API_URL),
      rt.appDomain?.toLowerCase(),
      ...rt.allowedDomains.map((d) => d.toLowerCase()),
    ].filter((h): h is string => !!h);
  }

  // ----- validation -----

  /** Problems with a complete settings set, as it would run. `errors` block saving; missing required ones only mark it incomplete. */
  validate(rt: MetaRuntime, opts: { requireSecrets?: boolean } = {}): Problem[] {
    const out: Problem[] = [];
    const prod = this.env.NODE_ENV === 'production';
    const add = (field: string, message: string, severity: Problem['severity'] = 'error') =>
      out.push({ field, message, severity });
    if (!rt.appId) add('appId', 'App ID is required to connect Meta accounts.');
    if (rt.ignoredRetiredAppIds.length)
      add(
        'appId',
        'A retired App ID from the old shared configuration was found and is being ignored. Torio Platform uses its own App ID.',
        'warning',
      );
    if (opts.requireSecrets !== false) {
      if (!rt.appSecret)
        add('appSecret', 'App Secret is required to verify webhooks and exchange login codes.');
      if (!rt.verifyToken)
        add(
          'webhookVerifyToken',
          'A webhook verify token is required to register webhooks with Meta.',
        );
    }
    const trusted = this.trustedHosts(rt);
    // Each OAuth flow is checked only against its own route: the channel callback and the customer Facebook sign-in
    // callback are different endpoints, and neither is ever accepted in place of the other.
    const ru = rt.oauthRedirectUri;
    if (!ru) add('oauthRedirectUri', 'OAuth redirect URI is required.');
    else {
      for (const m of checkRedirectUri(ru, META_CALLBACK_PATH, {
        trustedHosts: trusted,
        production: prod,
      }))
        // The host rule is new for channels: existing deployments keep working, so it warns rather than blocks.
        add('oauthRedirectUri', m, m.includes('isn’t trusted') ? 'warning' : 'error');
      if (rt.allowedRedirectUris.length && !rt.allowedRedirectUris.includes(ru))
        add(
          'oauthRedirectUri',
          'The primary redirect URI must be one of the allowed redirect URIs.',
        );
    }
    for (const u of rt.allowedRedirectUris)
      for (const m of checkRedirectUri(u, META_CALLBACK_PATH, {
        trustedHosts: trusted,
        production: prod,
      }))
        add('allowedRedirectUris', `${u}: ${m}`, m.includes('isn’t trusted') ? 'warning' : 'error');
    for (const [field, u] of [
      ['successUrl', rt.successUrl],
      ['failureUrl', rt.failureUrl],
    ] as const)
      if (u) {
        if (prod && !u.startsWith('https://')) add(field, 'HTTPS is required in production.');
        if (!this.isTrustedDestination(u, rt))
          add(
            field,
            'This host isn’t trusted. Add its domain to Allowed domains first, so users can’t be redirected anywhere else.',
          );
      }
    if (rt.webhookBaseUrl && prod && !rt.webhookBaseUrl.startsWith('https://'))
      add('webhookBaseUrl', 'Meta only calls HTTPS webhook URLs.');
    if (rt.appMode === 'LIVE' && !rt.websiteUrl)
      add(
        'websiteUrl',
        'A live Meta app needs a website / privacy URL configured in Meta.',
        'warning',
      );
    if (
      rt.appDomain &&
      rt.websiteUrl &&
      host(rt.websiteUrl) &&
      !host(rt.websiteUrl)!.endsWith(rt.appDomain)
    )
      add(
        'websiteUrl',
        'The website URL is not under the app domain; Meta rejects that.',
        'warning',
      );
    if (!this.crypto.configured)
      add(
        'encryption',
        'CHANNEL_ENCRYPTION_KEY is not set on the server, so no secret can be stored or tokens saved.',
      );
    return out;
  }

  status(
    problems: Problem[],
    rt: MetaRuntime,
  ): 'CONFIGURED' | 'INCOMPLETE' | 'INVALID' | 'NEEDS_ATTENTION' {
    const missing = (f: string) =>
      problems.some(
        (p) => p.severity === 'error' && p.field === f && /required|not set/i.test(p.message),
      );
    const blocking = problems.filter((p) => p.severity === 'error');
    if (blocking.some((p) => !missing(p.field))) return 'INVALID';
    if (blocking.length) return 'INCOMPLETE';
    if (problems.length || !rt.webhookEnabled) return 'NEEDS_ATTENTION';
    return 'CONFIGURED';
  }

  deploymentLevel() {
    const e = this.env;
    return [
      {
        name: 'DATABASE_URL',
        purpose: 'Database connection: needed before any saved setting can be read',
        configured: true,
      },
      { name: 'JWT_ACCESS_SECRET', purpose: 'Signs customer login sessions', configured: true },
      {
        name: 'CHANNEL_ENCRYPTION_KEY',
        purpose:
          'Master key that encrypts every stored secret and channel token. Rotate it with the re-encrypt workflow (Security tab)',
        configured: !!e.CHANNEL_ENCRYPTION_KEY,
      },
      {
        name: 'CHANNEL_ENCRYPTION_KEY_PREVIOUS',
        purpose:
          'Only during a key rotation: the old master key, so existing secrets stay readable until re-encrypted',
        configured: !!e.CHANNEL_ENCRYPTION_KEY_PREVIOUS,
      },
      {
        name: 'WEB_URL / CORS_ALLOWED_ORIGINS',
        purpose: 'Public web address; also the default redirect destination',
        configured: true,
      },
    ];
  }

  // ----- admin view -----

  async adminView() {
    const rt = await this.load(true);
    const problems = this.validate(rt);
    const redirect = rt.oauthRedirectUri;
    const urls = this.webhookUrls(rt);
    return {
      values: {
        appName: rt.appName,
        appId: rt.appId,
        apiVersion: rt.apiVersion,
        businessId: rt.businessId,
        appMode: rt.appMode,
        appDomain: rt.appDomain,
        websiteUrl: rt.websiteUrl,
        oauthRedirectUri: rt.oauthRedirectUri,
        allowedRedirectUris: rt.allowedRedirectUris,
        oauthStateTtlMinutes: Math.round(rt.stateTtlMs / 60_000),
        allowedDomains: rt.allowedDomains,
        successUrl: rt.successUrl,
        failureUrl: rt.failureUrl,
        webhookBaseUrl: rt.webhookBaseUrl,
        webhookEnabled: rt.webhookEnabled,
        whatsappConfigId: rt.whatsappConfigId,
        discoverWhatsapp: rt.discoverWhatsapp,
        messengerEnabled: rt.messengerEnabled,
        instagramEnabled: rt.instagramEnabled,
        whatsappEnabled: rt.whatsappEnabled,
      },
      sources: rt.sources,
      // Only whether a secret exists and where it comes from: the value itself never leaves the server.
      secrets: {
        appSecret: { configured: !!rt.appSecret, source: rt.sources.appSecret! },
        webhookVerifyToken: {
          configured: !!rt.verifyToken,
          source: rt.sources.webhookVerifyToken!,
        },
      },
      derived: {
        callbackPath: META_CALLBACK_PATH,
        redirectUriToRegister: redirect,
        metaWebhookUrl: urls.meta,
        whatsappWebhookUrl: urls.whatsapp,
      },
      status: this.status(problems, rt),
      problems,
      deploymentLevel: this.deploymentLevel(),
      updatedAt: rt.updatedAt?.toISOString() ?? null,
      updatedBy: rt.updatedBy,
    };
  }

  private async metaChannelCount() {
    return this.prisma.client.channel.count({
      where: { status: { not: 'DISCONNECTED' }, isSample: false },
    });
  }

  /** The runtime that would result from applying `patch` to what's saved now (secrets unchanged). */
  private async merged(patch: MetaConfigPatch) {
    const row = await this.prisma.client.metaConfiguration.findUnique({ where: { id: 'default' } });
    const next = { ...(row ?? {}), ...this.toRow(patch) } as Row;
    return { row, next, rt: this.build(next) };
  }

  private toRow(p: MetaConfigPatch) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) continue;
      out[k] = Array.isArray(v) ? v : v;
    }
    return out;
  }

  private display(v: unknown): string {
    if (v === null || v === undefined || v === '') return '(unset)';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '(none)';
    return String(v);
  }

  async preview(patch: MetaConfigPatch) {
    metaConfigPatchSchema.parse(patch);
    const cur = await this.load(true);
    const { rt, row } = await this.merged(patch);
    const before: Record<string, unknown> = {
      appName: cur.appName,
      appId: cur.appId,
      apiVersion: cur.apiVersion,
      businessId: cur.businessId,
      appMode: cur.appMode,
      appDomain: cur.appDomain,
      websiteUrl: cur.websiteUrl,
      oauthRedirectUri: cur.oauthRedirectUri,
      allowedRedirectUris: cur.allowedRedirectUris,
      oauthStateTtlMinutes: Math.round(cur.stateTtlMs / 60_000),
      allowedDomains: cur.allowedDomains,
      successUrl: cur.successUrl,
      failureUrl: cur.failureUrl,
      webhookBaseUrl: cur.webhookBaseUrl,
      webhookEnabled: cur.webhookEnabled,
      whatsappConfigId: cur.whatsappConfigId,
      discoverWhatsapp: cur.discoverWhatsapp,
      messengerEnabled: cur.messengerEnabled,
      instagramEnabled: cur.instagramEnabled,
      whatsappEnabled: cur.whatsappEnabled,
    };
    const after: Record<string, unknown> = {
      ...before,
      appName: rt.appName,
      appId: rt.appId,
      apiVersion: rt.apiVersion,
      businessId: rt.businessId,
      appMode: rt.appMode,
      appDomain: rt.appDomain,
      websiteUrl: rt.websiteUrl,
      oauthRedirectUri: rt.oauthRedirectUri,
      allowedRedirectUris: rt.allowedRedirectUris,
      oauthStateTtlMinutes: Math.round(rt.stateTtlMs / 60_000),
      allowedDomains: rt.allowedDomains,
      successUrl: rt.successUrl,
      failureUrl: rt.failureUrl,
      webhookBaseUrl: rt.webhookBaseUrl,
      webhookEnabled: rt.webhookEnabled,
      whatsappConfigId: rt.whatsappConfigId,
      discoverWhatsapp: rt.discoverWhatsapp,
      messengerEnabled: rt.messengerEnabled,
      instagramEnabled: rt.instagramEnabled,
      whatsappEnabled: rt.whatsappEnabled,
    };
    const changes = Object.keys(patch)
      .filter((k) => k in before && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((field) => ({
        field,
        before: this.display(before[field]),
        after: this.display(after[field]),
      }));
    const errors = this.validate(rt, { requireSecrets: false })
      .filter((p) => p.severity === 'error' && Object.keys(patch).includes(p.field))
      .map((p) => ({ field: p.field, message: p.message }));
    const impacts: { severity: 'warning' | 'danger'; message: string }[] = [];
    const changed = new Set(changes.map((c) => c.field));
    const channels = await this.metaChannelCount();
    const live = channels > 0;
    // Setting the App ID for the first time can't disturb anything; switching away from one can.
    // The suggested default doesn't count as a configured app, so replacing it can't disturb anything.
    if (changed.has('appId') && cur.appId && cur.sources.appId !== 'default')
      impacts.push({
        severity: live ? 'danger' : 'warning',
        message: `Changing the App ID points Torio at a different Meta app. Webhooks and tokens belong to the app that issued them, so ${live ? `the ${channels} connected channel(s) will likely need to be reconnected` : 'channels must be connected again under the new app'}.`,
      });
    if (changed.has('oauthRedirectUri') || changed.has('allowedRedirectUris'))
      impacts.push({
        severity: 'warning',
        message:
          'The new redirect URI must also be listed under Valid OAuth Redirect URIs in Meta, or Facebook login will fail.',
      });
    if (changed.has('apiVersion'))
      impacts.push({
        severity: 'warning',
        message:
          'All Graph API calls use the new version immediately. Make sure Meta still supports it for your app.',
      });
    if (changed.has('webhookEnabled') && !rt.webhookEnabled)
      impacts.push({
        severity: live ? 'danger' : 'warning',
        message:
          'With webhooks disabled Torio stops receiving customer messages from Meta (they will be rejected until re-enabled).',
      });
    for (const [f, label] of [
      ['messengerEnabled', 'Messenger'],
      ['instagramEnabled', 'Instagram'],
      ['whatsappEnabled', 'WhatsApp'],
    ] as const)
      if (changed.has(f) && !(rt as unknown as Record<string, boolean>)[f])
        impacts.push({
          severity: live ? 'danger' : 'warning',
          message: `${label} will be hidden from the connect screen and inbound ${label} events will be ignored.`,
        });
    if (changed.has('discoverWhatsapp') && rt.discoverWhatsapp)
      impacts.push({
        severity: 'warning',
        message:
          'The Facebook login will also request WhatsApp permissions; they must be approved for production in Meta.',
      });
    void row;
    return {
      changes,
      impacts,
      requiresConfirmation: impacts.some((i) => i.severity === 'danger'),
      errors,
    };
  }

  async save(
    admin: AdminContext,
    patch: MetaConfigPatch,
    confirm: boolean | undefined,
    ip?: string,
  ) {
    const parsed = metaConfigPatchSchema.parse(patch);
    const pv = await this.preview(parsed);
    const fail = async (message: string, errors?: unknown) => {
      await this.audit.log({
        admin,
        action: 'meta.config.update',
        targetType: 'meta_configuration',
        targetId: 'default',
        ip,
        metadata: {
          category: 'configuration',
          status: 'failed',
          fields: pv.changes.map((c) => c.field),
          reason: message,
          errors,
        },
      });
    };
    if (pv.errors.length) {
      await fail('validation', pv.errors);
      throw new BadRequestException(
        pv.errors.map((e) => `${LABEL[e.field] ?? e.field}: ${e.message}`).join(' '),
      );
    }
    if (!pv.changes.length) return this.adminView();
    if (pv.requiresConfirmation && !confirm) {
      await fail('confirmation required');
      throw new ConflictException(
        `Confirmation required: ${pv.impacts
          .filter((i) => i.severity === 'danger')
          .map((i) => i.message)
          .join(' ')}`,
      );
    }
    const data = this.toRow(parsed) as Prisma.MetaConfigurationUncheckedUpdateInput;
    try {
      // All-or-nothing: the settings row and its audit record commit together, or neither does.
      await this.prisma.client.$transaction(async (tx) => {
        await tx.metaConfiguration.upsert({
          where: { id: 'default' },
          create: {
            id: 'default',
            ...(data as Prisma.MetaConfigurationUncheckedCreateInput),
            updatedById: admin.id,
            updatedByEmail: admin.email,
          },
          update: { ...data, updatedById: admin.id, updatedByEmail: admin.email },
        });
        await this.audit.log(
          {
            admin,
            action: 'meta.config.update',
            targetType: 'meta_configuration',
            targetId: 'default',
            ip,
            metadata: {
              category: 'configuration',
              status: 'success',
              fields: pv.changes.map((c) => c.field),
              changes: pv.changes,
              confirmed: !!confirm,
            },
          },
          tx,
        );
      });
    } catch (e) {
      await fail('database error');
      throw e;
    }
    this.invalidate();
    await this.load(true);
    return this.adminView();
  }

  // ----- secrets -----

  private secretCol(kind: 'appSecret' | 'webhookVerifyToken') {
    return kind === 'appSecret' ? 'appSecretCiphertext' : 'verifyTokenCiphertext';
  }

  async setSecret(
    admin: AdminContext,
    kind: 'appSecret' | 'webhookVerifyToken',
    value: string,
    confirm: boolean | undefined,
    ip?: string,
  ) {
    if (!this.crypto.configured)
      throw new BadRequestException(
        'CHANNEL_ENCRYPTION_KEY is not set on the server, so secrets can’t be stored.',
      );
    const cur = await this.load(true);
    const hadValue = kind === 'appSecret' ? !!cur.appSecret : !!cur.verifyToken;
    const channels = await this.metaChannelCount();
    if (hadValue && channels > 0 && !confirm)
      throw new ConflictException(
        kind === 'appSecret'
          ? `Confirmation required: ${channels} connected channel(s) rely on webhooks signed with the current App Secret. Use the new secret of the same Meta app, or reconnect channels.`
          : `Confirmation required: update the verify token in Meta's webhook settings too, or Meta can't re-verify your callback URL.`,
      );
    const cipher = this.crypto.encrypt(value);
    const col = this.secretCol(kind);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.metaConfiguration.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          [col]: cipher,
          updatedById: admin.id,
          updatedByEmail: admin.email,
        },
        update: { [col]: cipher, updatedById: admin.id, updatedByEmail: admin.email },
      });
      // Never the value itself, a prefix or a length: only that it was replaced.
      await this.audit.log(
        {
          admin,
          action: 'meta.secret.replace',
          targetType: 'meta_configuration',
          targetId: kind,
          ip,
          metadata: { category: 'secrets', status: 'success', secret: kind, replaced: hadValue },
        },
        tx,
      );
    });
    this.invalidate();
    return this.adminView();
  }

  async clearSecret(admin: AdminContext, kind: 'appSecret' | 'webhookVerifyToken', ip?: string) {
    const cur = await this.load(true);
    const env =
      kind === 'appSecret' ? this.env.META_APP_SECRET : this.env.META_WEBHOOK_VERIFY_TOKEN;
    const channels = await this.metaChannelCount();
    if (!env && channels > 0)
      throw new ConflictException(
        'This secret can’t be cleared: no environment fallback exists and channels are connected, so webhooks would stop working. Replace it instead.',
      );
    if (
      !(kind === 'appSecret'
        ? cur.sources.appSecret === 'database'
        : cur.sources.webhookVerifyToken === 'database')
    )
      throw new BadRequestException('There is no saved value to clear.');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.metaConfiguration.update({
        where: { id: 'default' },
        data: { [this.secretCol(kind)]: null, updatedById: admin.id, updatedByEmail: admin.email },
      });
      await this.audit.log(
        {
          admin,
          action: 'meta.secret.clear',
          targetType: 'meta_configuration',
          targetId: kind,
          ip,
          metadata: {
            category: 'secrets',
            status: 'success',
            secret: kind,
            fallback: env ? 'environment' : 'none',
          },
        },
        tx,
      );
    });
    this.invalidate();
    return this.adminView();
  }

  /** A new random verify token. It is returned once so the admin can enter it in Meta, and stored only encrypted. */
  async generateVerifyToken(admin: AdminContext, confirm: boolean | undefined, ip?: string) {
    const token = randomBytes(24).toString('base64url');
    await this.setSecret(admin, 'webhookVerifyToken', token, confirm, ip);
    return { token };
  }

  async markWebhookVerified() {
    try {
      await this.prisma.client.metaConfiguration.upsert({
        where: { id: 'default' },
        create: { id: 'default', lastWebhookVerifiedAt: new Date() },
        update: { lastWebhookVerifiedAt: new Date() },
      });
    } catch (e) {
      this.log.warn(`Could not record webhook verification time: ${String(e)}`);
    }
  }
}
