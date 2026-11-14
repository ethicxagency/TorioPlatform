import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fingerprintOf, type Stored } from '../src/modules/admin/integrations/state';
import { PasswordService } from '../src/modules/auth/password.service';
import { PlansService } from '../src/modules/billing/plans.service';
import { SslcommerzService } from '../src/modules/billing/sslcommerz/sslcommerz.service';
import { ChannelCryptoService } from '../src/modules/whatsapp/channel-crypto.service';

/**
 * Real-PostgreSQL tests for paying with SSLCommerz, with the gateway itself mocked: sandbox checkout, server-side validation,
 * amount and currency checks, replays, failure and cancellation, expiry, and isolation between workspaces.
 * Needs TEST_DATABASE_URL with the sslcommerz_payments migration applied. No real credentials are used.
 */
const url = process.env.TEST_DATABASE_URL;
const KEY = 'integration-test-encryption-key-32-chars-min!';
const PASSWORD = 'torio-sandbox@ssl';
const md5 = (s: string) => createHash('md5').update(s).digest('hex');

describe.skipIf(!url)('SSLCommerz payments (real PostgreSQL, mocked gateway)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let ssl: SslcommerzService;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const http = () => request(app.getHttpServer());
  const W = (w = ids.ws!) => `/api/v1/workspaces/${w}/billing/sslcommerz`;
  const gw = {
    calls: [] as { url: string; body: string }[],
    validation: null as null | Record<string, string>,
    session: 'SUCCESS',
    querying: false,
  };

  const setConfig = async (over: { enabled?: boolean; env?: string } = {}) => {
    const crypto = app.get(ChannelCryptoService);
    const s: Stored = {
      values: { environment: over.env ?? 'sandbox', storeId: 'torio5f1a', currencies: 'BDT' },
      secrets: { storePassword: crypto.encrypt(PASSWORD) },
      secretVersions: { storePassword: 1 },
      enabled: over.enabled ?? true,
    };
    s.verification = {
      status: 'VERIFIED',
      at: new Date().toISOString(),
      fingerprint: fingerprintOf('sslcommerz', s),
      error: null,
    };
    await db.platformSetting.upsert({
      where: { key: 'integration.sslcommerz' },
      create: { key: 'integration.sslcommerz', value: s as never },
      update: { value: s as never },
    });
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.THROTTLE_DISABLED = 'true';
    process.env.CHANNEL_ENCRYPTION_KEY = KEY;
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    ssl = app.get(SslcommerzService);
    ssl.fetch = (async (u: string, init?: RequestInit) => {
      const body = init?.body ? String(init.body) : '';
      gw.calls.push({ url: String(u), body });
      if (String(u).includes('gwprocess'))
        return new Response(
          JSON.stringify(
            gw.session === 'SUCCESS'
              ? {
                  status: 'SUCCESS',
                  sessionkey: 'SK1',
                  GatewayPageURL: 'https://sandbox.sslcommerz.com/gw/SK1',
                }
              : { status: 'FAILED', failedreason: 'Store Credential Error' },
          ),
          { status: 200 },
        );
      if (String(u).includes('merchantTransIDvalidationAPI'))
        return new Response(
          JSON.stringify({
            element:
              gw.querying && gw.validation
                ? [{ status: gw.validation.status, val_id: gw.validation.val_id }]
                : [],
          }),
          { status: 200 },
        );
      return new Response(JSON.stringify(gw.validation ?? { status: 'INVALID_TRANSACTION' }), {
        status: 200,
      });
    }) as never;
    const jwt = app.get(JwtService);
    auth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: (await db.session.findFirstOrThrow({ where: { userId: id } })).id })}`,
    });
    const hash = await app.get(PasswordService).hash('Random-unusable-pass-1');
    const mk = (n: string) =>
      db.user.create({
        data: {
          email: `${n}-${sfx}@t.co`,
          name: n,
          passwordHash: hash,
          emailVerifiedAt: new Date(),
        },
      });
    const [owner, agent, outsider] = await Promise.all([mk('owner'), mk('agent'), mk('outsider')]);
    const mkWs = (n: string, extra: object = {}) =>
      db.workspace.create({
        data: {
          name: n,
          slug: `ssl-${n}-${sfx}`,
          contactEmail: `${n}@t.co`,
          country: 'BD',
          addressLine: 'Road 1',
          city: 'Dhaka',
          phone: '+8801700000000',
          ...extra,
        },
      });
    const ws = await mkWs('a');
    const wsB = await mkWs('b');
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: ws.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: ws.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    for (const u of [owner, agent, outsider])
      await db.session.create({
        data: {
          userId: u.id,
          familyId: randomUUID(),
          refreshTokenHash: `${u.id}-${sfx}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    Object.assign(ids, {
      owner: owner.id,
      agent: agent.id,
      outsider: outsider.id,
      ws: ws.id,
      wsB: wsB.id,
    });
    await app.get(PlansService).seed();
    await setConfig();
  });

  afterAll(async () => {
    await db.paymentGatewayTransaction.deleteMany({
      where: { workspaceId: { in: [ids.ws!, ids.wsB!] } },
    });
    await db.invoice.deleteMany({ where: { workspaceId: { in: [ids.ws!, ids.wsB!] } } });
    await db.subscription.deleteMany({ where: { workspaceId: { in: [ids.ws!, ids.wsB!] } } });
    await db.workspaceMembership.deleteMany({
      where: { workspaceId: { in: [ids.ws!, ids.wsB!] } },
    });
    await db.workspace.deleteMany({ where: { id: { in: [ids.ws!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.agent!, ids.outsider!] } } });
    await db.platformSetting.deleteMany({ where: { key: 'integration.sslcommerz' } });
    await db.$disconnect();
    await app.close();
  });

  const start = async (planKey = 'starter', interval = 'MONTH') => {
    const r = await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey, interval })
      .expect(200);
    const tran = await db.paymentGatewayTransaction.findUniqueOrThrow({
      where: { tranId: r.body.tranId },
    });
    return { r, tran };
  };
  const valid = (
    t: { tranId: string; amountMinor: number; currency: string },
    over: Record<string, string> = {},
  ) => ({
    status: 'VALID',
    tran_id: t.tranId,
    val_id: 'VAL-' + t.tranId.slice(-6),
    store_id: 'torio5f1a',
    amount: (t.amountMinor / 100).toFixed(2),
    currency_type: t.currency,
    currency_amount: (t.amountMinor / 100).toFixed(2),
    bank_tran_id: 'BANK1',
    card_type: 'BKASH-bKash',
    risk_level: '0',
    ...over,
  });
  const cb = (kind: string, body: Record<string, string>) =>
    http().post(`/api/v1/payments/sslcommerz/${kind}`).type('form').send(body);
  const sub = () => db.subscription.findUnique({ where: { workspaceId: ids.ws! } });

  it('starts a checkout with the server’s own price, and the browser cannot choose the amount or the workspace', async () => {
    const { r, tran } = await start();
    expect(r.body.url).toBe('https://sandbox.sslcommerz.com/gw/SK1');
    expect(r.body.tranId).toMatch(/^TORIO-[0-9A-F]{18}$/);
    const plan = await db.planDefinition.findUniqueOrThrow({ where: { key: 'starter' } });
    expect([
      tran.amountMinor,
      tran.currency,
      tran.workspaceId,
      tran.status,
      tran.environment,
    ]).toEqual([plan.monthlyMinor, plan.currency, ids.ws, 'PENDING', 'sandbox']);
    const sent = new URLSearchParams(gw.calls.find((c) => c.url.includes('gwprocess'))!.body);
    expect(sent.get('total_amount')).toBe((plan.monthlyMinor / 100).toFixed(2));
    expect(sent.get('tran_id')).toBe(tran.tranId);
    expect(sent.get('success_url')).toMatch(/\/api\/v1\/payments\/sslcommerz\/success$/);
    // nothing in the request body is an amount: extra fields are refused
    await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey: 'starter', interval: 'MONTH', amount: 1 })
      .expect(400);
    await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey: 'free', interval: 'MONTH' })
      .expect(400);
    await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey: 'nope', interval: 'MONTH' })
      .expect(400);
    expect(await sub()).toBeNull(); // starting a payment changes nothing
  });

  it('only the people who may manage billing can start a payment, and another workspace cannot read it', async () => {
    await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.agent!))
      .send({ planKey: 'starter', interval: 'MONTH' })
      .expect(403);
    await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.outsider!))
      .send({ planKey: 'starter', interval: 'MONTH' })
      .expect(404);
    const { r } = await start();
    await http()
      .get(`${W()}/transactions/${r.body.tranId}`)
      .set(await auth(ids.outsider!))
      .expect(404);
    await http()
      .get(`${W(ids.wsB)}/transactions/${r.body.tranId}`)
      .set(await auth(ids.outsider!))
      .expect(404); // not theirs either
    await http()
      .get(`${W()}/transactions`)
      .set(await auth(ids.owner!))
      .expect(200);
  });

  it('does not start a plan from the browser callback alone: a forged success with no valid payment changes nothing', async () => {
    const { tran } = await start();
    gw.validation = { status: 'INVALID_TRANSACTION' };
    const r = await cb('success', {
      tran_id: tran.tranId,
      val_id: 'FORGED',
      status: 'VALID',
      amount: '1.00',
    });
    expect(r.status).toBe(303);
    expect(r.headers.location).toContain('result=processing');
    expect(await sub()).toBeNull();
    expect(
      (await db.paymentGatewayTransaction.findUniqueOrThrow({ where: { id: tran.id } })).status,
    ).toBe('PENDING');
    // unknown or malformed transaction ids go to a failure page, with no gateway call for them
    const before = gw.calls.length;
    expect(
      (await cb('success', { tran_id: 'TORIO-NOPE', val_id: 'x' })).headers.location,
    ).toContain('result=failed');
    expect(gw.calls.length).toBe(before);
  });

  it('starts the plan once the gateway validates the same transaction, store, amount and currency, with an invoice, and replays change nothing', async () => {
    const { tran } = await start();
    gw.validation = valid(tran);
    const r = await cb('success', { tran_id: tran.tranId, val_id: gw.validation.val_id! });
    expect(r.status).toBe(303);
    expect(r.headers.location).toContain('result=success');
    expect(r.headers.location).toContain(`tran=${tran.tranId}`);
    const s1 = (await sub())!;
    expect([s1.planKey, s1.status, s1.source, s1.cancelAtPeriodEnd, s1.interval]).toEqual([
      'starter',
      'ACTIVE',
      'GATEWAY',
      true,
      'MONTH',
    ]);
    expect(s1.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);
    const t = await db.paymentGatewayTransaction.findUniqueOrThrow({ where: { id: tran.id } });
    expect([t.status, t.valId, t.bankTranId, t.paymentMethod]).toEqual([
      'PAID',
      gw.validation.val_id,
      'BANK1',
      'BKASH-bKash',
    ]);
    expect(t.appliedAt).not.toBeNull();
    const inv = await db.invoice.findMany({
      where: { workspaceId: ids.ws!, providerInvoiceId: `sslcommerz:${tran.tranId}` },
      include: { lines: true },
    });
    expect(inv).toHaveLength(1);
    expect([
      inv[0]!.status,
      inv[0]!.totalMinor,
      inv[0]!.amountPaidMinor,
      inv[0]!.lines.length,
    ]).toEqual(['PAID', tran.amountMinor, tran.amountMinor, 1]);
    // the same success again, an IPN for it, and a reconciliation: still one invoice and the same period
    const ipn: Record<string, string> = {
      tran_id: tran.tranId,
      val_id: gw.validation.val_id!,
      status: 'VALID',
      verify_key: 'status,tran_id,val_id',
    };
    ipn.verify_sign = md5(
      `status=VALID&store_passwd=${md5(PASSWORD)}&tran_id=${tran.tranId}&val_id=${ipn.val_id}`,
    );
    await cb('success', { tran_id: tran.tranId, val_id: ipn.val_id! }).expect(303);
    await http().post('/api/v1/payments/sslcommerz/ipn').type('form').send(ipn).expect(200);
    await ssl.reconcile(tran.tranId);
    expect(
      await db.invoice.count({
        where: { workspaceId: ids.ws!, providerInvoiceId: `sslcommerz:${tran.tranId}` },
      }),
    ).toBe(1);
    expect((await sub())!.currentPeriodEnd!.getTime()).toBe(s1.currentPeriodEnd!.getTime());
    // the workspace sees it as paid, and the billing overview reflects the plan and the end of the term
    const st = await http()
      .get(`${W()}/transactions/${tran.tranId}`)
      .set(await auth(ids.owner!))
      .expect(200);
    expect(st.body).toMatchObject({ status: 'PAID', planKey: 'starter' });
    const ov = await http()
      .get(`/api/v1/workspaces/${ids.ws}/billing/overview`)
      .set(await auth(ids.owner!))
      .expect(200);
    expect(ov.body.plan.key).toBe('starter');
    expect(ov.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(ov.body.nextPayment).toBeNull(); // it does not renew by itself
  });

  it('paying again for the same plan extends from the end of the paid term, not from today', async () => {
    const before = (await sub())!.currentPeriodEnd!;
    const { tran } = await start();
    gw.validation = valid(tran);
    await cb('success', { tran_id: tran.tranId, val_id: gw.validation.val_id! }).expect(303);
    const after = (await sub())!.currentPeriodEnd!;
    expect(after.getTime()).toBeGreaterThan(before.getTime() + 27 * 86_400_000);
    expect(after.getTime()).toBeLessThan(before.getTime() + 32 * 86_400_000);
  });

  it('rejects an amount, currency, store or transaction id that does not match, and flags a risky payment for review', async () => {
    const base = await sub();
    for (const [over, why] of [
      [{ amount: '1.00', currency_amount: '1.00' }, /Paid 1.00/],
      [{ currency_type: 'USD' }, /Paid in USD/],
      [{ store_id: 'someone-else' }, /different store/],
      [{ tran_id: 'TORIO-AAAAAAAAAAAAAAAAAA' }, /transaction id does not match/],
    ] as const) {
      const { tran } = await start();
      gw.validation = valid(tran, over as Record<string, string>);
      const r = await cb('success', { tran_id: tran.tranId, val_id: gw.validation.val_id! });
      expect(r.headers.location).toContain('result=review');
      const t = await db.paymentGatewayTransaction.findUniqueOrThrow({ where: { id: tran.id } });
      expect(t.status).toBe('REJECTED');
      expect(t.reason).toMatch(why);
      expect(t.appliedAt).toBeNull();
    }
    const { tran } = await start();
    gw.validation = valid(tran, { risk_level: '1' });
    await cb('success', { tran_id: tran.tranId, val_id: gw.validation.val_id! }).expect(303);
    expect(
      (await db.paymentGatewayTransaction.findUniqueOrThrow({ where: { id: tran.id } })).status,
    ).toBe('REVIEW');
    expect((await sub())!.currentPeriodEnd!.getTime()).toBe(base!.currentPeriodEnd!.getTime()); // none of those extended the term
  });

  it('marks failed and cancelled attempts, never undoes a confirmed payment, and refuses an unsigned or forged IPN', async () => {
    const f = (await start()).tran;
    expect(
      (await cb('fail', { tran_id: f.tranId, error: 'Card declined' })).headers.location,
    ).toContain('result=failed');
    expect(
      await db.paymentGatewayTransaction.findUniqueOrThrow({ where: { id: f.id } }),
    ).toMatchObject({ status: 'FAILED', reason: 'Card declined' });
    const c = (await start()).tran;
    expect((await cb('cancel', { tran_id: c.tranId })).headers.location).toContain(
      'result=cancelled',
    );
    expect(
      (await db.paymentGatewayTransaction.findUniqueOrThrow({ where: { id: c.id } })).status,
    ).toBe('CANCELLED');
    // a failed attempt that the customer then pays after all is confirmed by the gateway
    gw.validation = valid(f);
    await cb('success', { tran_id: f.tranId, val_id: gw.validation.val_id! }).expect(303);
    expect(
      (await db.paymentGatewayTransaction.findUniqueOrThrow({ where: { id: f.id } })).status,
    ).toBe('PAID');
    // a fail callback after payment changes nothing
    await cb('fail', { tran_id: f.tranId, error: 'late' }).expect(303);
    expect(
      (await db.paymentGatewayTransaction.findUniqueOrThrow({ where: { id: f.id } })).status,
    ).toBe('PAID');
    // IPN: unsigned and wrongly signed are refused
    await http()
      .post('/api/v1/payments/sslcommerz/ipn')
      .type('form')
      .send({ tran_id: f.tranId, status: 'VALID', val_id: 'x' })
      .expect(400);
    await http()
      .post('/api/v1/payments/sslcommerz/ipn')
      .type('form')
      .send({
        tran_id: f.tranId,
        status: 'VALID',
        val_id: 'x',
        verify_key: 'status,tran_id',
        verify_sign: 'a'.repeat(32),
      })
      .expect(400);
  });

  it('finds a payment whose callback was lost, by asking the gateway for the transaction (reconciliation)', async () => {
    const { tran } = await start();
    gw.validation = valid(tran);
    gw.querying = true;
    const r = await http()
      .get(`${W()}/transactions/${tran.tranId}`)
      .set(await auth(ids.owner!))
      .expect(200);
    gw.querying = false;
    expect(r.body.status).toBe('PAID');
  });

  it('a paid term ends by itself: expired, back on the free plan, and the plan limits follow', async () => {
    await db.subscription.update({
      where: { workspaceId: ids.ws! },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    expect(await ssl.expireDue()).toBe(1);
    expect((await sub())!.status).toBe('EXPIRED');
    const ov = await http()
      .get(`/api/v1/workspaces/${ids.ws}/billing/overview`)
      .set(await auth(ids.owner!))
      .expect(200);
    expect([ov.body.plan.key, ov.body.onFreePlan]).toEqual(['free', true]);
    // and it can be paid for again, starting a new term from now
    const { tran } = await start();
    gw.validation = valid(tran);
    await cb('success', { tran_id: tran.tranId, val_id: gw.validation.val_id! }).expect(303);
    expect((await sub())!).toMatchObject({ status: 'ACTIVE' });
  });

  it('refuses to start a payment when the workspace has a subscription managed elsewhere, when billing details are incomplete, or when the gateway is off', async () => {
    await db.subscription.update({ where: { workspaceId: ids.ws! }, data: { source: 'PROVIDER' } });
    await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(409);
    await db.subscription.update({ where: { workspaceId: ids.ws! }, data: { source: 'GATEWAY' } });
    await db.workspace.update({ where: { id: ids.ws! }, data: { contactEmail: null } });
    const r = await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(400);
    expect(JSON.stringify(r.body)).toMatch(/Complete your business information/);
    await db.workspace.update({ where: { id: ids.ws! }, data: { contactEmail: 'a@t.co' } });
    await setConfig({ enabled: false });
    await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(503);
    gw.session = 'FAILED';
    await setConfig();
    const bad = await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/Store Credential Error/);
    expect(
      (await db.paymentGatewayTransaction.findFirst({
        where: { workspaceId: ids.ws! },
        orderBy: { createdAt: 'desc' },
      }))!.status,
    ).toBe('FAILED');
    gw.session = 'SUCCESS';
  });

  it('a placeholder price is only charged in the sandbox', async () => {
    await db.planDefinition.update({
      where: { key: 'growth' },
      data: { placeholderPricing: true },
    });
    await setConfig({ env: 'live' });
    await db.subscription.deleteMany({ where: { workspaceId: ids.ws! } });
    const r = await http()
      .post(`${W()}/checkout`)
      .set(await auth(ids.owner!))
      .send({ planKey: 'growth', interval: 'MONTH' })
      .expect(400);
    expect(JSON.stringify(r.body)).toMatch(/placeholder/);
    await setConfig();
  });

  it('Super Admin can list payments across workspaces; secrets never appear in any payment record', async () => {
    const rows = await db.paymentGatewayTransaction.findMany({ where: { workspaceId: ids.ws! } });
    expect(rows.length).toBeGreaterThan(5);
    const text = JSON.stringify(rows);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toMatch(/card_no|store_passwd/i);
    const list = await ssl.list(null, { page: 1, pageSize: 50 });
    expect(list.data.some((t) => t.workspaceName === 'a')).toBe(true);
  });
});
