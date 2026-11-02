import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for the WhatsApp Cloud API layer. The Graph API is replaced by a fake fetch. */
const url = process.env.TEST_DATABASE_URL;
const SECRET = 'meta-app-secret-for-tests';
const VERIFY = 'verify-token-for-tests';

describe.skipIf(!url)('whatsapp (real PostgreSQL, fake Graph API)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id?: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const calls: { url: string; body: unknown }[] = [];
  let graphMode: 'ok' | 'expired' = 'ok';
  const PNID =
    `${Date.now()}`.slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const http = () => request(app.getHttpServer());
  const sign = (raw: string) => `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
  const hook = (payload: object, signature?: string) => {
    const raw = JSON.stringify(payload);
    return http()
      .post('/api/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature ?? sign(raw))
      .send(raw);
  };
  const inboundPayload = (id: string, from: string, body: string, ts = Date.now()) => ({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: PNID },
              contacts: [{ wa_id: from, profile: { name: 'Rafi' } }],
              messages: [
                {
                  id,
                  from,
                  timestamp: String(Math.floor(ts / 1000)),
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const statusPayload = (id: string, status: string, errors?: object[]) => ({
    entry: [
      {
        changes: [
          { value: { metadata: { phone_number_id: PNID }, statuses: [{ id, status, errors }] } },
        ],
      },
    ],
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    Object.assign(process.env, {
      META_APP_SECRET: SECRET,
      META_WEBHOOK_VERIFY_TOKEN: VERIFY,
      CHANNEL_ENCRYPTION_KEY: 'x'.repeat(40),
    });
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    const { WhatsAppGraphProvider } =
      await import('../src/modules/whatsapp/whatsapp.graph-provider');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    app.get(WhatsAppGraphProvider).useFetch((async (u: string, init?: RequestInit) => {
      calls.push({ url: String(u), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (graphMode === 'expired')
        return new Response(JSON.stringify({ error: { message: 'Token expired', code: 190 } }), {
          status: 401,
        });
      if (String(u).includes('/messages'))
        return new Response(
          JSON.stringify({ messages: [{ id: `wamid.${sfx}.out-${calls.length}` }] }),
        );
      return new Response(
        JSON.stringify({
          id: PNID,
          display_phone_number: '+880 1700-000000',
          verified_name: 'Urban Nest',
          quality_rating: 'GREEN',
        }),
      );
    }) as typeof fetch);
    db = createPrismaClient(url!);
    const jwt = app.get(JwtService);
    auth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: 's' })}`,
    });
    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: 'x' } });
    const [owner, agent, outsider] = await Promise.all([mk('owner'), mk('agent'), mk('outsider')]);
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `waa-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `wab-${sfx}` } });
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

  it('webhook verification checks the verify token', async () => {
    const q = (t: string) =>
      http().get(
        `/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=12345`,
      );
    expect((await q(VERIFY)).text).toBe('12345');
    await q('wrong').expect(403);
  });

  it('rejects unsigned and wrongly signed webhooks', async () => {
    await hook(inboundPayload(`wamid.${sfx}.x`, '8801', 'hi'), 'sha256=00').expect(403);
    await http()
      .post('/api/v1/webhooks/whatsapp')
      .send(inboundPayload(`wamid.${sfx}.y`, '8801', 'hi'))
      .expect(403);
  });

  it('connects a number only through Meta, encrypts the token and never returns it', async () => {
    const body = {
      displayName: 'Sales',
      phoneNumberId: PNID,
      accessToken: 'EAAG-secret-token-value-123456',
    };
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/whatsapp/connect`)
      .set(await auth(ids.agent))
      .send(body)
      .expect(403);
    const res = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/whatsapp/connect`)
      .set(await auth(ids.owner))
      .send(body)
      .expect(201);
    expect(JSON.stringify(res.body)).not.toContain('EAAG');
    expect(res.body.status).toBe('CONNECTED');
    ids.channel = res.body.id;
    const cred = await db.channelCredential.findUniqueOrThrow({
      where: { channelId: ids.channel },
    });
    expect(cred.ciphertext.startsWith('v1.')).toBe(true);
    expect(cred.ciphertext).not.toContain('EAAG');
    // the same number cannot be connected twice, in this or another workspace
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/whatsapp/connect`)
      .set(await auth(ids.owner))
      .send(body)
      .expect(409);
    await http()
      .post(`/api/v1/workspaces/${ids.wsB}/channels/whatsapp/connect`)
      .set(await auth(ids.outsider))
      .send(body)
      .expect(409);
  });

  it('ingests an inbound message into the Inbox and ignores a redelivery', async () => {
    const p = inboundPayload(`wamid.${sfx}.in-1`, '8801711111111', 'Hello, is this in stock?');
    const first = await hook(p).expect(200);
    expect(first.body.processed).toBe(1);
    const again = await hook(p).expect(200);
    expect(again.body).toMatchObject({ processed: 0, duplicates: 1 });
    const msgs = await db.message.findMany({
      where: { workspaceId: ids.wsA, externalId: `wamid.${sfx}.in-1` },
    });
    expect(msgs).toHaveLength(1);
    const conv = await db.conversation.findUniqueOrThrow({
      where: { id: msgs[0]!.conversationId },
      include: { customer: true },
    });
    expect(conv.customer).toMatchObject({
      name: 'Rafi',
      phoneKey: '8801711111111',
      source: 'WHATSAPP',
    });
    expect(conv).toMatchObject({ unreadCount: 1, channelId: ids.channel });
    expect(conv.lastInboundAt).not.toBeNull();
    ids.conv = conv.id;
    ids.customer = conv.customerId;
    // a second message from the same customer joins the same open conversation
    await hook(inboundPayload(`wamid.${sfx}.in-2`, '8801711111111', 'Hello?')).expect(200);
    expect(await db.conversation.count({ where: { customerId: ids.customer } })).toBe(1);
    expect(
      await db.customer.count({ where: { workspaceId: ids.wsA, phoneKey: '8801711111111' } }),
    ).toBe(1);
  });

  it('ignores events for numbers that are not connected', async () => {
    const p = inboundPayload(`wamid.${sfx}.ghost`, '8801', 'x');
    p.entry[0]!.changes[0]!.value.metadata.phone_number_id = '999999999';
    const r = await hook(p).expect(200);
    expect(r.body.ignored).toBe(1);
    expect(await db.message.count({ where: { externalId: `wamid.${sfx}.ghost` } })).toBe(0);
  });

  it('sends an agent reply through WhatsApp inside the 24-hour window and tracks status', async () => {
    const res = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/conversations/${ids.conv}/messages`)
      .set(await auth(ids.owner))
      .send({ body: 'Yes, in stock!' })
      .expect(201);
    expect(res.body.deliveryStatus).toBe('SENT');
    const sent = calls.at(-1)!;
    expect(sent.url).toContain(`/${PNID}/messages`);
    expect(sent.body).toMatchObject({
      to: '8801711111111',
      type: 'text',
      text: { body: 'Yes, in stock!' },
    });
    const wamid = (await db.message.findUniqueOrThrow({ where: { id: res.body.id } })).externalId!;
    await hook(statusPayload(wamid, 'read')).expect(200);
    await hook(statusPayload(wamid, 'delivered')).expect(200); // late, must not move backwards
    expect(
      (await db.message.findUniqueOrThrow({ where: { id: res.body.id } })).deliveryStatus,
    ).toBe('READ');
    ids.sentMsg = res.body.id;
  });

  it('records failed deliveries with the provider reason', async () => {
    const m = await db.message.create({
      data: {
        workspaceId: ids.wsA!,
        conversationId: ids.conv!,
        kind: 'OUTBOUND',
        body: 'x',
        deliveryStatus: 'SENT',
        externalId: `wamid.${sfx}.fail-1`,
      },
    });
    await hook(
      statusPayload(`wamid.${sfx}.fail-1`, 'failed', [
        { code: 131047, message: 'Re-engagement message' },
      ]),
    ).expect(200);
    const row = await db.message.findUniqueOrThrow({ where: { id: m.id } });
    expect(row).toMatchObject({ deliveryStatus: 'FAILED', errorMessage: 'Re-engagement message' });
  });

  it('blocks free-form replies once the 24-hour window has closed, and retry stays blocked', async () => {
    await db.conversation.update({
      where: { id: ids.conv },
      data: { lastInboundAt: new Date(Date.now() - 25 * 3600_000) },
    });
    const before = calls.length;
    const res = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/conversations/${ids.conv}/messages`)
      .set(await auth(ids.owner))
      .send({ body: 'Late reply' })
      .expect(201);
    expect(res.body.deliveryStatus).toBe('FAILED');
    expect(res.body.failureReason).toMatch(/24-hour/);
    expect(calls.length).toBe(before); // nothing was sent to Meta
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/messages/${res.body.id}/retry`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(calls.length).toBe(before);
  });

  it('honours STOP and START opt-out keywords', async () => {
    await db.conversation.update({ where: { id: ids.conv }, data: { lastInboundAt: new Date() } });
    await hook(inboundPayload(`wamid.${sfx}.stop`, '8801711111111', 'STOP')).expect(200);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: ids.customer } })).messagingOptOutAt,
    ).not.toBeNull();
    const before = calls.length;
    const res = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/conversations/${ids.conv}/messages`)
      .set(await auth(ids.owner))
      .send({ body: 'Promo!' })
      .expect(201);
    expect(res.body).toMatchObject({ deliveryStatus: 'FAILED' });
    expect(res.body.failureReason).toMatch(/opted out/);
    expect(calls.length).toBe(before);
    await hook(inboundPayload(`wamid.${sfx}.start`, '8801711111111', 'START')).expect(200);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: ids.customer } })).messagingOptOutAt,
    ).toBeNull();
  });

  it('does not resend a message that already has a provider id', async () => {
    const before = calls.length;
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/messages/${ids.sentMsg}/retry`)
      .set(await auth(ids.owner))
      .expect(400);
    expect(calls.length).toBe(before);
  });

  it('health check reports Meta’s answer and marks an expired token', async () => {
    const ok = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/${ids.channel}/health`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(ok.body).toMatchObject({ ok: true, qualityRating: 'GREEN' });
    graphMode = 'expired';
    const bad = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/${ids.channel}/health`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(bad.body.ok).toBe(false);
    expect((await db.channel.findUniqueOrThrow({ where: { id: ids.channel } })).status).toBe(
      'EXPIRED',
    );
    graphMode = 'ok';
  });

  it('keeps tenants apart', async () => {
    await http()
      .post(`/api/v1/workspaces/${ids.wsB}/channels/${ids.channel}/health`)
      .set(await auth(ids.outsider))
      .expect(400);
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/channels/${ids.channel}/health`)
      .set(await auth(ids.outsider))
      .expect(404); // non-members can't even tell the workspace exists
  });
});
