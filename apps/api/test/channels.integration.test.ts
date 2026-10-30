import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for the Channels API. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('channels (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = () => `/api/v1/workspaces/${ids.wsA}/channels`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    const jwt = app.get(JwtService);
    auth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: 's' })}`,
    });
    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: 'x' } });
    const [owner, agent, outsider] = await Promise.all([mk('owner'), mk('agent'), mk('outsider')]);
    Object.assign(ids, { owner: owner.id, agent: agent.id, outsider: outsider.id });
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `cha-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `chb-${sfx}` } });
    Object.assign(ids, { wsA: wsA.id, wsB: wsB.id });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    const wa = await db.channel.create({
      data: {
        workspaceId: wsA.id,
        provider: 'WHATSAPP',
        displayName: 'Sales WhatsApp',
        status: 'CONNECTED',
        isSample: true,
      },
    });
    const ig = await db.channel.create({
      data: {
        workspaceId: wsA.id,
        provider: 'INSTAGRAM',
        displayName: 'Brand Instagram',
        status: 'NEEDS_ATTENTION',
        lastError: 'Authorization expired',
      },
    });
    const other = await db.channel.create({
      data: {
        workspaceId: wsB.id,
        provider: 'MESSENGER',
        displayName: 'Other tenant page',
        status: 'CONNECTED',
      },
    });
    Object.assign(ids, { wa: wa.id, ig: ig.id, other: other.id });
    const cust = await db.customer.create({
      data: { workspaceId: wsA.id, name: 'C', isSample: true },
    });
    await db.conversation.create({
      data: { workspaceId: wsA.id, channelId: wa.id, customerId: cust.id, unreadCount: 2 },
    });
    await db.conversation.create({
      data: { workspaceId: wsA.id, channelId: wa.id, customerId: cust.id, status: 'RESOLVED' },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.agent!, ids.outsider!] } } });
    await db.$disconnect();
    await app.close();
  });

  it('lists channels with real conversation stats, honest sample/health fields, and filters', async () => {
    const h = await auth(ids.agent!);
    const list = (await http().get(base()).set(h).expect(200)).body.data;
    expect(list).toHaveLength(2);
    const wa = list.find((c: { id: string }) => c.id === ids.wa);
    expect(wa).toMatchObject({
      conversationCount: 2,
      openConversations: 1,
      unreadConversations: 1,
      isSample: true,
      lastHealthCheckAt: null,
    });
    expect(list.find((c: { id: string }) => c.id === ids.ig)).toMatchObject({
      status: 'NEEDS_ATTENTION',
      lastError: 'Authorization expired',
      conversationCount: 0,
    });
    expect((await http().get(`${base()}?provider=INSTAGRAM`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?status=CONNECTED`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?q=brand`).set(h)).body.data).toHaveLength(1);
    await http().get(`${base()}?status=BOGUS`).set(h).expect(400);
  });

  it('summary does not equate a saved record with a healthy connection', async () => {
    const s = (
      await http()
        .get(`${base()}/summary`)
        .set(await auth(ids.agent!))
        .expect(200)
    ).body;
    expect(s).toMatchObject({
      total: 2,
      connected: 1,
      needsAttention: 1,
      disconnected: 0,
      sample: 1,
      conversationsLast30Days: 2,
    });
  });

  it('providers are reported as unavailable (no integration exists) with requirements', async () => {
    const p = (
      await http()
        .get(`${base()}/providers`)
        .set(await auth(ids.agent!))
        .expect(200)
    ).body.data;
    expect(p).toHaveLength(3);
    expect(p.every((x: { state: string }) => x.state === 'unavailable')).toBe(true);
    expect(p.find((x: { provider: string }) => x.provider === 'WHATSAPP').connectedCount).toBe(1);
  });

  it('isolates tenants', async () => {
    await http()
      .get(base())
      .set(await auth(ids.outsider!))
      .expect(404);
    const owner = await auth(ids.owner!);
    await http().get(`${base()}/${ids.other}`).set(owner).expect(404);
    await http()
      .patch(`${base()}/${ids.other}`)
      .set(owner)
      .send({ displayName: 'Hacked' })
      .expect(404);
    await http().post(`${base()}/${ids.other}/disconnect`).set(owner).expect(404);
    expect((await db.channel.findUniqueOrThrow({ where: { id: ids.other! } })).status).toBe(
      'CONNECTED',
    );
  });

  it('only admins/owners manage; settings are validated; changes are audited', async () => {
    const agent = await auth(ids.agent!);
    const owner = await auth(ids.owner!);
    await http().patch(`${base()}/${ids.wa}`).set(agent).send({ displayName: 'x' }).expect(403);
    await http().patch(`${base()}/${ids.wa}`).set(owner).send({}).expect(400);
    await http()
      .patch(`${base()}/${ids.wa}`)
      .set(owner)
      .send({ defaultAssigneeId: ids.outsider })
      .expect(400);
    await http()
      .patch(`${base()}/${ids.wa}`)
      .set(owner)
      .send({ defaultTeamId: ids.owner })
      .expect(400);
    const res = await http()
      .patch(`${base()}/${ids.wa}`)
      .set(owner)
      .send({ displayName: 'Support WhatsApp', defaultAssigneeId: ids.agent })
      .expect(200);
    expect(res.body).toMatchObject({
      displayName: 'Support WhatsApp',
      defaultAssignee: { id: ids.agent },
    });
    const acts = (
      await http().get(`${base()}/${ids.wa}/activity`).set(owner).expect(200)
    ).body.data.map((a: { description: string }) => a.description);
    expect(acts.some((d: string) => d.includes('Renamed'))).toBe(true);
    await http().get(`${base()}/${ids.wa}/activity`).set(agent).expect(403);
  });

  it('disconnect keeps conversation history, is audited, and cannot repeat', async () => {
    const owner = await auth(ids.owner!);
    await http()
      .post(`${base()}/${ids.wa}/disconnect`)
      .set(await auth(ids.agent!))
      .expect(403);
    const res = await http().post(`${base()}/${ids.wa}/disconnect`).set(owner).expect(200);
    expect(res.body).toMatchObject({ status: 'DISCONNECTED', conversationCount: 2 });
    expect(res.body.disconnectedAt).not.toBeNull();
    expect(await db.conversation.count({ where: { channelId: ids.wa! } })).toBe(2);
    await http().post(`${base()}/${ids.wa}/disconnect`).set(owner).expect(409);
    const acts = (await http().get(`${base()}/${ids.wa}/activity`).set(owner)).body.data.map(
      (a: { description: string }) => a.description,
    );
    expect(acts.some((d: string) => d.includes('history was kept'))).toBe(true);
  });
});
