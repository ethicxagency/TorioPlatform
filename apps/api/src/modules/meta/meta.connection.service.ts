import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import { randomInt } from 'node:crypto';
import type { MetaSelectInput, WhatsAppEmbeddedSignupInput } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { MetaConfigService } from '../meta-config/meta-config.service';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { GraphError } from '../whatsapp/whatsapp.api';
import { WhatsAppGraphProvider } from '../whatsapp/whatsapp.graph-provider';
import { MetaGraphProvider } from './meta.graph-provider';
import { packCredential, unpackCredential } from './meta.credentials';
import { signState, verifyState, type MetaProduct } from './meta.state';

type Provider = 'MESSENGER' | 'INSTAGRAM';
type Product = MetaProduct;

/** Least-privilege scopes per product. Instagram messaging through a linked Page needs the Page scopes too. */
export const SCOPES: Record<Product, string[]> = {
  MESSENGER: ['pages_show_list', 'pages_messaging', 'pages_manage_metadata'],
  INSTAGRAM: [
    'pages_show_list',
    'pages_manage_metadata',
    'instagram_basic',
    'instagram_manage_messages',
  ],
  WHATSAPP: ['business_management', 'whatsapp_business_management', 'whatsapp_business_messaging'],
  CATALOG: ['business_management', 'catalog_management'],
};
/** Plain-language reason for each permission, shown on the connect screen. */
export const SCOPE_REASONS: Record<string, string> = {
  pages_show_list: 'See which Facebook Pages you manage',
  pages_messaging: 'Receive and answer Messenger messages for your Page',
  pages_manage_metadata: 'Subscribe your Page to message notifications',
  instagram_basic: 'See the Instagram account linked to your Page',
  instagram_manage_messages: 'Receive and answer Instagram messages',
  business_management: 'List your business portfolios and their WhatsApp accounts',
  whatsapp_business_management:
    'Read your WhatsApp Business Accounts and phone numbers, and subscribe to events',
  whatsapp_business_messaging: 'Send and receive WhatsApp messages',
  catalog_management: 'Read your product catalogs so Torio can propose products for your review',
};
const SUBSCRIBED_FIELDS: Record<Provider, string[]> = {
  MESSENGER: ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads'],
  INSTAGRAM: ['messages', 'messaging_postbacks', 'messaging_seen'],
};
const SESSION_TTL_MS = 15 * 60_000;
const PRODUCT_LABEL: Record<Product, string> = {
  MESSENGER: 'Messenger',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  CATALOG: 'Product catalog',
};

/** One discovered asset. Page/Instagram candidates carry a Page token; WhatsApp ones carry the long-lived user token. */
interface Candidate {
  key: string;
  provider: Provider | 'WHATSAPP';
  id: string;
  name: string;
  detail: string | null;
  imageUrl: string | null;
  eligible: boolean;
  reason: string | null;
  /** Page id used for sending/subscribing (Messenger and Instagram). */
  pageId?: string;
  /** WhatsApp Business Account id. */
  wabaId?: string;
  tokenCiphertext: string;
  /** Epoch ms when the token stops working, when known. */
  tokenExpiresAt?: number | null;
}

export interface ProvisionResult {
  key: string;
  provider: 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP';
  name: string;
  status: 'CONNECTED' | 'FAILED' | 'ACTION_REQUIRED';
  channelId: string | null;
  message: string | null;
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
    private readonly mc: MetaConfigService,
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

  /** Brain's catalog import registers here, so the shared Meta redirect can hand a catalog authorization back to it. */
  private catalogHandler: ((st: { w: string; u: string }, code: string) => Promise<string>) | null =
    null;
  registerCatalogHandler(fn: (st: { w: string; u: string }, code: string) => Promise<string>) {
    this.catalogHandler = fn;
  }

  /** Same readiness as the channel flow: the platform's Meta app, redirect and encryption key must be configured. */
  get catalogOauthReady() {
    return this.oauthReady;
  }

  /** The authorization URL for the catalog import: its own scopes, and state bound to this workspace and user. */
  async startCatalog(workspaceId: string, userId: string) {
    await this.mc.load();
    this.requireReady();
    const c = this.mc.current;
    const state = signState(
      { w: workspaceId, u: userId, p: ['CATALOG'] },
      c.appSecret!,
      Date.now(),
      c.stateTtlMs,
    );
    const url = new URL(`https://www.facebook.com/${c.apiVersion}/dialog/oauth`);
    url.searchParams.set('client_id', c.appId!);
    url.searchParams.set('redirect_uri', c.oauthRedirectUri!);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES.CATALOG.join(','));
    return { url: url.toString() };
  }

  get oauthReady() {
    const c = this.mc.current;
    return !!(
      c.appId &&
      c.appSecret &&
      c.oauthRedirectUri &&
      c.verifyToken &&
      c.webhookEnabled &&
      this.crypto.configured
    );
  }

  /** Products this server can authorize in one go: configured, and not switched off by Super Admin. */
  private get products(): Product[] {
    const c = this.mc.current;
    return (
      [
        c.messengerEnabled && 'MESSENGER',
        c.instagramEnabled && 'INSTAGRAM',
        c.whatsappEnabled && c.discoverWhatsapp && 'WHATSAPP',
      ] as (Product | false)[]
    ).filter((x): x is Product => !!x);
  }

  async publicConfig() {
    await this.mc.load();
    return {
      appId: this.mc.current.appId ?? null,
      graphVersion: this.mc.current.apiVersion,
      whatsappConfigId: this.mc.current.whatsappConfigId ?? null,
      whatsappDiscovery: !!this.mc.current.discoverWhatsapp,
      permissions: this.permissionsFor(this.products),
    };
  }

  /** Permissions the Facebook dialog will ask for, with the reason for each (shown before the user clicks). */
  permissionsFor(products: Product[]) {
    const scopes = [...new Set(products.flatMap((p) => SCOPES[p]))];
    return scopes.map((scope) => ({ scope, reason: SCOPE_REASONS[scope] ?? scope }));
  }

  private requireReady() {
    if (!this.oauthReady)
      throw new ServiceUnavailableException(
        'Meta isn’t configured yet. A platform admin needs to complete Super Admin → Integrations → Meta Developer (App ID, App Secret, redirect URI, webhook verify token) and the server needs CHANNEL_ENCRYPTION_KEY.',
      );
  }

  /** Step 1: the Facebook authorization URL, with a signed state bound to this workspace, user and products. */
  async start(workspaceId: string, userId: string, wanted?: Product[]) {
    await this.mc.load();
    this.requireReady();
    const c = this.mc.current;
    const products = (wanted ?? this.products).filter((p) => this.products.includes(p));
    if (!products.length) throw new BadRequestException('Choose at least one channel to connect.');
    const state = signState(
      { w: workspaceId, u: userId, p: products },
      c.appSecret!,
      Date.now(),
      c.stateTtlMs,
    );
    const url = new URL(`https://www.facebook.com/${c.apiVersion}/dialog/oauth`);
    url.searchParams.set('client_id', c.appId!);
    url.searchParams.set('redirect_uri', c.oauthRedirectUri!);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', [...new Set(products.flatMap((p) => SCOPES[p]))].join(','));
    return { url: url.toString() };
  }

  /**
   * Step 2: Meta redirects the browser here. Nothing is trusted until the signed state verifies; the code is
   * exchanged server-side and everything discovered is parked in an expiring session (tokens encrypted, never in the
   * URL). Always returns a web URL to send the browser to (success or a coded error).
   */
  async callback(q: { code?: string; state?: string; error?: string; error_reason?: string }) {
    await this.mc.load();
    const mc = this.mc.current;
    // Only the configured success/failure URL on an explicitly trusted host, else the web app's Channels page.
    const web = (params: Record<string, string>) => {
      const configured = 'meta_error' in params ? mc.failureUrl : mc.successUrl;
      const base =
        configured && this.mc.isTrustedDestination(configured, mc)
          ? configured
          : `${mc.webUrl.replace(/\/$/, '')}/channels`;
      return `${base}${base.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;
    };
    if (!this.oauthReady) return web({ meta_error: 'not_configured' });
    const st = q.state ? verifyState(q.state, this.mc.current.appSecret!) : null;
    if (!st) return web({ meta_error: 'invalid_state' });
    if (st.p.length === 1 && st.p[0] === 'CATALOG') {
      // A catalog authorization is handled by Brain's import, never by the channel flow below.
      const base = `${mc.webUrl.replace(/\/$/, '')}/brain?tab=intelligence`;
      if (q.error || !q.code) return `${base}&meta_catalog=denied`;
      if (!this.catalogHandler) return `${base}&meta_catalog=not_configured`;
      try {
        return await this.catalogHandler(st, q.code);
      } catch {
        return `${base}&meta_catalog=exchange_failed`;
      }
    }
    if (q.error || !q.code) return web({ meta_error: 'denied' });
    try {
      const g = this.graph.get();
      const short = await g.exchangeCode({
        appId: this.mc.current.appId!,
        appSecret: this.mc.current.appSecret!,
        redirectUri: this.mc.current.oauthRedirectUri!,
        code: q.code,
      });
      const long = await g.longLivedUserToken({
        appId: this.mc.current.appId!,
        appSecret: this.mc.current.appSecret!,
        token: short.access_token,
      });
      const userToken = long.access_token;
      const userExpires = long.expires_in ? Date.now() + long.expires_in * 1000 : null;
      const granted = await g.grantedPermissions(userToken);
      // A product whose permissions were declined is reported, not fatal: the others can still be connected.
      const okProducts = st.p.filter((p) => SCOPES[p].every((s) => granted.has(s)));
      const missing = st.p.filter((p) => !okProducts.includes(p));
      if (!okProducts.length) return web({ meta_error: 'missing_permissions' });

      const candidates: Candidate[] = [];
      if (okProducts.includes('MESSENGER') || okProducts.includes('INSTAGRAM')) {
        const pages = await g.pages(userToken);
        for (const p of pages.filter((x) => !!x.access_token)) {
          const enc = this.crypto.encrypt(p.access_token!);
          if (okProducts.includes('MESSENGER'))
            candidates.push({
              key: `MESSENGER:${p.id}`,
              provider: 'MESSENGER',
              id: p.id,
              name: p.name,
              detail: `Page ID ${p.id}`,
              imageUrl: p.picture?.data?.url ?? null,
              eligible: true,
              reason: null,
              pageId: p.id,
              tokenCiphertext: enc,
            });
          const ig = p.instagram_business_account;
          if (okProducts.includes('INSTAGRAM') && ig)
            candidates.push({
              key: `INSTAGRAM:${ig.id}`,
              provider: 'INSTAGRAM',
              id: ig.id,
              name: ig.username ? `@${ig.username}` : (ig.name ?? p.name),
              detail: `Professional account · Linked Page: ${p.name}`,
              imageUrl: ig.profile_picture_url ?? null,
              eligible: true,
              reason: null,
              pageId: p.id,
              tokenCiphertext: enc,
            });
        }
      }
      if (okProducts.includes('WHATSAPP')) {
        const enc = this.crypto.encrypt(userToken);
        for (const b of await g.whatsappAccounts(userToken))
          for (const w of b.owned_whatsapp_business_accounts?.data ?? [])
            for (const ph of w.phone_numbers?.data ?? []) {
              const registered = ph.status === 'CONNECTED';
              candidates.push({
                key: `WHATSAPP:${ph.id}`,
                provider: 'WHATSAPP',
                id: ph.id,
                name: ph.display_phone_number ?? ph.id,
                detail: [ph.verified_name, w.name ?? b.name].filter(Boolean).join(' · ') || null,
                imageUrl: null,
                eligible: registered,
                reason: registered
                  ? null
                  : 'This number isn’t registered for the WhatsApp Cloud API yet. Finish setup with WhatsApp Embedded Signup.',
                wabaId: w.id,
                tokenCiphertext: enc,
                tokenExpiresAt: userExpires,
              });
            }
      }
      if (!candidates.length) return web({ meta_error: 'no_accounts' });
      const session = await this.prisma.client.channelOAuthSession.create({
        data: {
          workspaceId: st.w,
          userId: st.u,
          candidates: { list: candidates, missing } as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      return web({ meta_session: session.id });
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
    const data = s.candidates as unknown as { list: Candidate[]; missing: Product[] };
    return { s, list: data.list ?? [], missing: data.missing ?? [] };
  }

  /** Step 3: what was discovered. Names and profile pictures only; connected assets are flagged. */
  async session(ws: string, userId: string, id: string) {
    const { s, list, missing } = await this.loadSession(ws, userId, id);
    const taken = await this.prisma.client.channel.findMany({
      where: {
        OR: list.map((c) => ({ provider: c.provider, externalAccountId: c.id })),
        status: { not: 'DISCONNECTED' },
      },
      select: { provider: true, externalAccountId: true },
    });
    const takenKeys = new Set(taken.map((t) => `${t.provider}:${t.externalAccountId}`));
    return {
      id: s.id,
      expiresAt: s.expiresAt.toISOString(),
      missingPermissions: missing,
      candidates: list.map((c) => ({
        key: c.key,
        provider: c.provider,
        name: c.name,
        detail: c.detail,
        imageUrl: c.imageUrl,
        eligible: c.eligible,
        reason: c.reason,
        taken: takenKeys.has(c.key),
      })),
    };
  }

  /** Cancel: the parked tokens are deleted right away instead of waiting for expiry. */
  async cancel(ws: string, userId: string, id: string) {
    await this.prisma.client.channelOAuthSession.deleteMany({
      where: { id, workspaceId: ws, userId },
    });
    return { ok: true as const };
  }

  /**
   * Step 4: provision every selected asset on its own. One failure never stops the others; connected assets are removed
   * from the session (their tokens are no longer parked) and failed ones stay, so they can be retried without
   * redoing the rest. Repeating a selection for an asset already connected here is a no-op that reports CONNECTED.
   */
  async select(ws: string, userId: string, id: string, input: MetaSelectInput) {
    await this.mc.load();
    this.requireReady();
    const { s, list } = await this.loadSession(ws, userId, id);
    const wanted = [...new Set(input.candidateKeys)];
    const unknown = wanted.filter((k) => !list.some((c) => c.key === k));
    if (unknown.length)
      throw new BadRequestException('Some selected accounts aren’t in this authorization');
    const results: ProvisionResult[] = [];
    for (const key of wanted) {
      const cand = list.find((c) => c.key === key)!;
      results.push(await this.provisionOne(ws, userId, cand));
    }
    const done = new Set(results.filter((r) => r.status === 'CONNECTED').map((r) => r.key));
    const remaining = list.filter((c) => !done.has(c.key));
    const data = s.candidates as unknown as { missing: Product[] };
    await this.prisma.client.channelOAuthSession.update({
      where: { id: s.id },
      data: remaining.length
        ? {
            candidates: {
              list: remaining,
              missing: data.missing,
            } as unknown as Prisma.InputJsonValue,
          }
        : { consumedAt: new Date(), candidates: { list: [], missing: [] } },
    });
    return { results };
  }

  private async provisionOne(
    ws: string,
    userId: string,
    cand: Candidate,
  ): Promise<ProvisionResult> {
    const base = {
      key: cand.key,
      provider: cand.provider as ProvisionResult['provider'],
      name: cand.name,
    };
    if (!cand.eligible)
      return { ...base, status: 'ACTION_REQUIRED', channelId: null, message: cand.reason };
    try {
      const channelId =
        cand.provider === 'WHATSAPP'
          ? await this.provisionWhatsApp(ws, userId, cand)
          : await this.provisionPage(ws, userId, cand);
      return { ...base, status: 'CONNECTED', channelId, message: null };
    } catch (e) {
      if (e instanceof ConflictException)
        return { ...base, status: 'FAILED', channelId: null, message: String(e.message) };
      if (e instanceof BadRequestException)
        return { ...base, status: 'FAILED', channelId: null, message: String(e.message) };
      this.log.error(`provisioning ${cand.key} failed: ${String(e)}`);
      return { ...base, status: 'FAILED', channelId: null, message: explain(e) };
    }
  }

  /** Messenger Page or Instagram account: subscribe the Page, then store its Page token. Nothing is saved if Meta says no. */
  private async provisionPage(ws: string, userId: string, cand: Candidate) {
    const provider = cand.provider as Provider;
    const db = this.prisma.client;
    const existing = await db.channel.findUnique({
      where: { provider_externalAccountId: { provider, externalAccountId: cand.id } },
    });
    if (existing && existing.status !== 'DISCONNECTED') {
      if (existing.workspaceId === ws && existing.status === 'CONNECTED') return existing.id; // already done here
      throw new ConflictException(
        existing.workspaceId === ws
          ? 'This account is already connected to this workspace. Use Reconnect on its card.'
          : 'This account is already connected to another workspace.',
      );
    }
    const token = this.crypto.decrypt(cand.tokenCiphertext);
    const g = this.graph.get();
    let tokenExpiresAt: Date | null = null;
    try {
      await g.page(cand.pageId!, token); // the Page token must really work
      await g.subscribePage(cand.pageId!, token, SUBSCRIBED_FIELDS[provider]);
      tokenExpiresAt =
        (
          await g
            .tokenInfo(this.mc.current.appId!, this.mc.current.appSecret!, token)
            .catch(() => null)
        )?.expiresAt ?? null;
    } catch (e) {
      throw new BadRequestException(`Couldn’t subscribe to messages. ${explain(e)}`);
    }
    const cipher = this.crypto.encrypt(packCredential({ token, pageId: cand.pageId! }));
    const now = new Date();
    const data = {
      displayName: cand.name,
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
    return db.$transaction(async (tx) => {
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
      await tx.auditLog.create({
        data: {
          workspaceId: ws,
          actorId: userId,
          action: existing ? 'channel.reconnect' : 'channel.connect',
          entityType: 'channel',
          entityId: c.id,
          metadata: {
            provider,
            description: `${PRODUCT_LABEL[provider]} connected: ${cand.name}`,
          },
        },
      });
      return c.id;
    });
  }

  /**
   * An existing, already-registered WhatsApp number discovered through Facebook login. Torio re-checks its state with
   * Meta, subscribes the WhatsApp Business Account to webhooks and stores the (long-lived user) token. Numbers that
   * aren't registered for the Cloud API are never saved as connected.
   */
  private async provisionWhatsApp(ws: string, userId: string, cand: Candidate) {
    const db = this.prisma.client;
    const existing = await db.channel.findUnique({
      where: { provider_externalAccountId: { provider: 'WHATSAPP', externalAccountId: cand.id } },
    });
    if (existing && existing.status !== 'DISCONNECTED') {
      if (existing.workspaceId === ws && existing.status === 'CONNECTED') return existing.id;
      throw new ConflictException(
        existing.workspaceId === ws
          ? 'This number is already connected to this workspace. Use Reconnect on its card.'
          : 'This number is already connected to another workspace.',
      );
    }
    const token = this.crypto.decrypt(cand.tokenCiphertext);
    let display: string | null = null;
    let verifiedName: string | null = null;
    try {
      const state = await this.graph.get().phoneState(cand.id, token);
      if (state.status !== 'CONNECTED')
        throw new BadRequestException(
          'This number isn’t registered for the WhatsApp Cloud API yet. Finish setup with WhatsApp Embedded Signup.',
        );
      display = state.display_phone_number ?? null;
      verifiedName = state.verified_name ?? null;
      await this.graph.get().subscribeWaba(cand.wabaId!, token);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(`WhatsApp setup didn’t complete. ${explain(e)}`);
    }
    const now = new Date();
    const data = {
      displayName: verifiedName ?? cand.name,
      status: 'CONNECTED' as const,
      accountName: verifiedName,
      accountMask: (display ?? cand.name).replace(/^(.{4}).*(.{3})$/, '$1••••$2'),
      connectedAt: now,
      disconnectedAt: null,
      lastHealthCheckAt: now,
      lastError: null,
      tokenExpiresAt: cand.tokenExpiresAt ? new Date(cand.tokenExpiresAt) : null,
      webhookStatus: 'SUBSCRIBED',
      webhookError: null,
    };
    const cipher = this.crypto.encrypt(token);
    return db.$transaction(async (tx) => {
      const c = existing
        ? await tx.channel.update({
            where: { id: existing.id },
            data: { ...data, workspaceId: ws },
          })
        : await tx.channel.create({
            data: { ...data, workspaceId: ws, provider: 'WHATSAPP', externalAccountId: cand.id },
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
          action: existing ? 'channel.reconnect' : 'channel.connect',
          entityType: 'channel',
          entityId: c.id,
          metadata: { provider: 'WHATSAPP', description: 'WhatsApp connected with Facebook login' },
        },
      });
      return c.id;
    });
  }

  /** WhatsApp Embedded Signup: the browser hands over a code and ids; the token exchange and validation happen here. */
  async embeddedSignup(ws: string, userId: string, input: WhatsAppEmbeddedSignupInput) {
    await this.mc.load();
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
        appId: this.mc.current.appId!,
        appSecret: this.mc.current.appSecret!,
        code: input.code,
      });
      token = t.access_token;
      // Business tokens normally have no expires_in; ask Meta whether this one expires (a 60-day configuration does).
      expiresAt = t.expires_in
        ? new Date(Date.now() + t.expires_in * 1000)
        : ((
            await this.graph
              .get()
              .tokenInfo(this.mc.current.appId!, this.mc.current.appSecret!, token)
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
    await this.mc.load();
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
