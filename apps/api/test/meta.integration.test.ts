import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import { createHmac } from 'node:crypto';
import request from 'supertest';
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
    'pages_show_list',
    'pages_manage_metadata',
    'pages_messaging',
    'instagram_basic',
    'instagram_manage_messages',
  ];
  let withInstagram = true;
  let subscribeFails = false;
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
  const startFlow = async (provider: 'MESSENGER' | 'INSTAGRAM', user = ids.owner, ws = ids.wsA) => {
    const res = await http()
      .post(`/api/v1/workspaces/${ws}/channels/meta/start`)
      .set(await auth(user))
      .send({ provider })
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
    Object.assign(process.env, {
      META_APP_ID: APP_ID,
      META_APP_SECRET: SECRET,
      META_OAUTH_REDIRECT_URI: REDIRECT,
      META_WEBHOOK_VERIFY_TOKEN: VERIFY,
      CHANNEL_ENCRYPTION_KEY: 'x'.repeat(40),
    });
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    const { MetaGraphProvider } = await import('../src/modules/meta/meta.graph-provider');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    app.get(MetaGraphProvider).useFetch((async (u: URL | string, init?: RequestInit) => {
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
    }) as typeof fetch);
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
    await db?.$disconnect();
    await app?.close();
  });

  it('starting needs channels:manage and returns a signed, least-privilege Meta URL', async () => {
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/start`)
      .set(await auth(ids.agent))
      .send({ provider: 'MESSENGER' })
      .expect(403);
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/start`)
      .set(await auth(ids.outsider))
      .send({ provider: 'MESSENGER' })
      .expect(404); // not a member: the workspace isn't even revealed
    const { res } = await startFlow('MESSENGER');
    const u = new URL(res.body.url);
    expect(u.hostname).toBe('www.facebook.com');
    expect(u.searchParams.get('client_id')).toBe(APP_ID);
    expect(u.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(u.searchParams.get('scope')).toBe(
      'pages_show_list,pages_messaging,pages_manage_metadata',
    );
    expect(res.text).not.toContain(SECRET);
  });

  it('the callback rejects forged, tampered and denied authorizations before any Meta call', async () => {
    const before = calls.length;
    const forged = await callback('abc.def').expect(302);
    expect(forged.headers.location).toContain('meta_error=invalid_state');
    const { state } = await startFlow('MESSENGER');
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

  it('reports missing permissions instead of connecting', async () => {
    granted = ['pages_show_list'];
    const { state } = await startFlow('MESSENGER');
    const r = await callback(state).expect(302);
    expect(r.headers.location).toContain('meta_error=missing_permissions');
    granted = [
      'pages_show_list',
      'pages_manage_metadata',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_messages',
    ];
  });

  it('Messenger: callback parks the Pages in a session; only its owner can read it; tokens never leave the server', async () => {
    const { state } = await startFlow('MESSENGER');
    const r = await callback(state).expect(302);
    const id = sessionOf(r.headers.location)!;
    expect(id).toBeTruthy();
    expect(r.headers.location).not.toContain('EAAG');
    ids.session = id;
    const s = await http()
      .get(`/api/v1/workspaces/${ids.wsA}/channels/meta/sessions/${id}`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(s.body.candidates).toEqual([
      { id: PAGE, name: 'Urban Nest Page', detail: null, taken: false },
    ]);
    expect(JSON.stringify(s.body)).not.toContain('EAAG');
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

  it('selecting a Page subscribes it, stores the token encrypted and is single-use', async () => {
    subscribeFails = true;
    const failed = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/sessions/${ids.session}/select`)
      .set(await auth(ids.owner))
      .send({ candidateId: PAGE })
      .expect(400);
    expect(failed.body.message ?? JSON.stringify(failed.body)).toMatch(/subscribe/i);
    expect(
      await db.channel.count({ where: { provider: 'MESSENGER', externalAccountId: PAGE } }),
    ).toBe(0); // nothing saved
    subscribeFails = false;
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/sessions/${ids.session}/select`)
      .set(await auth(ids.owner))
      .send({ candidateId: 'not-in-session' })
      .expect(400);
    const ok = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/sessions/${ids.session}/select`)
      .set(await auth(ids.owner))
      .send({ candidateId: PAGE })
      .expect(200);
    expect(JSON.stringify(ok.body)).not.toContain('EAAG');
    expect(ok.body).toMatchObject({
      provider: 'MESSENGER',
      status: 'CONNECTED',
      accountName: 'Urban Nest Page',
      webhookStatus: 'SUBSCRIBED',
    });
    ids.msgChannel = ok.body.id;
    const sub = calls.find(
      (c) => c.url.includes(`/${PAGE}/subscribed_apps`) && c.method === 'POST',
    );
    expect(sub?.url).toContain('subscribed_fields=messages');
    const cred = await db.channelCredential.findUniqueOrThrow({
      where: { channelId: ids.msgChannel },
    });
    expect(cred.ciphertext.startsWith('v1.')).toBe(true);
    expect(cred.ciphertext).not.toContain('EAAG');
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/sessions/${ids.session}/select`)
      .set(await auth(ids.owner))
      .send({ candidateId: PAGE })
      .expect(410); // already completed
  });

  it('a Page already connected anywhere cannot be connected again', async () => {
    const { state } = await startFlow('MESSENGER', ids.outsider, ids.wsB);
    const id = sessionOf((await callback(state).expect(302)).headers.location)!;
    const s = await http()
      .get(`/api/v1/workspaces/${ids.wsB}/channels/meta/sessions/${id}`)
      .set(await auth(ids.outsider))
      .expect(200);
    expect(s.body.candidates[0].taken).toBe(true);
    await http()
      .post(`/api/v1/workspaces/${ids.wsB}/channels/meta/sessions/${id}/select`)
      .set(await auth(ids.outsider))
      .send({ candidateId: PAGE })
      .expect(409);
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
  });

  it('Instagram: only Pages with a linked professional account are offered, shown by @username', async () => {
    withInstagram = false;
    const { MetaGraphProvider } = await import('../src/modules/meta/meta.graph-provider');
    const g = app.get(MetaGraphProvider);
    // restore the fake (the previous test replaced it)
    g.useFetch((async (u: URL | string, init?: RequestInit) => {
      calls.push({
        url: String(u),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const path = new URL(String(u)).pathname.replace(/^\/v[\d.]+\//, '');
      const json = (b: object) => new Response(JSON.stringify(b));
      if (path === 'oauth/access_token') return json({ access_token: 'EAAG-user' });
      if (path === 'me/permissions')
        return json({ data: granted.map((permission) => ({ permission, status: 'granted' })) });
      if (path === 'me/accounts')
        return json({
          data: [
            {
              id: PAGE,
              name: 'Urban Nest Page',
              access_token: 'EAAG-page',
              ...(withInstagram && {
                instagram_business_account: { id: IG, username: 'urbannest' },
              }),
            },
          ],
        });
      if (path.endsWith('/subscribed_apps')) return json({ success: true });
      if (path === 'debug_token') return json({ data: { is_valid: true, expires_at: 0 } });
      return json({});
    }) as typeof fetch);
    const none = await callback((await startFlow('INSTAGRAM')).state).expect(302);
    expect(none.headers.location).toContain('meta_error=no_accounts');
    withInstagram = true;
    const r = await callback((await startFlow('INSTAGRAM')).state).expect(302);
    const id = sessionOf(r.headers.location)!;
    const s = await http()
      .get(`/api/v1/workspaces/${ids.wsA}/channels/meta/sessions/${id}`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(s.body.candidates[0]).toMatchObject({
      id: IG,
      name: '@urbannest',
      detail: 'Linked Page: Urban Nest Page',
      taken: false,
    });
    const ok = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/meta/sessions/${id}/select`)
      .set(await auth(ids.owner))
      .send({ candidateId: IG })
      .expect(200);
    expect(ok.body).toMatchObject({ provider: 'INSTAGRAM', status: 'CONNECTED' });
    ids.igChannel = ok.body.id;
    // Instagram webhooks are keyed by the Instagram account id
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
    app
      .get(WhatsAppGraphProvider)
      .useFetch(
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
