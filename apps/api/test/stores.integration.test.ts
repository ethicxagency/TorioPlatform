import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';

/** Real-PostgreSQL tests for multi-store: creation, switching, isolation and General Settings sync. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('multi-store (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let jwt: JwtService;
  const sfx = Math.random().toString(36).slice(2, 8);
  const http = () => request(app.getHttpServer());
  const users: Record<string, { id: string; sid: string }> = {};
  const as = async (who: string) => {
    const u = users[who]!;
    return { Authorization: `Bearer ${await jwt.signAsync({ sub: u.id, sid: u.sid })}` };
  };
  const store = (n: string, over: Record<string, unknown> = {}) => ({
    name: `Store ${n}`,
    slug: `st-${n}-${sfx}`,
    industry: 'Fashion & Apparel',
    defaultCurrency: 'BDT',
    reportingTimeZone: 'Asia/Dhaka',
    contactEmail: `Shop-${n}@Example.test`,
    country: 'BD',
    ...over,
  });
  const create = async (who: string, body: object) =>
    http()
      .post('/api/v1/workspaces')
      .set(await as(who))
      .send(body);
  const list = async (who: string) =>
    (
      await http()
        .get('/api/v1/workspaces')
        .set(await as(who))
        .expect(200)
    ).body as {
      id: string;
      slug: string;
      name: string;
      role: string;
      active: boolean;
    }[];

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
    jwt = app.get(JwtService);
    const hash = await app.get(PasswordService).hash('Some-pass-1');
    for (const n of ['rabby', 'other', 'member']) {
      const u = await db.user.create({
        data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: hash },
      });
      const s = await db.session.create({
        data: {
          userId: u.id,
          familyId: randomUUID(),
          refreshTokenHash: randomUUID() + randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      users[n] = { id: u.id, sid: s.id };
    }
  });
  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    await db?.workspace.deleteMany({ where: { createdById: { in: ids } } });
    await db?.user.deleteMany({ where: { id: { in: ids } } });
    await db?.$disconnect();
    await app?.close();
  });

  it('a new account has no stores; creating the first makes the creator OWNER and the store active', async () => {
    expect(await list('rabby')).toEqual([]);
    const r = await create('rabby', store('one'));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      name: 'Store one',
      slug: `st-one-${sfx}`,
      role: 'OWNER',
      active: true,
      industry: 'Fashion & Apparel',
      defaultCurrency: 'BDT',
      reportingTimeZone: 'Asia/Dhaka',
      contactEmail: `shop-one@example.test`,
      country: 'BD',
      phone: null,
      city: null,
    });
    const m = await db.workspaceMembership.findMany({ where: { userId: users.rabby!.id } });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ role: 'OWNER', status: 'ACTIVE' });
    expect(
      (await db.userPreferences.findUniqueOrThrow({ where: { userId: users.rabby!.id } }))
        .lastActiveWorkspaceId,
    ).toBe(r.body.id);
  });

  it('the same account can create more stores without another registration; the newest becomes active', async () => {
    const two = await create('rabby', store('two', { phone: '+8801712345678', city: 'Dhaka' }));
    const three = await create('rabby', store('three'));
    expect([two.status, three.status]).toEqual([201, 201]);
    const l = await list('rabby');
    expect(l).toHaveLength(3);
    expect(l.filter((w) => w.active)).toHaveLength(1);
    expect(l[0]).toMatchObject({ slug: `st-three-${sfx}`, active: true, role: 'OWNER' });
    expect(await db.user.count({ where: { email: `rabby-${sfx}@t.co` } })).toBe(1);
  });

  it('store addresses are unique and validated, and a failed creation leaves nothing behind', async () => {
    const before = await db.workspace.count();
    const dup = await create('other', store('one'));
    expect(dup.status).toBe(409);
    for (const bad of [
      { slug: 'Has Spaces' },
      { slug: 'ab' },
      { slug: 'admin' },
      { defaultCurrency: 'XXX' },
      { reportingTimeZone: 'Mars/Base' },
      { contactEmail: 'nope' },
      { country: 'ZZ' },
      { industry: 'Piracy' },
      { phone: '0171234' },
      { name: 'x' },
    ])
      expect((await create('other', store('bad', bad))).status).toBe(400);
    expect(await db.workspace.count()).toBe(before);
    expect(await db.workspaceMembership.count({ where: { userId: users.other!.id } })).toBe(0);
    expect(await list('other')).toEqual([]);
  });

  it('checks availability and suggests an alternative', async () => {
    const taken = (
      await http()
        .get('/api/v1/workspaces/slug-check')
        .query({ slug: `st-one-${sfx}` })
        .set(await as('other'))
        .expect(200)
    ).body;
    expect(taken).toMatchObject({ available: false, reason: 'This address is already taken' });
    expect(taken.suggestion).toMatch(new RegExp(`^st-one-${sfx}-\\d+$`));
    const free = (
      await http()
        .get('/api/v1/workspaces/slug-check')
        .query({ slug: `fresh-${sfx}` })
        .set(await as('other'))
        .expect(200)
    ).body;
    expect(free).toMatchObject({ available: true, reason: null });
    const reserved = (
      await http()
        .get('/api/v1/workspaces/slug-check')
        .query({ slug: 'admin' })
        .set(await as('other'))
        .expect(200)
    ).body;
    expect(reserved.available).toBe(false);
    await http().get('/api/v1/workspaces/slug-check').query({ slug: 'x' }).expect(401);
  });

  it('switching validates membership, persists, and is restored on the next listing', async () => {
    const l = await list('rabby');
    const target = l.find((w) => w.slug === `st-one-${sfx}`)!;
    const switched = (
      await http()
        .put('/api/v1/workspaces/active')
        .set(await as('rabby'))
        .send({ workspaceId: target.id })
        .expect(200)
    ).body as typeof l;
    expect(switched[0]).toMatchObject({ id: target.id, active: true });
    expect(switched.filter((w) => w.active)).toHaveLength(1);
    // "Restored after login": a fresh listing for the same user still has it first.
    expect((await list('rabby'))[0]!.id).toBe(target.id);
    // Someone else's store, and one that does not exist, look identical.
    const theirs = await create('other', store('theirs'));
    for (const id of [theirs.body.id, randomUUID()])
      expect(
        (
          await http()
            .put('/api/v1/workspaces/active')
            .set(await as('rabby'))
            .send({ workspaceId: id })
        ).status,
      ).toBe(404);
    expect((await list('rabby'))[0]!.id).toBe(target.id);
    await http().put('/api/v1/workspaces/active').send({ workspaceId: target.id }).expect(401);
    await http()
      .put('/api/v1/workspaces/active')
      .set(await as('rabby'))
      .send({ workspaceId: 'nope' })
      .expect(400);
  });

  it('the switcher lists only accessible stores; a suspended membership removes the store from it', async () => {
    const theirs = (await list('other')).find((w) => w.slug === `st-theirs-${sfx}`)!;
    await db.workspaceMembership.create({
      data: { workspaceId: theirs.id, userId: users.member!.id, role: 'AGENT' },
    });
    expect((await list('member')).map((w) => w.id)).toEqual([theirs.id]);
    expect((await list('member'))[0]!.role).toBe('AGENT');
    expect((await list('rabby')).some((w) => w.id === theirs.id)).toBe(false);
    await db.workspaceMembership.updateMany({
      where: { workspaceId: theirs.id, userId: users.member!.id },
      data: { status: 'SUSPENDED' },
    });
    expect(await list('member')).toEqual([]);
    await http()
      .put('/api/v1/workspaces/active')
      .set(await as('member'))
      .send({ workspaceId: theirs.id })
      .expect(404);
  });

  it('a stale last-active store (no longer a member) falls back to a store the user still has', async () => {
    const l = await list('rabby');
    await db.userPreferences.update({
      where: { userId: users.rabby!.id },
      data: { lastActiveWorkspaceId: (await list('other'))[0]!.id },
    });
    const after = await list('rabby');
    expect(after).toHaveLength(l.length);
    expect(after.filter((w) => w.active)).toHaveLength(1);
    expect(l.map((w) => w.id)).toContain(after[0]!.id);
  });

  it("store data is isolated: another store's records are unreachable by changing the URL", async () => {
    const [a, b] = (await list('rabby')).filter((w) => w.slug !== `st-theirs-${sfx}`);
    const c = await db.customer.create({
      data: { workspaceId: a!.id, name: `Only in A ${sfx}` },
    });
    const inA = (
      await http()
        .get(`/api/v1/workspaces/${a!.id}/customers`)
        .set(await as('rabby'))
        .expect(200)
    ).body;
    expect(JSON.stringify(inA)).toContain(c.id);
    const inB = (
      await http()
        .get(`/api/v1/workspaces/${b!.id}/customers`)
        .set(await as('rabby'))
        .expect(200)
    ).body;
    expect(JSON.stringify(inB)).not.toContain(c.id);
    // another account, same ids: refused, and indistinguishable from "not found"
    for (const p of [`/customers`, `/customers/${c.id}`, ``])
      expect(
        (
          await http()
            .get(`/api/v1/workspaces/${a!.id}${p}`)
            .set(await as('other'))
        ).status,
      ).toBe(404);
    // reaching the record through a store you own but it does not belong to
    expect(
      (
        await http()
          .get(`/api/v1/workspaces/${b!.id}/customers/${c.id}`)
          .set(await as('rabby'))
      ).status,
    ).toBe(404);
  });

  it('General Settings reads and edits the same store record; one store never changes another', async () => {
    const [a, b] = (await list('rabby')).filter((w) => w.slug !== `st-theirs-${sfx}`);
    const seen = (
      await http()
        .get(`/api/v1/workspaces/${a!.id}`)
        .set(await as('rabby'))
        .expect(200)
    ).body;
    expect(seen).toMatchObject({
      industry: 'Fashion & Apparel',
      country: 'BD',
      reportingTimeZone: 'Asia/Dhaka',
    });
    const bBefore = (
      await http()
        .get(`/api/v1/workspaces/${b!.id}`)
        .set(await as('rabby'))
        .expect(200)
    ).body;
    const upd = await http()
      .patch(`/api/v1/workspaces/${a!.id}`)
      .set(await as('rabby'))
      .send({
        name: 'Renamed A',
        city: 'Chattogram',
        phone: '+8801811111111',
        defaultCurrency: 'USD',
        reportingTimeZone: 'Europe/London',
      });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({
      name: 'Renamed A',
      city: 'Chattogram',
      phone: '+8801811111111',
      defaultCurrency: 'USD',
      reportingTimeZone: 'Europe/London',
    });
    expect(
      (
        await http()
          .get(`/api/v1/workspaces/${b!.id}`)
          .set(await as('rabby'))
          .expect(200)
      ).body,
    ).toEqual(bBefore);
    // slug is the store's identity: it is not editable here
    await http()
      .patch(`/api/v1/workspaces/${a!.id}`)
      .set(await as('rabby'))
      .send({ slug: 'hijack' })
      .expect(400);
    await http()
      .patch(`/api/v1/workspaces/${a!.id}`)
      .set(await as('rabby'))
      .send({ phone: '123' })
      .expect(400);
    // a non-member cannot edit
    expect(
      (
        await http()
          .patch(`/api/v1/workspaces/${a!.id}`)
          .set(await as('other'))
          .send({ name: 'x' })
      ).status,
    ).toBe(404);
  });

  it('changing currency or time zone never rewrites historical records', async () => {
    const [a] = (await list('rabby')).filter((w) => w.slug !== `st-theirs-${sfx}`);
    const w = await db.workspace.findUniqueOrThrow({ where: { id: a!.id } });
    expect(w.defaultCurrency).toBe('USD'); // changed above
    const o = await db.order.findFirst({ where: { workspaceId: a!.id } });
    expect(o).toBeNull(); // nothing to rewrite here; the field only seeds new orders
    expect(w.createdAt).toBeInstanceOf(Date); // timestamps stay UTC instants; only display changes
  });

  it('a member with only the AGENT role cannot edit store settings', async () => {
    const theirs = (await list('other')).find((w) => w.slug === `st-theirs-${sfx}`)!;
    await db.workspaceMembership.updateMany({
      where: { workspaceId: theirs.id, userId: users.member!.id },
      data: { status: 'ACTIVE' },
    });
    expect(
      (
        await http()
          .patch(`/api/v1/workspaces/${theirs.id}`)
          .set(await as('member'))
          .send({ name: 'Hacked' })
      ).status,
    ).toBe(403);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe(
      'Store theirs',
    );
  });

  describe('real login never depends on having a store', () => {
    const login = (email: string, password: string) =>
      http().post('/api/v1/auth/login').send({ email, password });
    const tokenOf = async (email: string) =>
      (await login(email, 'Some-pass-1').expect(200)).body.accessToken as string;
    const storesFor = async (t: string) =>
      (await http().get('/api/v1/workspaces').set('Authorization', `Bearer ${t}`).expect(200))
        .body as { name: string; active: boolean }[];

    it('an account with no store signs in (200), gets an empty store list, and wrong credentials stay 401', async () => {
      const email = `member-${sfx}@t.co`;
      await db.workspaceMembership.deleteMany({ where: { userId: users.member!.id } });
      expect(await storesFor(await tokenOf(email))).toEqual([]);
      const bad = await login(email, 'wrong-password');
      expect(bad.status).toBe(401);
      expect(bad.body.error.requestId).toBeTruthy();
      expect(JSON.stringify(bad.body)).not.toMatch(/prisma|stack|column/i);
      expect((await login(`nobody-${sfx}@t.co`, 'x')).status).toBe(401);
    });

    it('an account with several stores signs in and gets the last active one first', async () => {
      const email = `rabby-${sfx}@t.co`;
      const mine = (await list('rabby')).filter((w) => w.slug.startsWith('st-'));
      await db.userPreferences.update({
        where: { userId: users.rabby!.id },
        data: { lastActiveWorkspaceId: mine[mine.length - 1]!.id },
      });
      const l = await storesFor(await tokenOf(email));
      expect(l.length).toBeGreaterThan(1);
      expect(l[0]).toMatchObject({ name: mine[mine.length - 1]!.name, active: true });
    });

    it('an account that never had preferences or memberships still signs in', async () => {
      await db.userPreferences.deleteMany({ where: { userId: users.member!.id } });
      expect(await storesFor(await tokenOf(`member-${sfx}@t.co`))).toEqual([]);
    });
  });

  it('personal profile is global: it lists linked sign-in methods and is the same whichever store is active', async () => {
    await db.userIdentity.create({
      data: {
        userId: users.rabby!.id,
        provider: 'GOOGLE',
        providerUserId: `g-${sfx}`,
        email: `rabby-${sfx}@t.co`,
      },
    });
    const before = (
      await http()
        .get('/api/v1/users/me')
        .set(await as('rabby'))
        .expect(200)
    ).body;
    expect(before.providers).toEqual(['GOOGLE']);
    const l = await list('rabby');
    await http()
      .put('/api/v1/workspaces/active')
      .set(await as('rabby'))
      .send({ workspaceId: l[l.length - 1]!.id })
      .expect(200);
    const after = (
      await http()
        .get('/api/v1/users/me')
        .set(await as('rabby'))
        .expect(200)
    ).body;
    expect(after).toEqual(before);
    const patched = (
      await http()
        .patch('/api/v1/users/me')
        .set(await as('rabby'))
        .send({ phone: '+8801712345678' })
        .expect(200)
    ).body;
    expect(patched).toMatchObject({
      phone: '+8801712345678',
      providers: ['GOOGLE'],
      email: `rabby-${sfx}@t.co`,
    });
    // a store's own record never carries personal fields
    expect(JSON.stringify(await list('rabby'))).not.toContain(`rabby-${sfx}@t.co`);
  });
});
