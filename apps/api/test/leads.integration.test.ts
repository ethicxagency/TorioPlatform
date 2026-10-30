import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for the Leads API. Run with TEST_DATABASE_URL (migrated DB); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('leads API (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = () => `/api/v1/workspaces/${ids.wsA}/leads`;
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
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `la-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `lb-${sfx}` } });
    Object.assign(ids, { wsA: wsA.id, wsB: wsB.id });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    const leadB = await db.lead.create({
      data: { workspaceId: wsB.id, name: 'Other Tenant Lead', email: 'shared@example.test' },
    });
    ids.leadB = leadB.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.agent!, ids.outsider!] } } });
    await db.$disconnect();
    await app.close();
  });

  it('creates a lead with a rules-based score and a CREATED activity', async () => {
    const h = await auth(ids.agent!);
    const res = await http()
      .post(base())
      .set(h)
      .send({
        name: 'Tanvir Test',
        email: 'Tanvir@Example.test',
        phone: '+880 1712-345678',
        company: 'Acme',
        tags: ['vip', 'vip'],
      })
      .expect(201);
    expect(res.body).toMatchObject({
      name: 'Tanvir Test',
      email: 'tanvir@example.test',
      stage: 'NEW',
      source: 'MANUAL',
      score: 40,
      tags: ['vip'],
    });
    ids.lead = res.body.id;
    const acts = (await http().get(`${base()}/${ids.lead}/activities`).set(h).expect(200)).body
      .data;
    expect(acts[0]).toMatchObject({ type: 'CREATED' });
  });

  it('validates input with field-level errors', async () => {
    const h = await auth(ids.agent!);
    const res = await http()
      .post(base())
      .set(h)
      .send({ name: '', email: 'nope', phone: 'abc' })
      .expect(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'email',
      'name',
      'phone',
    ]);
  });

  it('rejects duplicate email (case-insensitive) and duplicate phone within a workspace, but not across tenants', async () => {
    const h = await auth(ids.agent!);
    await http()
      .post(base())
      .set(h)
      .send({ name: 'Dup', email: 'TANVIR@example.test' })
      .expect(409);
    await http().post(base()).set(h).send({ name: 'Dup', phone: '8801712345678' }).expect(409);
    await http()
      .post(base())
      .set(h)
      .send({ name: 'Same email, other tenant', email: 'shared@example.test' })
      .expect(201);
  });

  it('lists with search, filters, sort and pagination', async () => {
    const h = await auth(ids.agent!);
    await http()
      .post(base())
      .set(h)
      .send({ name: 'Second Lead', company: 'Globex', source: 'WHATSAPP', stage: 'QUALIFIED' })
      .expect(201);
    const all = (await http().get(base()).set(h)).body;
    expect(all.meta.total).toBe(3);
    expect((await http().get(`${base()}?q=globex`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?q=1712345`).set(h)).body.data).toHaveLength(1); // phone digits
    expect((await http().get(`${base()}?stages=QUALIFIED,WON`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?sources=WHATSAPP`).set(h)).body.data[0].name).toBe(
      'Second Lead',
    );
    expect((await http().get(`${base()}?owner=unassigned`).set(h)).body.data).toHaveLength(3);
    expect((await http().get(`${base()}?tag=vip`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?minScore=30`).set(h)).body.data.length).toBeGreaterThan(0);
    const sorted = (await http().get(`${base()}?sort=name&dir=asc&pageSize=2&page=1`).set(h)).body;
    expect(sorted.data).toHaveLength(2);
    expect(sorted.meta).toMatchObject({ total: 3, totalPages: 2 });
    await http().get(`${base()}?stages=BOGUS`).set(h).expect(400);
  });

  it('summary counts leads honestly', async () => {
    const s = (
      await http()
        .get(`${base()}/summary`)
        .set(await auth(ids.agent!))
        .expect(200)
    ).body;
    expect(s).toMatchObject({
      total: 3,
      new: 2,
      qualified: 1,
      unassigned: 3,
      won: 0,
      lost: 0,
      conversionRate: null,
      createdLast30Days: 3,
      createdPrevious30Days: 0,
    });
  });

  it('updates stage/owner, recomputes score, records activities, validates owner membership', async () => {
    const h = await auth(ids.agent!);
    await http().patch(`${base()}/${ids.lead}`).set(h).send({ ownerId: ids.outsider }).expect(400);
    const res = await http()
      .patch(`${base()}/${ids.lead}`)
      .set(h)
      .send({ stage: 'PROPOSAL', ownerId: ids.agent, dealValue: 5000 })
      .expect(200);
    expect(res.body).toMatchObject({
      stage: 'PROPOSAL',
      owner: { id: ids.agent },
      dealValue: 5000,
      score: 80,
    });
    const acts = (await http().get(`${base()}/${ids.lead}/activities`).set(h)).body.data.map(
      (a: { type: string }) => a.type,
    );
    expect(acts).toEqual(expect.arrayContaining(['STAGE_CHANGED', 'OWNER_CHANGED', 'CREATED']));
    await http()
      .patch(`${base()}/${ids.lead}`)
      .set(h)
      .send({ email: 'tanvir@example.test' })
      .expect(200);
  });

  it('adds notes to the timeline', async () => {
    const h = await auth(ids.agent!);
    await http().post(`${base()}/${ids.lead}/notes`).set(h).send({ body: '   ' }).expect(400);
    const res = await http()
      .post(`${base()}/${ids.lead}/notes`)
      .set(h)
      .send({ body: 'Called, wants a quote' })
      .expect(201);
    expect(res.body.data[0]).toMatchObject({ type: 'NOTE', body: 'Called, wants a quote' });
  });

  it('isolates tenants: non-members get 404; ids from other workspaces are unreachable', async () => {
    await http()
      .get(base())
      .set(await auth(ids.outsider!))
      .expect(404);
    const h = await auth(ids.owner!);
    await http().get(`${base()}/${ids.leadB}`).set(h).expect(404);
    await http().patch(`${base()}/${ids.leadB}`).set(h).send({ name: 'x' }).expect(404);
    await http().delete(`${base()}/${ids.leadB}`).set(h).expect(404);
    const res = await http()
      .post(`${base()}/bulk`)
      .set(h)
      .send({ ids: [ids.leadB], action: 'SET_STAGE', stage: 'WON' })
      .expect(200);
    expect(res.body.updated).toBe(0);
    expect((await db.lead.findUnique({ where: { id: ids.leadB! } }))?.stage).toBe('NEW');
  });

  it('bulk actions: assign, stage, tags; delete requires leads:delete', async () => {
    const agent = await auth(ids.agent!);
    const owner = await auth(ids.owner!);
    const list = (await http().get(`${base()}?pageSize=100`).set(agent)).body.data as {
      id: string;
    }[];
    const lead = list.map((l) => l.id);
    expect(
      (
        await http()
          .post(`${base()}/bulk`)
          .set(agent)
          .send({ ids: lead, action: 'ASSIGN', ownerId: ids.agent })
          .expect(200)
      ).body.updated,
    ).toBe(3);
    expect(
      (
        await http()
          .post(`${base()}/bulk`)
          .set(agent)
          .send({ ids: lead, action: 'ADD_TAGS', tags: ['bulk'] })
          .expect(200)
      ).body.updated,
    ).toBe(3);
    await http()
      .post(`${base()}/bulk`)
      .set(agent)
      .send({ ids: lead, action: 'SET_STAGE', stage: 'WON' })
      .expect(200);
    await http()
      .post(`${base()}/bulk`)
      .set(agent)
      .send({ ids: lead, action: 'SET_STAGE' })
      .expect(400);
    await http()
      .post(`${base()}/bulk`)
      .set(agent)
      .send({ ids: lead, action: 'DELETE' })
      .expect(403);
    await http().delete(`${base()}/${lead[0]}`).set(agent).expect(403);
    const s = (await http().get(`${base()}/summary`).set(agent)).body;
    expect(s).toMatchObject({ won: 3, conversionRate: 1, unassigned: 0 });
    // restore for later tests
    await http()
      .post(`${base()}/bulk`)
      .set(owner)
      .send({ ids: lead, action: 'SET_STAGE', stage: 'NEW' })
      .expect(200);
  });

  it('links a lead to an Inbox customer and exposes the conversation', async () => {
    const ch = await db.channel.create({
      data: { workspaceId: ids.wsA!, provider: 'WHATSAPP', displayName: 'WA' },
    });
    const cust = await db.customer.create({
      data: { workspaceId: ids.wsA!, name: 'Linked Cust', isSample: true },
    });
    const conv = await db.conversation.create({
      data: { workspaceId: ids.wsA!, channelId: ch.id, customerId: cust.id },
    });
    const h = await auth(ids.agent!);
    const res = await http()
      .post(base())
      .set(h)
      .send({ name: 'Linked Lead', customerId: cust.id })
      .expect(201);
    expect(res.body.conversationId).toBe(conv.id);
    const otherCust = await db.customer.create({
      data: { workspaceId: ids.wsB!, name: 'Foreign', isSample: true },
    });
    await http()
      .post(base())
      .set(h)
      .send({ name: 'Bad link', customerId: otherCust.id })
      .expect(400);
  });

  it('exports CSV (filtered / selected) with formula-injection protection', async () => {
    const h = await auth(ids.agent!);
    await http()
      .post(base())
      .set(h)
      .send({ name: '=HYPERLINK("http://x")', email: 'csv@example.test' })
      .expect(201);
    const res = await http().get(`${base()}/export?q=csv`).set(h).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(res.text.split('\r\n').filter(Boolean)).toHaveLength(2);
    expect(
      (
        await http()
          .get(`${base()}/export`)
          .set(await auth(ids.outsider!))
      ).status,
    ).toBe(404);
  });

  it('imports rows: validates, skips duplicates, reports row errors', async () => {
    const h = await auth(ids.agent!);
    const res = await http()
      .post(`${base()}/import`)
      .set(h)
      .send({
        rows: [
          {
            name: 'Imp One',
            email: 'imp1@example.test',
            source: 'website',
            tags: 'a;b',
            dealValue: '৳1,200',
          },
          { name: 'Imp Dup', email: 'imp1@example.test' },
          { name: '', email: 'bad' },
        ],
      })
      .expect(200);
    expect(res.body).toMatchObject({ created: 1, skipped: 1 });
    expect(res.body.errors.map((e: { row: number }) => e.row)).toEqual([2, 3]);
    const created = (await http().get(`${base()}?q=imp1`).set(h)).body.data[0];
    expect(created).toMatchObject({ source: 'WEBSITE', tags: ['a', 'b'], dealValue: 1200 });
  });

  it('owners can delete leads', async () => {
    const h = await auth(ids.owner!);
    const id = (await http().get(`${base()}?q=Second`).set(h)).body.data[0].id;
    await http().delete(`${base()}/${id}`).set(h).expect(204);
    await http().get(`${base()}/${id}`).set(h).expect(404);
  });
});
