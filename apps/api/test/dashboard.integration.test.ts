import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for the dashboard analytics date contract. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('dashboard analytics (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const http = () => request(app.getHttpServer());
  const url2 = (q: string, ws = ids.wsA) => `/api/v1/workspaces/${ws}/dashboard/analytics?${q}`;
  let seq = 1000;

  const order = (
    ws: string,
    at: string,
    over: Partial<{ currency: string; totalMinor: number; status: 'PENDING' | 'CANCELLED' }> = {},
  ) =>
    db.order.create({
      data: {
        workspaceId: ws,
        number: ++seq,
        customerId: ids.custA!,
        currency: over.currency ?? 'USD',
        subtotalMinor: over.totalMinor ?? 10_000,
        totalMinor: over.totalMinor ?? 10_000,
        status: over.status ?? 'PENDING',
        createdAt: new Date(at),
      },
    });
  const pay = (ws: string, orderId: string, at: string, amountMinor: number) =>
    db.orderPayment.create({
      data: { workspaceId: ws, orderId, amountMinor, method: 'CASH', paidAt: new Date(at) },
    });
  const customer = (ws: string, name: string, at: string) =>
    db.customer.create({ data: { workspaceId: ws, name, createdAt: new Date(at) } });
  const setTz = (tz: string) =>
    db.workspace.update({ where: { id: ids.wsA! }, data: { reportingTimeZone: tz } });

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
    const wsA = await db.workspace.create({
      data: { name: 'A', slug: `da-${sfx}`, createdAt: new Date('2023-01-01T00:00:00Z') },
    });
    const wsB = await db.workspace.create({
      data: { name: 'B', slug: `db-${sfx}`, createdAt: new Date('2023-01-01T00:00:00Z') },
    });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    const custA = await customer(wsA.id, 'Anchor', '2023-01-02T00:00:00Z');
    const custB = await customer(wsB.id, 'Other tenant customer', '2024-02-29T10:00:00Z');
    Object.assign(ids, {
      owner: owner.id,
      agent: agent.id,
      outsider: outsider.id,
      wsA: wsA.id,
      wsB: wsB.id,
      custA: custA.id,
      custB: custB.id,
    });
    // workspace B has loud data that must never leak into A
    const ob = await db.order.create({
      data: {
        workspaceId: wsB.id,
        number: 1,
        customerId: custB.id,
        currency: 'USD',
        subtotalMinor: 999_999,
        totalMinor: 999_999,
        createdAt: new Date('2024-02-29T10:00:00Z'),
      },
    });
    await pay(wsB.id, ob.id, '2024-02-29T10:00:00Z', 999_999);
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.agent!, ids.outsider!] } } });
    await db.$disconnect();
    await app.close();
  });

  it('validates the date contract on the server and enforces workspace access', async () => {
    const o = await auth(ids.owner!);
    await http().get(url2('from=2024-01-01&to=2024-01-31')).expect(401);
    await http()
      .get(url2('from=2024-01-01&to=2024-01-31'))
      .set(await auth(ids.outsider!))
      .expect(404);
    for (const bad of [
      '',
      'from=2024-01-01',
      'from=nope&to=2024-01-02',
      'from=2024-02-30&to=2024-03-01',
      'from=2024-02-02&to=2024-02-01',
      'from=2020-01-01&to=2024-01-01',
      'from=2024-01-01&to=2024-01-31&compare=last_week',
    ])
      await http().get(url2(bad)).set(o).expect(400);
    const fut = await http().get(url2('from=2026-10-01&to=2026-12-31')).set(o).expect(400);
    expect(fut.body.error.message).toMatch(/future/);
    await http().get(url2('from=2024-01-01&to=2024-01-31')).set(o).expect(200);
  });

  it('counts only records inside the inclusive range in the reporting time zone (Dhaka, UTC+6)', async () => {
    await setTz('Asia/Dhaka');
    const o = await auth(ids.owner!);
    // 23:30 Dhaka on Mar 10 and 00:30 Dhaka on Mar 11 (a one-hour UTC gap straddling local midnight)
    const a = await order(ids.wsA!, '2025-03-10T17:30:00Z');
    const b = await order(ids.wsA!, '2025-03-10T18:30:00Z');
    await pay(ids.wsA!, a.id, '2025-03-10T17:30:00Z', 10_000);
    await pay(ids.wsA!, b.id, '2025-03-10T18:30:00Z', 25_000);
    const day = async (d: string) =>
      (
        await http()
          .get(url2(`from=${d}&to=${d}`))
          .set(o)
          .expect(200)
      ).body;
    const mar10 = await day('2025-03-10');
    const mar11 = await day('2025-03-11');
    expect(mar10.orders.total).toBe(1);
    expect(mar10.revenue.byCurrency).toEqual([{ currency: 'USD', amountMinor: 10_000 }]);
    expect(mar11.orders.total).toBe(1);
    expect(mar11.revenue.byCurrency).toEqual([{ currency: 'USD', amountMinor: 25_000 }]);
    expect(mar10.timeZone).toBe('Asia/Dhaka');
    // in UTC both fall on Mar 10: the reporting zone, not the server's, decides
    await setTz('UTC');
    expect((await day('2025-03-10')).orders.total).toBe(2);
    expect((await day('2025-03-11')).orders.total).toBe(0);
    await setTz('Asia/Dhaka');
    const both = (await http().get(url2('from=2025-03-10&to=2025-03-11')).set(o)).body;
    expect(both.orders.total).toBe(2);
    expect(both.revenue.byCurrency[0].amountMinor).toBe(35_000);
    expect(both.series.buckets).toEqual(['2025-03-10', '2025-03-11']);
    expect(both.series.orders).toEqual([1, 1]);
    expect(both.series.revenue).toEqual([10_000, 25_000]);
    // nothing from the other tenant, whose Feb 29 2024 order is huge
    const leap = (await http().get(url2('from=2024-02-28&to=2024-03-01')).set(o)).body;
    expect(leap.orders.total).toBe(0);
    expect(leap.revenue.byCurrency).toEqual([]);
    expect(leap.series.buckets).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']); // includes the leap day
  });

  it('handles daylight-saving transitions (New York, Mar 8 2026 is 23 hours long)', async () => {
    await setTz('America/New_York');
    const o = await auth(ids.owner!);
    const before = await order(ids.wsA!, '2026-03-08T04:59:00Z'); // 23:59 EST on Mar 7
    const start = await order(ids.wsA!, '2026-03-08T05:00:00Z'); // 00:00 EST on Mar 8
    const last = await order(ids.wsA!, '2026-03-09T03:59:00Z'); // 23:59 EDT on Mar 8
    const next = await order(ids.wsA!, '2026-03-09T04:00:00Z'); // 00:00 EDT on Mar 9
    const body = (await http().get(url2('from=2026-03-08&to=2026-03-08')).set(o).expect(200)).body;
    expect(body.orders.total).toBe(2);
    const mar7 = (await http().get(url2('from=2026-03-07&to=2026-03-07')).set(o)).body;
    expect(mar7.orders.total).toBe(1);
    const mar9 = (await http().get(url2('from=2026-03-09&to=2026-03-09')).set(o)).body;
    expect(mar9.orders.total).toBe(1);
    expect([before.id, start.id, last.id, next.id].length).toBe(4);
    await setTz('Asia/Dhaka');
  });

  it('sums revenue per currency, ignoring cancelled orders and payments outside the range', async () => {
    const o = await auth(ids.owner!);
    const ok = await order(ids.wsA!, '2025-06-02T10:00:00Z', {
      currency: 'EUR',
      totalMinor: 5_000,
    });
    const cancelled = await order(ids.wsA!, '2025-06-02T11:00:00Z', {
      currency: 'EUR',
      totalMinor: 7_000,
      status: 'CANCELLED',
    });
    const usd = await order(ids.wsA!, '2025-06-03T11:00:00Z', {
      currency: 'USD',
      totalMinor: 1_000,
    });
    await pay(ids.wsA!, ok.id, '2025-06-02T10:00:00Z', 5_000);
    await pay(ids.wsA!, cancelled.id, '2025-06-02T11:00:00Z', 7_000); // on a cancelled order: not revenue
    await pay(ids.wsA!, usd.id, '2025-06-04T12:00:00Z', 1_000);
    const r = (await http().get(url2('from=2025-06-02&to=2025-06-03')).set(o)).body;
    expect(r.revenue.byCurrency).toEqual([{ currency: 'EUR', amountMinor: 5_000 }]); // the USD payment is dated Jun 4
    expect(r.orders).toEqual({ total: 3, cancelled: 1 });
    const wide = (await http().get(url2('from=2025-06-02&to=2025-06-04')).set(o)).body;
    expect(wide.revenue.byCurrency).toHaveLength(2);
    expect(wide.revenue.primaryCurrency).toBe('EUR'); // largest, shown in the chart
    expect(wide.series.revenue.reduce((a: number, b: number) => a + b, 0)).toBe(5_000);
  });

  it('tracks customers: total at range end, new in range, and cumulative growth', async () => {
    const o = await auth(ids.owner!);
    await customer(ids.wsA!, 'C1', '2025-08-01T10:00:00Z');
    await customer(ids.wsA!, 'C2', '2025-08-01T12:00:00Z');
    await customer(ids.wsA!, 'C3', '2025-08-03T12:00:00Z');
    await customer(ids.wsA!, 'Later', '2025-09-01T00:00:00Z');
    const before = await db.customer.count({
      where: { workspaceId: ids.wsA!, createdAt: { lt: new Date('2025-07-31T18:00:00Z') } },
    });
    const r = (await http().get(url2('from=2025-08-01&to=2025-08-03')).set(o)).body; // Dhaka: starts 2025-07-31T18:00Z
    expect(r.customers.new).toBe(3);
    expect(r.customers.total).toBe(before + 3); // excludes "Later"
    expect(r.series.newCustomers).toEqual([2, 0, 1]);
    expect(r.series.totalCustomers).toEqual([before + 2, before + 2, before + 3]);
  });

  it('switches to weekly (Monday-start) and monthly buckets for longer ranges, and fills empty buckets', async () => {
    const o = await auth(ids.owner!);
    const week = (await http().get(url2('from=2025-08-01&to=2025-09-15')).set(o)).body;
    expect(week.granularity).toBe('week');
    expect(week.series.buckets[0]).toBe('2025-07-28'); // the Monday on/before Aug 1
    expect(
      week.series.buckets.every((b: string) => new Date(`${b}T00:00:00Z`).getUTCDay() === 1),
    ).toBe(true);
    expect(week.series.newCustomers.reduce((a: number, b: number) => a + b, 0)).toBe(
      week.customers.new,
    );
    const month = (await http().get(url2('from=2025-01-01&to=2025-12-31')).set(o)).body;
    expect(month.granularity).toBe('month');
    expect(month.series.buckets).toHaveLength(12);
    expect(month.series.orders).toHaveLength(12);
    const empty = (await http().get(url2('from=2019-01-01&to=2019-01-07')).set(o)).body;
    expect(empty.orders.total).toBe(0);
    expect(empty.revenue).toEqual({ byCurrency: [], primaryCurrency: '' });
    expect(empty.series.orders).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(empty.activity).toEqual([]);
  });

  it('compares with the previous period and previous year, and refuses misleading comparisons', async () => {
    const o = await auth(ids.owner!);
    // previous period for Mar 10–11 2025 is Mar 8–9 2025; previous year is Mar 10–11 2024
    const p = (
      await http().get(url2('from=2025-03-10&to=2025-03-11&compare=previous_period')).set(o)
    ).body;
    expect(p.comparison.range).toEqual({ from: '2025-03-08', to: '2025-03-09' });
    expect(p.comparison.coverage).toBe('full');
    expect(p.comparison.previous.orders).toBe(0);
    expect(p.comparison.changes.orders).toBeNull(); // 2 vs 0: undefined, not "+∞%"
    // a real comparison: Jun 2 (EUR 50) vs Jun 3 (nothing in EUR)
    const c = (
      await http().get(url2('from=2025-06-03&to=2025-06-03&compare=previous_period')).set(o)
    ).body;
    expect(c.comparison.range).toEqual({ from: '2025-06-02', to: '2025-06-02' });
    expect(c.comparison.previous.orders).toBe(2);
    expect(c.comparison.changes.orders).toBe(-50); // 1 → vs 2
    // previous year, including the leap-day clamp
    const y = (await http().get(url2('from=2025-03-01&to=2025-03-01&compare=previous_year')).set(o))
      .body;
    expect(y.comparison.range).toEqual({ from: '2024-03-01', to: '2024-03-01' });
    // no comparison by default
    expect(
      (await http().get(url2('from=2025-03-10&to=2025-03-11')).set(o)).body.comparison,
    ).toBeNull();
    // a comparison window entirely before the workspace had data shows no percentages
    const young = await db.workspace.create({
      data: {
        name: 'Young',
        slug: `dy-${sfx}`,
        createdAt: new Date('2025-09-01T00:00:00Z'),
        reportingTimeZone: 'UTC',
      },
    });
    await db.workspaceMembership.create({
      data: { workspaceId: young.id, userId: ids.owner!, role: 'OWNER' },
    });
    const yc = await customer(young.id, 'Y', '2025-09-10T00:00:00Z');
    expect(yc.id).toBeTruthy();
    const none = (
      await http().get(url2('from=2025-09-10&to=2025-09-12&compare=previous_year', young.id)).set(o)
    ).body;
    expect(none.comparison.coverage).toBe('none');
    expect(none.comparison.changes).toEqual({
      revenue: null,
      orders: null,
      newCustomers: null,
      customers: null,
    });
    const partial = (
      await http()
        .get(url2('from=2025-09-05&to=2025-09-11&compare=previous_period', young.id))
        .set(o)
    ).body;
    expect(partial.comparison.coverage).toBe('partial');
    await db.workspace.delete({ where: { id: young.id } });
  });

  it('lists recent activity inside the range only, and keeps billing details to roles that may see them', async () => {
    const o = await auth(ids.owner!);
    const day = (await http().get(url2('from=2025-08-03&to=2025-08-03')).set(o)).body;
    expect(day.activity.map((a: { title: string }) => a.title)).toEqual(['New customer: C3']);
    const jun = (await http().get(url2('from=2025-06-02&to=2025-06-02')).set(o)).body;
    expect(jun.activity.some((a: { type: string }) => a.type === 'payment')).toBe(true);
    expect(
      jun.activity.every(
        (a: { at: string }) => a.at >= '2025-06-01T18:00:00' && a.at < '2025-06-02T18:00:00',
      ),
    ).toBe(true);
    // point-in-time subscription: owner sees it, agent doesn't
    expect(day.subscription).toMatchObject({ onFreePlan: true, status: 'NONE' });
    const agent = (
      await http()
        .get(url2('from=2025-08-03&to=2025-08-03'))
        .set(await auth(ids.agent!))
        .expect(200)
    ).body;
    expect(agent.subscription).toBeNull();
    expect(agent.orders.total).toBe(day.orders.total);
  });

  it('reports real inbox activity, honours the channel filter and lists what needs attention', async () => {
    await setTz('UTC');
    const ws = ids.wsA!;
    const [wa, ig] = await Promise.all([
      db.channel.create({ data: { workspaceId: ws, provider: 'WHATSAPP', displayName: 'WA' } }),
      db.channel.create({ data: { workspaceId: ws, provider: 'INSTAGRAM', displayName: 'IG' } }),
    ]);
    const other = await db.channel.create({
      data: { workspaceId: ids.wsB!, provider: 'WHATSAPP', displayName: 'B' },
    });
    const now = Date.now();
    const conv = (channelId: string, workspaceId: string, over: object = {}) =>
      db.conversation.create({
        data: {
          workspaceId,
          channelId,
          customerId: workspaceId === ws ? ids.custA! : ids.custB!,
          ...over,
        },
      });
    const msg = (
      c: { id: string; workspaceId: string },
      at: Date,
      kind: 'INBOUND' | 'OUTBOUND' | 'NOTE' = 'INBOUND',
    ) =>
      db.message.create({
        data: { workspaceId: c.workspaceId, conversationId: c.id, kind, body: 'x', createdAt: at },
      });
    const today = new Date().toISOString().slice(0, 10);
    const day = (d: string) => new Date(`${today}T${d}Z`);
    // WhatsApp: started today, waiting 3h (overdue), two messages today
    const c1 = await conv(wa.id, ws, {
      createdAt: day('00:30:00'),
      waitingSince: new Date(now - 3 * 3600_000),
      unreadCount: 2,
    });
    await msg(c1, day('00:30:00'));
    await msg(c1, day('00:40:00'), 'OUTBOUND');
    // Instagram: resolved today, one message; a note never counts as activity
    const c2 = await conv(ig.id, ws, {
      createdAt: day('00:10:00'),
      status: 'RESOLVED',
      resolvedAt: day('00:50:00'),
    });
    await msg(c2, day('00:20:00'));
    await msg(c2, day('00:25:00'), 'NOTE');
    // WhatsApp: waiting 10 minutes (not overdue)
    const c3 = await conv(wa.id, ws, {
      createdAt: new Date('2025-01-01T00:00:00Z'),
      waitingSince: new Date(now - 10 * 60_000),
    });
    await msg(c3, day('00:05:00'));
    // other tenant: must never appear
    const cx = await conv(other.id, ids.wsB!, {
      createdAt: day('00:01:00'),
      waitingSince: new Date(now - 5 * 3600_000),
    });
    await msg(cx, day('00:02:00'));
    // leads: one hot and idle (WhatsApp), one new today (Instagram)
    await db.lead.create({
      data: {
        workspaceId: ws,
        name: 'Hot',
        source: 'WHATSAPP',
        stage: 'QUALIFIED',
        score: 85,
        lastActivityAt: new Date(now - 48 * 3600_000),
        createdAt: new Date('2025-01-01T00:00:00Z'),
      },
    });
    await db.lead.create({
      data: { workspaceId: ws, name: 'Fresh', source: 'INSTAGRAM', createdAt: day('00:15:00') },
    });
    // an order created from the WhatsApp conversation
    await db.order.create({
      data: {
        workspaceId: ws,
        number: ++seq,
        customerId: ids.custA!,
        conversationId: c1.id,
        currency: 'BDT',
        subtotalMinor: 100,
        totalMinor: 100,
        createdAt: day('00:45:00'),
      },
    });

    const owner = await auth(ids.owner!);
    const all = (
      await http()
        .get(url2(`from=${today}&to=${today}`))
        .set(owner)
        .expect(200)
    ).body;
    expect(all.messaging).toMatchObject({ total: 3, new: 2, resolved: 1 });
    expect(all.messaging.waiting).toBeGreaterThanOrEqual(2);
    expect(all.series.conversations.reduce((a: number, b: number) => a + b, 0)).toBe(3);
    expect(all.series.resolvedConversations.reduce((a: number, b: number) => a + b, 0)).toBe(1);
    expect(all.leads.total).toBe(1);
    expect(all.attention.waitingLong).toMatchObject({ count: 1, thresholdMinutes: 120 });
    expect(all.attention.waitingLong.oldest).toMatchObject({
      conversationId: c1.id,
      provider: 'WHATSAPP',
    });
    expect(all.attention.staleLeads.count).toBe(1);
    expect(all.attention.pendingOrders.count).toBeGreaterThanOrEqual(1);

    const wa1 = (
      await http()
        .get(url2(`from=${today}&to=${today}&channel=WHATSAPP`))
        .set(owner)
        .expect(200)
    ).body;
    expect(wa1.messaging).toMatchObject({ total: 2, new: 1, resolved: 0 });
    expect(wa1.leads.total).toBe(0);
    expect(wa1.orders.total).toBe(1);
    expect(wa1.attention.staleLeads.count).toBe(1);
    const ig1 = (
      await http()
        .get(url2(`from=${today}&to=${today}&channel=INSTAGRAM`))
        .set(owner)
        .expect(200)
    ).body;
    expect(ig1.messaging).toMatchObject({ total: 1, new: 1, resolved: 1, waiting: 0 });
    expect(ig1.orders.total).toBe(0);
    expect(ig1.attention).toMatchObject({
      waitingLong: { count: 0, oldest: null },
      staleLeads: { count: 0 },
    });
    await http()
      .get(url2(`from=${today}&to=${today}&channel=SMS`))
      .set(owner)
      .expect(400);
    // per-channel split ignores the filter: same numbers whichever channel is selected
    expect(all.byChannel.conversations).toMatchObject({ WHATSAPP: 1, INSTAGRAM: 1 });
    expect(all.byChannel.orders).toMatchObject({ WHATSAPP: 1 });
    expect(all.byChannel.leads).toMatchObject({ INSTAGRAM: 1 });
    expect(ig1.byChannel).toEqual(all.byChannel);
  });

  it('lets the chart pick a grouping the range supports, and refuses the rest', async () => {
    const owner = await auth(ids.owner!);
    const w = (
      await http()
        .get(url2('from=2025-03-01&to=2025-03-30&granularity=week'))
        .set(owner)
        .expect(200)
    ).body;
    expect(w.granularity).toBe('week');
    expect(w.series.buckets[0]).toBe('2025-02-24'); // Monday-start week containing 1 Mar
    await http()
      .get(url2('from=2025-03-01&to=2025-03-07&granularity=month'))
      .set(owner)
      .expect(400);
    await http().get(url2('from=2025-01-01&to=2025-12-31&granularity=day')).set(owner).expect(400);
    const m = (
      await http()
        .get(url2('from=2025-01-01&to=2025-12-31&granularity=month'))
        .set(owner)
        .expect(200)
    ).body;
    expect(m.series.buckets).toHaveLength(12);
  });

  it('rejects invalid reporting time zones when saving workspace settings and records the change', async () => {
    const o = await auth(ids.owner!);
    await http()
      .patch(`/api/v1/workspaces/${ids.wsA}`)
      .set(o)
      .send({ reportingTimeZone: 'Mars/Olympus' })
      .expect(400);
    await http()
      .patch(`/api/v1/workspaces/${ids.wsA}`)
      .set(await auth(ids.agent!))
      .send({ reportingTimeZone: 'Asia/Tokyo' })
      .expect(403);
    const r = await http()
      .patch(`/api/v1/workspaces/${ids.wsA}`)
      .set(o)
      .send({ reportingTimeZone: 'Asia/Tokyo' })
      .expect(200);
    expect(r.body.reportingTimeZone).toBe('Asia/Tokyo');
    expect((await http().get(url2('from=2025-03-10&to=2025-03-10')).set(o)).body.timeZone).toBe(
      'Asia/Tokyo',
    );
    expect(
      await db.auditLog.count({ where: { workspaceId: ids.wsA!, action: 'workspace.update' } }),
    ).toBeGreaterThan(0);
  });
});
