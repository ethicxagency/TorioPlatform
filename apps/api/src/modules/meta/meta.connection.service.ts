import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import { randomInt } from 'node:crypto';
import type { MetaSelectInput, WhatsAppEmbeddedSignupInput } from '@torio/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { GraphError } from '../whatsapp/whatsapp.api';
import { WhatsAppGraphProvider } from '../whatsapp/whatsapp.graph-provider';
import { MetaGraphProvider } from './meta.graph-provider';
import { packCredential, unpackCredential } from './meta.credentials';
import { signState, verifyState } from './meta.state';

type Provider = 'MESSENGER' | 'INSTAGRAM';

/** Least-privilege scopes per integration. Instagram messaging through a linked Page needs the Page scopes too. */
export const SCOPES: Record<Provider, string[]> = {
  MESSENGER: ['pages_show_list', 'pages_messaging', 'pages_manage_metadata'],
  INSTAGRAM: [
    'pages_show_list',
    'pages_manage_metadata',
    'instagram_basic',
    'instagram_manage_messages',
  ],
};
const SUBSCRIBED_FIELDS: Record<Provider, string[]> = {
  MESSENGER: ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads'],
  INSTAGRAM: ['messages', 'messaging_postbacks', 'messaging_seen'],
};
const SESSION_TTL_MS = 15 * 60_000;

interface Candidate {
  id: string;
  name: string;
  detail: string | null;
  /** Page id used for sending/subscribing (for Instagram this is the linked Page). */
  pageId: string;
  tokenCiphertext: string;
}

/** Why a Meta call failed, in words an admin can act on. Raw Graph errors are logged, not shown. */
export function explain(e: unknown): string {
  if (e instanceof GraphError) {
    if (e.tokenExpired) return 'Meta authorization expired or was revoked. Reconnect to continue.';
    if (e.code === 10 || e.code === 200 || e.code === 299)
      return 'A required Meta permission is missing. Reconnect and approve every permission.';
    if (e.transient) return 'Meta is rate-limiting or temporarily unavailable. Try again shortly.';
    return `Meta rejected the request: ${e.message}`.slice(0, 300);
  }
  return 'Could not reach Meta. Try again.';
}

@Injectable()
export class MetaConnectionService {
  private readonly log = new Logger(MetaConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly graph: MetaGraphProvider,
    private readonly waGraph: WhatsAppGraphProvider,
    private readonly channels: ChannelsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    // Disconnecting a Page also removes Torio's webhook subscription on Meta's side (best effort).
    this.channels.onDisconnect(async (ch) => {
      if (
        (ch.provider !== 'MESSENGER' && ch.provider !== 'INSTAGRAM') ||
        !ch.ciphertext ||
        !this.crypto.configured
      )
        return null;
      const cred = unpackCredential(this.crypto.decrypt(ch.ciphertext));
      if (!cred) return null;
      try {
        await this.graph.get().unsubscribePage(cred.pageId, cred.token);
        return 'Torio’s webhook subscription was removed from the Page on Meta.';
      } catch (e) {
        return `Couldn’t remove the Page subscription on Meta (${explain(e)}). The Page owner can remove Torio under Business integrations.`;
      }
    });
  }

  get oauthReady() {
    const c = this.config;
    return !!(
      c.META_APP_ID &&
      c.META_APP_SECRET &&
      c.META_OAUTH_REDIRECT_URI &&
      c.META_WEBHOOK_VERIFY_TOKEN &&
      this.crypto.configured
    );
  }

  publicConfig() {
    return {
      appId: this.config.META_APP_ID ?? null,
      graphVersion: this.config.META_GRAPH_VERSION,
      whatsappConfigId: this.config.META_WA_CONFIG_ID ?? null,
    };
  }

  private requireReady() {
    if (!this.oauthReady)
      throw new ServiceUnavailableException(
        'Meta isn’t configured on this server (META_APP_ID, META_APP_SECRET, META_OAUTH_REDIRECT_URI, META_WEBHOOK_VERIFY_TOKEN and CHANNEL_ENCRYPTION_KEY are required).',
      );
  }

  /** Step 1: the Meta authorization URL, with a signed state bound to this workspace, user and provider. */
  start(workspaceId: string, userId: string, provider: Provider) {
    this.requireReady();
    const c = this.config;
    const state = signState({ w: workspaceId, u: userId, p: provider }, c.META_APP_SECRET!);
    const url = new URL(`https://www.facebook.com/${c.META_GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set('client_id', c.META_APP_ID!);
    url.searchParams.set('redirect_uri', c.META_OAUTH_REDIRECT_URI!);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES[provider].join(','));
    return { url: url.toString() };
  }

  /**
   * Step 2: Meta redirects the browser here. Nothing is trusted until the signed state verifies; the code is
   * exchanged server-side and the result is parked in an expiring session, never put in the URL. Always returns
   * a web URL to send the browser to (success or a coded error).
   */
  async callback(q: { code?: string; state?: string; error?: string; error_reason?: string }) {
    const web = (params: Record<string, string>) =>
      `${this.config.WEB_URL.replace(/\/$/, '')}/channels?${new URLSearchParams(params)}`;
    if (!this.oauthReady) return web({ meta_error: 'not_configured' });
    const st = q.state ? verifyState(q.state, this.config.META_APP_SECRET!) : null;
    if (!st) return web({ meta_error: 'invalid_state' });
    if (q.error || !q.code) return web({ meta_error: 'denied' });
    try {
      const g = this.graph.get();
      const short = await g.exchangeCode({
        appId: this.config.META_APP_ID!,
        appSecret: this.config.META_APP_SECRET!,
        redirectUri: this.config.META_OAUTH_REDIRECT_URI!,
        code: q.code,
      });
      const long = await g.longLivedUserToken({
        appId: this.config.META_APP_ID!,
        appSecret: this.config.META_APP_SECRET!,
        token: short.access_token,
      });
      const userToken = long.access_token;
      const granted = await g.grantedPermissions(userToken);
      const missing = SCOPES[st.p].filter((s) => !granted.has(s));
      if (missing.length) return web({ meta_error: 'missing_permissions' });
      const pages = await g.pages(userToken);
      const eligible = pages.filter(
        (p) => !!p.access_token && (st.p === 'MESSENGER' || !!p.instagram_business_account),
      );
      if (!eligible.length) return web({ meta_error: 'no_accounts' });
      const candidates: Candidate[] = eligible.map((p) => ({
        id: st.p === 'INSTAGRAM' ? p.instagram_business_account!.id : p.id,
        name:
          st.p === 'INSTAGRAM'
            ? p.instagram_business_account?.username
              ? `@${p.instagram_business_account.username}`
              : p.name
            : p.name,
        detail: st.p === 'INSTAGRAM' ? `Linked Page: ${p.name}` : null,
        pageId: p.id,
        tokenCiphertext: this.crypto.encrypt(p.access_token!),
      }));
      const session = await this.prisma.client.channelOAuthSession.create({
        data: {
          workspaceId: st.w,
          userId: st.u,
          provider: st.p,
          candidates: candidates as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      return web({ meta_session: session.id, provider: st.p });
    } catch (e) {
      this.log.warn(
        `Meta OAuth callback failed: ${e instanceof GraphError ? `${e.status}/${e.code}` : String(e)}`,
      );
      return web({
        meta_error: e instanceof GraphError && e.transient ? 'unavailable' : 'exchange_failed',
      });
    }
  }

  private async loadSession(ws: string, userId: string, id: string) {
    const s = await this.prisma.client.channelOAuthSession.findFirst({
      where: { id, workspaceId: ws, userId },
    });
    if (!s) throw new NotFoundException('Connection session not found');
    if (s.consumedAt) throw new GoneException('This connection was already completed');
    if (s.expiresAt < new Date())
      throw new GoneException('This connection expired. Start again from the Channels page.');
    return s;
  }

  /** Step 3: what the user can pick. Names only; already-connected accounts are flagged. */
  async session(ws: string, userId: string, id: string) {
    const s = await this.loadSession(ws, userId, id);
    const candidates = s.candidates as unknown as Candidate[];
    const taken = await this.prisma.client.channel.findMany({
      where: {
        provider: s.provider,
        externalAccountId: { in: candidates.map((c) => c.id) },
        status: { not: 'DISCONNECTED' },
      },
      select: { externalAccountId: true },
    });
    const takenIds = new Set(taken.map((t) => t.externalAccountId));
    return {
      id: s.id,
      provider: s.provider as Provider,
      expiresAt: s.expiresAt.toISOString(),
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        detail: c.detail,
        taken: takenIds.has(c.id),
      })),
    };
  }

  /** Step 4: subscribe the Page to webhooks, then store the connection. Nothing is saved if Meta rejects it. */
  async select(ws: string, userId: string, id: string, input: MetaSelectInput) {
    this.requireReady();
    const s = await this.loadSession(ws, userId, id);
    const provider = s.provider as Provider;
    const cand = (s.candidates as unknown as Candidate[]).find((c) => c.id === input.candidateId);
    if (!cand) throw new BadRequestException('That account isn’t in this authorization');
    const db = this.prisma.client;
    const existing = await db.channel.findUnique({
      where: { provider_externalAccountId: { provider, externalAccountId: cand.id } },
    });
    if (existing && existing.status !== 'DISCONNECTED')
      throw new ConflictException(
        existing.workspaceId === ws
          ? 'This account is already connected to this workspace.'
          : 'This account is already connected to another workspace.',
      );
    const token = this.crypto.decrypt(cand.tokenCiphertext);
    const g = this.graph.get();
    let tokenExpiresAt: Date | null = null;
    try {
      await g.subscribePage(cand.pageId, token, SUBSCRIBED_FIELDS[provider]);
      tokenExpiresAt =
        (
          await g
            .tokenInfo(this.config.META_APP_ID!, this.config.META_APP_SECRET!, token)
            .catch(() => null)
        )?.expiresAt ?? null;
    } catch (e) {
      throw new BadRequestException(`Couldn’t subscribe to messages. ${explain(e)}`);
    }
    const cipher = this.crypto.encrypt(packCredential({ token, pageId: cand.pageId }));
    const now = new Date();
    const data = {
      displayName: input.displayName ?? cand.name,
      status: 'CONNECTED' as const,
      accountName: cand.name,
      accountMask: cand.id,
      connectedAt: now,
      disconnectedAt: null,
      lastHealthCheckAt: now,
      lastError: null,
      tokenExpiresAt,
      webhookStatus: 'SUBSCRIBED',
      webhookError: null,
    };
    const channel = await db.$transaction(async (tx) => {
      // Reconnecting a previously disconnected account revives the same channel so its conversations stay attached.
      const c = existing
        ? await tx.channel.update({
            where: { id: existing.id },
            data: { ...data, workspaceId: ws },
          })
        : await tx.channel.create({
            data: { ...data, workspaceId: ws, provider, externalAccountId: cand.id },
          });
      await tx.channelCredential.upsert({
        where: { channelId: c.id },
        create: { workspaceId: ws, channelId: c.id, ciphertext: cipher },
        update: { ciphertext: cipher },
      });
      await tx.channelOAuthSession.update({ where: { id: s.id }, data: { consumedAt: now } });
      await tx.auditLog.create({
        data: {
          workspaceId: ws,
          actorId: userId,
          action: existing ? 'channel.reconnect' : 'channel.connect',
          entityType: 'channel',
          entityId: c.id,
          metadata: {
            provider,
            description: `${provider === 'INSTAGRAM' ? 'Instagram' : 'Messenger'} connected: ${cand.name}`,
          },
        },
      });
      return c;
    });
    return this.channels.get(ws, channel.id);
  }

  /** WhatsApp Embedded Signup: the browser hands over a code and ids; the token exchange and validation happen here. */
  async embeddedSignup(ws: string, userId: string, input: WhatsAppEmbeddedSignupInput) {
    this.requireReady();
    const db = this.prisma.client;
    const taken = await db.channel.findUnique({
      where: {
        provider_externalAccountId: {
          provider: 'WHATSAPP',
          externalAccountId: input.phoneNumberId,
        },
      },
    });
    if (taken && taken.status !== 'DISCONNECTED')
      throw new ConflictException(
        taken.workspaceId === ws
          ? 'This WhatsApp number is already connected to this workspace.'
          : 'This WhatsApp number is already connected to another workspace.',
      );
    let token: string;
    let expiresAt: Date | null = null;
    let verifiedName: string | null = null;
    let display: string | null = null;
    // The two-step verification PIN is set once at registration and needed to re-register later, so it is kept encrypted.
    const pin = taken?.phonePinCiphertext
      ? this.crypto.decrypt(taken.phonePinCiphertext)
      : String(randomInt(100000, 1000000));
    try {
      const t = await this.graph.get().exchangeCode({
        appId: this.config.META_APP_ID!,
        appSecret: this.config.META_APP_SECRET!,
        code: input.code,
      });
      token = t.access_token;
      // Business tokens normally have no expires_in; ask Meta whether this one expires (a 60-day configuration does).
      expiresAt = t.expires_in
        ? new Date(Date.now() + t.expires_in * 1000)
        : ((
            await this.graph
              .get()
              .tokenInfo(this.config.META_APP_ID!, this.config.META_APP_SECRET!, token)
              .catch(() => null)
          )?.expiresAt ?? null);
      const info = await this.waGraph.get().phoneNumber(input.phoneNumberId, token);
      verifiedName = info.verified_name ?? null;
      display = info.display_phone_number ?? null;
      await this.graph.get().subscribeWaba(input.wabaId, token);
      await this.graph.get().registerPhone(input.phoneNumberId, token, pin);
    } catch (e) {
      throw new BadRequestException(`WhatsApp setup didn’t complete. ${explain(e)}`);
    }
    const mask = (display ?? input.phoneNumberId).replace(/^(.{4}).*(.{3})$/, '$1••••$2');
    const cipher = this.crypto.encrypt(token);
    const now = new Date();
    const data = {
      displayName: input.displayName,
      status: 'CONNECTED' as const,
      accountName: verifiedName,
      accountMask: mask,
      connectedAt: now,
      disconnectedAt: null,
      lastHealthCheckAt: now,
      lastError: null,
      tokenExpiresAt: expiresAt,
      webhookStatus: 'SUBSCRIBED',
      webhookError: null,
      phonePinCiphertext: this.crypto.encrypt(pin),
    };
    const channel = await db.$transaction(async (tx) => {
      const c = taken
        ? await tx.channel.update({ where: { id: taken.id }, data: { ...data, workspaceId: ws } })
        : await tx.channel.create({
            data: {
              ...data,
              workspaceId: ws,
              provider: 'WHATSAPP',
              externalAccountId: input.phoneNumberId,
            },
          });
      await tx.channelCredential.upsert({
        where: { channelId: c.id },
        create: { workspaceId: ws, channelId: c.id, ciphertext: cipher },
        update: { ciphertext: cipher },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: ws,
          actorId: userId,
          action: taken ? 'channel.reconnect' : 'channel.connect',
          entityType: 'channel',
          entityId: c.id,
          metadata: {
            provider: 'WHATSAPP',
            description: 'WhatsApp connected with Embedded Signup',
          },
        },
      });
      return c;
    });
    return this.channels.get(ws, channel.id);
  }

  /** A real call to Meta for a Messenger / Instagram channel; the outcome is what the Channels page shows. */
  async health(ws: string, channelId: string) {
    const db = this.prisma.client;
    const ch = await db.channel.findFirst({
      where: { id: channelId, workspaceId: ws, provider: { in: ['MESSENGER', 'INSTAGRAM'] } },
      include: { credential: true },
    });
    if (!ch) throw new NotFoundException('Channel not found');
    const checkedAt = new Date();
    const cred = ch.credential
      ? unpackCredential(this.crypto.decrypt(ch.credential.ciphertext))
      : null;
    if (!cred)
      return {
        ok: false,
        checkedAt: checkedAt.toISOString(),
        qualityRating: null,
        displayPhoneNumber: null,
        error: 'This channel has no live Meta connection.',
      };
    try {
      await this.graph.get().page(cred.pageId, cred.token);
      await db.channel.update({
        where: { id: ch.id },
        data: { status: 'CONNECTED', lastHealthCheckAt: checkedAt, lastError: null },
      });
      return {
        ok: true,
        checkedAt: checkedAt.toISOString(),
        qualityRating: null,
        displayPhoneNumber: null,
        error: null,
      };
    } catch (e) {
      const error = explain(e);
      await db.channel.update({
        where: { id: ch.id },
        data: {
          status: e instanceof GraphError && e.tokenExpired ? 'EXPIRED' : 'NEEDS_ATTENTION',
          lastHealthCheckAt: checkedAt,
          lastError: error.slice(0, 300),
        },
      });
      return {
        ok: false,
        checkedAt: checkedAt.toISOString(),
        qualityRating: null,
        displayPhoneNumber: null,
        error,
      };
    }
  }
}
