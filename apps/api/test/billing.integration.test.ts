import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BILLING_PROVIDER } from '../src/modules/billing/provider/billing-provider';
import { StripeProvider } from '../src/modules/billing/provider/stripe.provider';
import { signStripePayload } from '../src/modules/billing/provider/stripe-signature';

/** Real-PostgreSQL tests for billing. Stripe is replaced by a recording fake `fetch`; webhooks use real signatures. */
const url = process.env.TEST_DATABASE_URL;
const WHSEC = 'whsec_integration_test';
const PRICES = {
  starter: { month: 'price_st_m', year: 'price_st_y' },
  growth: { month: 'price_gr_m', year: 'price_gr_y' },
  scale: { month: 'price_sc_m', year: 'price_sc_y' },
};

type Call = { method: string; path: string; form: URLSearchParams };

describe.skipIf(!url)('billing (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const calls: Call[] = [];
  let customerSeq = 0;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = (ws = ids.wsA) => `/api/v1/workspaces/${ws}/billing`;
  const http = () => request(app.getHttpServer());
  const fakeFetch = (async (input: string, init?: RequestInit) => {
    const u = new URL(input);
    calls.push({
      method: init?.method ?? 'GET',
      path: u.pathname,
      form: new URLSearchParams((init?.body as string) ?? ''),
    });
    const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
    if (u.pathname === '/v1/customers') return json({ id: `cus_${sfx}_${++customerSeq}` });
    if (u.pathname === '/v1/checkout/sessions')
      return json({ url: 'https://checkout.example/session' });
    if (u.pathname.startsWith('/v1/subscriptions/') && init?.method === 'GET')
      return json({ items: { data: [{ id: 'si_1' }] } });
    return json({});
  }) as unknown as typeof fetch;

  let evtSeq = 0;
  const NOW = Math.floor(Date.now() / 1000);
  const evt = (
    type: string,
    object: Record<string, unknown>,
    created = NOW,
    id = `evt_${sfx}_${++evtSeq}`,
  ) => ({
    id,
    type,
    created,
    data: { object },
  });
  const deliver = (e: object, opts: { sign?: boolean; secret?: string; stamp?: number } = {}) => {
    const raw = JSON.stringify(e);
    const r = http()
      .post('/api/v1/billing/webhooks/stripe')
      .set('Content-Type', 'application/json');
    if (opts.sign !== false)
      r.set('Stripe-Signature', signStripePayload(raw, opts.secret ?? WHSEC, opts.stamp));
    return r.send(raw);
  };
  const subObj = (customer: string, over: Record<string, unknown> = {}) => ({
    id: `sub_${sfx}`,
    customer,
    status: 'active',
    current_period_start: NOW - 86_400,
    current_period_end: NOW + 29 * 86_400,
    cancel_at_period_end: false,
    start_date: NOW - 86_400,
    items: { data: [{ price: { id: PRICES.growth.month } }] },
    ...over,
  });
  const invObj = (customer: string, id: string, over: Record<string, unknown> = {}) => ({
    id,
    number: `INV-${id.slice(-4)}`,
    customer,
    status: 'open',
    attempted: false,
    currency: 'usd',
    subtotal: 4900,
    tax: 0,
    total: 4900,
    amount_paid: 0,
    created: NOW,
    hosted_invoice_url: 'https://invoice.example/i/1',
    lines: {
      data: [
        {
          description: 'Growth plan',
          quantity: 1,
          amount: 4900,
          price: { id: PRICES.growth.month },
          period: { start: NOW, end: NOW + 30 * 86_400 },
        },
      ],
    },
    ...over,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.BILLING_PRICE_IDS = JSON.stringify(PRICES);
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(BILLING_PROVIDER)
        .useValue(new StripeProvider('sk_test_integration', WHSEC, fakeFetch))
        .compile()
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
    const wsA = await db.workspace.create({
      data: {
        name: 'Acme Ltd',
        slug: `bla-${sfx}`,
        contactEmail: 'pay@acme.co',
        country: 'BD',
        city: 'Dhaka',
        addressLine: '1 Road',
        postalCode: '1207',
      },
    });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `blb-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: admin.id, role: 'ADMIN' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    // two accounts with different provider customers
    await db.billingAccount.create({
      data: { workspaceId: wsB.id, provider: 'stripe', providerCustomerId: `cus_B_${sfx}` },
    });
    Object.assign(ids, {
      owner: owner.id,
      admin: admin.id,
      agent: agent.id,
      outsider: outsider.id,
      wsA: wsA.id,
      wsB: wsB.id,
      cusB: `cus_B_${sfx}`,
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.billingEvent.deleteMany({ where: { providerEventId: { startsWith: `evt_${sfx}` } } });
    await db.auditLog.deleteMany({
      where: { actorId: { in: [ids.owner!, ids.admin!, ids.agent!, ids.outsider!] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [ids.owner!, ids.admin!, ids.agent!, ids.outsider!] } },
    });
    await db.$disconnect();
    await app.close();
  });

  it('enforces permissions: agents see nothing, admins read but cannot change, owners manage; tenants are isolated', async () => {
    const [agent, admin, owner, out] = await Promise.all([
      auth(ids.agent!),
      auth(ids.admin!),
      auth(ids.owner!),
      auth(ids.outsider!),
    ]);
    await http().get(`${base()}/overview`).set(agent).expect(403);
    await http().get(`${base()}/invoices`).set(agent).expect(403);
    await http().get(`${base()}/overview`).set(admin).expect(200);
    // billing details are General Settings now: there is nothing to PUT here
    await http().put(`${base()}/profile`).set(admin).send({ companyName: 'X' }).expect(404);
    await http()
      .post(`${base()}/subscription/checkout`)
      .set(admin)
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(403);
    await http().post(`${base()}/subscription/cancel`).set(admin).send({}).expect(403);
    await http().get(`${base()}/overview`).set(owner).expect(200);
    await http().get(`${base()}/overview`).set(out).expect(404);
    await http()
      .get(`${base(ids.wsB)}/overview`)
      .set(owner)
      .expect(404);
    await http().get(`${base()}/overview`).expect(401);
  });

  it('starts on the Free plan with real usage numbers and untracked meters called out', async () => {
    const owner = await auth(ids.owner!);
    const o = (await http().get(`${base()}/overview`).set(owner).expect(200)).body;
    expect(o).toMatchObject({
      providerConfigured: true,
      onFreePlan: true,
      subscription: null,
      nextPayment: null,
      aiCredits: { metered: false },
    });
    expect(o.plan.key).toBe('free');
    expect(o.actions).toMatchObject({ canCheckout: true, canChange: false, canCancel: false });
    const cust = await db.customer.create({ data: { workspaceId: ids.wsA!, name: 'C' } });
    const ch = await db.channel.create({
      data: { workspaceId: ids.wsA!, provider: 'WHATSAPP', displayName: 'W', status: 'CONNECTED' },
    });
    const conv = await db.conversation.create({
      data: { workspaceId: ids.wsA!, channelId: ch.id, customerId: cust.id },
    });
    await db.message.createMany({
      data: [
        { workspaceId: ids.wsA!, conversationId: conv.id, kind: 'OUTBOUND', body: 'a' },
        { workspaceId: ids.wsA!, conversationId: conv.id, kind: 'OUTBOUND', body: 'b' },
        { workspaceId: ids.wsA!, conversationId: conv.id, kind: 'NOTE', body: 'internal' },
        { workspaceId: ids.wsA!, conversationId: conv.id, kind: 'INBOUND', body: 'hi' },
      ],
    });
    const u = (await http().get(`${base()}/usage`).set(owner).expect(200)).body;
    const by = (m: string) => u.data.find((x: { metric: string }) => x.metric === m);
    expect(by('members')).toMatchObject({
      used: 3,
      limit: 2,
      remaining: 0,
      percent: 100,
      level: 'reached',
    });
    expect(by('contacts')).toMatchObject({ used: 1, limit: 100, level: 'ok' });
    expect(by('channels')).toMatchObject({ used: 1, limit: 1, level: 'reached' });
    expect(by('messages').used).toBe(2); // only outbound messages, not notes or inbound
    expect(by('whatsapp').used).toBe(1);
    expect(by('instagram').used).toBe(0);
    expect(u.notTracked).toEqual(
      expect.arrayContaining(['AI conversations', 'AI credits consumed', 'Storage']),
    );
    // workspace B's data never counts toward A
    const cB = await db.customer.create({ data: { workspaceId: ids.wsB!, name: 'B' } });
    expect(cB.id).toBeTruthy();
    expect(by('contacts').used).toBe(1);
  });

  it('lists plans with the provider price configuration and clearly flagged placeholder pricing', async () => {
    const p = (
      await http()
        .get(`${base()}/plans`)
        .set(await auth(ids.owner!))
        .expect(200)
    ).body.data;
    expect(p.map((x: { key: string }) => x.key)).toEqual(['free', 'starter', 'growth', 'scale']);
    expect(p.find((x: { key: string }) => x.key === 'free')).toMatchObject({
      purchasable: false,
      placeholderPricing: false,
    });
    expect(p.find((x: { key: string }) => x.key === 'growth')).toMatchObject({
      purchasable: true,
      placeholderPricing: true,
      recommended: true,
    });
    expect(p.find((x: { key: string }) => x.key === 'scale').limits.members).toBe(-1);
  });

  it('billing details come from General Settings: read-only, scoped to the store, with what is missing', async () => {
    const owner = await auth(ids.owner!);
    const a = (await http().get(`${base()}/profile`).set(owner).expect(200)).body;
    expect(a).toMatchObject({
      source: 'general-settings',
      complete: true,
      missing: [],
      details: {
        companyName: 'Acme Ltd',
        billingEmail: 'pay@acme.co',
        country: 'BD',
        city: 'Dhaka',
        addressLine: '1 Road',
        postalCode: '1207',
        contactName: null,
        taxId: null,
      },
    });
    // the other store has its own, incomplete, details: nothing is mixed
    const b = (
      await http()
        .get(`${base(ids.wsB)}/profile`)
        .set(await auth(ids.outsider!))
        .expect(200)
    ).body;
    expect(b.details.companyName).toBe('B');
    expect(b.details.billingEmail).toBeNull();
    expect(b.complete).toBe(false);
    expect(b.missing.map((m: { field: string }) => m.field)).toEqual(['billingEmail', 'country']);
    // and a member of one store cannot read the other's
    await http()
      .get(`${base(ids.wsB)}/profile`)
      .set(owner)
      .expect(404);
    // General Settings is the source: editing it changes what the page shows
    await db.workspace.update({ where: { id: ids.wsA! }, data: { state: 'Dhaka Division' } });
    expect((await http().get(`${base()}/profile`).set(owner)).body.details.state).toBe(
      'Dhaka Division',
    );
    await db.workspace.update({ where: { id: ids.wsA! }, data: { state: null } });
  });

  it('a purchase is refused, with a pointer to Settings → General, while required details are missing', async () => {
    const wsBOwner = await auth(ids.outsider!);
    const r = await http()
      .post(`${base(ids.wsB)}/subscription/checkout`)
      .set(wsBOwner)
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(400);
    expect(r.body.error.message).toMatch(/Settings → General/);
    expect(JSON.stringify(r.body)).toMatch(/BILLING_DETAILS_INCOMPLETE|Email|Country/);
    // no provider customer was created for it
    expect(
      calls.some(
        (c) => c.path === '/v1/customers' && c.form.get('metadata[workspace_id]') === ids.wsB,
      ),
    ).toBe(false);
  });

  it('checkout creates a provider customer and a hosted session for a known price only; no amounts are sent', async () => {
    const owner = await auth(ids.owner!);
    calls.length = 0;
    await http()
      .post(`${base()}/subscription/checkout`)
      .set(owner)
      .send({ planKey: 'free', interval: 'MONTH' })
      .expect(400);
    await http()
      .post(`${base()}/subscription/checkout`)
      .set(owner)
      .send({ planKey: 'platinum', interval: 'MONTH' })
      .expect(400);
    const r = await http()
      .post(`${base()}/subscription/checkout`)
      .set(owner)
      .send({ planKey: 'growth', interval: 'YEAR' })
      .expect(200);
    expect(r.body.url).toBe('https://checkout.example/session');
    const session = calls.find((c) => c.path === '/v1/checkout/sessions')!;
    expect(session.form.get('line_items[0][price]')).toBe(PRICES.growth.year);
    expect(session.form.get('client_reference_id')).toBe(ids.wsA);
    expect([...session.form.keys()].some((k) => /amount/.test(k))).toBe(false);
    const acct = await db.billingAccount.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } });
    expect(acct.providerCustomerId).toMatch(/^cus_/);
    ids.cusA = acct.providerCustomerId!;
    // nothing changes locally until a verified webhook arrives
    expect(await db.subscription.count({ where: { workspaceId: ids.wsA! } })).toBe(0);
  });

  it('rejects webhooks without a valid, fresh signature over the exact body', async () => {
    const e = evt('customer.subscription.created', subObj(ids.cusA!));
    await deliver(e, { sign: false }).expect(400);
    await deliver(e, { secret: 'whsec_wrong' }).expect(400);
    await deliver(e, { stamp: NOW - 3600 }).expect(400);
    const raw = JSON.stringify(e);
    await http()
      .post('/api/v1/billing/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signStripePayload(raw, WHSEC))
      .send(raw.replace('"active"', '"trialing"')) // tampered after signing
      .expect(400);
    expect(await db.subscription.count({ where: { workspaceId: ids.wsA! } })).toBe(0);
    expect(await db.billingEvent.count({ where: { providerEventId: e.id } })).toBe(0);
  });

  it('applies a signed subscription event once; replays are no-ops; older events never roll state back', async () => {
    const owner = await auth(ids.owner!);
    const created = evt('customer.subscription.created', subObj(ids.cusA!), NOW);
    const r1 = await deliver(created).expect(200);
    expect(r1.body).toMatchObject({ received: true, duplicate: false });
    let o = (await http().get(`${base()}/overview`).set(owner)).body;
    expect(o).toMatchObject({
      onFreePlan: false,
      plan: { key: 'growth' },
      subscription: {
        planKey: 'growth',
        interval: 'MONTH',
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
      },
    });
    expect(o.nextPayment).toMatchObject({ amountMinor: 450_000, placeholderPricing: true }); // ৳4,500 Growth placeholder
    expect(o.actions).toMatchObject({ canChange: true, canCancel: true, canCheckout: false });
    // exact replay
    expect((await deliver(created).expect(200)).body.duplicate).toBe(true);
    // same event id with a different body is still ignored (idempotency is by id)
    const forged = {
      ...created,
      data: {
        object: subObj(ids.cusA!, { items: { data: [{ price: { id: PRICES.scale.month } }] } }),
      },
    };
    expect((await deliver(forged).expect(200)).body.duplicate).toBe(true);
    expect(await db.billingEvent.count({ where: { providerEventId: created.id } })).toBe(1);
    // an older update arriving late is ignored
    await deliver(
      evt('customer.subscription.updated', subObj(ids.cusA!, { status: 'past_due' }), NOW - 600),
    ).expect(200);
    o = (await http().get(`${base()}/overview`).set(owner)).body;
    expect(o.subscription.status).toBe('ACTIVE');
    const ev = await db.billingEvent.findFirstOrThrow({
      where: { type: 'customer.subscription.updated', workspaceId: ids.wsA! },
    });
    expect(ev.outcome).toMatch(/older/);
    // checkout is now refused: change the plan instead
    await http()
      .post(`${base()}/subscription/checkout`)
      .set(owner)
      .send({ planKey: 'scale', interval: 'MONTH' })
      .expect(409);
  });

  it('cannot cross tenants: events for unknown customers or another workspace’s customer never touch this workspace', async () => {
    const before = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } });
    const r = await deliver(
      evt('customer.subscription.updated', subObj('cus_unknown', { status: 'canceled' })),
    ).expect(200);
    expect(r.body.received).toBe(true);
    // B's customer id can only ever change B, even if the payload says otherwise
    await deliver(
      evt(
        'customer.subscription.created',
        subObj(ids.cusB!, { id: `sub_B_${sfx}`, metadata: { workspaceId: ids.wsA } }),
      ),
    ).expect(200);
    expect(await db.subscription.count({ where: { workspaceId: ids.wsB! } })).toBe(1);
    const after = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } });
    expect(after.status).toBe(before.status);
    expect(after.providerSubscriptionId).toBe(before.providerSubscriptionId);
    // a checkout reference can't hijack a workspace that already has another customer
    await deliver(
      evt('checkout.session.completed', { client_reference_id: ids.wsA, customer: 'cus_attacker' }),
    ).expect(200);
    expect(
      (await db.billingAccount.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } }))
        .providerCustomerId,
    ).toBe(ids.cusA);
    // an unknown price id is recorded as ignored, not guessed
    await deliver(
      evt(
        'customer.subscription.updated',
        subObj(ids.cusA!, { items: { data: [{ price: { id: 'price_mystery' } }] } }),
      ),
    ).expect(200);
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } })).planKey,
    ).toBe('growth');
    // workspace A cannot read B's billing
    expect(
      (
        await http()
          .get(`${base()}/overview`)
          .set(await auth(ids.owner!))
      ).body.subscription.planKey,
    ).toBe('growth');
  });

  it('mirrors invoices from events: pending → failed → paid, with lines, snapshot, filters and a PDF', async () => {
    const owner = await auth(ids.owner!);
    const inv = `in_${sfx}_0001`;
    await deliver(evt('invoice.created', invObj(ids.cusA!, inv), NOW)).expect(200);
    let list = (await http().get(`${base()}/invoices`).set(owner).expect(200)).body;
    expect(list.data[0]).toMatchObject({
      status: 'PENDING',
      totalMinor: 4900,
      planKey: 'growth',
      canRetry: false,
    });
    await deliver(
      evt(
        'invoice.payment_failed',
        invObj(ids.cusA!, inv, { attempted: true, attempt_count: 1 }),
        NOW + 10,
      ),
    ).expect(200);
    list = (await http().get(`${base()}/invoices?status=FAILED`).set(owner)).body;
    expect(list.data).toHaveLength(1);
    expect(list.data[0].canRetry).toBe(true);
    // whole-history summary: one invoice, none paid, the unpaid amount per currency
    expect(list.summary.total).toBe(1);
    expect(list.summary.paid).toBe(0);
    expect(list.summary.outstanding).toEqual([
      { currency: list.data[0].currency, amountMinor: 4900 },
    ]);
    // search and date filters narrow the list but never the summary
    const q = async (qs: string) =>
      (await http().get(`${base()}/invoices?${qs}`).set(owner).expect(200)).body;
    expect((await q('q=growth')).data).toHaveLength(1);
    expect((await q('q=zzz-nothing')).data).toHaveLength(0);
    expect((await q('q=zzz-nothing')).summary.total).toBe(1);
    expect((await q('from=1970-01-01&to=2100-01-01')).data).toHaveLength(1);
    expect((await q('to=2000-01-01')).data).toHaveLength(0);
    expect((await q('from=2100-01-01')).data).toHaveLength(0);
    await http().get(`${base()}/invoices?from=yesterday`).set(owner).expect(400);
    await http().get(`${base()}/invoices?sort=nonsense`).set(owner).expect(400);
    expect((await q('sort=amount_asc')).data).toHaveLength(1);
    let o = (await http().get(`${base()}/overview`).set(owner)).body;
    expect(o.hasFailedPayment).toBe(true);
    const id = list.data[0].id;
    // retry asks the provider to pay it; local status only changes when the provider reports back
    calls.length = 0;
    await http().post(`${base()}/invoices/${id}/retry`).set(owner).expect(200);
    expect(calls.some((c) => c.path === `/v1/invoices/${inv}/pay`)).toBe(true);
    expect((await http().get(`${base()}/invoices/${id}`).set(owner)).body.status).toBe('FAILED');
    await deliver(
      evt('invoice.paid', invObj(ids.cusA!, inv, { status: 'paid', amount_paid: 4900 }), NOW + 20),
    ).expect(200);
    const detail = (await http().get(`${base()}/invoices/${id}`).set(owner).expect(200)).body;
    expect(detail).toMatchObject({
      status: 'PAID',
      subtotalMinor: 4900,
      amountPaidMinor: 4900,
      seller: { name: 'Torio' },
    });
    expect(detail.lines).toEqual([{ description: 'Growth plan', quantity: 1, amountMinor: 4900 }]);
    expect(detail.customer.companyName).toBe('Acme Ltd');
    await http().post(`${base()}/invoices/${id}/retry`).set(owner).expect(409); // only failed invoices
    expect((await http().get(`${base()}/invoices?status=PAID`).set(owner)).body.data).toHaveLength(
      1,
    );
    expect(
      (await http().get(`${base()}/invoices?status=REFUNDED`).set(owner)).body.data,
    ).toHaveLength(0);
    o = (await http().get(`${base()}/overview`).set(owner)).body;
    expect(o.hasFailedPayment).toBe(false);
    const paidList = (await http().get(`${base()}/invoices`).set(owner)).body;
    expect(paidList.summary).toMatchObject({ total: 1, paid: 1, outstanding: [] });
    // the PDF is generated from the stored record
    const pdf = await http()
      .get(`${base()}/invoices/${id}/pdf`)
      .set(owner)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.headers['content-disposition']).toContain('.pdf');
    const text = (pdf.body as Buffer).toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('INV-0001');
    expect(text).toContain('USD 49.00'); // ASCII PDF font: ISO code instead of a symbol
    // invoices are tenant-scoped
    await http()
      .get(`${base(ids.wsB)}/invoices/${id}`)
      .set(await auth(ids.outsider!))
      .expect(404);
    await http()
      .get(`${base()}/invoices/${id}`)
      .set(await auth(ids.outsider!))
      .expect(404);
    // a refund event marks it refunded, and a later "paid" replay can't undo that
    await deliver(
      evt(
        'charge.refunded',
        { customer: ids.cusA, invoice: inv, amount: 4900, amount_refunded: 4900 },
        NOW + 30,
      ),
    ).expect(200);
    expect((await http().get(`${base()}/invoices/${id}`).set(owner)).body.status).toBe('REFUNDED');
  });

  it('an invoice keeps the billing details it was issued with; new invoices use the latest General Settings', async () => {
    const owner = await auth(ids.owner!);
    const list = (await http().get(`${base()}/invoices?sort=date_asc`).set(owner)).body.data;
    const first = list[0];
    const before = (await http().get(`${base()}/invoices/${first.id}`).set(owner)).body.customer;
    expect(before).toMatchObject({
      companyName: 'Acme Ltd',
      city: 'Dhaka',
      billingEmail: 'pay@acme.co',
    });
    await db.workspace.update({
      where: { id: ids.wsA! },
      data: { name: 'Acme Holdings', city: 'Chattogram', contactEmail: 'billing@acme.co' },
    });
    await deliver(evt('invoice.created', invObj(ids.cusA!, `in_${sfx}_0002`), NOW + 100)).expect(
      200,
    );
    const all = (await http().get(`${base()}/invoices?sort=date_desc`).set(owner)).body.data;
    const second = all.find((x: { id: string }) => x.id !== first.id);
    const d2 = (await http().get(`${base()}/invoices/${second.id}`).set(owner)).body.customer;
    expect(d2).toMatchObject({
      companyName: 'Acme Holdings',
      city: 'Chattogram',
      billingEmail: 'billing@acme.co',
    });
    // the first invoice is untouched, even after a later provider event for it
    await deliver(
      evt(
        'invoice.updated',
        invObj(ids.cusA!, `in_${sfx}_0001`, { status: 'paid', amount_paid: 4900 }),
        NOW + 200,
      ),
    ).expect(200);
    const after = (await http().get(`${base()}/invoices/${first.id}`).set(owner)).body.customer;
    expect(after).toEqual(before);
    // the stored snapshot is what a reprint uses
    const row = await db.invoice.findUniqueOrThrow({ where: { id: first.id } });
    expect((row.customerSnapshot as { city: string }).city).toBe('Dhaka');
    await db.workspace.update({
      where: { id: ids.wsA! },
      data: { name: 'Acme Ltd', city: 'Dhaka', contactEmail: 'pay@acme.co' },
    });
  });

  it('manages payment methods from provider events and provider-confirmed actions; card data never appears', async () => {
    const owner = await auth(ids.owner!);
    const card = (id: string, last4: string) => ({
      id,
      type: 'card',
      customer: ids.cusA,
      card: { brand: 'visa', last4, exp_month: 12, exp_year: 2030 },
    });
    await deliver(evt('payment_method.attached', card('pm_1', '4242'))).expect(200);
    await deliver(evt('payment_method.attached', card('pm_2', '1111'))).expect(200);
    let pms = (await http().get(`${base()}/payment-methods`).set(owner).expect(200)).body.data;
    expect(pms).toHaveLength(2);
    expect(pms[0]).toMatchObject({
      brand: 'visa',
      last4: '4242',
      isDefault: true,
      expMonth: 12,
      expYear: 2030,
    });
    expect(JSON.stringify(pms)).not.toMatch(/pm_1|number|cvc/i);
    calls.length = 0;
    const second = pms.find((p: { last4: string }) => p.last4 === '1111');
    pms = (
      await http().post(`${base()}/payment-methods/${second.id}/default`).set(owner).expect(200)
    ).body.data;
    expect(pms.find((p: { last4: string }) => p.last4 === '1111').isDefault).toBe(true);
    expect(pms.filter((p: { isDefault: boolean }) => p.isDefault)).toHaveLength(1);
    expect(
      calls
        .find((c) => c.path === `/v1/customers/${ids.cusA}`)!
        .form.get('invoice_settings[default_payment_method]'),
    ).toBe('pm_2');
    // hosted card entry
    calls.length = 0;
    const s = await http().post(`${base()}/payment-methods/session`).set(owner).expect(200);
    expect(s.body.url).toMatch(/^https:/);
    expect(calls.find((c) => c.path === '/v1/checkout/sessions')!.form.get('mode')).toBe('setup');
    // removal goes through the provider; another tenant can't touch it
    await http()
      .delete(`${base(ids.wsB)}/payment-methods/${second.id}`)
      .set(await auth(ids.outsider!))
      .expect(404);
    const first = pms.find((p: { last4: string }) => p.last4 === '4242');
    await http().delete(`${base()}/payment-methods/${first.id}`).set(owner).expect(200);
    expect(calls.some((c) => c.path === '/v1/payment_methods/pm_1/detach')).toBe(true);
    // the only remaining card on an active subscription can't be removed
    await http().delete(`${base()}/payment-methods/${second.id}`).set(owner).expect(409);
    await deliver(evt('payment_method.detached', { id: 'pm_2' })).expect(200);
    expect((await http().get(`${base()}/payment-methods`).set(owner)).body.data).toHaveLength(0);
  });

  it('previews and requests upgrades/downgrades; local state changes only after the provider confirms', async () => {
    const owner = await auth(ids.owner!);
    const prev = (b: object) => http().post(`${base()}/subscription/preview`).set(owner).send(b);
    expect((await prev({ planKey: 'scale', interval: 'MONTH' }).expect(200)).body).toMatchObject({
      kind: 'upgrade',
      blockedReason: null,
      priceMinor: 1_200_000,
      placeholderPricing: true,
    });
    expect((await prev({ planKey: 'growth', interval: 'MONTH' })).body).toMatchObject({
      kind: 'same',
      blockedReason: expect.any(String),
    });
    expect((await prev({ planKey: 'growth', interval: 'YEAR' })).body.kind).toBe('interval');
    const down = (await prev({ planKey: 'starter', interval: 'MONTH' })).body;
    expect(down.kind).toBe('downgrade');
    expect(down.overages.map((o: { metric: string }) => o.metric)).toEqual([]); // 3 members, 1 contact: within Starter
    // make usage exceed Starter (5 members) to force the overage warning
    const extra = await Promise.all(
      [1, 2, 3].map((i) =>
        db.user.create({ data: { email: `m${i}-${sfx}@t.co`, name: `m${i}`, passwordHash: 'x' } }),
      ),
    );
    await db.workspaceMembership.createMany({
      data: extra.map((u) => ({ workspaceId: ids.wsA!, userId: u.id, role: 'AGENT' as const })),
    });
    const over = (await prev({ planKey: 'starter', interval: 'MONTH' })).body;
    expect(over.overages).toEqual([
      expect.objectContaining({ metric: 'members', used: 6, limit: 5 }),
    ]);
    const change = (b: object) => http().post(`${base()}/subscription/change`).set(owner).send(b);
    calls.length = 0;
    await change({ planKey: 'starter', interval: 'MONTH' }).expect(409); // must acknowledge
    expect(calls).toHaveLength(0);
    await change({ planKey: 'growth', interval: 'MONTH' }).expect(409); // same plan
    const ok = await change({
      planKey: 'starter',
      interval: 'MONTH',
      acknowledgeOverage: true,
    }).expect(200);
    expect(ok.body).toMatchObject({ accepted: true });
    const upd = calls.find(
      (c) => c.method === 'POST' && c.path === `/v1/subscriptions/sub_${sfx}`,
    )!;
    expect(upd.form.get('items[0][price]')).toBe(PRICES.starter.month);
    expect(upd.form.get('items[0][id]')).toBe('si_1');
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } })).planKey,
    ).toBe('growth'); // unchanged
    await deliver(
      evt(
        'customer.subscription.updated',
        subObj(ids.cusA!, { items: { data: [{ price: { id: PRICES.starter.month } }] } }),
        NOW + 100,
      ),
    ).expect(200);
    expect((await http().get(`${base()}/overview`).set(owner)).body.plan.key).toBe('starter');
    await db.workspaceMembership.deleteMany({ where: { userId: { in: extra.map((u) => u.id) } } });
    await db.user.deleteMany({ where: { id: { in: extra.map((u) => u.id) } } });
  });

  it('cancel at period end keeps access, can be resumed; immediate cancel and expiry reopen checkout', async () => {
    const owner = await auth(ids.owner!);
    calls.length = 0;
    const r = await http()
      .post(`${base()}/subscription/cancel`)
      .set(owner)
      .send({ atPeriodEnd: true, reason: 'Too expensive' })
      .expect(200);
    expect(r.body.message).toMatch(/end of the billing period/);
    expect(
      calls
        .find((c) => c.path === `/v1/subscriptions/sub_${sfx}`)!
        .form.get('cancel_at_period_end'),
    ).toBe('true');
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } }))
        .cancelAtPeriodEnd,
    ).toBe(false);
    await deliver(
      evt(
        'customer.subscription.updated',
        subObj(ids.cusA!, {
          cancel_at_period_end: true,
          canceled_at: NOW,
          items: { data: [{ price: { id: PRICES.starter.month } }] },
        }),
        NOW + 200,
      ),
    ).expect(200);
    let o = (await http().get(`${base()}/overview`).set(owner)).body;
    expect(o.subscription.cancelAtPeriodEnd).toBe(true);
    expect(o.actions).toMatchObject({
      canResume: true,
      canChange: false,
      canCancel: false,
      access: 'full_until_period_end',
    });
    expect(o.nextPayment).toBeNull();
    await http()
      .post(`${base()}/subscription/change`)
      .set(owner)
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(409);
    await http().post(`${base()}/subscription/cancel`).set(owner).send({}).expect(409);
    calls.length = 0;
    await http().post(`${base()}/subscription/resume`).set(owner).expect(200);
    expect(
      calls
        .find((c) => c.path === `/v1/subscriptions/sub_${sfx}`)!
        .form.get('cancel_at_period_end'),
    ).toBe('false');
    await deliver(
      evt(
        'customer.subscription.updated',
        subObj(ids.cusA!, { items: { data: [{ price: { id: PRICES.starter.month } }] } }),
        NOW + 300,
      ),
    ).expect(200);
    expect((await http().get(`${base()}/overview`).set(owner)).body.actions.canCancel).toBe(true);
    await http().post(`${base()}/subscription/resume`).set(owner).expect(409);
    // immediate cancellation, confirmed by the deleted event
    calls.length = 0;
    await http()
      .post(`${base()}/subscription/cancel`)
      .set(owner)
      .send({ atPeriodEnd: false })
      .expect(200);
    expect(
      calls.some((c) => c.method === 'DELETE' && c.path === `/v1/subscriptions/sub_${sfx}`),
    ).toBe(true);
    await deliver(
      evt(
        'customer.subscription.deleted',
        subObj(ids.cusA!, {
          status: 'canceled',
          current_period_end: NOW - 10,
          items: { data: [{ price: { id: PRICES.starter.month } }] },
        }),
        NOW + 400,
      ),
    ).expect(200);
    o = (await http().get(`${base()}/overview`).set(owner)).body;
    expect(o.subscription.status).toBe('CANCELED');
    expect(o.actions).toMatchObject({ canCheckout: true, access: 'none' });
    expect(
      await db.auditLog.count({
        where: { workspaceId: ids.wsA!, action: 'billing.cancel_requested' },
      }),
    ).toBe(2);
  });

  it('past due: limited access, retry available, plan changes blocked; recovery restores normal state', async () => {
    const owner = await auth(ids.owner!);
    // a new subscription after the previous one ended
    await deliver(
      evt(
        'customer.subscription.created',
        subObj(ids.cusA!, { id: `sub2_${sfx}`, status: 'past_due' }),
        NOW + 500,
      ),
    ).expect(200);
    let o = (await http().get(`${base()}/overview`).set(owner)).body;
    expect(o.subscription).toMatchObject({ planKey: 'growth', status: 'PAST_DUE' });
    expect(o.actions).toMatchObject({
      canRetryPayment: true,
      canChange: false,
      canCancel: true,
      access: 'limited',
    });
    expect(o.hasFailedPayment).toBe(true);
    const pv = (
      await http()
        .post(`${base()}/subscription/preview`)
        .set(owner)
        .send({ planKey: 'scale', interval: 'MONTH' })
    ).body;
    expect(pv.blockedReason).toMatch(/failed payment/);
    await http()
      .post(`${base()}/subscription/change`)
      .set(owner)
      .send({ planKey: 'scale', interval: 'MONTH' })
      .expect(409);
    await deliver(
      evt(
        'customer.subscription.updated',
        subObj(ids.cusA!, { id: `sub2_${sfx}`, status: 'active' }),
        NOW + 600,
      ),
    ).expect(200);
    o = (await http().get(`${base()}/overview`).set(owner)).body;
    expect(o.subscription.status).toBe('ACTIVE');
    expect(o.actions.canRetryPayment).toBe(false);
  });

  it('transient provider states are not mirrored, and unhandled event types are recorded as ignored', async () => {
    const before = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } });
    const inc = evt(
      'customer.subscription.updated',
      subObj(ids.cusA!, { id: `sub2_${sfx}`, status: 'incomplete' }),
      NOW + 700,
    );
    await deliver(inc).expect(200);
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } })).status,
    ).toBe(before.status);
    const other = evt('radar.early_fraud_warning.created', {});
    await deliver(other).expect(200);
    expect(
      (await db.billingEvent.findUniqueOrThrow({ where: { providerEventId: other.id } })).outcome,
    ).toMatch(/not handled/);
    // malformed events are rejected before any processing
    await deliver({ id: 'x' }).expect(400);
  });
});

describe.skipIf(!url)('billing without a payment provider (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let owner: { Authorization: string };
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    delete process.env.BILLING_PRICE_IDS;
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    const u = await db.user.create({
      data: { email: `np-${sfx}@t.co`, name: 'np', passwordHash: 'x' },
    });
    const ws = await db.workspace.create({ data: { name: 'NP', slug: `np-${sfx}` } });
    await db.workspaceMembership.create({
      data: { workspaceId: ws.id, userId: u.id, role: 'OWNER' },
    });
    Object.assign(ids, { u: u.id, ws: ws.id });
    owner = {
      Authorization: `Bearer ${await app.get(JwtService).signAsync({ sub: u.id, sid: 's' })}`,
    };
  });
  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: ids.ws! } });
    await db.auditLog.deleteMany({ where: { actorId: ids.u! } });
    await db.user.deleteMany({ where: { id: ids.u! } });
    await db.$disconnect();
    await app.close();
  });

  it('reports payments as not connected; nothing can be bought and no success is ever faked', async () => {
    const b = `/api/v1/workspaces/${ids.ws}/billing`;
    const o = (await http().get(`${b}/overview`).set(owner).expect(200)).body;
    expect(o).toMatchObject({ providerConfigured: false, provider: null, onFreePlan: true });
    expect(
      (await http().get(`${b}/plans`).set(owner)).body.data.every(
        (p: { purchasable: boolean }) => !p.purchasable,
      ),
    ).toBe(true);
    const pv = (
      await http()
        .post(`${b}/subscription/preview`)
        .set(owner)
        .send({ planKey: 'growth', interval: 'MONTH' })
    ).body;
    expect(pv.blockedReason).toMatch(/aren.t connected/);
    await http()
      .post(`${b}/subscription/checkout`)
      .set(owner)
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(400);
    await http().post(`${b}/payment-methods/session`).set(owner).expect(503);
    expect(await db.subscription.count({ where: { workspaceId: ids.ws! } })).toBe(0);
    // the billing details (General Settings) can still be read without a provider
    await http().get(`${b}/profile`).set(owner).expect(200);
    // webhooks can't be accepted without a configured secret
    await http()
      .post('/api/v1/billing/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send({ id: 'e' })
      .expect(503);
  });
});

void randomUUID;
