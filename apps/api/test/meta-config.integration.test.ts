import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lockMetaConfig } from './meta-lock';
import { PasswordService } from '../src/modules/auth/password.service';

/** Real-PostgreSQL tests for the Super Admin Meta configuration. Meta's Graph API is a fake fetch; none of this proves real Meta behaviour. */
const url = process.env.TEST_DATABASE_URL;
const PW = 'Admin-passphrase-1';
const MASTER = 'm'.repeat(40);
const PREVIOUS = 'p'.repeat(40);
const SECRET_V1 = 'meta-app-secret-ONE-plaintext';
const SECRET_V2 = 'meta-app-secret-TWO-plaintext';
const CALLBACK = 'https://app.example.test/api/v1/channels/meta/callback';

/** Seals text the way the app did under an older master key, to simulate a pre-rotation database. */
const sealWith = (key: string, plain: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
};

describe.skipIf(!url)('meta developer configuration (real PostgreSQL, fake Graph API)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie = '';
  let release: () => Promise<void>;
  let graphMode: 'ok' | 'badSecret' | 'webhookMismatch' = 'ok';
  const graphCalls: string[] = [];
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const http = () => request(app.getHttpServer());
  const A = '/api/v1/admin/integrations/meta';
  const get = (p: string) => http().get(`${A}${p}`).set('Cookie', cookie);
  const send = (m: 'post' | 'put' | 'delete', p: string, body: object = {}) =>
    http()[m](`${A}${p}`).set('Cookie', cookie).set('X-Torio-Admin', '1').send(body);
  const save = (patch: object, confirm?: boolean) =>
    send('put', '/config', { patch, ...(confirm !== undefined && { confirm }) });

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.THROTTLE_DISABLED = 'true';
    for (const k of [
      'META_APP_ID',
      'META_APP_SECRET',
      'META_OAUTH_REDIRECT_URI',
      'META_WEBHOOK_VERIFY_TOKEN',
      'META_WA_CONFIG_ID',
      'META_DISCOVER_WHATSAPP',
    ])
      delete process.env[k];
    Object.assign(process.env, {
      CHANNEL_ENCRYPTION_KEY: MASTER,
      CHANNEL_ENCRYPTION_KEY_PREVIOUS: PREVIOUS,
    });
    release = await lockMetaConfig(url!);
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    const { MetaGraphProvider } = await import('../src/modules/meta/meta.graph-provider');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    app.get(MetaGraphProvider).useFetch((async (u: URL | string) => {
      const target = new URL(String(u));
      graphCalls.push(target.pathname);
      const json = (b: object, status = 200) => new Response(JSON.stringify(b), { status });
      if (target.pathname.endsWith('/subscriptions'))
        return json({
          data: [
            {
              object: 'page',
              callback_url:
                graphMode === 'webhookMismatch'
                  ? 'https://old.example.test/hook'
                  : 'https://app.example.test/api/v1/webhooks/meta',
              fields: [{ name: 'messages' }],
            },
            {
              object: 'instagram',
              callback_url: 'https://app.example.test/api/v1/webhooks/meta',
              fields: [{ name: 'messages' }],
            },
            {
              object: 'whatsapp_business_account',
              callback_url: 'https://app.example.test/api/v1/webhooks/whatsapp',
              fields: [{ name: 'messages' }],
            },
          ],
        });
      if (target.pathname.endsWith('/app'))
        return json({ error: { message: 'An access token is required', code: 104 } }, 400);
      if (graphMode === 'badSecret')
        return json({ error: { message: 'Error validating client secret.', code: 190 } }, 400);
      return json({ id: '123456789', name: 'Torio Test App' });
    }) as typeof fetch);
    db = createPrismaClient(url!);
    const hash = await app.get(PasswordService).hash(PW);
    const admin = await db.platformAdmin.create({
      data: { email: `meta-admin-${sfx}@t.co`, name: 'Meta Admin', passwordHash: hash },
    });
    const login = await http()
      .post('/api/v1/admin/auth/login')
      .send({ email: admin.email, password: PW })
      .expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    // a customer workspace owner, to prove the dynamic config drives the real OAuth start and that customers can't reach admin routes
    const owner = await db.user.create({
      data: { email: `owner-${sfx}@t.co`, name: 'Owner', passwordHash: 'x' },
    });
    const ws = await db.workspace.create({ data: { name: 'W', slug: `mc-${sfx}` } });
    await db.workspaceMembership.create({
      data: { workspaceId: ws.id, userId: owner.id, role: 'OWNER' },
    });
    Object.assign(ids, {
      owner: owner.id,
      ws: ws.id,
      ownerJwt: await app.get(JwtService).signAsync({ sub: owner.id, sid: 's' }),
    });
  });

  afterAll(async () => {
    await release?.();
    await db?.$disconnect();
    await app?.close();
  });

  it('is Super Admin only: no session and customer tokens are refused', async () => {
    await http().get(`${A}/config`).expect(401);
    await http().get(`${A}/config`).set('Authorization', `Bearer ${ids.ownerJwt}`).expect(401);
    await http()
      .put(`${A}/config`)
      .set('Cookie', cookie)
      .send({ patch: { appName: 'x' } })
      .expect(403); // missing admin header
    await http().get(`${A}/diagnostics`).expect(401);
  });

  it('starts incomplete, with no secrets and every effective value labelled by its source', async () => {
    const c = (await get('/config').expect(200)).body;
    expect(c.status).toBe('INCOMPLETE');
    expect(c.secrets).toEqual({
      appSecret: { configured: false, source: 'unset' },
      webhookVerifyToken: { configured: false, source: 'unset' },
    });
    expect(c.derived.callbackPath).toBe('/api/v1/channels/meta/callback');
    expect(c.deploymentLevel.map((d: { name: string }) => d.name)).toContain(
      'CHANNEL_ENCRYPTION_KEY',
    );
    // Torio Platform's App ID is suggested by default, so what's missing is the secret and verify token
    expect(c.problems.some((p: { field: string }) => p.field === 'appSecret')).toBe(true);
  });

  it('validates before saving, keeps the last good configuration and records the failed attempt', async () => {
    const bad = await save({ oauthRedirectUri: 'https://app.example.test/some/other/path' }).expect(
      400,
    );
    expect(JSON.stringify(bad.body)).toContain('/api/v1/channels/meta/callback');
    await save({
      oauthRedirectUri: 'http://insecure.example.test/api/v1/channels/meta/callback',
    }).expect(400); // https only (localhost excepted)
    await save({ appId: 'not-a-number' }).expect(400);
    await save({ unknownField: 1 }).expect(400);
    expect((await get('/config')).body.values.oauthRedirectUri).toBeNull(); // nothing partially applied
    const failed = (await get('/activity?action=meta.config.update').expect(200)).body.data;
    expect(
      failed.some((r: { metadata: { status: string } }) => r.metadata?.status === 'failed'),
    ).toBe(true);
  });

  it('saves settings, exposes them with their source and audits the field names without secrets', async () => {
    const r = await save({
      appName: 'Torio Test App',
      appId: '123456789',
      appMode: 'DEVELOPMENT',
      oauthRedirectUri: CALLBACK,
      allowedRedirectUris: [CALLBACK],
      webhookBaseUrl: 'https://app.example.test',
      allowedDomains: ['app.example.test'],
    }).expect(200);
    expect(r.body.values).toMatchObject({ appId: '123456789', oauthRedirectUri: CALLBACK });
    expect(r.body.sources).toMatchObject({ appId: 'database', oauthRedirectUri: 'database' });
    expect(r.body.updatedBy).toContain('@');
    expect(r.body.derived).toMatchObject({
      redirectUriToRegister: CALLBACK,
      metaWebhookUrl: 'https://app.example.test/api/v1/webhooks/meta',
      whatsappWebhookUrl: 'https://app.example.test/api/v1/webhooks/whatsapp',
    });
    const log = (await get('/activity?action=meta.config.update').expect(200)).body.data.find(
      (x: { metadata: { status: string } }) => x.metadata?.status === 'success',
    );
    expect(log.metadata.fields).toEqual(expect.arrayContaining(['appId', 'oauthRedirectUri']));
    expect(log.adminEmail).toContain('meta-admin');
  });

  it('only trusted hosts can be redirect destinations (no open redirects)', async () => {
    const bad = await save({ successUrl: 'https://evil.example.org/channels' }).expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/trusted/);
    await save({
      successUrl: 'https://app.example.test/channels',
      failureUrl: 'https://app.example.test/channels?x=1',
    }).expect(200);
    // the real callback sends the browser to the configured destination, and falls back to the web app for an unconfigured one
    const { signState } = await import('../src/modules/meta/meta.state');
    const state = signState({ w: ids.ws!, u: ids.owner!, p: ['MESSENGER'] }, SECRET_V1);
    await send('put', '/secrets/app-secret', { value: SECRET_V1 }).expect(200);
    await send('put', '/secrets/webhook-verify-token', { value: 'verify-token-ONE' }).expect(200);
    const denied = await http()
      .get(`/api/v1/channels/meta/callback?error=access_denied&state=${encodeURIComponent(state)}`)
      .expect(302);
    expect(denied.headers.location).toMatch(
      /^https:\/\/app\.example\.test\/channels\?x=1&meta_error=denied$/,
    );
  });

  it('secrets are write-only: stored encrypted, never returned, never audited in plain text', async () => {
    const c = (await get('/config').expect(200)).body;
    expect(c.secrets).toEqual({
      appSecret: { configured: true, source: 'database' },
      webhookVerifyToken: { configured: true, source: 'database' },
    });
    const row = await db.metaConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    expect(row.appSecretCiphertext!.startsWith('v1.')).toBe(true);
    expect(row.appSecretCiphertext).not.toContain(SECRET_V1);
    const all = JSON.stringify([
      (await get('/config')).body,
      (await get('/diagnostics')).body,
      (await get('/security')).body,
      (await get('/activity?pageSize=100')).body,
    ]);
    expect(all).not.toContain(SECRET_V1);
    expect(all).not.toContain('verify-token-ONE');
    expect(all).not.toContain(MASTER);
    const audits = await db.adminAuditLog.findMany({ where: { targetType: 'meta_configuration' } });
    expect(JSON.stringify(audits)).not.toContain(SECRET_V1);
    expect(audits.some((a) => a.action === 'meta.secret.replace')).toBe(true);
  });

  it('the running integrations follow the saved configuration with no restart: webhooks, signatures and OAuth', async () => {
    const q = (t: string) =>
      http().get(
        `/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=4242`,
      );
    expect((await q('verify-token-ONE')).text).toBe('4242');
    await q('wrong').expect(403);
    expect((await get('/diagnostics')).body.webhook.lastVerifiedAt).not.toBeNull(); // Meta's verification was recorded
    // rotate the verify token: the old one stops working immediately, the generated one works
    const gen = (
      await send('post', '/secrets/webhook-verify-token/generate', { confirm: true }).expect(200)
    ).body.token as string;
    expect(gen.length).toBeGreaterThan(20);
    await q('verify-token-ONE').expect(403);
    expect((await q(gen)).text).toBe('4242');
    expect(JSON.stringify((await get('/config')).body)).not.toContain(gen); // shown once only
    // signatures are checked against the saved App Secret, and a replaced secret takes over at once
    const body = JSON.stringify({ object: 'page', entry: [] });
    const sign = (s: string) => `sha256=${createHmac('sha256', s).update(body).digest('hex')}`;
    const post = (sig: string) =>
      http()
        .post('/api/v1/webhooks/meta')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', sig)
        .send(body);
    await post(sign(SECRET_V1)).expect(200);
    await send('put', '/secrets/app-secret', { value: SECRET_V2, confirm: true }).expect(200);
    await post(sign(SECRET_V1)).expect(403);
    await post(sign(SECRET_V2)).expect(200);
    // OAuth start uses the saved App ID, redirect URI and state lifetime
    await db.workspaceMembership.updateMany({
      where: { workspaceId: ids.ws!, userId: ids.owner! },
      data: { role: 'OWNER' },
    });
    await save({ oauthStateTtlMinutes: 5 }).expect(200);
    const start = await http()
      .post(`/api/v1/workspaces/${ids.ws}/channels/meta/start`)
      .set('Authorization', `Bearer ${ids.ownerJwt}`)
      .send({ products: ['MESSENGER'] })
      .expect(200);
    const u = new URL(start.body.url);
    expect(u.searchParams.get('client_id')).toBe('123456789');
    expect(u.searchParams.get('redirect_uri')).toBe(CALLBACK);
    const { verifyState } = await import('../src/modules/meta/meta.state');
    const st = verifyState(u.searchParams.get('state')!, SECRET_V2)!;
    expect(st.e - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    expect(st.e - Date.now()).toBeGreaterThan(4 * 60_000);
  });

  it('dangerous changes show their impact first and need explicit confirmation; connected channels are untouched', async () => {
    const ch = await db.channel.create({
      data: {
        workspaceId: ids.ws!,
        provider: 'MESSENGER',
        displayName: 'Existing Page',
        status: 'CONNECTED',
        externalAccountId: `page-${sfx}`,
      },
    });
    const prev = (
      await send('post', '/config/preview', {
        patch: { appId: '987654321', webhookEnabled: false },
      }).expect(200)
    ).body;
    expect(prev.requiresConfirmation).toBe(true);
    expect(prev.impacts.map((i: { message: string }) => i.message).join(' ')).toMatch(
      /reconnected|stops receiving/,
    );
    expect(prev.changes.map((c: { field: string }) => c.field)).toEqual(
      expect.arrayContaining(['appId', 'webhookEnabled']),
    );
    await save({ appId: '987654321' }).expect(409);
    await send('put', '/secrets/app-secret', { value: 'another-secret-value-1' }).expect(409); // channels depend on the current secret
    await save({ appId: '987654321' }, true).expect(200);
    expect((await get('/config')).body.values.appId).toBe('987654321');
    expect((await db.channel.findUniqueOrThrow({ where: { id: ch.id } })).status).toBe('CONNECTED'); // nothing disconnected
    await save({ appId: '123456789' }, true).expect(200); // rollback = put the previous value back
    // disabled webhooks are refused by the real controller, then re-enabled
    await save({ webhookEnabled: false }, true).expect(200);
    await http()
      .get('/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1')
      .expect(403);
    await save({ webhookEnabled: true }).expect(200);
    await db.channel.delete({ where: { id: ch.id } });
  });

  it('real checks against Meta report success and failure with safe, actionable results', async () => {
    const ok = (await send('post', '/test/credentials').expect(200)).body;
    expect(ok).toMatchObject({ ok: true, httpStatus: 200 });
    expect(JSON.stringify(ok)).not.toContain(SECRET_V2);
    expect(graphCalls.some((p) => p.endsWith('/123456789'))).toBe(true);
    graphMode = 'badSecret';
    const bad = (await send('post', '/test/credentials').expect(200)).body;
    expect(bad).toMatchObject({ ok: false, httpStatus: 400, metaCode: 190 });
    expect(bad.resolution).toMatch(/App Secret/);
    expect(JSON.stringify(bad)).not.toContain(SECRET_V2);
    graphMode = 'ok';
    const oauth = (await send('post', '/test/oauth').expect(200)).body;
    expect(oauth.ok).toBe(true);
    expect(oauth.details).toContainEqual({ label: 'Redirect URI to register', value: CALLBACK });
    expect((await send('post', '/test/connectivity').expect(200)).body).toMatchObject({
      ok: true,
      metaCode: 104,
    });
    expect((await send('post', '/test/webhook').expect(200)).body.ok).toBe(true);
    graphMode = 'webhookMismatch';
    const mm = (await send('post', '/test/webhook').expect(200)).body;
    expect(mm.ok).toBe(false);
    expect(mm.details.find((d: { label: string }) => d.label === 'page').value).toMatch(
      /callback differs/,
    );
    graphMode = 'ok';
  });

  it('clearing a secret needs confirmation and is refused when channels would be left without one', async () => {
    await send('delete', '/secrets/app-secret', {}).expect(400); // body must confirm
    const ch = await db.channel.create({
      data: {
        workspaceId: ids.ws!,
        provider: 'INSTAGRAM',
        displayName: 'IG',
        status: 'CONNECTED',
        externalAccountId: `ig-${sfx}`,
      },
    });
    await send('delete', '/secrets/app-secret', { confirm: true }).expect(409); // no environment fallback + channels connected
    await db.channel.delete({ where: { id: ch.id } });
    // other suites may share this database: clearing is allowed exactly when no connected channel remains
    const others = await db.channel.count({
      where: { status: { not: 'DISCONNECTED' }, isSample: false },
    });
    const cleared = await send('delete', '/secrets/app-secret', { confirm: true }).expect(
      others ? 409 : 200,
    );
    if (!others)
      expect(cleared.body.secrets.appSecret).toEqual({ configured: false, source: 'unset' });
    await send('put', '/secrets/app-secret', { value: SECRET_V2, confirm: true }).expect(200);
  });

  it('key rotation re-seals every stored secret with the current key and never touches unreadable data', async () => {
    const ch = await db.channel.create({
      data: {
        workspaceId: ids.ws!,
        provider: 'MESSENGER',
        displayName: 'Old key Page',
        status: 'CONNECTED',
        externalAccountId: `old-${sfx}`,
      },
    });
    await db.channelCredential.create({
      data: {
        workspaceId: ids.ws!,
        channelId: ch.id,
        ciphertext: sealWith(PREVIOUS, '{"t":"EAAG-old","p":"1"}'),
      },
    });
    const ch2 = await db.channel.create({
      data: {
        workspaceId: ids.ws!,
        provider: 'INSTAGRAM',
        displayName: 'Lost key',
        status: 'CONNECTED',
        externalAccountId: `lost-${sfx}`,
      },
    });
    const junk = sealWith('z'.repeat(40), 'sealed with a key nobody has');
    await db.channelCredential.create({
      data: { workspaceId: ids.ws!, channelId: ch2.id, ciphertext: junk },
    });
    const before = (await get('/security').expect(200)).body;
    expect(before).toMatchObject({
      masterKeyConfigured: true,
      previousKeyConfigured: true,
      rotationPending: true,
    });
    expect(before.secretsSealedWith.previous).toBeGreaterThanOrEqual(1);
    expect(before.secretsSealedWith.unreadable).toBeGreaterThanOrEqual(1);
    const r = (await send('post', '/security/reencrypt').expect(200)).body;
    expect(r.reencrypted).toBeGreaterThanOrEqual(1);
    expect(r.failed).toBeGreaterThanOrEqual(1);
    const after = (await get('/security').expect(200)).body;
    expect(after.secretsSealedWith.previous).toBe(0);
    expect(after.rotationPending).toBe(false);
    const { ChannelCryptoService } = await import('../src/modules/whatsapp/channel-crypto.service');
    const moved = await db.channelCredential.findUniqueOrThrow({ where: { channelId: ch.id } });
    expect(app.get(ChannelCryptoService).keyOf(moved.ciphertext)).toBe('current');
    expect(app.get(ChannelCryptoService).decrypt(moved.ciphertext)).toBe(
      '{"t":"EAAG-old","p":"1"}',
    );
    expect(
      (await db.channelCredential.findUniqueOrThrow({ where: { channelId: ch2.id } })).ciphertext,
    ).toBe(junk); // left exactly as it was
    expect((await get('/security')).body.lastKeyRotationAt).toBeNull(); // a partial rotation isn't recorded as complete
    expect(
      JSON.stringify((await get('/activity?action=meta.security').expect(200)).body),
    ).not.toContain('EAAG-old');
    await db.channel.deleteMany({ where: { id: { in: [ch.id, ch2.id] } } });
  });

  it('the activity log is paginated and filterable', async () => {
    const p1 = (await get('/activity?pageSize=3&page=1').expect(200)).body;
    expect(p1.data).toHaveLength(3);
    expect(p1.meta.total).toBeGreaterThan(3);
    const tests = (await get('/activity?action=meta.test').expect(200)).body;
    expect(tests.data.every((r: { action: string }) => r.action.startsWith('meta.test'))).toBe(
      true,
    );
    expect(tests.data.length).toBeGreaterThan(0);
    expect(tests.data.every((r: { ipAddress: string | null }) => r.ipAddress !== undefined)).toBe(
      true,
    );
  });
});
