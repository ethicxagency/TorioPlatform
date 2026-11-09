import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { lockMetaConfig } from './meta-lock';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for the Meta OAuth + Messenger/Instagram layer. Meta's Graph API is replaced by a fake fetch. */
const url = process.env.TEST_DATABASE_URL;
const SECRET = 'meta-app-secret-for-tests';
const VERIFY = 'verify-token-for-tests';
const APP_ID = '1234567890';
const REDIRECT = 'http://localhost:4000/api/v1/channels/meta/callback';

describe.skipIf(!url)('meta channels (real PostgreSQL, fake Graph API)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id?: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const PAGE = `${Date.now()}`.slice(-10);
  const IG = `${Date.now() + 1}`.slice(-10);
  const calls: { url: string; method: string; body: unknown }[] = [];
  let granted = [
    'business_management',
    'whatsapp_business_management',
    'whatsapp_business_messaging',
    'pages_show_list',
    'pages_manage_metadata',
    'pages_messaging',
    'instagram_basic',
    'instagram_manage_messages',
  ];
  let release: () => Promise<void>;
  let fake: typeof fetch;
  let MetaGraphProvider: typeof import('../src/modules/meta/meta.graph-provider').MetaGraphProvider;
  const withInstagram = true;
  let subscribeFails = false;
  const WA_OK = `${Date.now() + 21}`.slice(-12);
  const WA_NEW = `${Date.now() + 22}`.slice(-12);
  const WABA_ID = `${Date.now() + 23}`.slice(-12);
  const http = () => request(app.getHttpServer());
  const sign = (raw: string) => `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
  const hook = (payload: object, signature?: string) => {
    const raw = JSON.stringify(payload);
    return http()
      .post('/api/v1/webhooks/meta')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature ?? sign(raw))
      .send(raw);
  };
  /** Webhooks acknowledge first and process after; wait for the recorded event to settle. */
  const settle = async (key: string) => {
    for (let i = 0; i < 50; i++) {
      const e = await db.providerWebhookEvent.findFirst({ where: { eventKey: key } });
      if (e && e.status !== 'RECEIVED') return e;
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`event ${key} did not settle`);
  };
  const messaging = (object: 'page' | 'instagram', entryId: string, ev: object) => ({
    object,
    entry: [{ id: entryId, time: Date.now(), messaging: [ev] }],
  });
  const startFlow = async (
    products?: ('MESSENGER' | 'INSTAGRAM' | 'WHATSAPP')[],
    user = ids.owner,
    ws = ids.wsA,
  ) => {
    const res = await http()
      .post(`/api/v1/workspaces/${ws}/channels/meta/start`)
      .set(await auth(user))
      .send(products ? { products } : {})
      .expect(200);
    const state = new URL(res.body.url).searchParams.get('state')!;
    return { res, state };
  };
  const callback = (state: string, code = 'auth-code-123') =>
    http().get(`/api/v1/channels/meta/callback?code=${code}&state=${encodeURIComponent(state)}`);
  const sessionOf = (location: string | undefined) =>
    new URL(location!).searchParams.get('meta_session');

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    release = await lockMetaConfig(url!);
    Object.assign(process.env, {
      META_APP_ID: APP_ID,
      META_APP_SECRET: SECRET,
      META_OAUTH_REDIRECT_URI: REDIRECT,
      META_WEBHOOK_VERIFY_TOKEN: VERIFY,
      CHANNEL_ENCRYPTION_KEY: 'x'.repeat(40),
      META_DISCOVER_WHATSAPP: 'true',
    });
    const { AppModule } = await import('../src/app.module');
    ({ MetaGraphProvider } = await import('../src/modules/meta/meta.graph-provider'));
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    fake = (async (u: URL | string, init?: RequestInit) => {
      const target = new URL(String(u));
      const path = target.pathname.replace(/^\/v[\d.]+\//, '');
      calls.push({
        url: String(u),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const json = (b: object, status = 200) => new Response(JSON.stringify(b), { status });
      if (path === 'oauth/access_token')
        return json({
          access_token: `EAAG-user-token-${target.searchParams.get('grant_type') ?? 'short'}`,
          expires_in: 5_184_000,
        });
      if (path === 'me/permissions')
        return json({ data: granted.map((permission) => ({ permission, status: 'granted' })) });
      if (path === 'me/accounts')
        return json({
          data: [
            {
              id: PAGE,
              name: 'Urban Nest Page',
              access_token: 'EAAG-page-token-secret-value',
              ...(withInstagram && {
                instagram_business_account: { id: IG, username: 'urbannest' },
              }),
            },
          ],
        });
      if (path === 'me/businesses')
        return json({
          data: [
            {
              id: 'biz1',
              name: 'Urban Nest Ltd',
              owned_whatsapp_business_accounts: {
                data: [
                  {
                    id: WABA_ID,
                    name: 'Urban Nest WABA',
                    phone_numbers: {
                      data: [
                        {
                          id: WA_OK,
                          display_phone_number: '+880 1711-000001',
                          verified_name: 'Urban Nest',
                          status: 'CONNECTED',
                        },
                        {
                          id: WA_NEW,
                          display_phone_number: '+880 1711-000002',
                          verified_name: 'Urban Nest',
                          status: 'PENDING',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        });
      if (path === WA_OK || path === WA_NEW)
        return json({
          id: path,
          display_phone_number: '+880 1711-000001',
          verified_name: 'Urban Nest',
          status: path === WA_OK ? 'CONNECTED' : 'PENDING',
        });
      if (path.endsWith('/subscribed_apps') && path.startsWith(WABA_ID))
        return json({ success: true });
      if (path.endsWith('/subscribed_apps'))
        return subscribeFails
          ? json({ error: { message: 'Permissions error', code: 200 } }, 403)
          : json({ success: true });
      if (path === 'debug_token') return json({ data: { is_valid: true, expires_at: 0 } });
      if (path.endsWith('/messages')) return json({ message_id: `m_${sfx}_out_${calls.length}` });
      if (path === PAGE) return json({ id: PAGE, name: 'Urban Nest Page' });
      return json({
        name: 'Sara Ahmed',
        first_name: 'Sara',
        last_name: 'Ahmed',
        username: 'sara.a',
      });
    }) as typeof fetch;
    app.get(MetaGraphProvider).useFetch(fake);
    db = createPrismaClient(url!);
    const jwt = app.get(JwtService);
    auth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: 's' })}`,
    });
    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: 'x' } });
    const [owner, agent, outsider] = await Promise.all([mk('owner'), mk('agent'), mk('outsider')]);
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `ma-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `mb-${sfx}` } });
    Object.assign(ids, {
      owner: owner.id,
      agent: agent.id,
      outsider: outsider.id,
      wsA: wsA.id,
      wsB: wsB.id,
    });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
  });

  afterAll(async () => {
    await release?.();
    await db?.$disconnect();
    await app?.close();
  });

  const ALL = [
    'business_management',
    'whatsapp_business_management',
    'whatsapp_business_messaging',
    'pages_show_list',
    'pages_manage_metadata',
    'pages_messaging',
    'instagram_basic',
    'instagram_manage_messages',
  ];
  const sessionBody = async (id: string, user = ids.owner, ws = ids.wsA) =>
    (
      await http()
        .get(`/api/v1/workspaces/${ws}/channels/meta/sessions/${id}`)
        .set(await auth(user))
        .expect(200)
    ).body;
  const selectKeys = async (
    id: string,
    keys: string[],
    opts: { status?: number; user?: string; ws?: string } = {},
  ) =>
    (
      await http()
        .post(`/api/v1/workspaces/${opts.ws ?? ids.wsA}/channels/meta/sessions/${id}/select`)
        .set(await auth(opts.user ?? ids.owner))
        .send({ candidateKeys: keys })
        .expect(opts.status ?? 200)
    ).body;

  it('starting needs channels:manage and returns a signed Facebook URL asking only for the chosen products', async () => {
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/start`)
      .set(await auth(ids.agent))
      .send({})
      .expect(403);
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/start`)
      .set(await auth(ids.outsider))
      .send({})
      .expect(404); // not a member
    const all = await startFlow();
    const u = new URL(all.res.body.url);
    expect(u.hostname).toBe('www.facebook.com');
    expect(u.searchParams.get('client_id')).toBe(APP_ID);
    expect(u.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(new Set(u.searchParams.get('scope')!.split(','))).toEqual(new Set(ALL));
    expect(all.res.text).not.toContain(SECRET);
    const one = await startFlow(['MESSENGER']);
    expect(new URL(one.res.body.url).searchParams.get('scope')).toBe(
      'pages_show_list,pages_messaging,pages_manage_metadata',
    );
  });

  it('the callback rejects forged, tampered and denied authorizations before any Meta call', async () => {
    const before = calls.length;
    expect((await callback('abc.def').expect(302)).headers.location).toContain(
      'meta_error=invalid_state',
    );
    const { state } = await startFlow();
    const tampered = await callback(state.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))).expect(
      302,
    );
    expect(tampered.headers.location).toContain('meta_error=invalid_state');
    const denied = await http()
      .get(`/api/v1/channels/meta/callback?error=access_denied&state=${encodeURIComponent(state)}`)
      .expect(302);
    expect(denied.headers.location).toContain('meta_error=denied');
    expect(calls.length).toBe(before);
  });

  it('declined permissions are reported per product instead of failing everything', async () => {
    granted = ['pages_show_list'];
    const none = await callback((await startFlow()).state).expect(302);
    expect(none.headers.location).toContain('meta_error=missing_permissions');
    granted = ALL.filter((x) => !x.startsWith('whatsapp') && x !== 'business_management');
    const r = await callback((await startFlow()).state).expect(302);
    const body = await sessionBody(sessionOf(r.headers.location)!);
    expect(body.missingPermissions).toEqual(['WHATSAPP']);
    expect(body.candidates.some((c: { provider: string }) => c.provider === 'WHATSAPP')).toBe(
      false,
    );
    expect(body.candidates.some((c: { provider: string }) => c.provider === 'MESSENGER')).toBe(
      true,
    );
    granted = ALL;
  });

  it('one authorization discovers Pages, Instagram accounts and WhatsApp numbers; tokens never leave the server', async () => {
    const r = await callback((await startFlow()).state).expect(302);
    const id = sessionOf(r.headers.location)!;
    expect(r.headers.location).not.toContain('EAAG');
    ids.session = id;
    const body = await sessionBody(id);
    expect(body.candidates).toEqual([
      {
        key: `MESSENGER:${PAGE}`,
        provider: 'MESSENGER',
        name: 'Urban Nest Page',
        detail: `Page ID ${PAGE}`,
        imageUrl: null,
        eligible: true,
        reason: null,
        taken: false,
      },
      {
        key: `INSTAGRAM:${IG}`,
        provider: 'INSTAGRAM',
        name: '@urbannest',
        detail: 'Professional account · Linked Page: Urban Nest Page',
        imageUrl: null,
        eligible: true,
        reason: null,
        taken: false,
      },
      {
        key: `WHATSAPP:${WA_OK}`,
        provider: 'WHATSAPP',
        name: '+880 1711-000001',
        detail: 'Urban Nest · Urban Nest WABA',
        imageUrl: null,
        eligible: true,
        reason: null,
        taken: false,
      },
      expect.objectContaining({
        key: `WHATSAPP:${WA_NEW}`,
        eligible: false,
        reason: expect.stringMatching(/Embedded Signup/),
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain('EAAG');
    // another user in the same workspace, and another workspace entirely, can't see it
    await http()
      .get(`/api/v1/workspaces/${ids.wsA}/channels/meta/sessions/${id}`)
      .set(await auth(ids.agent))
      .expect(403);
    await http()
      .get(`/api/v1/workspaces/${ids.wsB}/channels/meta/sessions/${id}`)
      .set(await auth(ids.outsider))
      .expect(404);
    const row = await db.channelOAuthSession.findUniqueOrThrow({ where: { id } });
    expect(JSON.stringify(row.candidates)).not.toContain('EAAG-page-token-secret-value');
  });

  it('each selected asset is provisioned on its own: failures and unready numbers never block the rest, and retry is safe', async () => {
    subscribeFails = true; // Meta rejects the Page subscriptions
    const first = await selectKeys(ids.session!, [
      `MESSENGER:${PAGE}`,
      `INSTAGRAM:${IG}`,
      `WHATSAPP:${WA_OK}`,
      `WHATSAPP:${WA_NEW}`,
    ]);
    const by = Object.fromEntries(first.results.map((r: { key: string }) => [r.key, r]));
    expect(by[`MESSENGER:${PAGE}`]).toMatchObject({ status: 'FAILED', channelId: null });
    expect(by[`MESSENGER:${PAGE}`].message).toMatch(/subscribe/i);
    expect(by[`INSTAGRAM:${IG}`].status).toBe('FAILED');
    expect(by[`WHATSAPP:${WA_OK}`]).toMatchObject({ status: 'CONNECTED' });
    expect(by[`WHATSAPP:${WA_NEW}`]).toMatchObject({ status: 'ACTION_REQUIRED' });
    expect(JSON.stringify(first)).not.toContain('EAAG');
    expect(
      await db.channel.count({
        where: {
          provider: { in: ['MESSENGER', 'INSTAGRAM'] },
          externalAccountId: { in: [PAGE, IG] },
        },
      }),
    ).toBe(0); // nothing saved for failures
    ids.waChannel = by[`WHATSAPP:${WA_OK}`].channelId;
    // retry only the failed ones
    subscribeFails = false;
    const retry = await selectKeys(ids.session!, [`MESSENGER:${PAGE}`, `INSTAGRAM:${IG}`]);
    const r2 = Object.fromEntries(retry.results.map((r: { key: string }) => [r.key, r]));
    expect(r2[`MESSENGER:${PAGE}`].status).toBe('CONNECTED');
    expect(r2[`INSTAGRAM:${IG}`].status).toBe('CONNECTED');
    ids.msgChannel = r2[`MESSENGER:${PAGE}`].channelId;
    ids.igChannel = r2[`INSTAGRAM:${IG}`].channelId;
    // choosing the same WhatsApp number again (new authorization) reuses the channel instead of duplicating it
    const again = await callback((await startFlow()).state).expect(302);
    const dup = await selectKeys(sessionOf(again.headers.location)!, [`WHATSAPP:${WA_OK}`]);
    expect(dup.results[0]).toMatchObject({ status: 'CONNECTED', channelId: ids.waChannel });
    expect(
      await db.channel.count({ where: { provider: 'WHATSAPP', externalAccountId: WA_OK } }),
    ).toBe(1);
    // subscribed with the right fields and the Page token, stored encrypted
    const sub = calls
      .filter((c) => c.url.includes(`/${PAGE}/subscribed_apps`) && c.method === 'POST')
      .at(-1)!;
    expect(sub.url).toContain('subscribed_fields=messages');
    for (const cid of [ids.msgChannel, ids.igChannel, ids.waChannel]) {
      const cred = await db.channelCredential.findUniqueOrThrow({ where: { channelId: cid! } });
      expect(cred.ciphertext.startsWith('v1.')).toBe(true);
      expect(cred.ciphertext).not.toContain('EAAG');
    }
    const msg = await db.channel.findUniqueOrThrow({ where: { id: ids.msgChannel } });
    expect(msg).toMatchObject({
      status: 'CONNECTED',
      webhookStatus: 'SUBSCRIBED',
      provider: 'MESSENGER',
    });
    // connected assets are no longer parked in the session; the failed/unready ones still are
    const left = await sessionBody(ids.session!);
    expect(left.candidates.map((c: { key: string }) => c.key)).toEqual([`WHATSAPP:${WA_NEW}`]);
    await selectKeys(ids.session!, ['MESSENGER:nope'], { status: 400 });
  });

  it('assets connected anywhere cannot be connected again, and cancelling discards the parked tokens', async () => {
    const { state } = await startFlow(undefined, ids.outsider, ids.wsB);
    const id = sessionOf((await callback(state).expect(302)).headers.location)!;
    const s = await sessionBody(id, ids.outsider, ids.wsB);
    expect(
      s.candidates
        .filter((c: { taken: boolean }) => c.taken)
        .map((c: { provider: string }) => c.provider)
        .sort(),
    ).toEqual(['INSTAGRAM', 'MESSENGER', 'WHATSAPP']);
    const res = await selectKeys(id, [`MESSENGER:${PAGE}`, `WHATSAPP:${WA_OK}`], {
      user: ids.outsider,
      ws: ids.wsB,
    });
    expect(
      res.results.every(
        (r: { status: string; message: string }) =>
          r.status === 'FAILED' && /another workspace/.test(r.message),
      ),
    ).toBe(true);
    await http()
      .post(`/api/v1/workspaces/${ids.wsB}/channels/meta/sessions/${id}/cancel`)
      .set(await auth(ids.outsider))
      .expect(200);
    expect(await db.channelOAuthSession.count({ where: { id } })).toBe(0);
    await http()
      .get(`/api/v1/workspaces/${ids.wsB}/channels/meta/sessions/${id}`)
      .set(await auth(ids.outsider))
      .expect(404);
  });

  it('webhook verification checks the token; unsigned and badly signed posts are rejected', async () => {
    const q = (t: string) =>
      http().get(
        `/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=777`,
      );
    expect((await q(VERIFY)).text).toBe('777');
    await q('nope').expect(403);
    const p = messaging('page', PAGE, {
      sender: { id: 'u1' },
      message: { mid: `m_${sfx}_x`, text: 'hi' },
    });
    await hook(p, 'sha256=00').expect(403);
    await http().post('/api/v1/webhooks/meta').send(p).expect(403);
  });

  it('ingests a Messenger message once (redelivery and echoes are ignored) and maps the contact', async () => {
    const mid = `m_${sfx}_in1`;
    const ev = {
      sender: { id: `psid-${sfx}` },
      recipient: { id: PAGE },
      timestamp: Date.now(),
      message: { mid, text: 'Hi, do you ship to Sylhet?' },
    };
    const first = await hook(messaging('page', PAGE, ev)).expect(200);
    expect(first.body).toMatchObject({ received: true, accepted: 1 });
    await settle(`msg:${mid}`);
    const again = await hook(messaging('page', PAGE, ev)).expect(200);
    expect(again.body).toMatchObject({ accepted: 0, duplicates: 1 });
    const echo = await hook(
      messaging('page', PAGE, {
        sender: { id: PAGE },
        message: { mid: `m_${sfx}_echo`, text: 'ours', is_echo: true },
      }),
    ).expect(200);
    expect(echo.body.accepted).toBe(0);
    const msgs = await db.message.findMany({ where: { workspaceId: ids.wsA, externalId: mid } });
    expect(msgs).toHaveLength(1);
    const conv = await db.conversation.findUniqueOrThrow({
      where: { id: msgs[0]!.conversationId },
      include: { customer: true },
    });
    expect(conv).toMatchObject({ channelId: ids.msgChannel, unreadCount: 1 });
    expect(conv.customer).toMatchObject({ name: 'Sara Ahmed', source: 'MESSENGER' });
    ids.conv = conv.id;
    ids.customer = conv.customerId;
    await hook(
      messaging('page', PAGE, { ...ev, message: { mid: `m_${sfx}_in2`, text: 'Hello?' } }),
    ).expect(200);
    await settle(`msg:m_${sfx}_in2`);
    expect(await db.conversation.count({ where: { customerId: ids.customer } })).toBe(1);
    expect(await db.channelContact.count({ where: { channelId: ids.msgChannel } })).toBe(1);
    const channel = await db.channel.findUniqueOrThrow({ where: { id: ids.msgChannel } });
    expect(channel.lastEventAt).not.toBeNull();
  });

  it('events for unknown or other accounts are ignored, never attached to a workspace', async () => {
    const mid = `m_${sfx}_ghost`;
    const r = await hook(
      messaging('page', '99999999999', { sender: { id: 'z' }, message: { mid, text: 'x' } }),
    ).expect(200);
    expect(r.body.ignored).toBe(1);
    expect(await db.message.count({ where: { externalId: mid } })).toBe(0);
  });

  it('replies through the Messenger send API inside the window, then tracks delivery and read receipts', async () => {
    const res = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/conversations/${ids.conv}/messages`)
      .set(await auth(ids.owner))
      .send({ body: 'Yes, we do!' })
      .expect(201);
    expect(res.body.deliveryStatus).toBe('SENT');
    const sent = calls.filter((c) => c.url.includes(`/${PAGE}/messages`)).at(-1)!;
    expect(sent.method).toBe('POST');
    expect(sent.body).toMatchObject({
      recipient: { id: `psid-${sfx}` },
      messaging_type: 'RESPONSE',
      message: { text: 'Yes, we do!' },
    });
    const mid = (await db.message.findUniqueOrThrow({ where: { id: res.body.id } })).externalId!;
    await hook(
      messaging('page', PAGE, {
        sender: { id: `psid-${sfx}` },
        recipient: { id: PAGE },
        delivery: { mids: [mid] },
      }),
    ).expect(200);
    await settle(`delivery:${mid}`);
    expect(
      (await db.message.findUniqueOrThrow({ where: { id: res.body.id } })).deliveryStatus,
    ).toBe('DELIVERED');
    await hook(
      messaging('page', PAGE, {
        sender: { id: `psid-${sfx}` },
        recipient: { id: PAGE },
        read: { watermark: Date.now() + 1000 },
      }),
    ).expect(200);
    await settle(
      `read:psid-${sfx}:${(await db.providerWebhookEvent.findFirst({ where: { eventKey: { startsWith: `read:psid-${sfx}` } } }))!.eventKey.split(':')[2]}`,
    );
    expect(
      (await db.message.findUniqueOrThrow({ where: { id: res.body.id } })).deliveryStatus,
    ).toBe('READ');
  });

  it('blocks replies once the 24-hour window has closed and sends nothing to Meta', async () => {
    await db.conversation.update({
      where: { id: ids.conv },
      data: { lastInboundAt: new Date(Date.now() - 25 * 3600_000) },
    });
    const before = calls.length;
    const res = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/conversations/${ids.conv}/messages`)
      .set(await auth(ids.owner))
      .send({ body: 'Late' })
      .expect(201);
    expect(res.body.deliveryStatus).toBe('FAILED');
    expect(res.body.failureReason).toMatch(/24-hour/);
    expect(calls.length).toBe(before);
    await db.conversation.update({ where: { id: ids.conv }, data: { lastInboundAt: new Date() } });
  });

  it('health check asks Meta and marks the channel when authorization is gone', async () => {
    const ok = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/${ids.msgChannel}/health`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(ok.body.ok).toBe(true);
    const { MetaGraphProvider } = await import('../src/modules/meta/meta.graph-provider');
    app.get(MetaGraphProvider).useFetch(
      (async () =>
        new Response(JSON.stringify({ error: { message: 'Token expired', code: 190 } }), {
          status: 401,
        })) as typeof fetch,
    );
    const bad = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/${ids.msgChannel}/health`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.error).toMatch(/expired|revoked/i);
    expect((await db.channel.findUniqueOrThrow({ where: { id: ids.msgChannel } })).status).toBe(
      'EXPIRED',
    );
    // an expired channel refuses to send rather than pretending
    const res = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/conversations/${ids.conv}/messages`)
      .set(await auth(ids.owner))
      .send({ body: 'x' })
      .expect(201);
    expect(res.body.failureReason).toMatch(/reconnected/);
    app.get(MetaGraphProvider).useFetch(fake);
  });

  it('Instagram webhooks are keyed by the Instagram account id and land in the same Inbox', async () => {
    const mid = `m_${sfx}_ig1`;
    await hook(
      messaging('instagram', IG, {
        sender: { id: `igsid-${sfx}` },
        recipient: { id: IG },
        timestamp: Date.now(),
        message: { mid, text: 'Price?' },
      }),
    ).expect(200);
    await settle(`msg:${mid}`);
    const m = await db.message.findFirstOrThrow({
      where: { externalId: mid },
      include: { conversation: { include: { customer: true } } },
    });
    expect(m.conversation.channelId).toBe(ids.igChannel);
    expect(m.conversation.customer.source).toBe('INSTAGRAM');
  });

  it('a delivery receipt without message ids marks earlier replies delivered by its watermark', async () => {
    const m = await db.message.create({
      data: {
        workspaceId: ids.wsA!,
        conversationId: ids.conv!,
        kind: 'OUTBOUND',
        body: 'wm',
        deliveryStatus: 'SENT',
        externalId: `m_${sfx}_wm`,
      },
    });
    const wm = Date.now() + 5000;
    await hook(
      messaging('page', PAGE, {
        sender: { id: `psid-${sfx}` },
        recipient: { id: PAGE },
        delivery: { watermark: wm },
      }),
    ).expect(200);
    await settle(`delivery-wm:psid-${sfx}:${wm}`);
    expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).deliveryStatus).toBe(
      'DELIVERED',
    );
  });

  it('events stored but never finished are picked up again (crash safety)', async () => {
    const mid = `m_${sfx}_stuck`;
    const ev = {
      sender: { id: `psid-${sfx}` },
      recipient: { id: PAGE },
      timestamp: Date.now(),
      message: { mid, text: 'stuck' },
    };
    const row = await db.providerWebhookEvent.create({
      data: {
        provider: 'MESSENGER',
        eventKey: `msg:${mid}`,
        channelId: ids.msgChannel,
        workspaceId: ids.wsA,
        payload: ev,
        receivedAt: new Date(Date.now() - 120_000),
      },
    });
    const { MetaWebhookService } = await import('../src/modules/meta/meta.webhook.service');
    await app.get(MetaWebhookService).retryFailed();
    expect(
      (await db.providerWebhookEvent.findUniqueOrThrow({ where: { id: row.id } })).status,
    ).toBe('PROCESSED');
    expect(await db.message.count({ where: { externalId: mid } })).toBe(1);
  });

  it('WhatsApp Embedded Signup: server exchanges the code, subscribes the WABA, registers the number and keeps the PIN encrypted', async () => {
    const { WhatsAppGraphProvider } =
      await import('../src/modules/whatsapp/whatsapp.graph-provider');
    app.get(WhatsAppGraphProvider).useFetch(
      (async () =>
        new Response(
          JSON.stringify({
            id: 'p',
            display_phone_number: '+880 1700-000111',
            verified_name: 'Urban Nest',
          }),
        )) as typeof fetch,
    );
    const WA_PHONE = `${Date.now() + 7}`.slice(-12);
    const WABA = `${Date.now() + 9}`.slice(-12);
    const body = {
      code: 'one-time-code-abcdef',
      phoneNumberId: WA_PHONE,
      wabaId: WABA,
      displayName: 'Support line',
    };
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/whatsapp/embedded-signup`)
      .set(await auth(ids.agent))
      .send(body)
      .expect(403);
    const before = calls.length;
    const ok = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/whatsapp/embedded-signup`)
      .set(await auth(ids.owner))
      .send(body)
      .expect(200);
    expect(ok.body).toMatchObject({
      provider: 'WHATSAPP',
      status: 'CONNECTED',
      webhookStatus: 'SUBSCRIBED',
    });
    expect(JSON.stringify(ok.body)).not.toContain('EAAG');
    const made = calls.slice(before);
    const exchange = made.find((c) => c.url.includes('oauth/access_token'))!;
    expect(exchange.url).toContain('code=one-time-code-abcdef');
    expect(exchange.url).not.toContain('redirect_uri'); // Embedded Signup exchanges the code without one
    expect(
      made.some((c) => c.url.includes(`/${WABA}/subscribed_apps`) && c.method === 'POST'),
    ).toBe(true);
    const reg = made.find((c) => c.url.includes(`/${WA_PHONE}/register`))!;
    expect(reg.body).toMatchObject({
      messaging_product: 'whatsapp',
      pin: expect.stringMatching(/^\d{6}$/),
    });
    const ch = await db.channel.findFirstOrThrow({
      where: { provider: 'WHATSAPP', externalAccountId: WA_PHONE },
    });
    expect(ch.phonePinCiphertext?.startsWith('v1.')).toBe(true);
    expect(ch.phonePinCiphertext).not.toContain((reg.body as { pin: string }).pin);
    // the same number can't be claimed again while connected
    await http()
      .post(`/api/v1/workspaces/${ids.wsB}/channels/whatsapp/embedded-signup`)
      .set(await auth(ids.outsider))
      .send(body)
      .expect(409);
  });

  it('disconnect deletes the stored token but keeps the conversations', async () => {
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/${ids.igChannel}/disconnect`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(await db.channelCredential.count({ where: { channelId: ids.igChannel } })).toBe(0);
    expect(await db.conversation.count({ where: { channelId: ids.igChannel } })).toBe(1);
    // a disconnected channel ignores new events
    const mid = `m_${sfx}_ig_after`;
    const r = await hook(
      messaging('instagram', IG, {
        sender: { id: `igsid-${sfx}` },
        message: { mid, text: 'hello?' },
      }),
    ).expect(200);
    expect(r.body.ignored).toBe(1);
  });
});
