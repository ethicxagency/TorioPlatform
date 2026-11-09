import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Real-PostgreSQL integration tests for the Inbox API (tenant isolation, actions, validation).
 * Run with TEST_DATABASE_URL pointing at a migrated database; skipped otherwise.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('inbox API (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (userId: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = () => `/api/v1/workspaces/${ids.wsA}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    const jwt = app.get(JwtService);
    auth = async (userId) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: userId, sid: 's' })}`,
    });

    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: 'x' } });
    const [owner, agent, outsider] = await Promise.all([mk('owner'), mk('agent'), mk('outsider')]);
    ids.owner = owner.id;
    ids.agent = agent.id;
    ids.outsider = outsider.id;
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `a-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `b-${sfx}` } });
    ids.wsA = wsA.id;
    ids.wsB = wsB.id;
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    const ch = await db.channel.create({
      data: { workspaceId: wsA.id, provider: 'WHATSAPP', displayName: 'WA', status: 'CONNECTED' },
    });
    const cust = await db.customer.create({
      data: { workspaceId: wsA.id, name: 'Tanvir Test', phone: '+8801700000000', isSample: true },
    });
    const conv = await db.conversation.create({
      data: {
        workspaceId: wsA.id,
        channelId: ch.id,
        customerId: cust.id,
        unreadCount: 2,
        waitingSince: new Date(Date.now() - 600_000),
        lastMessagePreview: 'price koto?',
      },
    });
    await db.message.create({
      data: { workspaceId: wsA.id, conversationId: conv.id, kind: 'INBOUND', body: 'price koto?' },
    });
    ids.conv = conv.id;
    ids.cust = cust.id;
    const chB = await db.channel.create({
      data: { workspaceId: wsB.id, provider: 'INSTAGRAM', displayName: 'IG' },
    });
    const custB = await db.customer.create({
      data: { workspaceId: wsB.id, name: 'Other Tenant', isSample: true },
    });
    const convB = await db.conversation.create({
      data: { workspaceId: wsB.id, channelId: chB.id, customerId: custB.id },
    });
    ids.convB = convB.id;
    ids.custB = custB.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.agent!, ids.outsider!] } } });
    await db.$disconnect();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('lists conversations with counts, scoped to the workspace', async () => {
    const res = await http()
      .get(`${base()}/conversations`)
      .set(await auth(ids.agent!))
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].customer.name).toBe('Tanvir Test');
    expect(res.body.counts).toEqual({ open: 1, snoozed: 0, resolved: 0 });
    // Counts follow the channel filter.
    const ig = await http()
      .get(`${base()}/conversations?channel=INSTAGRAM`)
      .set(await auth(ids.agent!))
      .expect(200);
    expect(ig.body.counts).toEqual({ open: 0, snoozed: 0, resolved: 0 });
    // Channel badges ignore the channel filter itself, so every tab shows its own number.
    const perChannel = { all: 1, WHATSAPP: 1, INSTAGRAM: 0, MESSENGER: 0 };
    expect(res.body.channelCounts).toEqual(perChannel);
    expect(ig.body.channelCounts).toEqual(perChannel);
  });

  it('filters by view, channel and search text', async () => {
    const h = await auth(ids.agent!);
    expect((await http().get(`${base()}/conversations?view=mine`).set(h)).body.data).toHaveLength(
      0,
    );
    expect(
      (await http().get(`${base()}/conversations?view=unassigned`).set(h)).body.data,
    ).toHaveLength(1);
    expect(
      (await http().get(`${base()}/conversations?channel=INSTAGRAM`).set(h)).body.data,
    ).toHaveLength(0);
    expect((await http().get(`${base()}/conversations?q=price`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}/conversations?q=zzzz`).set(h)).body.data).toHaveLength(0);
  });

  it('hides other tenants: 404 for non-members on every inbox route', async () => {
    const h = await auth(ids.outsider!);
    await http().get(`${base()}/conversations`).set(h).expect(404);
    await http().get(`${base()}/conversations/${ids.conv}`).set(h).expect(404);
    await http()
      .post(`${base()}/conversations/${ids.conv}/messages`)
      .set(h)
      .send({ body: 'hi' })
      .expect(404);
    await http().patch(`${base()}/customers/${ids.cust}`).set(h).send({ notes: 'x' }).expect(404);
  });

  it("cannot reach another tenant's records through your own workspace id", async () => {
    const h = await auth(ids.owner!);
    await http().get(`${base()}/conversations/${ids.convB}`).set(h).expect(404);
    await http().patch(`${base()}/customers/${ids.custB}`).set(h).send({ notes: 'x' }).expect(404);
    const res = await http()
      .post(`${base()}/conversations/bulk`)
      .set(h)
      .send({ ids: [ids.convB], action: 'RESOLVE' })
      .expect(200);
    expect(res.body.updated).toBe(0);
    expect((await db.conversation.findUnique({ where: { id: ids.convB! } }))?.status).toBe('OPEN');
  });

  it('sends a reply: stores it, updates preview, clears waiting', async () => {
    const h = await auth(ids.agent!);
    const res = await http()
      .post(`${base()}/conversations/${ids.conv}/messages`)
      .set(h)
      .send({ body: '  Ji, ৳1,450  ' })
      .expect(201);
    expect(res.body).toMatchObject({
      kind: 'OUTBOUND',
      body: 'Ji, ৳1,450',
      deliveryStatus: 'PENDING',
    });
    const conv = (await http().get(`${base()}/conversations/${ids.conv}`).set(h)).body;
    expect(conv.lastMessagePreview).toBe('Ji, ৳1,450');
    expect(conv.waitingSince).toBeNull();
  });

  it('internal notes do not touch the preview', async () => {
    const h = await auth(ids.agent!);
    await http()
      .post(`${base()}/conversations/${ids.conv}/messages`)
      .set(h)
      .send({ kind: 'NOTE', body: 'check stock' })
      .expect(201);
    const conv = (await http().get(`${base()}/conversations/${ids.conv}`).set(h)).body;
    expect(conv.lastMessagePreview).toBe('Ji, ৳1,450');
    const msgs = (await http().get(`${base()}/conversations/${ids.conv}/messages`).set(h)).body;
    expect(msgs.data.map((m: { kind: string }) => m.kind)).toEqual(['INBOUND', 'OUTBOUND', 'NOTE']);
  });

  it('validates message bodies on the server', async () => {
    const h = await auth(ids.agent!);
    await http()
      .post(`${base()}/conversations/${ids.conv}/messages`)
      .set(h)
      .send({ body: '   ' })
      .expect(400);
    await http()
      .post(`${base()}/conversations/${ids.conv}/messages`)
      .set(h)
      .send({ body: 'x'.repeat(4001) })
      .expect(400);
    await http()
      .post(`${base()}/conversations/${ids.conv}/messages`)
      .set(h)
      .send({ body: 'hi', replyToId: ids.owner })
      .expect(400);
  });

  it('assigns only to workspace members and records an event', async () => {
    const h = await auth(ids.agent!);
    await http()
      .patch(`${base()}/conversations/${ids.conv}`)
      .set(h)
      .send({ assigneeId: ids.outsider })
      .expect(400);
    const res = await http()
      .patch(`${base()}/conversations/${ids.conv}`)
      .set(h)
      .send({ assigneeId: ids.agent })
      .expect(200);
    expect(res.body.assignee.id).toBe(ids.agent);
    const msgs = (await http().get(`${base()}/conversations/${ids.conv}/messages`).set(h)).body
      .data;
    expect(msgs.at(-1)).toMatchObject({ kind: 'EVENT', body: 'agent assigned this to themself' });
  });

  it('snoozes (future time required), resolves, reopens, and tracks counts', async () => {
    const h = await auth(ids.agent!);
    await http()
      .patch(`${base()}/conversations/${ids.conv}`)
      .set(h)
      .send({ status: 'SNOOZED' })
      .expect(400);
    await http()
      .patch(`${base()}/conversations/${ids.conv}`)
      .set(h)
      .send({ status: 'SNOOZED', snoozedUntil: new Date(Date.now() - 1000).toISOString() })
      .expect(400);
    await http()
      .patch(`${base()}/conversations/${ids.conv}`)
      .set(h)
      .send({ status: 'SNOOZED', snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() })
      .expect(200);
    let list = (await http().get(`${base()}/conversations?status=SNOOZED`).set(h)).body;
    expect(list.data).toHaveLength(1);
    expect(list.counts).toEqual({ open: 0, snoozed: 1, resolved: 0 });
    // Badges count the requested status, so the snoozed conversation moved with it.
    expect(list.channelCounts).toMatchObject({ all: 1, WHATSAPP: 1 });
    expect(
      (await http().get(`${base()}/conversations?status=OPEN`).set(h)).body.channelCounts.all,
    ).toBe(0);
    await http()
      .patch(`${base()}/conversations/${ids.conv}`)
      .set(h)
      .send({ status: 'RESOLVED' })
      .expect(200);
    list = (await http().get(`${base()}/conversations?status=RESOLVED`).set(h)).body;
    expect(list.data[0].unreadCount).toBe(0);
    await http()
      .patch(`${base()}/conversations/${ids.conv}`)
      .set(h)
      .send({ status: 'OPEN' })
      .expect(200);
  });

  it('marks unread / read', async () => {
    const h = await auth(ids.agent!);
    expect(
      (await http().post(`${base()}/conversations/${ids.conv}/unread`).set(h).expect(200)).body
        .unreadCount,
    ).toBe(1);
    expect(
      (await http().post(`${base()}/conversations/${ids.conv}/read`).set(h).expect(200)).body
        .unreadCount,
    ).toBe(0);
  });

  it('bulk actions apply within the workspace', async () => {
    const h = await auth(ids.agent!);
    const res = await http()
      .post(`${base()}/conversations/bulk`)
      .set(h)
      .send({ ids: [ids.conv], action: 'ASSIGN_ME' })
      .expect(200);
    expect(res.body.updated).toBe(1);
    await http()
      .post(`${base()}/conversations/bulk`)
      .set(h)
      .send({ ids: [ids.conv], action: 'SNOOZE' })
      .expect(400);
  });

  it('bulk assign, unread and priority; other workspaces are skipped, not failed', async () => {
    const h = await auth(ids.agent!);
    const bulk = (body: object) => http().post(`${base()}/conversations/bulk`).set(h).send(body);
    // convB belongs to another workspace: it is not touched and not counted.
    expect(
      (
        await bulk({ ids: [ids.conv, ids.convB], action: 'ASSIGN', assigneeId: ids.owner }).expect(
          200,
        )
      ).body.updated,
    ).toBe(1);
    await bulk({ ids: [ids.conv], action: 'ASSIGN', assigneeId: ids.outsider }).expect(400);
    await bulk({ ids: [ids.conv], action: 'ASSIGN' }).expect(400);
    await bulk({ ids: [ids.conv], action: 'SET_PRIORITY' }).expect(400);
    await bulk({ ids: [ids.conv], action: 'SET_PRIORITY', priority: 'HIGH' }).expect(200);
    await bulk({ ids: [ids.conv], action: 'MARK_READ' }).expect(200);
    expect((await bulk({ ids: [ids.conv], action: 'MARK_UNREAD' }).expect(200)).body.updated).toBe(
      1,
    );
    let conv = await db.conversation.findUniqueOrThrow({ where: { id: ids.conv } });
    expect(conv).toMatchObject({ assigneeId: ids.owner, priority: 'HIGH', unreadCount: 1 });
    await bulk({ ids: [ids.conv], action: 'ASSIGN', assigneeId: null }).expect(200);
    await bulk({ ids: [ids.conv], action: 'SET_PRIORITY', priority: 'NORMAL' }).expect(200);
    conv = await db.conversation.findUniqueOrThrow({ where: { id: ids.conv } });
    expect(conv).toMatchObject({ assigneeId: null, priority: 'NORMAL' });
    expect(
      (await db.conversation.findUniqueOrThrow({ where: { id: ids.convB } })).assigneeId,
    ).toBeNull();
    // Leave the conversation as the earlier bulk test did, for the tests that follow.
    await bulk({ ids: [ids.conv], action: 'ASSIGN_ME' }).expect(200);
  });

  it('updates customer lead status, tags (deduped) and notes', async () => {
    const h = await auth(ids.agent!);
    const res = await http()
      .patch(`${base()}/customers/${ids.cust}`)
      .set(h)
      .send({ leadStatus: 'INTERESTED', tags: ['VIP', 'VIP', 'COD'], notes: 'prefers Sage' })
      .expect(200);
    expect(res.body).toMatchObject({
      leadStatus: 'INTERESTED',
      tags: ['VIP', 'COD'],
      notes: 'prefers Sage',
    });
    // The workspace tag list is distinct and sorted, and never includes other workspaces' tags.
    await db.customer.update({ where: { id: ids.custB }, data: { tags: ['OTHER_WS'] } });
    const tags = await http().get(`${base()}/customers/tags`).set(h).expect(200);
    expect(tags.body.data).toEqual(['COD', 'VIP']);
    expect((await http().get(`${base()}/conversations?tag=VIP`).set(h)).body.data).toHaveLength(1);
    await http()
      .patch(`${base()}/customers/${ids.cust}`)
      .set(h)
      .send({ leadStatus: 'BOGUS' })
      .expect(400);
  });

  it('saved replies: agents read, only admins/owners manage', async () => {
    const agent = await auth(ids.agent!);
    const owner = await auth(ids.owner!);
    const body = { shortcut: '/price', title: 'Price', body: 'Hi {name}, it is ৳1,450' };
    await http().post(`${base()}/saved-replies`).set(agent).send(body).expect(403);
    const created = await http().post(`${base()}/saved-replies`).set(owner).send(body).expect(201);
    await http().post(`${base()}/saved-replies`).set(owner).send(body).expect(409);
    await http()
      .post(`${base()}/saved-replies`)
      .set(owner)
      .send({ ...body, shortcut: 'nope' })
      .expect(400);
    expect((await http().get(`${base()}/saved-replies`).set(agent)).body).toHaveLength(1);
    await http().delete(`${base()}/saved-replies/${created.body.id}`).set(owner).expect(204);
  });

  it('searches conversations and customers within the workspace only', async () => {
    const h = await auth(ids.owner!);
    const res = await http().get(`${base()}/search?q=tanvir`).set(h).expect(200);
    expect(res.body.customers[0].name).toBe('Tanvir Test');
    expect(res.body.conversations).toHaveLength(1);
    expect(
      (await http().get(`${base()}/search?q=Other%20Tenant`).set(h)).body.customers,
    ).toHaveLength(0);
  });
});
