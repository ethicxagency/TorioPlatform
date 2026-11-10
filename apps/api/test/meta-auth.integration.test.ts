import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';
import { SocialProviders } from '../src/modules/auth/social.providers';
import { lockMetaConfig } from './meta-lock';

/**
 * Real-PostgreSQL tests for the two-Meta-app architecture: Torio Platform (Business Messaging, row "default") and Torio
 * Auth (customer sign-in, row "auth"). MOCKED: Meta's Graph API is an in-process fake, so these prove how Torio keeps the
 * two apps apart, not that either real Meta app is configured correctly.
 */
const url = process.env.TEST_DATABASE_URL;
const PW = 'Admin-passphrase-1';
const MASTER = 'm'.repeat(40);
const BUSINESS_SECRET = 'business-app-secret-plaintext';
const AUTH_SECRET = 'auth-app-secret-plaintext-xyz';
const AUTH_ID = '2321020315413901';
const BUSINESS_ID = '3850545818418490';
const CALLBACK = 'https://torio.example.test/api/v1/auth/oauth/facebook/callback';

describe.skipIf(!url)('two Meta apps (real PostgreSQL, fake Graph API)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie = '';
  let release: () => Promise<void>;
  let graph: 'ok' | 'badSecret' = 'ok';
  const graphCalls: string[] = [];
  const sfx = Math.random().toString(36).slice(2, 8);
  const http = () => request(app.getHttpServer());
  const A = '/api/v1/admin/integrations/meta-auth';
  const B = '/api/v1/admin/integrations/meta';
  const get = (p: string) => http().get(`${A}${p}`).set('Cookie', cookie);
  const send = (m: 'post' | 'put' | 'delete', p: string, body: object = {}) =>
    http()[m](`${A}${p}`).set('Cookie', cookie).set('X-Torio-Admin', '1').send(body);
  const save = (patch: object) => send('put', '/config', { patch });
  const bsend = (m: 'put', p: string, body: object) =>
    http()[m](`${B}${p}`).set('Cookie', cookie).set('X-Torio-Admin', '1').send(body);

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.THROTTLE_DISABLED = 'true';
    for (const k of [
      'META_APP_ID',
      'META_APP_SECRET',
      'META_OAUTH_REDIRECT_URI',
      'META_WEBHOOK_VERIFY_TOKEN',
      'FACEBOOK_APP_ID',
      'FACEBOOK_APP_SECRET',
      'FACEBOOK_REDIRECT_URI',
      'FACEBOOK_LOGIN_CONFIG_ID',
    ])
      delete process.env[k];
    process.env.CHANNEL_ENCRYPTION_KEY = MASTER;
    process.env.WEB_URL = 'https://torio.example.test';
    release = await lockMetaConfig(url!);
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    const { MetaGraphProvider } = await import('../src/modules/meta/meta.graph-provider');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    await db.metaConfiguration.deleteMany({ where: { id: { in: ['default', 'auth'] } } });
    app.get(MetaGraphProvider).useFetch((async (u: URL | string) => {
      const t = new URL(String(u));
      graphCalls.push(t.pathname + t.search);
      const json = (b: object, status = 200) => new Response(JSON.stringify(b), { status });
      if (graph === 'badSecret')
        return json({ error: { message: 'Error validating client secret.', code: 190 } }, 400);
      return json({ id: AUTH_ID, name: 'Torio Auth' });
    }) as typeof fetch);
    const admin = await db.platformAdmin.create({
      data: {
        email: `auth-admin-${sfx}@t.co`,
        name: 'Auth Admin',
        passwordHash: await app.get(PasswordService).hash(PW),
      },
    });
    const login = await http()
      .post('/api/v1/admin/auth/login')
      .send({ email: admin.email, password: PW })
      .expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  });
  afterAll(async () => {
    await db?.metaConfiguration.deleteMany({ where: { id: { in: ['default', 'auth'] } } });
    await release?.();
    await db?.$disconnect();
    await app?.close();
  });

  it('is Super Admin only', async () => {
    await http().get(`${A}/config`).expect(401);
    const customer = await app
      .get(JwtService)
      .signAsync({ sub: '00000000-0000-4000-8000-000000000000', sid: 's' });
    await http().get(`${A}/config`).set('Authorization', `Bearer ${customer}`).expect(401);
    await http().put(`${A}/config`).set('Cookie', cookie).send({ patch: {} }).expect(403);
    await http().post(`${A}/test`).expect(401);
  });

  it('starts incomplete with the suggested Torio Auth app id, no secret, and its own callback route', async () => {
    const c = (await get('/config').expect(200)).body;
    expect(c.status).toBe('INCOMPLETE');
    expect(c.values.appId).toBe(AUTH_ID);
    expect(c.credentialsFrom).toBe('none');
    expect(c.secrets.appSecret).toEqual({ configured: false, source: 'unset' });
    expect(c.derived).toMatchObject({
      callbackPath: '/api/v1/auth/oauth/facebook/callback',
      scopes: ['public_profile', 'email'],
      suggestedAppId: AUTH_ID,
    });
  });

  it('validates each field against this app only, and refuses the Business Messaging app id', async () => {
    await save({
      customerAuthRedirectUri: 'https://torio.example.test/api/v1/channels/meta/callback',
    }).expect(400);
    await save({
      customerAuthRedirectUri: 'https://evil.example.org/api/v1/auth/oauth/facebook/callback',
    }).expect(400);
    await save({
      customerAuthRedirectUri: 'http://torio.example.test/api/v1/auth/oauth/facebook/callback',
    }).expect(400);
    await save({ appId: 'not-a-number' }).expect(400);
    await save({ unknownField: 1 }).expect(400);
    // the Business Messaging app's default id can't be used for customer sign-in
    const clash = await save({ appId: BUSINESS_ID }).expect(400);
    expect(JSON.stringify(clash.body)).toMatch(/separate Torio Auth app/);
    expect((await get('/config')).body.values.customerAuthRedirectUri).toBeNull(); // nothing partially applied
  });

  it('saves settings and audits only field names', async () => {
    const r = await save({
      appName: 'Torio Auth',
      appId: AUTH_ID,
      appMode: 'LIVE',
      appDomain: 'torio.example.test',
      customerAuthRedirectUri: CALLBACK,
      customerAuthAllowedRedirectUris: [CALLBACK],
    }).expect(200);
    expect(r.body.values).toMatchObject({
      appId: AUTH_ID,
      customerAuthRedirectUri: CALLBACK,
      appMode: 'LIVE',
    });
    expect(r.body.derived).toMatchObject({
      generatedRedirectUri: CALLBACK,
      matchesRoute: true,
      registerInMeta: CALLBACK,
    });
    const log = await db.adminAuditLog.findFirst({
      where: { action: 'meta.auth.config.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect((log!.metadata as { fields: string[] }).fields).toEqual(
      expect.arrayContaining(['appId', 'customerAuthRedirectUri']),
    );
  });

  it('the App Secret is write-only: stored encrypted, never returned, never audited in plain text', async () => {
    const r = await send('put', '/secrets/app-secret', { value: AUTH_SECRET }).expect(200);
    expect(r.body.secrets.appSecret).toEqual({ configured: true, source: 'database' });
    expect(r.body.credentialsFrom).toBe('database');
    expect(JSON.stringify((await get('/config')).body)).not.toContain(AUTH_SECRET);
    const row = await db.metaConfiguration.findUniqueOrThrow({ where: { id: 'auth' } });
    expect(row.purpose).toBe('AUTH');
    expect(row.appSecretCiphertext).toBeTruthy();
    expect(row.appSecretCiphertext).not.toContain(AUTH_SECRET);
    const logs = JSON.stringify(
      await db.adminAuditLog.findMany({ where: { action: { startsWith: 'meta.auth' } } }),
    );
    expect(logs).not.toContain(AUTH_SECRET);
    expect(logs).toContain('meta.auth.secret.replace');
  });

  it('a new secret that Meta rejects never overwrites the stored one, for either app', async () => {
    const before = await db.metaConfiguration.findUniqueOrThrow({ where: { id: 'auth' } });
    graph = 'badSecret';
    const bad = await send('put', '/secrets/app-secret', {
      value: 'regenerated-but-wrong-secret',
    }).expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/did not accept this App Secret/);
    expect(JSON.stringify(bad.body)).not.toContain('regenerated-but-wrong-secret');
    expect(
      (await db.metaConfiguration.findUniqueOrThrow({ where: { id: 'auth' } })).appSecretCiphertext,
    ).toBe(before.appSecretCiphertext);
    // the Business Messaging app is protected the same way, and is unaffected by the Auth app's attempt
    await bsend('put', '/secrets/app-secret', { value: 'another-wrong-business-secret' }).expect(
      400,
    );
    const logs = JSON.stringify(
      await db.adminAuditLog.findMany({ where: { action: { startsWith: 'meta.' } } }),
    );
    expect(logs).not.toContain('regenerated-but-wrong-secret');
    expect(logs).not.toContain('another-wrong-business-secret');
    graph = 'ok';
    // once Meta accepts a secret it is saved, and the old ciphertext is replaced
    await send('put', '/secrets/app-secret', { value: AUTH_SECRET }).expect(200);
    expect(
      (await db.metaConfiguration.findUniqueOrThrow({ where: { id: 'auth' } })).appSecretCiphertext,
    ).not.toBe(before.appSecretCiphertext);
  });

  it('a real credentials test reports success and failure with safe messages', async () => {
    const ok = (await send('post', '/test').expect(200)).body;
    expect(ok).toMatchObject({ ok: true, message: 'Meta accepted the App ID and App Secret.' });
    expect(
      graphCalls.some(
        (c) =>
          c.includes(encodeURIComponent(`${AUTH_ID}|${AUTH_SECRET}`)) ||
          c.includes(`${AUTH_ID}%7C${AUTH_SECRET}`),
      ),
    ).toBe(true);
    graph = 'badSecret';
    const bad = (await send('post', '/test').expect(200)).body;
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain(AUTH_SECRET);
    expect((await get('/config')).body).toMatchObject({ lastTestOk: false });
    graph = 'ok';
    await send('post', '/test').expect(200);
    expect((await get('/config')).body).toMatchObject({ lastTestOk: true });
  });

  it('customer Facebook sign-in runs on the Torio Auth app, never the Business Messaging app', async () => {
    // give the business app its own, different credentials
    await bsend('put', '/config', { patch: { appId: '111222333444555' } }).expect(200);
    await bsend('put', '/secrets/app-secret', { value: BUSINESS_SECRET }).expect(200);
    const seen: string[] = [];
    app.get(SocialProviders).fetch = (async (i: string | URL | Request) => {
      seen.push(String(i));
      return new Response(JSON.stringify({ error: {} }), { status: 400 });
    }) as typeof fetch;
    const start = await http().get('/api/v1/auth/oauth/facebook/start');
    const loc = new URL(start.headers.location!);
    expect(loc.searchParams.get('client_id')).toBe(AUTH_ID);
    expect(loc.searchParams.get('redirect_uri')).toBe(CALLBACK);
    expect(loc.searchParams.get('scope')).toBe('public_profile,email');
    const jar = (start.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('torio_oauth='))!
      .split(';')[0]!;
    await http()
      .get('/api/v1/auth/oauth/facebook/callback')
      .set('Cookie', jar)
      .query({ code: 'c', state: loc.searchParams.get('state')! });
    const exchange = seen.find((u) => u.includes('/oauth/access_token'))!;
    expect(new URL(exchange).searchParams.get('client_id')).toBe(AUTH_ID);
    expect(new URL(exchange).searchParams.get('client_secret')).toBe(AUTH_SECRET);
    expect(seen.join(' ')).not.toContain(BUSINESS_SECRET);
    expect(seen.join(' ')).not.toContain('111222333444555');
  });

  it('webhooks are verified with the Business Messaging secret only; the Auth app secret is rejected', async () => {
    await bsend('put', '/config', { patch: { webhookEnabled: true } }).expect(200);
    const raw = JSON.stringify({ object: 'page', entry: [] });
    const sig = (s: string) => `sha256=${createHmac('sha256', s).update(raw).digest('hex')}`;
    const post = (s: string) =>
      http()
        .post('/api/v1/webhooks/meta')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', sig(s))
        .send(raw);
    await post(AUTH_SECRET).expect(403);
    await post(BUSINESS_SECRET).expect(200);
  });

  it('each app fails independently: clearing the Auth secret leaves the business app untouched', async () => {
    const before = (await http().get(`${B}/config`).set('Cookie', cookie)).body;
    expect(before.secrets.appSecret.configured).toBe(true);
    const r = await send('delete', '/secrets/app-secret', { confirm: true }).expect(200);
    expect(r.body.secrets.appSecret.configured).toBe(false);
    expect(r.body.status).not.toBe('CONFIGURED');
    const after = (await http().get(`${B}/config`).set('Cookie', cookie)).body;
    expect(after.secrets.appSecret.configured).toBe(true);
    expect(after.values.appId).toBe('111222333444555');
    // and the customer sign-in is simply unavailable (not a crash) while the business app keeps working
    expect((await http().get('/api/v1/auth/config')).body.facebook).toBe(false);
    await send('delete', '/secrets/app-secret', { confirm: true }).expect(400); // nothing left to clear
  });
});
