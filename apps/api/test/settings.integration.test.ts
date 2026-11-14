import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';

/** Real-PostgreSQL tests for profile, security and workspace settings. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;
const OLD = 'Old-password-1';
const NEW = 'Brand-new-pass-2';

describe.skipIf(!url)('settings (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let jwt: JwtService;
  let passwords: PasswordService;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const http = () => request(app.getHttpServer());
  const bearer = async (userId: string, sid: string) => ({
    Authorization: `Bearer ${await jwt.signAsync({ sub: userId, sid })}`,
  });
  const hdr = async (who: 'owner' | 'admin' | 'agent' | 'outsider') =>
    bearer(ids[who]!, ids[`${who}Sid`]!);
  const session = (userId: string, ua: string, familyId = randomUUID()) =>
    db.session.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: randomUUID() + randomUUID(),
        userAgent: ua,
        ipAddress: '203.0.113.7',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
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
    jwt = app.get(JwtService);
    passwords = app.get(PasswordService);
    const hash = await passwords.hash(OLD);
    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: hash, passwordSetAt: new Date() } });
    const [owner, admin, agent, outsider] = await Promise.all([
      mk('owner'),
      mk('admin'),
      mk('agent'),
      mk('outsider'),
    ]);
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `sta-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `stb-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: admin.id, role: 'ADMIN' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    Object.assign(ids, {
      owner: owner.id,
      admin: admin.id,
      agent: agent.id,
      outsider: outsider.id,
      wsA: wsA.id,
      wsB: wsB.id,
    });
    // each user has a "current" desktop session; the owner also has a phone and a laptop
    for (const [k, u] of Object.entries({ owner, admin, agent, outsider })) {
      const s = await session(
        u.id,
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/120.0 Safari/537.36',
      );
      ids[`${k}Sid`] = s.id;
    }
    await db.auditLog.create({
      data: {
        workspaceId: wsB.id,
        actorId: outsider.id,
        action: 'secret.other_tenant',
        metadata: { description: 'Other tenant event' },
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.auditLog.deleteMany({
      where: { actorId: { in: [ids.owner!, ids.admin!, ids.agent!, ids.outsider!] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [ids.owner!, ids.admin!, ids.agent!, ids.outsider!] } },
    });
    await db.$disconnect();
    await app.close();
  });

  it('reads and updates only the caller’s personal profile', async () => {
    const h = await hdr('agent');
    expect((await http().get('/api/v1/users/me').set(h).expect(200)).body).toMatchObject({
      email: `agent-${sfx}@t.co`,
      phone: null,
      landingPage: 'dashboard',
    });
    const r = await http()
      .patch('/api/v1/users/me')
      .set(h)
      .send({
        name: ' Agent Smith ',
        phone: '+8801700000000',
        timeZone: 'Asia/Dhaka',
        landingPage: 'inbox',
      })
      .expect(200);
    expect(r.body).toMatchObject({
      name: 'Agent Smith',
      phone: '+8801700000000',
      timeZone: 'Asia/Dhaka',
      landingPage: 'inbox',
    });
    // a partial update must not wipe fields it doesn't mention
    const partial = await http()
      .patch('/api/v1/users/me')
      .set(h)
      .send({ jobTitle: 'Support' })
      .expect(200);
    expect(partial.body).toMatchObject({
      phone: '+8801700000000',
      jobTitle: 'Support',
      timeZone: 'Asia/Dhaka',
    });
    const cleared = await http()
      .patch('/api/v1/users/me')
      .set(h)
      .send({ phone: '', timeZone: '' })
      .expect(200);
    expect(cleared.body).toMatchObject({ phone: null, timeZone: null });
  });

  it('rejects invalid values and any attempt to change email, role or status', async () => {
    const h = await hdr('agent');
    const patch = (b: object) => http().patch('/api/v1/users/me').set(h).send(b);
    await patch({ timeZone: 'Mars/Olympus' }).expect(400);
    await patch({ landingPage: 'settings' }).expect(400);
    await patch({ name: '' }).expect(400);
    await patch({}).expect(400);
    await patch({ email: 'evil@t.co' }).expect(400);
    await patch({ role: 'OWNER' }).expect(400);
    await patch({ status: 'SUSPENDED' }).expect(400);
    expect((await db.user.findUnique({ where: { id: ids.agent! } }))?.email).toBe(
      `agent-${sfx}@t.co`,
    );
    expect(
      (
        await db.workspaceMembership.findFirst({
          where: { userId: ids.agent!, workspaceId: ids.wsA! },
        })
      )?.role,
    ).toBe('AGENT');
    await http().get('/api/v1/users/me').expect(401);
  });

  it('lists devices without secrets, flags the current one, and revokes others', async () => {
    const h = await hdr('owner');
    const phone = await session(
      ids.owner!,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1',
    );
    const laptop = await session(ids.owner!, 'Mozilla/5.0 (Windows NT 10.0) Firefox/121.0');
    const list = (await http().get('/api/v1/users/me/sessions').set(h).expect(200)).body.data;
    expect(list).toHaveLength(3);
    expect(list.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.find((s: { id: string }) => s.id === ids.ownerSid).device).toBe('Chrome on macOS');
    expect(list.map((s: { device: string }) => s.device)).toEqual(
      expect.arrayContaining(['Safari on iOS', 'Firefox on Windows']),
    );
    expect(JSON.stringify(list)).not.toMatch(/refreshToken|Hash|familyId/);
    // cannot revoke this device, someone else's, or a missing one
    await http().delete(`/api/v1/users/me/sessions/${ids.ownerSid}`).set(h).expect(400);
    await http().delete(`/api/v1/users/me/sessions/${ids.agentSid}`).set(h).expect(404);
    await http().delete(`/api/v1/users/me/sessions/${randomUUID()}`).set(h).expect(404);
    const after = (await http().delete(`/api/v1/users/me/sessions/${phone.id}`).set(h).expect(200))
      .body.data;
    expect(after).toHaveLength(2);
    expect((await db.session.findUnique({ where: { id: phone.id } }))?.revokedAt).not.toBeNull();
    const r = (await http().post('/api/v1/users/me/sessions/revoke-others').set(h).expect(200))
      .body;
    expect(r.revoked).toBe(1);
    expect((await db.session.findUnique({ where: { id: laptop.id } }))?.revokedAt).not.toBeNull();
    expect((await db.session.findUnique({ where: { id: ids.ownerSid! } }))?.revokedAt).toBeNull();
    // another user's sessions are untouched
    expect((await db.session.findUnique({ where: { id: ids.agentSid! } }))?.revokedAt).toBeNull();
  });

  it('changes the password only with the correct current one, and signs out other devices', async () => {
    const h = await hdr('admin');
    const other = await session(ids.admin!, 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0');
    const pw = (b: object) => http().post('/api/v1/users/me/password').set(h).send(b);
    await pw({ currentPassword: 'wrong', newPassword: NEW }).expect(400);
    await pw({ currentPassword: OLD, newPassword: 'short' }).expect(400);
    await pw({ currentPassword: OLD, newPassword: 'alllowercase1234' }).expect(400);
    await pw({ currentPassword: OLD, newPassword: OLD }).expect(400);
    const unchanged = await db.user.findUnique({ where: { id: ids.admin! } });
    expect(await passwords.verify(unchanged!.passwordHash, OLD)).toBe(true);
    const ok = (await pw({ currentPassword: OLD, newPassword: NEW }).expect(200)).body;
    expect(ok.revoked).toBe(1);
    const changed = await db.user.findUnique({ where: { id: ids.admin! } });
    expect(await passwords.verify(changed!.passwordHash, NEW)).toBe(true);
    expect(await passwords.verify(changed!.passwordHash, OLD)).toBe(false);
    expect((await db.session.findUnique({ where: { id: other.id } }))?.revokedAt).not.toBeNull();
    expect((await db.session.findUnique({ where: { id: ids.adminSid! } }))?.revokedAt).toBeNull();
    expect(
      await db.auditLog.count({ where: { actorId: ids.admin!, action: 'user.password_change' } }),
    ).toBe(1);
    // the new password works for sign-in
    await http()
      .post('/api/v1/auth/login')
      .send({ email: `admin-${sfx}@t.co`, password: NEW })
      .expect(200);
  });

  it('exports only the caller’s own data, without secrets', async () => {
    const h = await hdr('agent');
    const body = (await http().get('/api/v1/users/me/export').set(h).expect(200)).body;
    expect(body.profile.email).toBe(`agent-${sfx}@t.co`);
    expect(body.workspaces).toHaveLength(1);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/passwordHash|refreshTokenHash|familyId|\$argon2/);
    expect(text).not.toContain(`owner-${sfx}`);
  });

  it('workspace profile: only Owner/Admin edit, validated and audited; slug never changes', async () => {
    const base = `/api/v1/workspaces/${ids.wsA}`;
    const agent = await hdr('agent');
    const admin = await hdr('admin');
    await http().patch(base).set(agent).send({ name: 'Hacked' }).expect(403);
    await http()
      .patch(base)
      .set(await hdr('outsider'))
      .send({ name: 'Hacked' })
      .expect(404);
    await http().patch(base).set(admin).send({ name: 'x' }).expect(400);
    await http().patch(base).set(admin).send({ defaultCurrency: 'XXX' }).expect(400);
    await http().patch(base).set(admin).send({ contactEmail: 'nope' }).expect(400);
    await http().patch(base).set(admin).send({ slug: 'new-slug' }).expect(400);
    const r = await http()
      .patch(base)
      .set(admin)
      .send({
        name: 'UrbanNest HQ',
        description: 'Home decor',
        defaultCurrency: 'BDT',
        contactEmail: 'Hello@Urban.test',
      })
      .expect(200);
    expect(r.body).toMatchObject({
      name: 'UrbanNest HQ',
      slug: `sta-${sfx}`,
      defaultCurrency: 'BDT',
      contactEmail: 'hello@urban.test',
      role: 'ADMIN',
    });
    const got = (await http().get(base).set(agent).expect(200)).body;
    expect(got.defaultCurrency).toBe('BDT');
    // Any ISO 4217 currency and any IANA zone are accepted; unknown ones and agents are not.
    await http().patch(base).set(admin).send({ defaultCurrency: 'ZZZ' }).expect(400);
    await http().patch(base).set(admin).send({ reportingTimeZone: 'Mars/Base' }).expect(400);
    await http().patch(base).set(agent).send({ defaultCurrency: 'USD' }).expect(403);
    const regional = await http()
      .patch(base)
      .set(admin)
      .send({ defaultCurrency: 'SAR', reportingTimeZone: 'Asia/Dubai' })
      .expect(200);
    expect(regional.body).toMatchObject({
      defaultCurrency: 'SAR',
      reportingTimeZone: 'Asia/Dubai',
    });
    expect((await http().get(base).set(agent).expect(200)).body).toMatchObject({
      defaultCurrency: 'SAR',
      reportingTimeZone: 'Asia/Dubai',
    });
    expect((await db.workspace.findUnique({ where: { id: ids.wsB! } }))?.name).toBe('B');
    expect(
      await db.auditLog.count({ where: { workspaceId: ids.wsA!, action: 'workspace.update' } }),
    ).toBe(2);
  });

  it('audit log: Owner/Admin only, workspace-scoped, paged', async () => {
    const base = `/api/v1/workspaces/${ids.wsA}/audit`;
    await http()
      .get(base)
      .set(await hdr('agent'))
      .expect(403);
    await http()
      .get(base)
      .set(await hdr('outsider'))
      .expect(404);
    const r = (
      await http()
        .get(base)
        .set(await hdr('owner'))
        .expect(200)
    ).body;
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data[0]).toMatchObject({ action: 'workspace.update' });
    expect(r.data[0].description).toMatch(/Workspace settings changed/);
    expect(JSON.stringify(r)).not.toContain('other_tenant');
    expect(
      (
        await http()
          .get(`${base}?pageSize=1`)
          .set(await hdr('owner'))
      ).body.data,
    ).toHaveLength(1);
    expect(
      (
        await http()
          .get(`${base}?q=nomatch`)
          .set(await hdr('owner'))
      ).body.data,
    ).toHaveLength(0);
  });
});
