import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';
import { BILLING_PROVIDER } from '../src/modules/billing/provider/billing-provider';
import { StripeProvider } from '../src/modules/billing/provider/stripe.provider';

/** Real-PostgreSQL tests for the Super Admin panel API. Stripe is a recording fake `fetch`. */
const url = process.env.TEST_DATABASE_URL;
const PW = 'Admin-passphrase-1';
const PRICES = {
  starter: { month: 'price_st_m', year: 'price_st_y' },
  growth: { month: 'price_gr_m', year: 'price_gr_y' },
};

describe.skipIf(!url)('super admin (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let customerAuth: (id: string) => Promise<{ Authorization: string }>;
  let passwords: PasswordService;
  const calls: { method: string; path: string; form: URLSearchParams }[] = [];
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  let cookie = '';
  const http = () => request(app.getHttpServer());
  const A = '/api/v1/admin';
  const get = (p: string) => http().get(`${A}${p}`).set('Cookie', cookie);
  const post = (p: string, body: object = {}) =>
    http().post(`${A}${p}`).set('Cookie', cookie).set('X-Torio-Admin', '1').send(body);
  const patch = (p: string, body: object) =>
    http().patch(`${A}${p}`).set('Cookie', cookie).set('X-Torio-Admin', '1').send(body);

  const fakeFetch = (async (input: string, init?: RequestInit) => {
    const u = new URL(input);
    calls.push({
      method: init?.method ?? 'GET',
      path: u.pathname,
      form: new URLSearchParams((init?.body as string) ?? ''),
    });
    const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
    if (u.pathname.startsWith('/v1/subscriptions/') && init?.method === 'GET')
      return json({ items: { data: [{ id: 'si_1' }] } });
    return json({});
  }) as unknown as typeof fetch;

  async function adminLogin(email: string, password = PW) {
    const r = await http().post(`${A}/auth/login`).send({ email, password });
    return r;
  }
  const cookieFrom = (r: request.Response) =>
    (r.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0] ?? '';

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    // Login is rate limited in production (5/min); this suite signs in far more often than that.
    process.env.THROTTLE_DISABLED = 'true';
    process.env.BILLING_PRICE_IDS = JSON.stringify(PRICES);
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(BILLING_PROVIDER)
        .useValue(
          new StripeProvider('sk_test_admin_integration', 'whsec_admin_integration', fakeFetch),
        )
        .compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    passwords = app.get(PasswordService);
    const jwt = app.get(JwtService);
    customerAuth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: 's' })}`,
    });
    const hash = await passwords.hash(PW);
    const admin = await db.platformAdmin.create({
      data: { email: `root-${sfx}@torio.test`, name: 'Root', passwordHash: hash },
    });
    ids.admin = admin.id;
    ids.adminEmail = admin.email;
    const mk = (n: string) =>
      db.user.create({
        data: {
          email: `${n}-${sfx}@t.co`,
          name: `Cust ${n}`,
          passwordHash: hash,
          emailVerifiedAt: new Date(),
        },
      });
    const [alice, bob] = await Promise.all([mk('alice'), mk('bob')]);
    const wsA = await db.workspace.create({ data: { name: `Alpha ${sfx}`, slug: `adm-a-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: `Beta ${sfx}`, slug: `adm-b-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: alice.id, role: 'OWNER' },
        { workspaceId: wsB.id, userId: bob.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: bob.id, role: 'AGENT' },
      ],
    });
    await db.channel.create({
      data: { workspaceId: wsA.id, provider: 'WHATSAPP', displayName: 'W', status: 'CONNECTED' },
    });
    await db.session.create({
      data: {
        userId: alice.id,
        familyId: randomUUID(),
        refreshTokenHash: randomUUID() + randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    Object.assign(ids, {
      alice: alice.id,
      bob: bob.id,
      wsA: wsA.id,
      wsB: wsB.id,
      aliceEmail: alice.email,
      bobEmail: bob.email,
      wsAName: wsA.name,
    });
    const r = await adminLogin(admin.email);
    cookie = cookieFrom(r);
  });

  afterAll(async () => {
    await db.planDefinition.deleteMany({ where: { key: { startsWith: `t${sfx}` } } });
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [ids.alice!, ids.bob!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.alice!, ids.bob!] } } });
    await db.adminAuditLog.deleteMany({
      where: { OR: [{ adminEmail: { contains: sfx } }, { adminId: ids.admin! }] },
    });
    await db.platformAdmin.deleteMany({ where: { id: ids.admin! } });
    await db.platformSetting.deleteMany({ where: { key: 'registration' } });
    await db.$disconnect();
    await app.close();
  });

  it('signs in with a server-side session cookie, rejects bad credentials, and logs both', async () => {
    const bad = await adminLogin(ids.adminEmail!, 'wrong-password-123');
    expect(bad.status).toBe(401);
    expect((await adminLogin('nobody@torio.test')).status).toBe(401);
    const ok = await adminLogin(ids.adminEmail!);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ email: ids.adminEmail, role: 'SUPER_ADMIN' });
    expect(JSON.stringify(ok.body)).not.toMatch(/password|hash/i);
    const raw = (ok.headers['set-cookie'] as unknown as string[])[0]!;
    expect(raw).toMatch(/torio_admin=/);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/api\/v1\/admin/);
    const me = await http().get(`${A}/auth/me`).set('Cookie', cookieFrom(ok)).expect(200);
    expect(me.body.email).toBe(ids.adminEmail);
    expect(
      await db.adminAuditLog.count({
        where: { action: 'admin.login_failed', adminEmail: ids.adminEmail! },
      }),
    ).toBe(1);
    expect(
      await db.adminAuditLog.count({ where: { action: 'admin.login', adminId: ids.admin! } }),
    ).toBeGreaterThanOrEqual(2);
    // the stored session is a hash, never the raw token
    const token = cookieFrom(ok).split('=')[1]!;
    expect(await db.adminSession.count({ where: { tokenHash: token } })).toBe(0);
  });

  it('keeps customers out: no cookie, customer tokens and forged headers never reach admin routes', async () => {
    await http().get(`${A}/dashboard`).expect(401);
    await http()
      .get(`${A}/customers`)
      .set(await customerAuth(ids.alice!))
      .expect(401);
    await http().get(`${A}/customers`).set('Cookie', 'torio_admin=not-a-real-token').expect(401);
    await http()
      .get(`${A}/customers`)
      .set('X-Torio-Role', 'SUPER_ADMIN')
      .set('Cookie', `torio_admin=${ids.admin}`)
      .expect(401);
    await http()
      .post(`${A}/plans`)
      .set(await customerAuth(ids.alice!))
      .send({})
      .expect(401);
    // an admin session is not a customer session either
    await http().get('/api/v1/users/me').set('Cookie', cookie).expect(401);
    await http()
      .get(`/api/v1/workspaces/${ids.wsA}/billing/overview`)
      .set('Cookie', cookie)
      .expect(401);
    // customers can't mint an admin: there's no registration or promotion route
    await http().post(`${A}/auth/register`).send({ email: 'x@t.co', password: PW }).expect(404);
    expect(await db.platformAdmin.count({ where: { email: { contains: `-${sfx}@t.co` } } })).toBe(
      0,
    );
  });

  it('requires the admin header on state changes, honours logout, expiry and deactivation', async () => {
    await http()
      .post(`${A}/customers/${ids.alice}/suspend`)
      .set('Cookie', cookie)
      .send({ reason: 'No header' })
      .expect(403);
    const s = await adminLogin(ids.adminEmail!);
    const c = cookieFrom(s);
    await http().get(`${A}/dashboard`).set('Cookie', c).expect(200);
    await http().post(`${A}/auth/logout`).set('Cookie', c).expect(200);
    await http().get(`${A}/dashboard`).set('Cookie', c).expect(401);
    // expired
    const e = cookieFrom(await adminLogin(ids.adminEmail!));
    await db.adminSession.updateMany({
      where: { adminId: ids.admin!, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http().get(`${A}/dashboard`).set('Cookie', e).expect(401);
    // deactivated account
    cookie = cookieFrom(await adminLogin(ids.adminEmail!));
    await db.platformAdmin.update({ where: { id: ids.admin! }, data: { isActive: false } });
    await http().get(`${A}/dashboard`).set('Cookie', cookie).expect(401);
    expect((await adminLogin(ids.adminEmail!)).status).toBe(401);
    await db.platformAdmin.update({ where: { id: ids.admin! }, data: { isActive: true } });
    cookie = cookieFrom(await adminLogin(ids.adminEmail!));
    await get('/dashboard').expect(200);
  });

  it('changes the admin password (verifying the current one) and signs other sessions out', async () => {
    const other = cookieFrom(await adminLogin(ids.adminEmail!));
    await post('/auth/password', {
      currentPassword: 'wrong-wrong-12',
      newPassword: 'Another-passphrase-2',
    }).expect(403);
    await post('/auth/password', { currentPassword: PW, newPassword: 'short' }).expect(400);
    await post('/auth/password', {
      currentPassword: PW,
      newPassword: 'Another-passphrase-2',
    }).expect(200);
    await http().get(`${A}/auth/me`).set('Cookie', other).expect(401);
    await get('/auth/me').expect(200);
    expect((await adminLogin(ids.adminEmail!, PW)).status).toBe(401);
    cookie = cookieFrom(await adminLogin(ids.adminEmail!, 'Another-passphrase-2'));
    await post('/auth/password', {
      currentPassword: 'Another-passphrase-2',
      newPassword: PW,
    }).expect(200);
    cookie = cookieFrom(await adminLogin(ids.adminEmail!));
  });

  it('lists and searches customers with plan and subscription status, and never leaks secrets', async () => {
    const all = (await get(`/customers?q=${sfx}`).expect(200)).body;
    expect(all.meta.total).toBe(2);
    const alice = all.data.find((c: { email: string }) => c.email === ids.aliceEmail);
    expect(alice).toMatchObject({
      workspaceCount: 1,
      planKey: 'free',
      subscriptionStatus: 'NONE',
      status: 'ACTIVE',
    });
    expect(all.data.find((c: { email: string }) => c.email === ids.bobEmail).workspaceCount).toBe(
      2,
    );
    expect((await get(`/customers?q=alice-${sfx}`)).body.data).toHaveLength(1);
    expect((await get(`/customers?q=${sfx}&status=DISABLED`)).body.data).toHaveLength(0);
    expect((await get(`/customers?q=${sfx}&subscription=NONE`)).body.data).toHaveLength(2);
    expect((await get(`/customers?q=${sfx}&subscription=ACTIVE`)).body.data).toHaveLength(0);
    await get('/customers?status=BOGUS').expect(400);
    const d = (await get(`/customers/${ids.alice}`).expect(200)).body;
    expect(d.workspaces).toEqual([expect.objectContaining({ name: ids.wsAName, role: 'OWNER' })]);
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/passwordHash|argon2|refreshToken|tokenHash/i);
    await get(`/customers/${randomUUID()}`).expect(404);
  });

  it('suspends a customer with a required reason: sessions die, login and workspace access stop, all audited; reactivation restores', async () => {
    await post(`/customers/${ids.alice}/suspend`, {}).expect(400);
    await post(`/customers/${ids.alice}/suspend`, { reason: 'abc' }).expect(400);
    const r = await post(`/customers/${ids.alice}/suspend`, {
      reason: 'Chargeback fraud investigation',
    }).expect(200);
    expect(r.body).toMatchObject({
      status: 'DISABLED',
      suspendedReason: 'Chargeback fraud investigation',
    });
    expect(await db.session.count({ where: { userId: ids.alice!, revokedAt: null } })).toBe(0);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: ids.aliceEmail, password: PW })
      .expect(401);
    // an access token issued before suspension stops working on workspace routes immediately
    await http()
      .get(`/api/v1/workspaces/${ids.wsA}/customers`)
      .set(await customerAuth(ids.alice!))
      .expect(404);
    await post(`/customers/${ids.alice}/suspend`, { reason: 'Again please' }).expect(409);
    const audit = await db.adminAuditLog.findFirstOrThrow({
      where: { action: 'customer.suspend', targetId: ids.alice! },
    });
    expect(audit).toMatchObject({
      adminEmail: ids.adminEmail,
      reason: 'Chargeback fraud investigation',
      targetLabel: ids.aliceEmail,
    });
    expect((await get(`/customers?q=${sfx}&status=DISABLED`)).body.data).toHaveLength(1);
    await post(`/customers/${ids.alice}/reactivate`, { reason: 'Cleared after review' }).expect(
      200,
    );
    await http()
      .post('/api/v1/auth/login')
      .send({ email: ids.aliceEmail, password: PW })
      .expect(200);
    await http()
      .get(`/api/v1/workspaces/${ids.wsA}/customers`)
      .set(await customerAuth(ids.alice!))
      .expect(200);
    expect(
      await db.adminAuditLog.count({
        where: { action: 'customer.reactivate', targetId: ids.alice! },
      }),
    ).toBe(1);
  });

  it('manages workspaces: details, filters, and suspension that blocks members at once', async () => {
    const list = (await get(`/workspaces?q=${sfx}`).expect(200)).body;
    expect(list.meta.total).toBe(2);
    const a = list.data.find((w: { id: string }) => w.id === ids.wsA);
    expect(a).toMatchObject({
      members: 2,
      channels: 1,
      planKey: 'free',
      status: 'ACTIVE',
      owner: { email: ids.aliceEmail },
    });
    const det = (await get(`/workspaces/${ids.wsA}`).expect(200)).body;
    expect(det.subscription).toBeNull();
    await post(`/workspaces/${ids.wsA}/suspend`, { reason: 'ok' }).expect(400);
    await post(`/workspaces/${ids.wsA}/suspend`, { reason: 'Terms of service violation' }).expect(
      200,
    );
    const r = await http()
      .get(`/api/v1/workspaces/${ids.wsA}/customers`)
      .set(await customerAuth(ids.alice!));
    expect(r.status).toBe(403);
    expect(r.body.error.message).toMatch(/suspended/);
    // the other tenant is unaffected
    await http()
      .get(`/api/v1/workspaces/${ids.wsB}/customers`)
      .set(await customerAuth(ids.bob!))
      .expect(200);
    expect((await get(`/workspaces?q=${sfx}&status=SUSPENDED`)).body.data).toHaveLength(1);
    expect(
      (
        await http()
          .get('/api/v1/workspaces')
          .set(await customerAuth(ids.alice!))
      ).body[0].status,
    ).toBe('SUSPENDED');
    await post(`/workspaces/${ids.wsA}/suspend`, { reason: 'Already suspended' }).expect(409);
    await post(`/workspaces/${ids.wsA}/reactivate`, { reason: 'Appeal accepted' }).expect(200);
    await http()
      .get(`/api/v1/workspaces/${ids.wsA}/customers`)
      .set(await customerAuth(ids.alice!))
      .expect(200);
  });

  it('plans: create (disabled), edit, enable, and existing subscribers keep their entitlements', async () => {
    const key = `t${sfx}pro`;
    const body = {
      key,
      name: 'Test Pro',
      description: 'x',
      rank: 9,
      currency: 'USD',
      monthlyMinor: 1000,
      yearlyMinor: 10000,
      limits: {
        members: 10,
        channels: 3,
        contacts: 500,
        messages: 1000,
        whatsapp: 100,
        instagram: 100,
        messenger: 100,
      },
      aiCredits: 250,
      features: ['A feature'],
    };
    await http().post(`${A}/plans`).set('Cookie', cookie).send(body).expect(403); // header missing
    await post('/plans', { ...body, key: 'Bad Key' }).expect(400);
    const created = (await post('/plans', body).expect(201)).body;
    expect(created).toMatchObject({ key, status: 'DISABLED', subscribers: 0, aiCredits: 250 });
    await post('/plans', body).expect(409);
    // disabled plans are invisible to customers
    const owner = await customerAuth(ids.bob!);
    const visible = async () =>
      (await http().get(`/api/v1/workspaces/${ids.wsB}/billing/plans`).set(owner)).body.data.map(
        (p: { key: string }) => p.key,
      );
    expect(await visible()).not.toContain(key);
    await post(`/plans/${key}/status`, { status: 'ACTIVE', reason: 'Launching it' }).expect(200);
    expect(await visible()).toContain(key);
    // subscribe workspace B (manual grant), then change the plan's limits
    await post(`/workspaces/${ids.wsB}/assign-plan`, {
      planKey: key,
      reason: 'Pilot customer',
    }).expect(200);
    const limitsOf = async () =>
      (await http().get(`/api/v1/workspaces/${ids.wsB}/billing/overview`).set(owner)).body.plan
        .limits.members;
    expect(await limitsOf()).toBe(10);
    const edited = (
      await patch(`/plans/${key}`, {
        limits: { ...body.limits, members: 2 },
        monthlyMinor: 2000,
      }).expect(200)
    ).body;
    expect(edited.limits.members).toBe(2);
    expect(await limitsOf()).toBe(10); // unchanged for the existing subscriber
    expect(
      (await get('/plans')).body.data.find((p: { key: string }) => p.key === key).subscribers,
    ).toBe(1);
    // a brand-new subscription would get the new definition
    expect(
      (await http().get(`/api/v1/workspaces/${ids.wsB}/billing/plans`).set(owner)).body.data.find(
        (p: { key: string }) => p.key === key,
      ).limits.members,
    ).toBe(2);
    // can't archive while in use; can disable
    const blocked = await post(`/plans/${key}/status`, {
      status: 'ARCHIVED',
      reason: 'Cleanup',
    }).expect(409);
    expect(blocked.body.error.message).toMatch(/active subscription/);
    await post(`/plans/${key}/status`, { status: 'DISABLED', reason: 'Pause sales' }).expect(200);
    expect(await visible()).not.toContain(key);
    await post('/plans/free/status', { status: 'DISABLED', reason: 'Trying to' }).expect(409);
    await post(
      `/subscriptions/${(await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsB! } })).id}/cancel`,
      { reason: 'End pilot', atPeriodEnd: false },
    ).expect(200);
    await post(`/plans/${key}/status`, { status: 'ARCHIVED', reason: 'Cleanup' }).expect(200);
    await patch(`/plans/${key}`, { name: 'Renamed' }).expect(409); // archived
    expect(
      await db.adminAuditLog.count({ where: { action: { startsWith: 'plan.' }, targetId: key } }),
    ).toBeGreaterThanOrEqual(5);
  });

  it('subscriptions: manual grants are applied and labelled; provider changes are only requested, never claimed', async () => {
    // manual grant on workspace A
    const m = (
      await post(`/workspaces/${ids.wsA}/assign-plan`, {
        planKey: 'growth',
        interval: 'YEAR',
        reason: 'Partner programme',
        endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      }).expect(200)
    ).body;
    expect(m).toMatchObject({ accepted: true, pending: false });
    await post(`/workspaces/${ids.wsA}/assign-plan`, { planKey: 'growth' }).expect(400); // reason required
    await post(`/workspaces/${ids.wsA}/assign-plan`, {
      planKey: 'nope',
      reason: 'whatever it is',
    }).expect(400);
    const sub = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ids.wsA! } });
    expect(sub).toMatchObject({
      source: 'MANUAL',
      status: 'ACTIVE',
      planKey: 'growth',
      grantReason: 'Partner programme',
    });
    const alice = await customerAuth(ids.alice!);
    const ov = (await http().get(`/api/v1/workspaces/${ids.wsA}/billing/overview`).set(alice)).body;
    expect(ov.plan.key).toBe('growth');
    expect(ov.actions).toMatchObject({ canChange: false, canCancel: false, canCheckout: false });
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/billing/subscription/cancel`)
      .set(alice)
      .send({})
      .expect(409);
    const list = (await get(`/subscriptions?status=ACTIVE&q=${sfx}`).expect(200)).body;
    expect(list.data[0]).toMatchObject({
      source: 'MANUAL',
      amountMinor: -1,
      workspace: { id: ids.wsA },
      customer: { email: ids.aliceEmail },
    });
    // end the manual grant
    expect(
      (
        await post(`/subscriptions/${sub.id}/cancel`, {
          reason: 'Programme ended',
          atPeriodEnd: true,
        }).expect(200)
      ).body.pending,
    ).toBe(false);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe(
      'CANCELED',
    );
    await post(`/subscriptions/${sub.id}/cancel`, { reason: 'Again', atPeriodEnd: true }).expect(
      409,
    );
    // a provider-backed subscription on workspace B
    const psub = await db.subscription
      .create({
        data: {
          workspaceId: ids.wsB!,
          planKey: 'growth',
          interval: 'MONTH',
          status: 'ACTIVE',
          source: 'PROVIDER',
          providerSubscriptionId: `sub_adm_${sfx}`,
          priceMinor: 4900,
          currency: 'AED',
          lastEventAt: new Date(),
          currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
          startedAt: new Date(),
        },
      })
      .catch(async () =>
        db.subscription.update({
          where: { workspaceId: ids.wsB! },
          data: {
            planKey: 'growth',
            interval: 'MONTH',
            status: 'ACTIVE',
            source: 'PROVIDER',
            providerSubscriptionId: `sub_adm_${sfx}`,
            priceMinor: 4900,
            currency: 'AED',
            canceledAt: null,
            currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
            cancelAtPeriodEnd: false,
          },
        }),
      );
    calls.length = 0;
    const c = (
      await post(`/subscriptions/${psub.id}/cancel`, {
        reason: 'Customer asked by phone',
        atPeriodEnd: true,
      }).expect(200)
    ).body;
    expect(c).toMatchObject({ accepted: true, pending: true });
    expect(c.message).toMatch(/once the provider confirms/);
    expect(
      calls
        .find((x) => x.path === `/v1/subscriptions/sub_adm_${sfx}`)!
        .form.get('cancel_at_period_end'),
    ).toBe('true');
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { id: psub.id } })).cancelAtPeriodEnd,
    ).toBe(false); // unchanged until the webhook
    await post(`/subscriptions/${psub.id}/resume`, { reason: 'Nothing scheduled yet' }).expect(409);
    calls.length = 0;
    const ch = (
      await post(`/workspaces/${ids.wsB}/assign-plan`, {
        planKey: 'starter',
        interval: 'MONTH',
        reason: 'Downgrade requested',
      }).expect(200)
    ).body;
    expect(ch.pending).toBe(true);
    expect(
      calls
        .find((x) => x.method === 'POST' && x.path === `/v1/subscriptions/sub_adm_${sfx}`)!
        .form.get('items[0][price]'),
    ).toBe('price_st_m');
    expect((await db.subscription.findUniqueOrThrow({ where: { id: psub.id } })).planKey).toBe(
      'growth',
    );
    const det = (await get(`/subscriptions/${psub.id}`).expect(200)).body;
    expect(det).toMatchObject({ source: 'PROVIDER', amountMinor: 4900, currency: 'AED' });
    expect(
      await db.adminAuditLog.count({
        where: { action: 'subscription.cancel_requested', targetId: psub.id },
      }),
    ).toBe(1);
    ids.psub = psub.id;
  });

  it('dashboard shows real figures; MRR counts only paying provider subscriptions, per currency', async () => {
    await db.invoice.createMany({
      data: [
        {
          workspaceId: ids.wsB!,
          providerInvoiceId: `in_${sfx}_1`,
          number: `D-${sfx}-1`,
          status: 'PAID',
          currency: 'AED',
          subtotalMinor: 4900,
          taxMinor: 0,
          totalMinor: 4900,
          issuedAt: new Date(),
          lastEventAt: new Date(),
        },
        {
          workspaceId: ids.wsB!,
          providerInvoiceId: `in_${sfx}_2`,
          number: `D-${sfx}-2`,
          status: 'FAILED',
          currency: 'AED',
          subtotalMinor: 4900,
          taxMinor: 0,
          totalMinor: 4900,
          issuedAt: new Date(),
          lastEventAt: new Date(),
        },
      ],
    });
    const d = (await get('/dashboard').expect(200)).body;
    expect(d.customers.total).toBeGreaterThanOrEqual(2);
    expect(
      d.mrr.byCurrency.find((x: { currency: string }) => x.currency === 'AED').amountMinor,
    ).toBe(4900);
    // yearly provider subscription adds amount/12; canceled and manual ones add nothing
    await db.subscription.update({
      where: { id: ids.psub! },
      data: { interval: 'YEAR', priceMinor: 12000 },
    });
    expect(
      (await get('/dashboard')).body.mrr.byCurrency.find(
        (x: { currency: string }) => x.currency === 'AED',
      ).amountMinor,
    ).toBe(1000);
    await db.subscription.update({ where: { id: ids.psub! }, data: { status: 'CANCELED' } });
    expect(
      (await get('/dashboard')).body.mrr.byCurrency.find(
        (x: { currency: string }) => x.currency === 'AED',
      ),
    ).toBeUndefined();
    const rev = d.revenue.find((r: { currency: string }) => r.currency === 'AED');
    expect(rev.months).toHaveLength(6);
    expect(rev.months.at(-1).amountMinor).toBeGreaterThanOrEqual(4900);
    expect(d.failedPayments.some((f: { number: string }) => f.number === `D-${sfx}-2`)).toBe(true);
    expect(d.recentCustomers.length).toBeGreaterThan(0);
  });

  it('activity log: searchable admin actions and payment events, read-only', async () => {
    const a = (await get(`/activity?q=${ids.aliceEmail}`).expect(200)).body;
    expect(a.data.map((x: { action: string }) => x.action)).toEqual(
      expect.arrayContaining(['customer.suspend', 'customer.reactivate']),
    );
    const s = a.data.find((x: { action: string }) => x.action === 'customer.suspend');
    expect(s).toMatchObject({ actor: ids.adminEmail, reason: 'Chargeback fraud investigation' });
    expect(
      (await get('/activity?q=plan.')).body.data.every((x: { action: string }) =>
        x.action.includes('plan.'),
      ),
    ).toBe(true);
    await db.billingEvent.create({
      data: {
        workspaceId: ids.wsB!,
        providerEventId: `evt_adm_${sfx}`,
        type: 'invoice.payment_failed',
        occurredAt: new Date(),
        outcome: 'processed',
      },
    });
    const p = (await get(`/activity?source=payments&q=payment_failed`).expect(200)).body;
    expect(
      p.data.some(
        (x: { action: string; target: string }) =>
          x.action === 'invoice.payment_failed' && x.target === `Beta ${sfx}`,
      ),
    ).toBe(true);
    await http()
      .patch(`${A}/activity/${a.data[0].id}`)
      .set('Cookie', cookie)
      .set('X-Torio-Admin', '1')
      .send({ reason: 'edit' })
      .expect(404);
    await http()
      .delete(`${A}/activity/${a.data[0].id}`)
      .set('Cookie', cookie)
      .set('X-Torio-Admin', '1')
      .expect(404);
    await db.billingEvent.deleteMany({ where: { providerEventId: `evt_adm_${sfx}` } });
  });

  it('settings: provider status without secrets; branding reaches invoices; registration switch is enforced', async () => {
    const s = (await get('/settings').expect(200)).body;
    // Provider status reflects configuration only; here Stripe is injected as a fake, not configured through the environment.
    expect(s.paymentProvider).toMatchObject({ configured: false, webhookSecretSet: false });
    expect(s.paymentProvider.priceIdsConfigured).toBeGreaterThanOrEqual(2);
    expect(s.emailProvider.configured).toBe(false);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/sk_test|whsec_|STRIPE/);
    await patch('/settings', {}).expect(400);
    await patch('/settings', { supportEmail: 'nope' }).expect(400);
    const before = s.branding;
    const upd = (
      await patch('/settings', {
        legalName: `Torio Labs ${sfx} Ltd`,
        invoiceNote: 'BIN 1234',
        reason: 'Company registered',
      }).expect(200)
    ).body;
    expect(upd.branding.legalName).toBe(`Torio Labs ${sfx} Ltd`);
    const inv = await db.invoice.findFirstOrThrow({ where: { providerInvoiceId: `in_${sfx}_1` } });
    const detail = (
      await http()
        .get(`/api/v1/workspaces/${ids.wsB}/billing/invoices/${inv.id}`)
        .set(await customerAuth(ids.bob!))
        .expect(200)
    ).body;
    expect(detail.seller).toEqual({ name: `Torio Labs ${sfx} Ltd`, note: 'BIN 1234' });
    // registration
    await patch('/settings', { registrationOpen: false }).expect(200);
    const reg = await http()
      .post('/api/v1/auth/register')
      .send({
        name: 'New',
        email: `new-${sfx}@t.co`,
        password: 'Sup3rSecretPass',
        workspaceName: 'New WS',
      });
    expect(reg.status).toBe(403);
    expect(await db.user.count({ where: { email: `new-${sfx}@t.co` } })).toBe(0);
    await patch('/settings', {
      registrationOpen: true,
      legalName: before.legalName,
      invoiceNote: before.invoiceNote,
    }).expect(200);
    const ok = await http()
      .post('/api/v1/auth/register')
      .send({
        name: 'New',
        email: `new-${sfx}@t.co`,
        password: 'Sup3rSecretPass',
        workspaceName: 'New WS',
      });
    expect(ok.status).toBe(201);
    const nu = await db.user.findUniqueOrThrow({ where: { email: `new-${sfx}@t.co` } });
    await db.workspace.deleteMany({ where: { createdById: nu.id } });
    await db.auditLog.deleteMany({ where: { actorId: nu.id } });
    await db.user.delete({ where: { id: nu.id } });
    expect(
      await db.adminAuditLog.count({ where: { action: 'settings.update' } }),
    ).toBeGreaterThanOrEqual(3);
  });
});
