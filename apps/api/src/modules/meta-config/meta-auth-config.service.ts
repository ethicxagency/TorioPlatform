import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  checkRedirectUri,
  FACEBOOK_LOGIN_CALLBACK_PATH,
  isRetiredMetaAppId,
  META_APP_IDS,
  metaAuthPatchSchema,
  type MetaAuthPatch,
} from '@torio/contracts';
import { Prisma } from '@torio/database';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { AdminAudit } from '../admin/admin-audit.service';
import type { AdminContext } from '../admin/admin-auth';
import { MetaGraphProvider } from '../meta/meta.graph-provider';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { GraphError } from '../whatsapp/whatsapp.api';
import { MetaConfigService, type Problem } from './meta-config.service';

/** The permissions customer sign-in asks for: the profile and the email, nothing business or messaging related. */
export const AUTH_APP_SCOPES = ['public_profile', 'email'] as const;
const CACHE_MS = 5_000;
const ID = 'auth';

type Row = Prisma.MetaConfigurationGetPayload<object>;
type Source = 'database' | 'environment' | 'default' | 'unset';

/** What customer "Continue with Facebook" runs on right now. Saved values win; the environment is the fallback. */
export interface AuthRuntime {
  appName: string | null;
  appId: string | null;
  /** Retired App IDs found in saved or environment settings and skipped (their secrets are never used either). */
  ignoredRetiredAppIds: string[];
  appSecret: string | null;
  apiVersion: string;
  appMode: 'DEVELOPMENT' | 'LIVE' | null;
  appDomain: string | null;
  websiteUrl: string | null;
  redirectUri: string | null;
  allowedRedirectUris: string[];
  /** Whether the saved App ID/Secret pair, the environment pair, or nothing is in use. */
  credentialsFrom: 'database' | 'environment' | 'none';
  /** An App ID is saved but its App Secret isn't, so the saved ID is ignored until it is. */
  savedIdWithoutSecret: boolean;
  sources: Record<string, Source>;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Settings for the Torio Auth Meta app: Facebook Login for customers, and nothing else. It is a different Meta app from
 * Torio Platform (Messenger, Instagram, WhatsApp), so its credentials live in their own row (id "auth"), are never read
 * for webhooks or channels, and a problem here never touches the business integrations (or the other way round).
 */
@Injectable()
export class MetaAuthConfigService {
  private readonly log = new Logger(MetaAuthConfigService.name);
  private rt: AuthRuntime;
  private loadedAt = 0;
  private inflight?: Promise<AuthRuntime>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly audit: AdminAudit,
    private readonly business: MetaConfigService,
    private readonly graph: MetaGraphProvider,
    @Inject(APP_CONFIG) private readonly env: AppConfig,
  ) {
    this.rt = this.build(null);
  }

  get current(): AuthRuntime {
    return this.rt;
  }

  async load(force = false): Promise<AuthRuntime> {
    if (!force && Date.now() - this.loadedAt < CACHE_MS) return this.rt;
    this.inflight ??= (async () => {
      try {
        this.rt = this.build(
          await this.prisma.client.metaConfiguration.findUnique({ where: { id: ID } }),
        );
        this.loadedAt = Date.now();
      } catch (e) {
        // Keep the last known configuration if the database read fails.
        this.log.error(`Auth app configuration reload failed: ${String(e)}`);
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

  private decryptOpt(c: string | null | undefined) {
    if (!c) return null;
    try {
      return this.crypto.decrypt(c);
    } catch {
      this.log.error(
        'The stored Auth app secret could not be decrypted (wrong or missing CHANNEL_ENCRYPTION_KEY?)',
      );
      return null;
    }
  }

  private build(row: Row | null): AuthRuntime {
    const env = this.env;
    const src: AuthRuntime['sources'] = {};
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
    const dbSecret = this.decryptOpt(row?.appSecretCiphertext);
    // A retired App ID (from the old shared configuration) is never resolved: skipped, never a silent fallback.
    const ignoredRetiredAppIds = [row?.appId, env.FACEBOOK_APP_ID].filter((v): v is string =>
      isRetiredMetaAppId(v),
    );
    const dbId = isRetiredMetaAppId(row?.appId) ? null : (row?.appId ?? null);
    const envId = isRetiredMetaAppId(env.FACEBOOK_APP_ID) ? null : (env.FACEBOOK_APP_ID ?? null);
    // The App ID and Secret are one pair from one source: a saved secret brings the saved (or suggested) ID with it;
    // an environment secret is only used with its own, non-retired environment ID.
    let appId: string | null;
    let appSecret: string | null;
    let credentialsFrom: AuthRuntime['credentialsFrom'];
    if (dbSecret) {
      appId = dbId ?? envId ?? META_APP_IDS.AUTH;
      appSecret = dbSecret;
      credentialsFrom = 'database';
      src.appId = dbId ? 'database' : envId ? 'environment' : 'default';
      src.appSecret = 'database';
    } else if (envId && env.FACEBOOK_APP_SECRET) {
      appId = envId;
      appSecret = env.FACEBOOK_APP_SECRET;
      credentialsFrom = 'environment';
      src.appId = 'environment';
      src.appSecret = 'environment';
    } else {
      appId = dbId ?? META_APP_IDS.AUTH;
      appSecret = null;
      credentialsFrom = 'none';
      src.appId = dbId ? 'database' : 'default';
      src.appSecret = 'unset';
    }
    return {
      appName: pick('appName', row?.appName, null),
      appId,
      ignoredRetiredAppIds,
      appSecret,
      apiVersion: pick('apiVersion', row?.apiVersion, env.META_GRAPH_VERSION)!,
      appMode: pick('appMode', row?.appMode as 'DEVELOPMENT' | 'LIVE' | null, null),
      appDomain: pick('appDomain', row?.appDomain, null),
      websiteUrl: pick('websiteUrl', row?.websiteUrl, null),
      redirectUri: pick(
        'customerAuthRedirectUri',
        row?.customerAuthRedirectUri,
        env.FACEBOOK_REDIRECT_URI ?? null,
      ),
      allowedRedirectUris: pick(
        'customerAuthAllowedRedirectUris',
        row?.customerAuthAllowedRedirectUris,
        null,
        [] as string[],
      )!,
      credentialsFrom,
      savedIdWithoutSecret: !!dbId && !dbSecret,
      sources: src,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedByEmail ?? null,
    };
  }

  /** Whether customer Facebook sign-in has a complete App ID + Secret to run on. */
  get ready(): boolean {
    return !!(this.rt.appId && this.rt.appSecret);
  }

  private trustedHosts(rt: AuthRuntime): string[] {
    const h = (u?: string | null) => {
      try {
        return u ? new URL(u).hostname.toLowerCase() : null;
      } catch {
        return null;
      }
    };
    return [h(this.env.WEB_URL), h(this.env.API_URL), rt.appDomain?.toLowerCase()].filter(
      (x): x is string => !!x,
    );
  }

  /**
   * The redirect URI customer Facebook sign-in sends to Meta and must repeat exactly at the code exchange: the saved
   * primary, else FACEBOOK_REDIRECT_URI, else the API origin (API_URL) + the route. Never the web app's address, and
   * production never guesses. Anything failing this flow's own checks is refused.
   */
  redirect(rt: AuthRuntime = this.rt): {
    uri: string | null;
    problems: string[];
    source: 'saved' | 'environment' | 'derived' | 'none';
  } {
    const prod = this.env.NODE_ENV === 'production';
    const apiBase = this.env.API_URL
      ? this.env.API_URL.replace(/\/$/, '')
      : prod
        ? null
        : `http://localhost:${this.env.API_PORT}`;
    const configured = rt.redirectUri;
    const uri = configured ?? (apiBase ? `${apiBase}${FACEBOOK_LOGIN_CALLBACK_PATH}` : null);
    const source = configured
      ? rt.sources.customerAuthRedirectUri === 'database'
        ? 'saved'
        : 'environment'
      : uri
        ? 'derived'
        : 'none';
    if (!uri)
      return {
        uri: null,
        source,
        problems: [
          'Set API_URL (the public address of the API) on the server, or save a Customer Facebook callback URL. Production never guesses it.',
        ],
      };
    const problems = checkRedirectUri(uri, FACEBOOK_LOGIN_CALLBACK_PATH, {
      trustedHosts: this.trustedHosts(rt),
      production: prod,
    });
    if (rt.allowedRedirectUris.length && !rt.allowedRedirectUris.includes(uri))
      problems.push('Not in the allowed redirect URIs.');
    return problems.length ? { uri: null, problems, source } : { uri, problems, source };
  }

  validate(rt: AuthRuntime): Problem[] {
    const out: Problem[] = [];
    const add = (field: string, message: string, severity: Problem['severity'] = 'error') =>
      out.push({ field, message, severity });
    if (!rt.appId) add('appId', 'App ID is required.');
    if (rt.ignoredRetiredAppIds.length)
      add(
        'appId',
        'A retired App ID from the old shared configuration was found and is being ignored, along with any secret tied to it. Torio Auth uses its own App ID.',
        'warning',
      );
    if (!rt.appSecret)
      add('appSecret', 'App Secret is required for customers to sign in with Facebook.');
    if (rt.appId && this.business.current.appId && rt.appId === this.business.current.appId)
      add(
        'appId',
        'This is the Business Messaging app’s ID. Customer sign-in must use the separate Torio Auth app.',
      );
    if (rt.savedIdWithoutSecret)
      add(
        'appId',
        'A saved App ID is only used once its App Secret is saved too; until then the previous configuration keeps running.',
        'warning',
      );
    const prod = this.env.NODE_ENV === 'production';
    const trusted = this.trustedHosts(rt);
    const cu = rt.redirectUri;
    if (cu)
      for (const m of checkRedirectUri(cu, FACEBOOK_LOGIN_CALLBACK_PATH, {
        trustedHosts: trusted,
        production: prod,
      }))
        add('customerAuthRedirectUri', m);
    if (cu && rt.allowedRedirectUris.length && !rt.allowedRedirectUris.includes(cu))
      add('customerAuthRedirectUri', 'The callback URL must be one of the allowed redirect URIs.');
    for (const u of rt.allowedRedirectUris)
      for (const m of checkRedirectUri(u, FACEBOOK_LOGIN_CALLBACK_PATH, {
        trustedHosts: trusted,
        production: prod,
      }))
        add('customerAuthAllowedRedirectUris', `${u}: ${m}`);
    const r = this.redirect(rt);
    if (!cu && !r.uri) for (const m of r.problems) add('customerAuthRedirectUri', m);
    if (!this.crypto.configured)
      add(
        'encryption',
        'Secure token storage (CHANNEL_ENCRYPTION_KEY) is not configured on the server, so the App Secret can’t be saved here.',
      );
    return out;
  }

  private status(problems: Problem[]): 'CONFIGURED' | 'INCOMPLETE' | 'INVALID' {
    const errors = problems.filter((p) => p.severity === 'error');
    if (!errors.length) return 'CONFIGURED';
    return errors.every((p) => /required/i.test(p.message)) ? 'INCOMPLETE' : 'INVALID';
  }

  private async lastEvents() {
    const db = this.prisma.client;
    const [login, test] = await Promise.all([
      db.auditLog.findFirst({
        where: { action: 'auth.login', metadata: { path: ['provider'], equals: 'FACEBOOK' } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      db.adminAuditLog.findFirst({
        where: { action: 'meta.auth.test' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, metadata: true },
      }),
    ]);
    return {
      lastLoginAt: login?.createdAt.toISOString() ?? null,
      lastTestAt: test?.createdAt.toISOString() ?? null,
      lastTestOk: test ? (test.metadata as { status?: string } | null)?.status === 'success' : null,
    };
  }

  async adminView() {
    const rt = await this.load(true);
    const problems = this.validate(rt);
    const r = this.redirect(rt);
    let path: string | null = null;
    try {
      if (r.uri) path = new URL(r.uri).pathname.replace(/\/$/, '');
    } catch {
      /* reported through problems */
    }
    return {
      values: {
        appName: rt.appName,
        appId: rt.appId,
        apiVersion: rt.apiVersion,
        appMode: rt.appMode,
        appDomain: rt.appDomain,
        websiteUrl: rt.websiteUrl,
        customerAuthRedirectUri: rt.redirectUri,
        customerAuthAllowedRedirectUris: rt.allowedRedirectUris,
      },
      sources: rt.sources,
      // Only whether a secret exists: the value never leaves the server.
      secrets: {
        appSecret: { configured: !!rt.appSecret, source: rt.sources.appSecret ?? 'unset' },
      },
      credentialsFrom: rt.credentialsFrom,
      derived: {
        callbackPath: FACEBOOK_LOGIN_CALLBACK_PATH,
        generatedRedirectUri: r.uri,
        matchesRoute: path === FACEBOOK_LOGIN_CALLBACK_PATH,
        registerInMeta: r.uri,
        scopes: [...AUTH_APP_SCOPES],
        suggestedAppId: META_APP_IDS.AUTH,
      },
      status: this.status(problems),
      problems,
      ...(await this.lastEvents()),
      updatedAt: rt.updatedAt?.toISOString() ?? null,
      updatedBy: rt.updatedBy,
    };
  }

  private async merged(patch: MetaAuthPatch) {
    const row = await this.prisma.client.metaConfiguration.findUnique({ where: { id: ID } });
    return this.build({ ...(row ?? ({} as Row)), ...patch } as Row);
  }

  async save(admin: AdminContext, patch: MetaAuthPatch, ip?: string) {
    const parsed = metaAuthPatchSchema.parse(patch);
    const next = await this.merged(parsed);
    const fields = Object.keys(parsed);
    // Only problems with what is being saved block it; a still-missing secret doesn't stop other fields from saving.
    const errors = this.validate(next).filter(
      (p) => p.severity === 'error' && fields.includes(p.field),
    );
    if (errors.length) {
      await this.audit.log({
        admin,
        action: 'meta.auth.config.update',
        targetType: 'meta_configuration',
        targetId: ID,
        ip,
        metadata: { category: 'configuration', status: 'failed', fields, reason: 'validation' },
      });
      throw new BadRequestException(errors.map((e) => e.message).join(' '));
    }
    if (!fields.length) return this.adminView();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.metaConfiguration.upsert({
        where: { id: ID },
        create: {
          id: ID,
          purpose: 'AUTH',
          ...(parsed as object),
          updatedById: admin.id,
          updatedByEmail: admin.email,
        },
        update: { ...(parsed as object), updatedById: admin.id, updatedByEmail: admin.email },
      });
      await this.audit.log(
        {
          admin,
          action: 'meta.auth.config.update',
          targetType: 'meta_configuration',
          targetId: ID,
          ip,
          metadata: { category: 'configuration', status: 'success', fields },
        },
        tx,
      );
    });
    this.invalidate();
    return this.adminView();
  }

  async setSecret(admin: AdminContext, value: string, ip?: string) {
    if (!this.crypto.configured)
      throw new BadRequestException(
        'Secure token storage (CHANNEL_ENCRYPTION_KEY) is not configured on the server, so secrets can’t be stored.',
      );
    const had = this.rt.sources.appSecret === 'database';
    // The new secret must be accepted by Meta for this app before it replaces anything stored.
    const rt = await this.load(true);
    if (!rt.appId) throw new BadRequestException('Save the App ID first.');
    try {
      const info = await this.graph.get().appInfo(rt.appId, value);
      if (info.id && info.id !== rt.appId)
        throw new GraphError(`Meta answered for app ${info.id}`, 400);
      this.log.log(
        `Torio Auth (app ${rt.appId}, from ${rt.sources.appId}): new App Secret accepted by Meta`,
      );
    } catch (e) {
      this.log.warn(
        `Torio Auth (app ${rt.appId}, from ${rt.sources.appId}): new App Secret ${e instanceof GraphError ? 'rejected by Meta' : 'could not be checked'}`,
      );
      await this.audit.log({
        admin,
        action: 'meta.auth.secret.replace',
        targetType: 'meta_configuration',
        targetId: ID,
        ip,
        metadata: {
          category: 'secrets',
          status: 'failed',
          reason: e instanceof GraphError ? 'rejected by Meta' : 'Meta unreachable',
        },
      });
      throw new BadRequestException(
        e instanceof GraphError
          ? `Meta did not accept this App Secret for app ${rt.appId}. The saved secret was not changed.`
          : 'Could not reach Meta to check the new App Secret, so the saved secret was not changed. Try again shortly.',
      );
    }
    const cipher = this.crypto.encrypt(value);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.metaConfiguration.upsert({
        where: { id: ID },
        create: {
          id: ID,
          purpose: 'AUTH',
          appSecretCiphertext: cipher,
          updatedById: admin.id,
          updatedByEmail: admin.email,
        },
        update: { appSecretCiphertext: cipher, updatedById: admin.id, updatedByEmail: admin.email },
      });
      // Never the value, a prefix or a length: only that it was replaced.
      await this.audit.log(
        {
          admin,
          action: 'meta.auth.secret.replace',
          targetType: 'meta_configuration',
          targetId: ID,
          ip,
          metadata: { category: 'secrets', status: 'success', replaced: had },
        },
        tx,
      );
    });
    this.invalidate();
    return this.adminView();
  }

  async clearSecret(admin: AdminContext, ip?: string) {
    await this.load(true);
    if (this.rt.sources.appSecret !== 'database')
      throw new BadRequestException('There is no saved App Secret to clear.');
    const fallback = !!(this.env.FACEBOOK_APP_ID && this.env.FACEBOOK_APP_SECRET);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.metaConfiguration.update({
        where: { id: ID },
        data: { appSecretCiphertext: null, updatedById: admin.id, updatedByEmail: admin.email },
      });
      await this.audit.log(
        {
          admin,
          action: 'meta.auth.secret.clear',
          targetType: 'meta_configuration',
          targetId: ID,
          ip,
          metadata: {
            category: 'secrets',
            status: 'success',
            fallback: fallback ? 'environment' : 'none',
          },
        },
        tx,
      );
    });
    this.invalidate();
    return this.adminView();
  }

  /** Asks Meta whether the App ID and App Secret in use are a valid pair. A real call; nothing is inferred from the fields. */
  async test(admin: AdminContext, ip?: string) {
    const rt = await this.load(true);
    let ok = false;
    let message: string;
    let httpStatus: number | null = null;
    let metaCode: number | null = null;
    let resolution: string | null = null;
    const details: { label: string; value: string }[] = [];
    if (!rt.appId || !rt.appSecret) {
      message = 'App ID and App Secret must both be configured first.';
      resolution =
        'Save the Torio Auth App Secret, or set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET on the server.';
    } else
      try {
        const info = await this.graph.get().appInfo(rt.appId, rt.appSecret);
        ok = true;
        httpStatus = 200;
        message = 'Meta accepted the App ID and App Secret.';
        details.push(
          { label: 'App name at Meta', value: info.name ?? '—' },
          {
            label: 'Credentials from',
            value: rt.credentialsFrom === 'database' ? 'saved here' : 'server environment',
          },
        );
        if (rt.appName && info.name && rt.appName !== info.name)
          resolution = `Meta calls this app “${info.name}”, not “${rt.appName}”.`;
      } catch (e) {
        if (e instanceof GraphError) {
          httpStatus = e.status;
          metaCode = e.code ?? null;
          message =
            `Meta rejected the request: ${e.message.replace(/(access_token|secret)=[^&\s]+/gi, '$1=…')}`.slice(
              0,
              280,
            );
          resolution =
            'Check the App ID and App Secret are from the same app (Meta → App settings → Basic).';
        } else {
          message = 'Could not reach Meta to check the credentials.';
          resolution = 'Check the server’s network access to graph.facebook.com.';
        }
      }
    await this.audit.log({
      admin,
      action: 'meta.auth.test',
      targetType: 'meta_configuration',
      targetId: ID,
      ip,
      metadata: {
        category: 'diagnostics',
        status: ok ? 'success' : 'failed',
        httpStatus,
        metaCode,
      },
    });
    return {
      ok,
      checkedAt: new Date().toISOString(),
      httpStatus,
      metaCode,
      message,
      resolution,
      details,
    };
  }
}
