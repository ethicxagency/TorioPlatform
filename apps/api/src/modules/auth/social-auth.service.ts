import { Inject, Injectable, Logger } from '@nestjs/common';
import { hashToken, AuthService, type ClientMeta, type IssuedSession } from './auth.service';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { PlatformSettingsService } from '../platform/platform-settings.service';
import { MailService } from './mail.service';
import { randomToken, safeReturnTo, signCookie, verifyCookie } from './oauth-cookie';
import {
  newPkce,
  SocialAuthError,
  SocialProviders,
  type Provider,
  type ProviderProfile,
} from './social.providers';

export const STATE_COOKIE = 'torio_oauth';
export const PENDING_COOKIE = 'torio_oauth_pending';
const STATE_TTL = 10 * 60_000;
const PENDING_TTL = 15 * 60_000;
const COMPLETE_TTL = 30 * 60_000;

interface StateCookie {
  p: Provider;
  s: string;
  v: string;
  n: string;
  r: string;
  /** The exact redirect URI sent to the provider; the code exchange must repeat it. */
  u: string;
}
interface PendingCookie {
  provider: ProviderProfile['provider'];
  sub: string;
  name: string;
}

export type SocialOutcome =
  | { kind: 'session'; session: IssuedSession; returnTo: string }
  | { kind: 'email_required'; pendingCookie: string }
  | { kind: 'verify_sent' };

const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002';

/**
 * Google and Facebook sign-in for customers. The policy, in order:
 *  1. A linked identity (provider + the provider's stable user id) signs in its account, whatever the email is now.
 *  2. Otherwise a new account is created only from an email the provider verified (Google), or one the person proved
 *     they own by clicking a link we emailed (Facebook, or any provider that gave none).
 *  3. An email that already belongs to an account is linked only when BOTH sides are verified. Otherwise the person is
 *     told to sign in the usual way: we never merge on an unproven email, so nobody can take over an account by
 *     registering a social identity with someone else's address.
 */
@Injectable()
export class SocialAuthService {
  private readonly log = new Logger(SocialAuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly providers: SocialProviders,
    private readonly mail: MailService,
    private readonly platform: PlatformSettingsService,
    @Inject(APP_CONFIG) private readonly c: AppConfig,
  ) {}

  /** Which providers the sign-in page may show. */
  async options() {
    await this.providers.ready();
    return {
      google: this.providers.configured('google'),
      facebook: this.providers.configured('facebook'),
    };
  }

  async begin(provider: Provider, returnTo: string | undefined) {
    const { verifier, challenge } = newPkce();
    const state = randomToken(24);
    const nonce = randomToken(24);
    const redirectUri = await this.providers.redirectUri(provider);
    const url = this.providers.authorizeUrl(provider, { state, nonce, challenge, redirectUri });
    const cookie = signCookie<StateCookie>(
      'state',
      { p: provider, s: state, v: verifier, n: nonce, r: safeReturnTo(returnTo), u: redirectUri },
      this.c.JWT_ACCESS_SECRET,
      STATE_TTL,
    );
    return { url, cookie, ttlMs: STATE_TTL };
  }

  async finish(
    provider: Provider,
    q: { code?: string; state?: string; error?: string },
    stateCookie: string | undefined,
    meta: ClientMeta,
  ): Promise<SocialOutcome> {
    const st = verifyCookie<StateCookie>('state', stateCookie, this.c.JWT_ACCESS_SECRET);
    // CSRF: the callback must carry the state this very browser was given, for this provider.
    if (!st || st.p !== provider || !q.state || q.state !== st.s)
      throw new SocialAuthError('invalid_state');
    if (q.error)
      throw new SocialAuthError(q.error === 'access_denied' ? 'cancelled' : 'provider_error');
    if (!q.code) throw new SocialAuthError('provider_error');
    // Exact redirect-URI matching: the settings must still allow the URI this sign-in started with, so a URI removed
    // (or a flow whose configuration changed) mid-way can't be completed.
    if ((await this.providers.redirectUri(provider)) !== st.u)
      throw new SocialAuthError('invalid_state');
    const profile = await this.providers.exchange(provider, q.code, {
      verifier: st.v,
      nonce: st.n,
      redirectUri: st.u,
    });
    return this.resolve(profile, meta, safeReturnTo(st.r));
  }

  private async sessionFor(
    userId: string,
    meta: ClientMeta,
    returnTo: string,
    audit: string,
    provider: string,
  ): Promise<SocialOutcome> {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status !== 'ACTIVE') throw new SocialAuthError('account_disabled');
    await this.prisma.client.auditLog.create({
      data: {
        actorId: user.id,
        action: audit,
        entityType: 'user',
        entityId: user.id,
        ipAddress: meta.ipAddress,
        metadata: { provider },
      },
    });
    return { kind: 'session', session: await this.auth.issueFor(user, meta), returnTo };
  }

  /** `proven`: the email was confirmed by a click on an emailed link, which counts as verified. */
  private async resolve(
    profile: ProviderProfile,
    meta: ClientMeta,
    returnTo: string,
    proven = false,
  ): Promise<SocialOutcome> {
    const where = {
      provider_providerUserId: {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    };
    const known = await this.prisma.client.userIdentity.findUnique({ where });
    if (known) {
      await this.prisma.client.userIdentity.update({
        where: { id: known.id },
        data: { lastLoginAt: new Date() },
      });
      await this.syncImage(known.userId, profile.image);
      return this.sessionFor(known.userId, meta, returnTo, 'auth.login', profile.provider);
    }
    if (!profile.email)
      return {
        kind: 'email_required',
        pendingCookie: signCookie<PendingCookie>(
          'pending',
          { provider: profile.provider, sub: profile.providerUserId, name: profile.name },
          this.c.JWT_ACCESS_SECRET,
          PENDING_TTL,
        ),
      };
    const verified = profile.emailVerified || proven;
    const existing = await this.prisma.client.user.findUnique({ where: { email: profile.email } });

    if (!existing) {
      if (!verified) {
        await this.startPending(profile, profile.email);
        return { kind: 'verify_sent' };
      }
      if (!(await this.platform.registrationOpen()))
        throw new SocialAuthError('registration_closed');
      const user = await this.auth.createCustomer(
        {
          email: profile.email,
          name: profile.name,
          emailVerified: true,
          provider: profile.provider,
          image: profile.image,
        },
        meta,
      );
      return this.link(user.id, profile, meta, returnTo, 'auth.login');
    }

    if (verified && existing.emailVerifiedAt && existing.status === 'ACTIVE')
      return this.link(existing.id, profile, meta, returnTo, 'auth.social_link');
    throw new SocialAuthError('account_exists');
  }

  private async link(
    userId: string,
    profile: ProviderProfile,
    meta: ClientMeta,
    returnTo: string,
    audit: string,
  ): Promise<SocialOutcome> {
    try {
      await this.prisma.client.userIdentity.create({
        data: {
          userId,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
          lastLoginAt: new Date(),
        },
      });
    } catch (e) {
      // A concurrent callback created it first: that identity must belong to this same user, or we stop.
      if (!isUnique(e)) throw e;
      const row = await this.prisma.client.userIdentity.findUniqueOrThrow({
        where: {
          provider_providerUserId: {
            provider: profile.provider,
            providerUserId: profile.providerUserId,
          },
        },
      });
      if (row.userId !== userId) throw new SocialAuthError('account_exists');
    }
    await this.syncImage(userId, profile.image);
    return this.sessionFor(userId, meta, returnTo, audit, profile.provider);
  }

  /**
   * Keeps the account avatar in step with the provider's. A picture the person chose themselves (imageSource CUSTOM)
   * is never overwritten, and a provider that gives no picture never clears the existing one. Best effort: a failed
   * avatar sync must never block sign-in.
   */
  private async syncImage(userId: string, image: string | null | undefined) {
    if (!image) return;
    try {
      // The provider's picture is always remembered (so it can be restored), whatever picture is in use.
      await this.prisma.client.user.updateMany({
        where: { id: userId, NOT: { providerImage: image } },
        data: { providerImage: image },
      });
      // It becomes the picture in use only when the person has not chosen their own or chosen none.
      await this.prisma.client.user.updateMany({
        where: {
          id: userId,
          OR: [{ imageSource: null }, { imageSource: 'PROVIDER' }],
          NOT: { image },
        },
        data: { image, imageSource: 'PROVIDER' },
      });
    } catch (e) {
      this.log.warn(`Could not sync the profile picture: ${(e as Error).name}`);
    }
  }

  private async startPending(
    profile: Pick<ProviderProfile, 'provider' | 'providerUserId' | 'name' | 'image'>,
    email: string,
  ) {
    if (!this.mail.configured) throw new SocialAuthError('mail_not_configured');
    const token = randomToken(32);
    await this.prisma.client.pendingSocialSignup.create({
      data: {
        tokenHash: hashToken(token),
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        name: profile.name,
        image: profile.image ?? null,
        email,
        expiresAt: new Date(Date.now() + COMPLETE_TTL),
      },
    });
    const sent = await this.mail.send(
      email,
      'Confirm your email to finish signing in to Torio',
      `Confirm this email address to finish signing in to Torio:\n${this.c.WEB_URL.replace(/\/$/, '')}/auth/complete?token=${token}\n\nThe link works once and expires in 30 minutes. If this wasn't you, ignore this message.`,
    );
    if (!sent) throw new SocialAuthError('mail_not_configured');
  }

  /** Step for a provider that gave no email: the person types one, and we email a link to it. Same answer for any address. */
  async requestEmail(pendingCookie: string | undefined, email: string) {
    const p = verifyCookie<PendingCookie>('pending', pendingCookie, this.c.JWT_ACCESS_SECRET);
    if (!p) throw new SocialAuthError('invalid_state');
    await this.startPending({ provider: p.provider, providerUserId: p.sub, name: p.name }, email);
  }

  /** The emailed link was followed: the mailbox is proven, so the sign-in can finish. */
  async complete(token: string, meta: ClientMeta): Promise<SocialOutcome> {
    const row = await this.prisma.client.pendingSocialSignup.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date())
      throw new SocialAuthError('invalid_state');
    const claimed = await this.prisma.client.pendingSocialSignup.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new SocialAuthError('invalid_state');
    return this.resolve(
      {
        provider: row.provider,
        providerUserId: row.providerUserId,
        name: row.name,
        email: row.email,
        emailVerified: false,
        image: row.image,
      },
      meta,
      '/',
      true,
    );
  }
}
