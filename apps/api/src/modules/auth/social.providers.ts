import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { MetaConfigService } from '../meta-config/meta-config.service';
import { JwtInvalid, verifyRs256, type JwtClaims } from './jwt-rs256';

export type Provider = 'google' | 'facebook';

/** Reasons a social sign-in can fail. The browser only ever sees the code, never provider messages or tokens. */
export type SocialErrorCode =
  | 'provider_not_configured'
  | 'invalid_state'
  | 'cancelled'
  | 'provider_error'
  | 'invalid_token'
  | 'email_unverified'
  | 'account_exists'
  | 'registration_closed'
  | 'account_disabled'
  | 'mail_not_configured'
  | 'email_required';

export class SocialAuthError extends Error {
  constructor(
    readonly code: SocialErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** What a provider tells us, after the server has verified it. Nothing here comes from the browser. */
export interface ProviderProfile {
  provider: 'GOOGLE' | 'FACEBOOK';
  /** Google `sub` / Facebook app-scoped user id. */
  providerUserId: string;
  name: string;
  email: string | null;
  /** Whether the provider vouches that the user controls the email. Facebook's is never treated as verified. */
  emailVerified: boolean;
}

const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';

export const pkceChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');
export const newPkce = () => {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: pkceChallenge(verifier) };
};

/**
 * Talks to Google and Facebook from the server only. Every network call goes through `fetch`, so tests can replace it
 * with recorded provider responses. Client secrets never leave this class.
 */
@Injectable()
export class SocialProviders {
  fetch: typeof fetch = (...a) => fetch(...a);
  private jwks: { at: number; keys: { keys: never[] } } | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly c: AppConfig,
    private readonly meta: MetaConfigService,
  ) {}

  /**
   * The redirect URI a sign-in will use, decided once at the start and carried (signed) to the callback so the code is
   * exchanged with exactly the same value. Google's comes from the environment; Facebook's from its own saved setting
   * (Super Admin → Meta Developer → Customer Facebook Authentication), which is validated against the Facebook sign-in
   * route only. A value that fails those checks is refused rather than used.
   */
  async redirectUri(p: Provider): Promise<string> {
    if (p === 'google')
      return (
        this.c.GOOGLE_REDIRECT_URI ??
        `${this.c.WEB_URL.replace(/\/$/, '')}/api/v1/auth/oauth/google/callback`
      );
    await this.meta.load();
    const r = this.meta.customerFacebookRedirect();
    if (!r.uri) throw new SocialAuthError('provider_not_configured', r.problems.join(' '));
    return r.uri;
  }

  configured(p: Provider): boolean {
    return p === 'google'
      ? !!(this.c.GOOGLE_CLIENT_ID && this.c.GOOGLE_CLIENT_SECRET)
      : !!(this.c.FACEBOOK_APP_ID && this.c.FACEBOOK_APP_SECRET);
  }

  authorizeUrl(
    p: Provider,
    s: { state: string; nonce: string; challenge: string; redirectUri: string },
  ): string {
    if (!this.configured(p)) throw new SocialAuthError('provider_not_configured');
    if (p === 'google') {
      const q = new URLSearchParams({
        client_id: this.c.GOOGLE_CLIENT_ID!,
        redirect_uri: s.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: s.state,
        nonce: s.nonce,
        code_challenge: s.challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    }
    const q = new URLSearchParams({
      client_id: this.c.FACEBOOK_APP_ID!,
      redirect_uri: s.redirectUri,
      response_type: 'code',
      scope: 'public_profile,email',
      state: s.state,
    });
    return `https://www.facebook.com/${this.c.META_GRAPH_VERSION}/dialog/oauth?${q}`;
  }

  async exchange(
    p: Provider,
    code: string,
    s: { verifier: string; nonce: string; redirectUri: string },
  ): Promise<ProviderProfile> {
    if (!this.configured(p)) throw new SocialAuthError('provider_not_configured');
    return p === 'google' ? this.google(code, s) : this.facebook(code, s.redirectUri);
  }

  private async googleKeys() {
    if (this.jwks && Date.now() - this.jwks.at < 3_600_000) return this.jwks.keys;
    const r = await this.fetch(GOOGLE_JWKS);
    if (!r.ok) throw new SocialAuthError('provider_error', 'could not load Google signing keys');
    const keys = (await r.json()) as { keys: never[] };
    this.jwks = { at: Date.now(), keys };
    return keys;
  }

  private async google(code: string, s: { verifier: string; nonce: string; redirectUri: string }) {
    const body = new URLSearchParams({
      code,
      client_id: this.c.GOOGLE_CLIENT_ID!,
      client_secret: this.c.GOOGLE_CLIENT_SECRET!,
      redirect_uri: s.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: s.verifier,
    });
    const r = await this.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tok = (await r.json().catch(() => ({}))) as { id_token?: string };
    if (!r.ok || !tok.id_token)
      throw new SocialAuthError('provider_error', 'token exchange failed');
    let claims: JwtClaims;
    try {
      claims = verifyRs256(tok.id_token, (await this.googleKeys()) as never, {
        issuers: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.c.GOOGLE_CLIENT_ID!,
      });
    } catch (e) {
      if (e instanceof JwtInvalid) throw new SocialAuthError('invalid_token', e.message);
      throw e;
    }
    if (claims.nonce !== s.nonce) throw new SocialAuthError('invalid_token', 'nonce mismatch');
    if (!claims.sub) throw new SocialAuthError('invalid_token', 'missing subject');
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    return {
      provider: 'GOOGLE' as const,
      providerUserId: claims.sub,
      name: (claims.name as string | undefined)?.trim() || email?.split('@')[0] || 'Google user',
      email,
      emailVerified:
        !!email && (claims.email_verified === true || claims.email_verified === 'true'),
    };
  }

  private async facebook(code: string, redirectUri: string): Promise<ProviderProfile> {
    const v = this.c.META_GRAPH_VERSION;
    const g = `https://graph.facebook.com/${v}`;
    const t = await this.fetch(
      `${g}/oauth/access_token?${new URLSearchParams({
        client_id: this.c.FACEBOOK_APP_ID!,
        client_secret: this.c.FACEBOOK_APP_SECRET!,
        redirect_uri: redirectUri,
        code,
      })}`,
    );
    const tok = (await t.json().catch(() => ({}))) as { access_token?: string };
    if (!t.ok || !tok.access_token)
      throw new SocialAuthError('provider_error', 'token exchange failed');
    // Confirm the token was issued to our app and is live before trusting anything it returns.
    const d = await this.fetch(
      `${g}/debug_token?${new URLSearchParams({
        input_token: tok.access_token,
        access_token: `${this.c.FACEBOOK_APP_ID}|${this.c.FACEBOOK_APP_SECRET}`,
      })}`,
    );
    const dbg = (await d.json().catch(() => ({}))) as {
      data?: { app_id?: string; is_valid?: boolean; user_id?: string };
    };
    if (!d.ok || !dbg.data?.is_valid || dbg.data.app_id !== this.c.FACEBOOK_APP_ID)
      throw new SocialAuthError('invalid_token', 'token not issued to this app');
    const me = await this.fetch(
      `${g}/me?${new URLSearchParams({ fields: 'id,name,email', access_token: tok.access_token })}`,
    );
    const prof = (await me.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      email?: string;
    };
    if (!me.ok || !prof.id) throw new SocialAuthError('provider_error', 'profile request failed');
    if (dbg.data.user_id && dbg.data.user_id !== prof.id)
      throw new SocialAuthError('invalid_token', 'identity mismatch');
    return {
      provider: 'FACEBOOK',
      providerUserId: prof.id,
      name: prof.name?.trim() || 'Facebook user',
      email: prof.email ? prof.email.toLowerCase() : null,
      // Facebook can return an email the person never confirmed, so it never counts as proof of ownership on its own.
      emailVerified: false,
    };
  }
}
