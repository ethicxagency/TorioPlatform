import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for the Customers API. Run with TEST_DATABASE_URL (migrated DB); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('customers API (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = () => `/api/v1/workspaces/${ids.wsA}/customers`;
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
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `ca-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `cb-${sfx}` } });
    Object.assign(ids, { wsA: wsA.id, wsB: wsB.id });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    const custB = await db.customer.create({
      data: {
        workspaceId: wsB.id,
        name: 'Other Tenant',
        email: 'shared@example.test',
        isSample: true,
      },
    });
    ids.custB = custB.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.agent!, ids.outsider!] } } });
    await db.$disconnect();
    await app.close();
  });

  it('creates a customer (normalised email, deduped tags) and validates input', async () => {
    const h = await auth(ids.agent!);
    const res = await http()
      .post(base())
      .set(h)
      .send({
        name: 'Nusrat Test',
        email: 'Nusrat@Example.test',
        phone: '+880 1898-221340',
        company: 'Acme',
        tags: ['vip', 'vip'],
        source: 'INSTAGRAM',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      name: 'Nusrat Test',
      email: 'nusrat@example.test',
      status: 'ACTIVE',
      source: 'INSTAGRAM',
      tags: ['vip'],
      conversationCount: 0,
      conversationId: null,
    });
    ids.cust = res.body.id;
    const bad = await http()
      .post(base())
      .set(h)
      .send({ name: '', email: 'x', phone: 'abc' })
      .expect(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'email',
      'name',
      'phone',
    ]);
  });

  it('rejects duplicates per workspace, never merging, but allows the same email in another tenant', async () => {
    const h = await auth(ids.agent!);
    await http()
      .post(base())
      .set(h)
      .send({ name: 'Dup', email: 'NUSRAT@example.test' })
      .expect(409);
    await http().post(base()).set(h).send({ name: 'Dup', phone: '8801898221340' }).expect(409);
    await http()
      .post(base())
      .set(h)
      .send({ name: 'Cross tenant', email: 'shared@example.test' })
      .expect(201);
  });

  it('lists with search, filters, segments, sorting and pagination', async () => {
    const h = await auth(ids.agent!);
    await http()
      .post(base())
      .set(h)
      .send({ name: 'Imran Second', company: 'Globex', status: 'INACTIVE', source: 'WHATSAPP' })
      .expect(201);
    const all = (await http().get(base()).set(h)).body;
    expect(all.meta.total).toBe(3);
    expect((await http().get(`${base()}?q=globex`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?q=1898221`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?status=INACTIVE`).set(h)).body.data).toHaveLength(1);
    expect(
      (await http().get(`${base()}?sources=INSTAGRAM,WHATSAPP`).set(h)).body.data,
    ).toHaveLength(2);
    expect((await http().get(`${base()}?owner=unassigned`).set(h)).body.data).toHaveLength(3);
    expect((await http().get(`${base()}?tag=vip`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?segment=tagged`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?segment=new`).set(h)).body.data).toHaveLength(3);
    expect((await http().get(`${base()}?segment=recent`).set(h)).body.data).toHaveLength(0);
    expect((await http().get(`${base()}?segment=inactive`).set(h)).body.data).toHaveLength(3); // no conversations in 90 days
    const sorted = (await http().get(`${base()}?sort=name&dir=asc&pageSize=2`).set(h)).body;
    expect(sorted.data).toHaveLength(2);
    expect(sorted.meta).toMatchObject({ total: 3, totalPages: 2 });
    await http().get(`${base()}?segment=bogus`).set(h).expect(400);
  });

  it('summary reports real counts only', async () => {
    const s = (
      await http()
        .get(`${base()}/summary`)
        .set(await auth(ids.agent!))
        .expect(200)
    ).body;
    expect(s).toEqual({
      total: 3,
      active: 2,
      withConversations: 0,
      createdLast30Days: 3,
      createdPrevious30Days: 0,
    });
  });

  it('updates fields incl. owner (member only) and keeps the Inbox-era fields working', async () => {
    const h = await auth(ids.agent!);
    await http().patch(`${base()}/${ids.cust}`).set(h).send({ ownerId: ids.outsider }).expect(400);
    const res = await http()
      .patch(`${base()}/${ids.cust}`)
      .set(h)
      .send({
        ownerId: ids.agent,
        leadStatus: 'INTERESTED',
        notes: 'prefers Sage',
        address: 'Dhaka',
        status: 'INACTIVE',
      })
      .expect(200);
    expect(res.body).toMatchObject({
      owner: { id: ids.agent },
      leadStatus: 'INTERESTED',
      notes: 'prefers Sage',
      address: 'Dhaka',
      status: 'INACTIVE',
    });
    await http()
      .patch(`${base()}/${ids.cust}`)
      .set(h)
      .send({ status: 'ACTIVE', email: 'nusrat@example.test' })
      .expect(200);
    await http().patch(`${base()}/${ids.cust}`).set(h).send({ leadStatus: 'BOGUS' }).expect(400);
  });

  it('isolates tenants (404 for non-members and for ids from other workspaces)', async () => {
    await http()
      .get(base())
      .set(await auth(ids.outsider!))
      .expect(404);
    const h = await auth(ids.owner!);
    await http().get(`${base()}/${ids.custB}`).set(h).expect(404);
    await http().patch(`${base()}/${ids.custB}`).set(h).send({ name: 'x' }).expect(404);
    await http().delete(`${base()}/${ids.custB}`).set(h).expect(404);
    await http().post(`${base()}/${ids.custB}/notes`).set(h).send({ body: 'x' }).expect(404);
    expect(
      (
        await http()
          .post(`${base()}/bulk`)
          .set(h)
          .send({ ids: [ids.custB], action: 'ADD_TAGS', tags: ['x'] })
          .expect(200)
      ).body.updated,
    ).toBe(0);
    expect((await db.customer.findUnique({ where: { id: ids.custB! } }))?.tags).toEqual([]);
  });

  it('notes: add, edit own only, delete own or moderate', async () => {
    const agent = await auth(ids.agent!);
    const owner = await auth(ids.owner!);
    await http().post(`${base()}/${ids.cust}/notes`).set(agent).send({ body: '  ' }).expect(400);
    const added = (
      await http()
        .post(`${base()}/${ids.cust}/notes`)
        .set(agent)
        .send({ body: 'Asked for Sage' })
        .expect(201)
    ).body.data;
    const noteId = added[0].id;
    expect(added[0]).toMatchObject({ body: 'Asked for Sage' });
    await http()
      .patch(`${base()}/${ids.cust}/notes/${noteId}`)
      .set(owner)
      .send({ body: 'hijack' })
      .expect(403);
    expect(
      (
        await http()
          .patch(`${base()}/${ids.cust}/notes/${noteId}`)
          .set(agent)
          .send({ body: 'Asked for Sage v2' })
          .expect(200)
      ).body.data[0].body,
    ).toBe('Asked for Sage v2');
    await http()
      .post(`${base()}/${ids.cust}/notes`)
      .set(owner)
      .send({ body: 'owner note' })
      .expect(201);
    const mine = (await http().get(`${base()}/${ids.cust}/notes`).set(owner)).body.data.find(
      (n: { body: string }) => n.body === 'owner note',
    );
    await http().delete(`${base()}/${ids.cust}/notes/${mine.id}`).set(agent).expect(403); // agents cannot delete others' notes
    await http().delete(`${base()}/${ids.cust}/notes/${noteId}`).set(owner).expect(200); // owner may moderate
  });

  it('shows linked conversations and a real activity timeline', async () => {
    const ch = await db.channel.create({
      data: { workspaceId: ids.wsA!, provider: 'WHATSAPP', displayName: 'WA' },
    });
    const conv = await db.conversation.create({
      data: {
        workspaceId: ids.wsA!,
        channelId: ch.id,
        customerId: ids.cust!,
        lastMessagePreview: 'price koto?',
      },
    });
    const h = await auth(ids.agent!);
    const one = (await http().get(`${base()}/${ids.cust}`).set(h)).body;
    expect(one).toMatchObject({ conversationCount: 1, conversationId: conv.id });
    const convs = (await http().get(`${base()}/${ids.cust}/conversations`).set(h)).body.data;
    expect(convs[0]).toMatchObject({ id: conv.id, provider: 'WHATSAPP', preview: 'price koto?' });
    const types = (await http().get(`${base()}/${ids.cust}/activity`).set(h)).body.data.map(
      (e: { type: string }) => e.type,
    );
    expect(types).toEqual(expect.arrayContaining(['CREATED', 'CONVERSATION']));
    expect((await http().get(`${base()}/summary`).set(h)).body.withConversations).toBe(1);
    expect((await http().get(`${base()}?segment=recent`).set(h)).body.data).toHaveLength(1);
  });

  it('refuses to delete customers with conversations; deletes others (owner/admin only)', async () => {
    const owner = await auth(ids.owner!);
    const agent = await auth(ids.agent!);
    await http().delete(`${base()}/${ids.cust}`).set(owner).expect(409);
    const extra = (await http().post(base()).set(owner).send({ name: 'Disposable' }).expect(201))
      .body.id;
    await http().delete(`${base()}/${extra}`).set(agent).expect(403);
    await http().delete(`${base()}/${extra}`).set(owner).expect(204);
    await http().get(`${base()}/${extra}`).set(owner).expect(404);
  });

  it('bulk: add/remove tags, assign, status; validates bodies', async () => {
    const h = await auth(ids.agent!);
    const list = (await http().get(`${base()}?pageSize=100`).set(h)).body.data as { id: string }[];
    const all = list.map((c) => c.id);
    expect(
      (
        await http()
          .post(`${base()}/bulk`)
          .set(h)
          .send({ ids: all, action: 'ADD_TAGS', tags: ['bulk'] })
          .expect(200)
      ).body.updated,
    ).toBe(all.length);
    expect((await http().get(`${base()}?tag=bulk`).set(h)).body.data).toHaveLength(all.length);
    await http()
      .post(`${base()}/bulk`)
      .set(h)
      .send({ ids: all, action: 'REMOVE_TAGS', tags: ['bulk'] })
      .expect(200);
    expect((await http().get(`${base()}?tag=bulk`).set(h)).body.data).toHaveLength(0);
    expect(
      (
        await http()
          .post(`${base()}/bulk`)
          .set(h)
          .send({ ids: all, action: 'ASSIGN', ownerId: ids.agent })
          .expect(200)
      ).body.updated,
    ).toBe(all.length);
    await http()
      .post(`${base()}/bulk`)
      .set(h)
      .send({ ids: all, action: 'SET_STATUS', status: 'INACTIVE' })
      .expect(200);
    await http().post(`${base()}/bulk`).set(h).send({ ids: all, action: 'SET_STATUS' }).expect(400);
    await http()
      .post(`${base()}/bulk`)
      .set(h)
      .send({ ids: all, action: 'ASSIGN', ownerId: ids.outsider })
      .expect(400);
  });

  it('exports CSV (selected/filtered) with formula-injection protection, workspace-scoped', async () => {
    const h = await auth(ids.agent!);
    await http()
      .post(base())
      .set(h)
      .send({ name: '=cmd|calc', email: 'csv@example.test' })
      .expect(201);
    const res = await http().get(`${base()}/export?q=csv`).set(h).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain("'=cmd|calc");
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
          { name: 'Imp One', email: 'imp1@example.test', source: 'website', tags: 'a;b' },
          { name: 'Imp Dup', email: 'IMP1@example.test' },
          { name: '', email: 'bad' },
        ],
      })
      .expect(200);
    expect(res.body).toMatchObject({ created: 1, skipped: 1 });
    expect(res.body.errors.map((e: { row: number }) => e.row)).toEqual([2, 3]);
    expect((await http().get(`${base()}?q=imp1`).set(h)).body.data[0]).toMatchObject({
      source: 'WEBSITE',
      tags: ['a', 'b'],
    });
  });
});
