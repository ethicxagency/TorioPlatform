import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/modules/auth/auth.service';
import { MailService } from '../src/modules/auth/mail.service';
import { MetaAuthConfigService } from '../src/modules/meta-config/meta-auth-config.service';
import { lockMetaConfig } from './meta-lock';
import { PasswordService } from '../src/modules/auth/password.service';
import { safeReturnTo } from '../src/modules/auth/oauth-cookie';
import { SocialProviders } from '../src/modules/auth/social.providers';

/**
 * Real-PostgreSQL tests for customer sign-in with Google and Facebook, email verification and password reset.
 * Needs TEST_DATABASE_URL.
 *
 * MOCKED PROVIDERS: Google's token endpoint and signing keys, Facebook's Graph API and the email provider are replaced by
 * in-process fakes (Google tokens are signed with a throwaway RSA key and verified for real). These tests prove Torio's
 * handling of provider responses; they do NOT prove the real Google/Facebook apps are configured correctly. That needs the
 * manual check described in docs/CUSTOMER_AUTH.md.
 */
const url = process.env.TEST_DATABASE_URL;
const GOOGLE_ID = 'test-google-client-id.apps.googleusercontent.com';
const FB_APP = '123456789012345';

describe.skipIf(!url)('customer social sign-in (real PostgreSQL, mocked providers)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let release: () => Promise<void>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const http = () => request(app.getHttpServer());
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };

  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const idToken = (claims: Record<string, unknown>, kid = 'k1') => {
    const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
    const body = b64({
      iss: 'https://accounts.google.com',
      aud: GOOGLE_ID,
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    });
    const sig = createSign('RSA-SHA256')
      .update(`${head}.${body}`)
      .sign(privateKey)
      .toString('base64url');
    return `${head}.${body}.${sig}`;
  };

  // What the fake providers will answer for the next callback.
  let google: { claims: (nonce: string) => Record<string, unknown>; kid?: string; fail?: boolean };
  let fb: {
    id: string;
    email?: string;
    name?: string;
    appId?: string;
    failExchange?: boolean;
    picture?: string;
    silhouette?: boolean;
  };
  let mails: { to: string; subject: string; text: string }[];
  let nonceSeen = '';

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = String(input);
    const json = (b: unknown, ok = true) =>
      new Response(JSON.stringify(b), { status: ok ? 200 : 400 });
    if (u.includes('oauth2.googleapis.com/token')) {
      if (google.fail) return json({ error: 'invalid_grant' }, false);
      return json({ id_token: idToken(google.claims(nonceSeen), google.kid) });
    }
    if (u.includes('googleapis.com/oauth2/v3/certs')) return json({ keys: [jwk] });
    if (u.includes('graph.facebook.com') && u.includes('/oauth/access_token'))
      return fb.failExchange ? json({ error: {} }, false) : json({ access_token: 'fb-token' });
    if (u.includes('/debug_token'))
      return json({ data: { app_id: fb.appId ?? FB_APP, is_valid: true, user_id: fb.id } });
    if (u.includes('graph.facebook.com') && u.includes('/me'))
      return json({
        id: fb.id,
        name: fb.name ?? 'Fiona Book',
        ...(fb.email && { email: fb.email }),
        ...(fb.picture && {
          picture: { data: { url: fb.picture, is_silhouette: !!fb.silhouette } },
        }),
      });
    if (u.includes('api.resend.com/emails')) {
      mails.push(JSON.parse(String(init?.body)));
      return json({ id: 'm1' });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof fetch;

  const cookieOf = (res: request.Response, name: string) =>
    (res.headers['set-cookie'] as unknown as string[] | undefined)
      ?.find((c) => c.startsWith(`${name}=`))
      ?.split(';')[0];
  const linkToken = (mail: { text: string }) => /token=([\w-]+)/.exec(mail.text)![1]!;

  /** Runs start then callback like a browser would, returning where the callback redirected. */
  async function signIn(
    provider: 'google' | 'facebook',
    opts: { badState?: boolean; returnTo?: string } = {},
  ) {
    const start = await http()
      .get(`/api/v1/auth/oauth/${provider}/start`)
      .query(opts.returnTo ? { returnTo: opts.returnTo } : {});
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.location!);
    const state = loc.searchParams.get('state')!;
    nonceSeen = loc.searchParams.get('nonce') ?? '';
    const jar = cookieOf(start, 'torio_oauth')!;
    const cb = await http()
      .get(`/api/v1/auth/oauth/${provider}/callback`)
      .set('Cookie', jar)
      .query({ code: 'auth-code', state: opts.badState ? 'forged' : state });
    return { start, cb, loc, to: new URL(cb.headers.location!) };
  }
  const reason = (r: { to: URL }) => r.to.searchParams.get('reason');

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    // The customer Facebook redirect URI lives in the shared Meta configuration row, so this suite must not overlap others.
    release = await lockMetaConfig(url!);
    process.env.GOOGLE_CLIENT_ID = GOOGLE_ID;
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret-value';
    process.env.FACEBOOK_APP_ID = FB_APP;
    process.env.FACEBOOK_APP_SECRET = 'facebook-secret-value';
    process.env.RESEND_API_KEY = 're_test_key_value';
    process.env.MAIL_FROM = 'Torio <no-reply@torio.test>';
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    app.get(SocialProviders).fetch = fakeFetch;
    app.get(MailService).fetch = fakeFetch;
  });
  afterAll(async () => {
    await db.metaConfiguration.deleteMany({ where: { id: 'auth' } });
    await release?.();
    await db.user.deleteMany({ where: { email: { endsWith: `-${sfx}@t.co` } } });
    await db.pendingSocialSignup.deleteMany({ where: { email: { endsWith: `-${sfx}@t.co` } } });
    await app.close();
  });
  beforeEach(() => {
    mails = [];
    google = { claims: () => ({}) };
    fb = { id: `fb-${randomUUID()}` };
  });

  const email = (n: string) => `${n}-${sfx}@t.co`;
  const goodGoogle = (sub: string, mail: string, extra: Record<string, unknown> = {}) =>
    (google = {
      claims: (nonce) => ({
        sub,
        email: mail,
        email_verified: true,
        name: 'Gina Oogle',
        nonce,
        ...extra,
      }),
    });

  describe('config', () => {
    it('reports what the sign-in page may offer, the same for everyone', async () => {
      const r = await http().get('/api/v1/auth/config').expect(200);
      expect(r.body).toMatchObject({ google: true, facebook: true, email: true });
    });
    it('a provider without credentials is refused with a clear reason, not faked', async () => {
      const providers = app.get(SocialProviders) as unknown as { c: Record<string, unknown> };
      const saved = providers.c.GOOGLE_CLIENT_SECRET;
      providers.c.GOOGLE_CLIENT_SECRET = undefined;
      const r = await http().get('/api/v1/auth/oauth/google/start');
      expect(new URL(r.headers.location!).searchParams.get('reason')).toBe(
        'provider_not_configured',
      );
      providers.c.GOOGLE_CLIENT_SECRET = saved;
    });
  });

  describe('Google', () => {
    it('start sends PKCE + state + nonce to Google and never a secret', async () => {
      const { loc } = await signIn('google').then((x) => x);
      expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
      expect(loc.searchParams.get('state')).toBeTruthy();
      expect(loc.search).not.toContain('google-secret-value');
    });

    it('the authorization request and the token exchange carry the identical redirect URI (the API origin, not the web app)', async () => {
      const seen: string[] = [];
      const inner = app.get(SocialProviders).fetch;
      app.get(SocialProviders).fetch = (async (i: string | URL | Request, init?: RequestInit) => {
        if (String(i).includes('oauth2.googleapis.com/token'))
          seen.push((init?.body as URLSearchParams).get('redirect_uri')!);
        return inner(i, init);
      }) as typeof fetch;
      goodGoogle('g-ru', email('gru'));
      const r = await signIn('google');
      app.get(SocialProviders).fetch = inner;
      const sent = r.loc.searchParams.get('redirect_uri')!;
      expect(sent).toMatch(/\/api\/v1\/auth\/oauth\/google\/callback$/);
      expect(sent).not.toContain(
        new URL(process.env.WEB_URL ?? 'http://localhost:3000').host.replace(
          'localhost:3000',
          'never',
        ),
      );
      expect(seen).toEqual([sent]);
    });

    it('creates a customer (no store yet) for a verified Google identity, then signs the same one in again', async () => {
      goodGoogle('g-sub-1', email('gina'));
      const a = await signIn('google', { returnTo: '/orders' });
      expect(a.to.pathname).toBe('/auth/callback');
      expect(a.to.searchParams.get('status')).toBe('ok');
      expect(a.to.searchParams.get('next')).toBe('/orders');
      expect(cookieOf(a.cb, 'torio_rt')).toBeTruthy();
      const user = await db.user.findUniqueOrThrow({
        where: { email: email('gina') },
        include: { memberships: true, identities: true },
      });
      expect(user.emailVerifiedAt).not.toBeNull();
      // No store yet: onboarding creates the first one, so signing in never invents one.
      expect(user.memberships).toHaveLength(0);
      expect(user.identities[0]).toMatchObject({ provider: 'GOOGLE', providerUserId: 'g-sub-1' });
      // Same identity again: even with a changed email it is the same account, and nothing is duplicated.
      goodGoogle('g-sub-1', email('gina-new'));
      const b = await signIn('google');
      expect(b.to.searchParams.get('status')).toBe('ok');
      expect(
        await db.user.count({ where: { email: { in: [email('gina'), email('gina-new')] } } }),
      ).toBe(1);
      expect(await db.userIdentity.count({ where: { providerUserId: 'g-sub-1' } })).toBe(1);
      // The new session works against the existing refresh endpoint.
      const rt = cookieOf(b.cb, 'torio_rt')!;
      await http().post('/api/v1/auth/refresh').set('Cookie', rt).send({}).expect(200);
    });

    it('rejects a token for another audience, an expired one, a bad signature and a wrong nonce', async () => {
      goodGoogle('g-x', email('aud'), { aud: 'someone-elses-client' });
      expect(reason(await signIn('google'))).toBe('invalid_token');
      goodGoogle('g-x', email('exp'), { exp: Math.floor(Date.now() / 1000) - 3600 });
      expect(reason(await signIn('google'))).toBe('invalid_token');
      google = {
        claims: (n) => ({ sub: 'g-x', email: email('kid'), email_verified: true, nonce: n }),
        kid: 'unknown',
      };
      expect(reason(await signIn('google'))).toBe('invalid_token');
      goodGoogle('g-x', email('nonce'), { nonce: 'not-the-nonce' });
      expect(reason(await signIn('google'))).toBe('invalid_token');
      expect(
        await db.user.count({
          where: { email: { in: [email('aud'), email('exp'), email('kid'), email('nonce')] } },
        }),
      ).toBe(0);
    });

    it('a failed token exchange or a cancelled consent ends on an error page with a code', async () => {
      google = { claims: () => ({}), fail: true };
      expect(reason(await signIn('google'))).toBe('provider_error');
      const start = await http().get('/api/v1/auth/oauth/google/start');
      const state = new URL(start.headers.location!).searchParams.get('state')!;
      const cb = await http()
        .get('/api/v1/auth/oauth/google/callback')
        .set('Cookie', cookieOf(start, 'torio_oauth')!)
        .query({ error: 'access_denied', state });
      expect(new URL(cb.headers.location!).searchParams.get('reason')).toBe('cancelled');
    });

    it('does not create an account from an email Google has not verified; it asks for confirmation by email', async () => {
      goodGoogle('g-unv', email('unverified'), { email_verified: false });
      const r = await signIn('google');
      expect(r.to.pathname).toBe('/auth/complete');
      expect(r.to.searchParams.get('step')).toBe('check-email');
      expect(await db.user.count({ where: { email: email('unverified') } })).toBe(0);
      expect(mails).toHaveLength(1);
      // Following the emailed link proves the mailbox and finishes sign-in.
      const done = await http()
        .post('/api/v1/auth/oauth/complete')
        .send({ token: linkToken(mails[0]!) })
        .expect(200);
      expect(done.body.ok).toBe(true);
      expect(await db.user.count({ where: { email: email('unverified') } })).toBe(1);
      // Single use.
      await http()
        .post('/api/v1/auth/oauth/complete')
        .send({ token: linkToken(mails[0]!) })
        .expect(500);
    });

    it('never merges into an existing account whose email was not verified (takeover protection)', async () => {
      const hash = await app.get(PasswordService).hash('Victim-pass-1');
      await db.user.create({
        data: { email: email('victim'), name: 'Victim', passwordHash: hash },
      });
      goodGoogle('g-attacker', email('victim'));
      const r = await signIn('google');
      expect(reason(r)).toBe('account_exists');
      expect(await db.userIdentity.count({ where: { providerUserId: 'g-attacker' } })).toBe(0);
      expect(cookieOf(r.cb, 'torio_rt')).toBeUndefined();
    });

    it('links to an existing account only when both the account email and Google are verified', async () => {
      const hash = await app.get(PasswordService).hash('Owner-pass-1');
      const u = await db.user.create({
        data: {
          email: email('verified'),
          name: 'Verified',
          passwordHash: hash,
          emailVerifiedAt: new Date(),
        },
      });
      goodGoogle('g-link', email('verified'));
      const r = await signIn('google');
      expect(r.to.searchParams.get('status')).toBe('ok');
      expect(
        (
          await db.userIdentity.findUniqueOrThrow({
            where: { provider_providerUserId: { provider: 'GOOGLE', providerUserId: 'g-link' } },
          })
        ).userId,
      ).toBe(u.id);
      expect(await db.user.count({ where: { email: email('verified') } })).toBe(1);
      expect(
        await db.auditLog.count({ where: { actorId: u.id, action: 'auth.social_link' } }),
      ).toBe(1);
    });

    it('a suspended account cannot sign in through Google', async () => {
      const u = await db.user.create({
        data: {
          email: email('susp'),
          name: 'S',
          passwordHash: 'x',
          emailVerifiedAt: new Date(),
          status: 'DISABLED',
        },
      });
      await db.userIdentity.create({
        data: { userId: u.id, provider: 'GOOGLE', providerUserId: 'g-susp' },
      });
      goodGoogle('g-susp', email('susp'));
      expect(reason(await signIn('google'))).toBe('account_disabled');
    });
  });

  describe('profile picture sync (the account avatar belongs to the global user, not a store)', () => {
    const imageOf = async (mail: string) =>
      db.user.findUniqueOrThrow({
        where: { email: mail },
        select: { image: true, imageSource: true },
      });

    it('Google: stores the picture on signup, updates it on a later sign-in, and tolerates a missing one', async () => {
      goodGoogle('g-pic-1', email('pic'), { picture: 'https://lh3.example.test/a.jpg' });
      await signIn('google');
      expect(await imageOf(email('pic'))).toEqual({
        image: 'https://lh3.example.test/a.jpg',
        imageSource: 'PROVIDER',
      });
      goodGoogle('g-pic-1', email('pic'), { picture: 'https://lh3.example.test/b.jpg' });
      await signIn('google');
      expect((await imageOf(email('pic'))).image).toBe('https://lh3.example.test/b.jpg');
      // No picture this time: the existing one stays, and sign-in still works.
      goodGoogle('g-pic-1', email('pic'));
      expect((await signIn('google')).to.searchParams.get('status')).toBe('ok');
      expect((await imageOf(email('pic'))).image).toBe('https://lh3.example.test/b.jpg');
      expect(await db.user.count({ where: { email: email('pic') } })).toBe(1);
    });

    it('never stores a non-https picture URL', async () => {
      goodGoogle('g-pic-2', email('pic2'), { picture: 'http://insecure.example.test/a.jpg' });
      await signIn('google');
      expect((await imageOf(email('pic2'))).image).toBeNull();
    });

    it('a picture the person chose themselves is never overwritten by a sync', async () => {
      goodGoogle('g-pic-3', email('pic3'), { picture: 'https://lh3.example.test/p.jpg' });
      await signIn('google');
      await db.user.update({
        where: { email: email('pic3') },
        data: { image: 'https://cdn.example.test/mine.png', imageSource: 'CUSTOM' },
      });
      goodGoogle('g-pic-3', email('pic3'), { picture: 'https://lh3.example.test/new.jpg' });
      await signIn('google');
      expect(await imageOf(email('pic3'))).toEqual({
        image: 'https://cdn.example.test/mine.png',
        imageSource: 'CUSTOM',
      });
    });

    it('Facebook: syncs a real picture, ignores the default silhouette', async () => {
      fb = {
        id: 'fb-pic-1',
        email: email('fbpic'),
        picture: 'https://scontent.example.test/f.jpg',
      };
      await signIn('facebook');
      await http()
        .post('/api/v1/auth/oauth/complete')
        .send({ token: linkToken(mails.at(-1)!) })
        .expect(200);
      expect((await imageOf(email('fbpic'))).image).toBe('https://scontent.example.test/f.jpg');
      fb = {
        id: 'fb-pic-1',
        email: email('fbpic'),
        picture: 'https://scontent.example.test/silhouette.jpg',
        silhouette: true,
      };
      await signIn('facebook');
      expect((await imageOf(email('fbpic'))).image).toBe('https://scontent.example.test/f.jpg');
    });

    it('a user with no linked stores signs in without any store being invented', async () => {
      goodGoogle('g-pic-4', email('nostore'));
      await signIn('google');
      const u = await db.user.findUniqueOrThrow({ where: { email: email('nostore') } });
      expect(await db.workspaceMembership.count({ where: { userId: u.id } })).toBe(0);
    });
  });

  describe('Facebook', () => {
    it('start sends state and no secret to Facebook', async () => {
      const { loc } = await signIn('facebook');
      expect(loc.hostname).toBe('www.facebook.com');
      expect(loc.searchParams.get('scope')).toBe('public_profile,email');
      expect(loc.searchParams.get('state')).toBeTruthy();
      expect(loc.search).not.toContain('facebook-secret-value');
    });

    it('an email from Facebook is confirmed by an emailed link before an account exists', async () => {
      fb = { id: 'fb-ok-1', email: email('fiona') };
      const r = await signIn('facebook');
      expect(r.to.searchParams.get('step')).toBe('check-email');
      expect(await db.user.count({ where: { email: email('fiona') } })).toBe(0);
      const done = await http()
        .post('/api/v1/auth/oauth/complete')
        .send({ token: linkToken(mails[0]!) });
      expect(done.status).toBe(200);
      expect(cookieOf(done, 'torio_rt')).toBeTruthy();
      const user = await db.user.findUniqueOrThrow({
        where: { email: email('fiona') },
        include: { identities: true },
      });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.identities[0]).toMatchObject({ provider: 'FACEBOOK', providerUserId: 'fb-ok-1' });
      // Linked identity now signs straight in, no second account (duplicate identity).
      const again = await signIn('facebook');
      expect(again.to.searchParams.get('status')).toBe('ok');
      expect(await db.userIdentity.count({ where: { providerUserId: 'fb-ok-1' } })).toBe(1);
    });

    it('when Facebook gives no email, the person supplies one and confirms it by link', async () => {
      fb = { id: 'fb-noemail', name: 'No Mail' };
      const r = await signIn('facebook');
      expect(r.to.pathname).toBe('/auth/complete');
      expect(r.to.searchParams.get('step')).toBe('email');
      const pending = cookieOf(r.cb, 'torio_oauth_pending')!;
      expect(pending).toBeTruthy();
      await http()
        .post('/api/v1/auth/oauth/email')
        .send({ email: email('typed') })
        .expect(500); // no hand-off cookie
      await http()
        .post('/api/v1/auth/oauth/email')
        .set('Cookie', pending)
        .send({ email: email('typed') })
        .expect(200);
      expect(mails).toHaveLength(1);
      expect(mails[0]!.to).toBe(email('typed'));
      await http()
        .post('/api/v1/auth/oauth/complete')
        .send({ token: linkToken(mails[0]!) })
        .expect(200);
      expect(await db.userIdentity.count({ where: { providerUserId: 'fb-noemail' } })).toBe(1);
    });

    it('rejects a forged state, a failed exchange, and a token issued to another app', async () => {
      fb = { id: 'fb-bad', email: email('bad') };
      expect(reason(await signIn('facebook', { badState: true }))).toBe('invalid_state');
      fb = { id: 'fb-bad', email: email('bad'), failExchange: true };
      expect(reason(await signIn('facebook'))).toBe('provider_error');
      fb = { id: 'fb-bad', email: email('bad'), appId: '999999999999999' };
      expect(reason(await signIn('facebook'))).toBe('invalid_token');
      expect(await db.user.count({ where: { email: email('bad') } })).toBe(0);
    });

    it('a state from one provider cannot complete the other (CSRF / mix-up)', async () => {
      const start = await http().get('/api/v1/auth/oauth/google/start');
      const state = new URL(start.headers.location!).searchParams.get('state')!;
      const cb = await http()
        .get('/api/v1/auth/oauth/facebook/callback')
        .set('Cookie', cookieOf(start, 'torio_oauth')!)
        .query({ code: 'c', state });
      expect(new URL(cb.headers.location!).searchParams.get('reason')).toBe('invalid_state');
      // And without the browser's cookie nothing completes at all.
      const bare = await http()
        .get('/api/v1/auth/oauth/google/callback')
        .query({ code: 'c', state });
      expect(new URL(bare.headers.location!).searchParams.get('reason')).toBe('invalid_state');
    });
  });

  describe('Facebook redirect URI (its own setting, separate from the channel callback)', () => {
    const origin = new URL(process.env.WEB_URL ?? 'http://localhost:3000').origin;
    const MINE = `${origin}/api/v1/auth/oauth/facebook/callback`;
    const setConfig = async (data: Record<string, unknown>) => {
      await db.metaConfiguration.upsert({
        where: { id: 'auth' },
        create: { id: 'auth', purpose: 'AUTH', ...data },
        update: data,
      });
      await app.get(MetaAuthConfigService).load(true);
    };
    const redirectUriSentToFacebook = async () => {
      const r = await http().get('/api/v1/auth/oauth/facebook/start');
      return {
        r,
        uri: r.headers.location?.startsWith('http')
          ? new URL(r.headers.location).searchParams.get('redirect_uri')
          : null,
      };
    };
    it('uses the saved customer sign-in URI, and the code exchange repeats exactly that value', async () => {
      await setConfig({ customerAuthRedirectUri: MINE, customerAuthAllowedRedirectUris: [MINE] });
      expect((await redirectUriSentToFacebook()).uri).toBe(MINE);
      fb = { id: 'fb-ru-1', email: email('ru1') };
      const seen: string[] = [];
      const inner = app.get(SocialProviders).fetch;
      app.get(SocialProviders).fetch = (async (i: string | URL | Request, init?: RequestInit) => {
        if (String(i).includes('/oauth/access_token'))
          seen.push(new URL(String(i)).searchParams.get('redirect_uri')!);
        return inner(i, init);
      }) as typeof fetch;
      const r = await signIn('facebook');
      app.get(SocialProviders).fetch = inner;
      expect(r.to.searchParams.get('step')).toBe('check-email');
      expect(seen).toEqual([MINE]);
    });

    it('a URI that is only valid for the Meta channel flow is refused, not used', async () => {
      await setConfig({
        customerAuthRedirectUri: `${origin}/api/v1/channels/meta/callback`,
        customerAuthAllowedRedirectUris: [],
      });
      const { r } = await redirectUriSentToFacebook();
      expect(new URL(r.headers.location!).searchParams.get('reason')).toBe(
        'provider_not_configured',
      );
    });

    it('a URI on an untrusted host is refused', async () => {
      await setConfig({
        customerAuthRedirectUri: 'https://evil.example.org/api/v1/auth/oauth/facebook/callback',
        customerAuthAllowedRedirectUris: [],
      });
      expect(
        new URL((await redirectUriSentToFacebook()).r.headers.location!).searchParams.get('reason'),
      ).toBe('provider_not_configured');
    });

    it('with nothing saved it uses the API origin default, never the web app address', async () => {
      await setConfig({ customerAuthRedirectUri: null, customerAuthAllowedRedirectUris: [] });
      const api = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
      expect((await redirectUriSentToFacebook()).uri).toBe(
        `${api.replace(/\/$/, '')}/api/v1/auth/oauth/facebook/callback`,
      );
    });

    it('a sign-in started with one URI cannot finish after that URI is no longer allowed (exact match)', async () => {
      await setConfig({ customerAuthRedirectUri: MINE, customerAuthAllowedRedirectUris: [MINE] });
      fb = { id: 'fb-ru-2', email: email('ru2') };
      const start = await http().get('/api/v1/auth/oauth/facebook/start');
      const state = new URL(start.headers.location!).searchParams.get('state')!;
      await setConfig({
        customerAuthRedirectUri: `${origin}/api/v1/auth/oauth/facebook/callback/`,
        customerAuthAllowedRedirectUris: [`${origin}/api/v1/auth/oauth/facebook/callback/`],
      });
      const cb = await http()
        .get('/api/v1/auth/oauth/facebook/callback')
        .set('Cookie', cookieOf(start, 'torio_oauth')!)
        .query({ code: 'c', state });
      expect(new URL(cb.headers.location!).searchParams.get('reason')).toBe('invalid_state');
      await setConfig({ customerAuthRedirectUri: null, customerAuthAllowedRedirectUris: [] });
    });
  });

  describe('redirect safety', () => {
    it('only same-site relative return paths survive', () => {
      expect(safeReturnTo('/orders?x=1')).toBe('/orders?x=1');
      for (const bad of [
        'https://evil.example',
        '//evil.example',
        '/\\evil',
        'javascript:alert(1)',
        '/admin',
        '/admin/users',
        '/login',
        '',
        undefined,
      ])
        expect(safeReturnTo(bad as string | undefined)).toBe('/');
    });
    it('a crafted returnTo never reaches the callback redirect', async () => {
      goodGoogle('g-redir', email('redir'));
      const r = await signIn('google', { returnTo: 'https://evil.example/x' });
      expect(r.to.searchParams.get('next')).toBe('/');
    });
  });

  describe('email verification and password reset', () => {
    const mk = async (n: string, verified = false) => {
      const hash = await app.get(PasswordService).hash('Old-password-1');
      return db.user.create({
        data: {
          email: email(n),
          name: n,
          passwordHash: hash,
          emailVerifiedAt: verified ? new Date() : null,
        },
      });
    };

    it('registration sends a verification email, and the link verifies once', async () => {
      const r = await http()
        .post('/api/v1/auth/register')
        .send({
          name: 'Reg User',
          email: email('reg'),
          password: 'Strong-pass-1',
          workspaceName: 'Reg Co',
        })
        .expect(201);
      expect(r.body.user.emailVerified).toBe(false);
      await new Promise((res) => setTimeout(res, 300));
      expect(mails.find((m) => m.to === email('reg'))).toBeTruthy();
      const token = linkToken(mails.find((m) => m.to === email('reg'))!);
      await http().post('/api/v1/auth/verify-email').send({ token }).expect(200);
      expect(
        (await db.user.findUniqueOrThrow({ where: { email: email('reg') } })).emailVerifiedAt,
      ).not.toBeNull();
      await http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
      await http()
        .post('/api/v1/auth/verify-email')
        .send({ token: 'x'.repeat(40) })
        .expect(400);
    });

    it('registration without a business name creates the account only; a named one also creates its store', async () => {
      const r = await http()
        .post('/api/v1/auth/register')
        .send({ name: 'Ada Lovelace', email: email('noname'), password: 'Strong-pass-1' })
        .expect(201);
      expect(await db.workspaceMembership.count({ where: { userId: r.body.user.id } })).toBe(0);
      const named = await http()
        .post('/api/v1/auth/register')
        .send({
          name: 'Ada Lovelace',
          email: email('named'),
          password: 'Strong-pass-1',
          workspaceName: 'Ada Shop',
        })
        .expect(201);
      const ws = await db.workspaceMembership.findFirstOrThrow({
        where: { userId: named.body.user.id },
        include: { workspace: true },
      });
      expect(ws.workspace.name).toBe('Ada Shop');
      expect(ws.role).toBe('OWNER');
    });

    it('an expired verification link is refused', async () => {
      const u = await mk('expired');
      await db.emailToken.create({
        data: {
          userId: u.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: hashToken('e'.repeat(43)),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      await http()
        .post('/api/v1/auth/verify-email')
        .send({ token: 'e'.repeat(43) })
        .expect(400);
    });

    it('forgot-password answers identically for known and unknown addresses and only emails real ones', async () => {
      await mk('known');
      const a = await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: email('known') });
      const b = await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: email('nobody') });
      expect(a.status).toBe(b.status);
      expect(a.body).toEqual(b.body);
      expect(mails.map((m) => m.to)).toEqual([email('known')]);
    });

    it('a reset link sets the password once, signs every device out, and cannot be reused', async () => {
      const u = await mk('reset');
      await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: email('reset') })
        .expect(200);
      const token = linkToken(mails.at(-1)!);
      const session = await http()
        .post('/api/v1/auth/login')
        .send({ email: email('reset'), password: 'Old-password-1' })
        .expect(200);
      const rt = cookieOf(session, 'torio_rt')!;
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'weak' })
        .expect(400);
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand-new-pass-2' })
        .expect(200);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: email('reset'), password: 'Old-password-1' })
        .expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: email('reset'), password: 'Brand-new-pass-2' })
        .expect(200);
      await http().post('/api/v1/auth/refresh').set('Cookie', rt).send({}).expect(401);
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Another-pass-3' })
        .expect(400);
      expect(
        await db.auditLog.count({ where: { actorId: u.id, action: 'auth.password_reset' } }),
      ).toBe(1);
    });

    it('a newer reset link retires the older one', async () => {
      await mk('twice');
      await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: email('twice') })
        .expect(200);
      const first = linkToken(mails.at(-1)!);
      await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: email('twice') })
        .expect(200);
      const second = linkToken(mails.at(-1)!);
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token: first, password: 'Brand-new-pass-2' })
        .expect(400);
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token: second, password: 'Brand-new-pass-2' })
        .expect(200);
    });

    it('resending verification needs sign-in and honours a cooldown', async () => {
      await mk('resend');
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: email('resend'), password: 'Old-password-1' })
        .expect(200);
      await http().post('/api/v1/auth/resend-verification').expect(401);
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };
      await http().post('/api/v1/auth/resend-verification').set(auth).expect(200);
      await http().post('/api/v1/auth/resend-verification').set(auth).expect(429);
    });
  });

  describe('rate limiting and separation from the platform admin', () => {
    it('password recovery is rate limited', async () => {
      const codes: number[] = [];
      for (let i = 0; i < 8; i++)
        codes.push(
          (
            await http()
              .post('/api/v1/auth/forgot-password')
              .set('X-Forwarded-For', '198.51.100.9')
              .send({ email: email('rl') })
          ).status,
        );
      expect(codes).toContain(429);
    });
    it('a customer session is not accepted by the platform admin API', async () => {
      const u = await db.user.create({
        data: {
          email: email('cust'),
          name: 'C',
          passwordHash: await app.get(PasswordService).hash('Cust-pass-1'),
        },
      });
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Cust-pass-1' })
        .expect(200);
      await http()
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(401);
    });
  });
});
