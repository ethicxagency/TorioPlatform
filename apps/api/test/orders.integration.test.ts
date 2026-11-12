import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for the Orders API. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('orders (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = () => `/api/v1/workspaces/${ids.wsA}/orders`;
  const http = () => request(app.getHttpServer());
  const item = (name: string, quantity = 1, unitPriceMinor = 1_000) => ({
    name,
    quantity,
    unitPriceMinor,
  });
  const body = (over: Record<string, unknown> = {}) => ({
    customerId: ids.cust,
    currency: 'USD',
    items: [item('Linen sofa', 2, 25_000), item('Cushion', 3, 1_500)],
    discountMinor: 1_000,
    shippingMinor: 2_000,
    taxMinor: 500,
    requestId: randomUUID(),
    ...over,
  });

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
    const [owner, admin, agent, outsider] = await Promise.all([
      mk('owner'),
      mk('admin'),
      mk('agent'),
      mk('outsider'),
    ]);
    Object.assign(ids, {
      owner: owner.id,
      admin: admin.id,
      agent: agent.id,
      outsider: outsider.id,
    });
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `oda-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `odb-${sfx}` } });
    Object.assign(ids, { wsA: wsA.id, wsB: wsB.id });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: admin.id, role: 'ADMIN' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    const cust = await db.customer.create({
      data: {
        workspaceId: wsA.id,
        name: 'Nadia Rahman',
        email: `n-${sfx}@t.co`,
        phone: '+8801711000000',
      },
    });
    const custB = await db.customer.create({ data: { workspaceId: wsB.id, name: 'Other tenant' } });
    const ch = await db.channel.create({
      data: { workspaceId: wsA.id, provider: 'WHATSAPP', displayName: 'WA', status: 'CONNECTED' },
    });
    const conv = await db.conversation.create({
      data: { workspaceId: wsA.id, channelId: ch.id, customerId: cust.id },
    });
    Object.assign(ids, { cust: cust.id, custB: custB.id, conv: conv.id });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({
      where: { id: { in: [ids.owner!, ids.admin!, ids.agent!, ids.outsider!] } },
    });
    await db.$disconnect();
    await app.close();
  });

  it('creates an order with server-computed totals, sequential numbers and an idempotent retry', async () => {
    const h = await auth(ids.agent!);
    const b = body({ note: 'Gift wrap please', conversationId: ids.conv });
    const a = (await http().post(base()).set(h).send(b).expect(201)).body;
    // 2×250.00 + 3×15.00 = 545.00 − 10 + 20 + 5
    expect(a).toMatchObject({
      number: 1001,
      subtotalMinor: 54_500,
      totalMinor: 56_000,
      paidMinor: 0,
      outstandingMinor: 56_000,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      fulfillmentStatus: 'UNFULFILLED',
      channel: 'WHATSAPP',
      itemCount: 5,
    });
    expect(a.items.map((i: { lineTotalMinor: number }) => i.lineTotalMinor)).toEqual([
      50_000, 4_500,
    ]);
    expect(a.notes).toHaveLength(1);
    expect(a.events.map((e: { type: string }) => e.type)).toEqual(['note', 'created']);
    const again = (await http().post(base()).set(h).send(b).expect(201)).body;
    expect(again.id).toBe(a.id);
    expect(await db.order.count({ where: { workspaceId: ids.wsA! } })).toBe(1);
    const second = (await http().post(base()).set(h).send(body()).expect(201)).body;
    expect(second.number).toBe(1002);
    ids.o1 = a.id;
    ids.o2 = second.id;
  });

  it('ignores client-sent totals, and validates amounts, customer and conversation', async () => {
    const h = await auth(ids.agent!);
    const r = await http()
      .post(base())
      .set(h)
      .send(body({ totalMinor: 1, paidMinor: 99_999 }))
      .expect(201);
    expect(r.body.totalMinor).toBe(56_000);
    expect(r.body.paidMinor).toBe(0);
    await http()
      .post(base())
      .set(h)
      .send(body({ items: [] }))
      .expect(400);
    await http()
      .post(base())
      .set(h)
      .send(body({ discountMinor: 99_999_999 }))
      .expect(400);
    await http()
      .post(base())
      .set(h)
      .send(body({ currency: 'XXX' }))
      .expect(400);
    await http()
      .post(base())
      .set(h)
      .send(body({ customerId: ids.custB }))
      .expect(400);
    await http()
      .post(base())
      .set(h)
      .send(body({ conversationId: randomUUID() }))
      .expect(400);
    await http()
      .post(base())
      .set(h)
      .send(body({ items: [item('x', 0)] }))
      .expect(400);
  });

  it('lists with filters, search, sorting, pagination and a real summary', async () => {
    const h = await auth(ids.agent!);
    const all = (await http().get(base()).set(h).expect(200)).body;
    expect(all.meta.total).toBeGreaterThanOrEqual(3);
    expect((await http().get(`${base()}?q=1001`).set(h)).body.data).toHaveLength(1);
    expect((await http().get(`${base()}?q=nadia`).set(h)).body.meta.total).toBe(all.meta.total);
    expect((await http().get(`${base()}?channel=WHATSAPP`).set(h)).body.meta.total).toBe(1);
    expect((await http().get(`${base()}?channel=MANUAL`).set(h)).body.meta.total).toBe(
      all.meta.total - 1,
    );
    expect((await http().get(`${base()}?status=CANCELLED`).set(h)).body.data).toHaveLength(0);
    await http().get(`${base()}?status=NOPE`).set(h).expect(400);
    expect((await http().get(`${base()}?pageSize=1&page=2`).set(h)).body.data).toHaveLength(1);
    const asc = (await http().get(`${base()}?sort=createdAt&dir=asc`).set(h)).body.data;
    expect(asc[0].number).toBe(1001);
    const s = (await http().get(`${base()}/summary`).set(h).expect(200)).body;
    expect(s).toMatchObject({
      totalOrders: all.meta.total,
      hasPrevious: false,
      revenue: [],
      processing: 0,
      completed: 0,
    });
    expect(s.pendingPayments.count).toBe(all.meta.total);
    const ranged = (
      await http()
        .get(`${base()}/summary?createdFrom=${new Date(Date.now() - 86_400_000).toISOString()}`)
        .set(h)
    ).body;
    expect(ranged.hasPrevious).toBe(true);
    expect(ranged.previousTotalOrders).toBe(0);
  });

  it('enforces status transitions, completion prerequisites and cancellation rules', async () => {
    const h = await auth(ids.agent!);
    const owner = await auth(ids.owner!);
    const st = (id: string, status: string, who = h) =>
      http().post(`${base()}/${id}/status`).set(who).send({ status });
    await st(ids.o1!, 'COMPLETED').expect(409);
    await st(ids.o1!, 'CONFIRMED').expect(200);
    await st(ids.o1!, 'PROCESSING').expect(200);
    await st(ids.o1!, 'COMPLETED').expect(409); // not fulfilled
    await http()
      .put(`${base()}/${ids.o1}/fulfillment`)
      .set(h)
      .send({
        status: 'FULFILLED',
        carrier: 'Pathao',
        trackingNumber: 'PT123',
        trackingUrl: 'https://t.co/PT123',
      })
      .expect(200);
    await st(ids.o1!, 'COMPLETED').expect(409); // unpaid
    await st(ids.o1!, 'CANCELLED').expect(409); // fulfilled
    await http()
      .post(`${base()}/${ids.o1}/payments`)
      .set(owner)
      .send({
        amountMinor: 56_000,
        method: 'BANK_TRANSFER',
        reference: 'TX-1',
        requestId: randomUUID(),
      })
      .expect(201);
    const done = (await st(ids.o1!, 'COMPLETED').expect(200)).body;
    expect(done).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID', carrier: 'Pathao' });
    expect(done.completedAt).not.toBeNull();
    await st(ids.o1!, 'CANCELLED').expect(409);
    const types = done.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(['created', 'status', 'fulfillment', 'payment']));
  });

  it('records payments manually with permission, idempotency and balance checks', async () => {
    const agent = await auth(ids.agent!);
    const admin = await auth(ids.admin!);
    const pay = (amountMinor: number, requestId = randomUUID(), who = admin) =>
      http()
        .post(`${base()}/${ids.o2}/payments`)
        .set(who)
        .send({ amountMinor, method: 'CASH', requestId });
    await pay(1_000, randomUUID(), agent).expect(403);
    const key = randomUUID();
    const p1 = (await pay(20_000, key).expect(201)).body;
    expect(p1).toMatchObject({
      paidMinor: 20_000,
      paymentStatus: 'PARTIALLY_PAID',
      outstandingMinor: 36_000,
    });
    const replay = (await pay(20_000, key).expect(201)).body;
    expect(replay.paidMinor).toBe(20_000);
    expect(await db.orderPayment.count({ where: { orderId: ids.o2! } })).toBe(1);
    await pay(36_001).expect(400);
    await http()
      .post(`${base()}/${ids.o2}/payments`)
      .set(admin)
      .send({
        amountMinor: 100,
        method: 'CASH',
        requestId: randomUUID(),
        paidAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(400);
    const p2 = (await pay(36_000).expect(201)).body;
    expect(p2).toMatchObject({ paymentStatus: 'PAID', outstandingMinor: 0 });
    await pay(1).expect(409);
    // pricing is locked once a payment exists
    await http()
      .patch(`${base()}/${ids.o2}`)
      .set(admin)
      .send({ items: [item('Changed')] })
      .expect(409);
  });

  it('edits a pending order, recomputes totals, and cancels with confirmation semantics', async () => {
    const h = await auth(ids.agent!);
    const o = (await http().post(base()).set(h).send(body()).expect(201)).body;
    const e = (
      await http()
        .patch(`${base()}/${o.id}`)
        .set(h)
        .send({
          items: [item('Table', 1, 10_000)],
          discountMinor: 0,
          shippingMinor: 0,
          taxMinor: 0,
          shippingAddress: 'House 4, Dhaka',
        })
        .expect(200)
    ).body;
    expect(e).toMatchObject({
      subtotalMinor: 10_000,
      totalMinor: 10_000,
      shippingAddress: 'House 4, Dhaka',
    });
    expect(e.items).toHaveLength(1);
    await http().patch(`${base()}/${o.id}`).set(h).send({}).expect(400);
    const c = (
      await http().post(`${base()}/${o.id}/status`).set(h).send({ status: 'CANCELLED' }).expect(200)
    ).body;
    expect(c).toMatchObject({ status: 'CANCELLED', outstandingMinor: 0 });
    await http().patch(`${base()}/${o.id}`).set(h).send({ shippingMethod: 'x' }).expect(409);
    const sum = (await http().get(`${base()}/summary`).set(h)).body;
    expect(sum.cancelled).toBe(1);
    expect(
      await db.auditLog.count({
        where: { workspaceId: ids.wsA!, entityId: o.id, action: 'order.cancel' },
      }),
    ).toBe(1);
  });

  it('fulfillment needs a confirmed order and only moves forward; tracking URLs must be http(s)', async () => {
    const h = await auth(ids.agent!);
    const o = (await http().post(base()).set(h).send(body()).expect(201)).body;
    const put = (b: object) => http().put(`${base()}/${o.id}/fulfillment`).set(h).send(b);
    await put({ status: 'PROCESSING' }).expect(409);
    await http().post(`${base()}/${o.id}/status`).set(h).send({ status: 'CONFIRMED' }).expect(200);
    await put({ status: 'FULFILLED', trackingUrl: 'javascript:alert(1)' }).expect(400);
    await put({ status: 'PROCESSING' }).expect(200);
    const f = (await put({ status: 'FULFILLED' }).expect(200)).body;
    expect(f.fulfillmentStatus).toBe('FULFILLED');
    expect(f.shippedAt).not.toBeNull();
    await put({ status: 'PROCESSING' }).expect(409);
  });

  it('bulk status change reports partial failures and respects eligibility', async () => {
    const h = await auth(ids.agent!);
    const a = (await http().post(base()).set(h).send(body()).expect(201)).body;
    const done = ids.o1!; // completed
    const r = (
      await http()
        .post(`${base()}/bulk`)
        .set(h)
        .send({ ids: [a.id, done, randomUUID()], action: 'SET_STATUS', status: 'CONFIRMED' })
        .expect(200)
    ).body;
    expect(r.updated).toBe(1);
    expect(r.failed).toHaveLength(2);
    expect(r.failed.find((f: { id: string }) => f.id === done).reason).toMatch(/completed/);
    expect((await http().get(`${base()}/${a.id}`).set(h)).body.status).toBe('CONFIRMED');
  });

  it('notes: author edits, others cannot; admins can moderate deletes', async () => {
    const agent = await auth(ids.agent!);
    const owner = await auth(ids.owner!);
    const n = (
      await http()
        .post(`${base()}/${ids.o2}/notes`)
        .set(agent)
        .send({ body: 'Call before delivery' })
        .expect(201)
    ).body;
    const noteId = n.notes[0].id;
    await http()
      .patch(`${base()}/${ids.o2}/notes/${noteId}`)
      .set(owner)
      .send({ body: 'x' })
      .expect(403);
    await http()
      .patch(`${base()}/${ids.o2}/notes/${noteId}`)
      .set(agent)
      .send({ body: 'Call first' })
      .expect(200);
    await http().post(`${base()}/${ids.o2}/notes`).set(agent).send({ body: '   ' }).expect(400);
    const agent2 = await auth(ids.agent!);
    await http().delete(`${base()}/${ids.o2}/notes/${noteId}`).set(owner).expect(200);
    await http().delete(`${base()}/${ids.o2}/notes/${noteId}`).set(agent2).expect(404);
  });

  it('exports CSV (selected or filtered) with formula-injection protection', async () => {
    const h = await auth(ids.agent!);
    await db.customer.update({ where: { id: ids.cust! }, data: { name: '=HYPERLINK("x")' } });
    const csv = (await http().get(`${base()}/export?ids=${ids.o2}`).set(h).expect(200)).text;
    expect(csv.split('\r\n')[0]).toContain('Order,Created,Customer');
    expect(csv).toContain('#1002');
    expect(csv).not.toContain('#1001');
    expect(csv).toContain(`'=HYPERLINK`);
  });

  it('isolates tenants and enforces read/write permissions', async () => {
    const outsider = await auth(ids.outsider!);
    await http().get(base()).set(outsider).expect(404);
    await http().get(`${base()}/${ids.o1}`).set(outsider).expect(404);
    const ownB = await auth(ids.outsider!);
    await http().get(`/api/v1/workspaces/${ids.wsB}/orders/${ids.o1}`).set(ownB).expect(404);
    await http()
      .post(`/api/v1/workspaces/${ids.wsB}/orders/${ids.o1}/status`)
      .set(ownB)
      .send({ status: 'CONFIRMED' })
      .expect(404);
    await http().get(base()).expect(401);
    expect(
      (
        await http()
          .get(`${base()}/${randomUUID()}`)
          .set(await auth(ids.owner!))
      ).status,
    ).toBe(404);
  });

  it('invoice: a PDF from the real order, one stable number per order, never across stores', async () => {
    const h = await auth(ids.agent!);
    const url = (id: string) => `${base()}/${id}/invoice`;
    const first = await http()
      .get(url(ids.o1!))
      .set(h)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toContain('application/pdf');
    expect(first.headers['content-disposition']).toMatch(/inline; filename="TORIO-INV-\d{5}\.pdf"/);
    expect((first.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const inv = await db.orderInvoice.findUnique({ where: { orderId: ids.o1! } });
    expect(inv?.number).toBe(1);
    // reprint and download keep the identity
    const dl = await http()
      .get(`${url(ids.o1!)}?download=1`)
      .set(h);
    expect(dl.headers['content-disposition']).toMatch(
      /attachment; filename="TORIO-INV-00001\.pdf"/,
    );
    expect(await db.orderInvoice.count({ where: { workspaceId: ids.wsA! } })).toBe(1);
    // concurrent first requests for a second order produce one invoice and one number
    await Promise.all([1, 2, 3].map(() => http().get(url(ids.o2!)).set(h).expect(200)));
    const second = await db.orderInvoice.findMany({ where: { orderId: ids.o2! } });
    expect(second).toHaveLength(1);
    expect(second[0]!.number).toBe(2);
    // another store cannot reach it, and no number is issued for the refusal
    const outsider = await auth(ids.outsider!);
    await http().get(url(ids.o1!)).set(outsider).expect(404);
    await http()
      .get(`/api/v1/workspaces/${ids.wsB}/orders/${ids.o1}/invoice`)
      .set(outsider)
      .expect(404);
    expect(await db.orderInvoice.count({ where: { workspaceId: ids.wsB! } })).toBe(0);
    await http().get(url(ids.o1!)).expect(401);
  });
});
