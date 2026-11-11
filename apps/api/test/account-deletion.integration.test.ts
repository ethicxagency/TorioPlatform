import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService } from '../src/modules/auth/mail.service';
import { PasswordService } from '../src/modules/auth/password.service';

/** Real-PostgreSQL tests for account deletion. The email provider is an in-process fake. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;
const PW = 'Delete-me-pass-1';
const ADMIN_PW = 'Admin-passphrase-1';

describe.skipIf(!url)('account deletion (real PostgreSQL, fake email provider)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie = '';
  let mails: { to: string; text: string }[] = [];
  let ipCounter = 0;
  const sfx = Math.random().toString(36).slice(2, 8);
  const http = () => request(app.getHttpServer());
  /** Each call comes from a fresh IP so the per-IP rate limit only bites where a test asks for it. */
  const ip = () => `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.${(ipCounter++ % 250) + 1}`;
  const post = (p: string) =>
    http().post(`/api/v1/account-deletion${p}`).set('X-Forwarded-For', ip());
  const token = (m: { text: string }) => /token=([\w-]+)/.exec(m.text)![1]!;
  const email = (n: string) => `${n}-${sfx}@t.co`;
  const mkUser = async (n: string, extra: object = {}) =>
    db.user.create({
      data: {
        email: email(n),
        name: n,
        passwordHash: await app.get(PasswordService).hash(PW),
        emailVerifiedAt: new Date(),
        ...extra,
      },
    });
  const bearer = async (u: { id: string }) => {
    const s = await db.session.create({
      data: {
        userId: u.id,
        familyId: crypto.randomUUID(),
        refreshTokenHash: crypto.randomUUID() + crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return {
      Authorization: `Bearer ${await app.get(JwtService).signAsync({ sub: u.id, sid: s.id })}`,
    };
  };
  const admin = (m: 'get' | 'post', p: string, body: object = {}) => {
    const call = http()[m].bind(http());
    return call(`/api/v1/admin/account-deletions${p}`)
      .set('Cookie', cookie)
      .set('X-Torio-Admin', '1')
      .send(body);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.RESEND_API_KEY = 're_test_key_value';
    process.env.MAIL_FROM = 'Torio <no-reply@torio.test>';
    process.env.WEB_URL = 'https://torio.example.test';
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    app.get(MailService).fetch = (async (_u: unknown, init?: RequestInit) => {
      mails.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const a = await db.platformAdmin.create({
      data: {
        email: `del-admin-${sfx}@t.co`,
        name: 'A',
        passwordHash: await app.get(PasswordService).hash(ADMIN_PW),
      },
    });
    const login = await http()
      .post('/api/v1/admin/auth/login')
      .send({ email: a.email, password: ADMIN_PW })
      .expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  });
  afterAll(async () => {
    await db.accountDeletionRequest.deleteMany({
      where: { OR: [{ email: { endsWith: `-${sfx}@t.co` } }, { email: { contains: '***' } }] },
    });
    await app.close();
  });

  it('an emailed link request answers the same for a real and an unknown address, and creates a request only for a real one', async () => {
    mails = [];
    await mkUser('known');
    const real = await post('/requests')
      .send({ email: email('known'), confirm: true })
      .expect(202);
    const fake = await post('/requests')
      .send({ email: email('nobody'), confirm: true })
      .expect(202);
    expect(real.body).toEqual(fake.body);
    expect(real.body).toEqual({ verificationSent: true, reference: null, status: null });
    expect(mails.map((m) => m.to)).toEqual([email('known')]);
    expect(await db.accountDeletionRequest.count({ where: { email: email('nobody') } })).toBe(0);
    expect(
      await db.accountDeletionRequest.count({
        where: { email: email('known'), status: 'PENDING_VERIFICATION' },
      }),
    ).toBe(1);
  });

  it('requires the permanent-deletion confirmation and a valid email', async () => {
    await post('/requests')
      .send({ email: email('known') })
      .expect(400);
    await post('/requests')
      .send({ email: email('known'), confirm: false })
      .expect(400);
    await post('/requests').send({ email: 'nope', confirm: true }).expect(400);
  });

  it('a second request does not create a second active one', async () => {
    await post('/requests')
      .send({ email: email('known'), confirm: true })
      .expect(202);
    expect(await db.accountDeletionRequest.count({ where: { email: email('known') } })).toBe(1);
    // and the database itself refuses a concurrent duplicate
    const u = await db.user.findUniqueOrThrow({ where: { email: email('known') } });
    await expect(
      db.accountDeletionRequest.create({
        data: { reference: 'TDR-DUP', userId: u.id, email: u.email },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('the emailed link verifies once; bad, reused and expired links are refused', async () => {
    const link = token(mails[0]!);
    const ok = await post('/verify').send({ token: link }).expect(200);
    expect(ok.body).toMatchObject({ status: 'VERIFIED' });
    expect(ok.body.reference).toMatch(/^TDR-/);
    await post('/verify').send({ token: link }).expect(400);
    await post('/verify')
      .send({ token: 'x'.repeat(40) })
      .expect(400);
    const u = await mkUser('expired');
    await db.accountDeletionRequest.create({
      data: {
        reference: 'TDR-EXP',
        userId: u.id,
        email: u.email,
        tokenHash: (await import('../src/modules/auth/auth.service')).hashToken('e'.repeat(43)),
        tokenExpiresAt: new Date(Date.now() - 1000),
      },
    });
    await post('/verify')
      .send({ token: 'e'.repeat(43) })
      .expect(400);
  });

  it('a request’s status is readable by its reference only', async () => {
    const r = await db.accountDeletionRequest.findFirstOrThrow({
      where: { email: email('known') },
    });
    const s = await http()
      .get(`/api/v1/account-deletion/requests/${r.reference}`)
      .set('X-Forwarded-For', ip())
      .expect(200);
    expect(s.body).toMatchObject({
      reference: r.reference,
      status: 'VERIFIED',
      rejectionReason: null,
    });
    expect(JSON.stringify(s.body)).not.toContain(email('known'));
    await http()
      .get('/api/v1/account-deletion/requests/TDR-NOPE')
      .set('X-Forwarded-For', ip())
      .expect(404);
  });

  it('a signed-in customer confirms with their password and gets a real reference at once', async () => {
    const u = await mkUser('signed');
    const h = await bearer(u);
    await post('/requests/me')
      .set(h)
      .send({ password: 'wrong-password', confirm: true })
      .expect(401);
    expect(await db.accountDeletionRequest.count({ where: { userId: u.id } })).toBe(0);
    const ok = await post('/requests/me')
      .set(h)
      .send({ password: PW, reason: 'Closing my shop', confirm: true })
      .expect(200);
    expect(ok.body).toMatchObject({ verificationSent: false, status: 'VERIFIED' });
    const again = await post('/requests/me')
      .set(h)
      .send({ password: PW, confirm: true })
      .expect(200);
    expect(again.body.reference).toBe(ok.body.reference); // duplicate prevented
    await post('/requests/me').send({ password: PW, confirm: true }).expect(401); // needs a session
  });

  it('signed in without a password falls back to the emailed link', async () => {
    mails = [];
    const u = await mkUser('nopw');
    const r = await post('/requests/me')
      .set(await bearer(u))
      .send({ confirm: true })
      .expect(200);
    expect(r.body).toEqual({ verificationSent: true, reference: null, status: null });
    expect(mails[0]!.to).toBe(email('nopw'));
  });

  it('processing anonymizes the account, removes access, disconnects only its own workspace and leaves others alone', async () => {
    const u = await mkUser('victim');
    const other = await mkUser('bystander');
    const ws = await db.workspace.create({ data: { name: 'Solo', slug: `solo-${sfx}` } });
    const wsOther = await db.workspace.create({ data: { name: 'Team', slug: `team-${sfx}` } });
    await db.workspaceMembership.create({
      data: { workspaceId: ws.id, userId: u.id, role: 'OWNER' },
    });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsOther.id, userId: other.id, role: 'OWNER' },
        { workspaceId: wsOther.id, userId: u.id, role: 'AGENT' },
      ],
    });
    const ch = await db.channel.create({
      data: {
        workspaceId: ws.id,
        provider: 'MESSENGER',
        displayName: 'Page',
        status: 'CONNECTED',
      },
    });
    await db.channelCredential.create({
      data: { workspaceId: ws.id, channelId: ch.id, ciphertext: 'v1.x.y.z' },
    });
    const chOther = await db.channel.create({
      data: {
        workspaceId: wsOther.id,
        provider: 'MESSENGER',
        displayName: 'Other',
        status: 'CONNECTED',
      },
    });
    await db.userIdentity.create({
      data: { userId: u.id, provider: 'GOOGLE', providerUserId: `g-${sfx}` },
    });
    await bearer(u);
    const req = await post('/requests/me')
      .set(await bearer(u))
      .send({ password: PW, confirm: true })
      .expect(200);
    const row = await db.accountDeletionRequest.findFirstOrThrow({
      where: { reference: req.body.reference },
    });
    const done = await admin('post', `/${row.id}/process`).expect(200);
    expect(done.body.data.find((d: { id: string }) => d.id === row.id)).toMatchObject({
      status: 'COMPLETED',
    });
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({ name: 'Deleted user', status: 'DISABLED', phone: null });
    expect(after.email).toBe(`deleted-${u.id}@deleted.torio.invalid`);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.userIdentity.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.workspaceMembership.count({ where: { userId: u.id } })).toBe(0);
    expect((await db.channel.findUniqueOrThrow({ where: { id: ch.id } })).status).toBe(
      'DISCONNECTED',
    );
    expect(await db.channelCredential.count({ where: { channelId: ch.id } })).toBe(0);
    // the shared workspace and its channel are untouched, and the other member keeps access
    expect((await db.channel.findUniqueOrThrow({ where: { id: chOther.id } })).status).toBe(
      'CONNECTED',
    );
    expect(
      await db.workspaceMembership.count({ where: { workspaceId: wsOther.id, userId: other.id } }),
    ).toBe(1);
    // the deleted account can no longer sign in, and the request keeps only a masked address
    await http().post('/api/v1/auth/login').send({ email: u.email, password: PW }).expect(401);
    const finished = await db.accountDeletionRequest.findUniqueOrThrow({ where: { id: row.id } });
    expect(finished.email).toContain('***');
    expect(finished.summary).toMatchObject({ workspacesWithNoOtherMembers: 1 });
  });

  it('an owner whose workspace others still use is refused with a reason and nothing changes', async () => {
    const owner = await mkUser('owner');
    const member = await mkUser('member');
    const ws = await db.workspace.create({ data: { name: 'Shared', slug: `shared-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: ws.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: ws.id, userId: member.id, role: 'AGENT' },
      ],
    });
    const req = await post('/requests/me')
      .set(await bearer(owner))
      .send({ password: PW, confirm: true })
      .expect(200);
    const row = await db.accountDeletionRequest.findFirstOrThrow({
      where: { reference: req.body.reference },
    });
    await admin('post', `/${row.id}/process`).expect(200);
    const after = await db.accountDeletionRequest.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe('REJECTED');
    expect(after.rejectionReason).toMatch(/Transfer ownership/);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).email).toBe(
      email('owner'),
    );
    expect(await db.workspaceMembership.count({ where: { workspaceId: ws.id } })).toBe(2);
  });

  it('administrators can reject with a reason, only verified requests can be processed, and only admins can act', async () => {
    const u = await mkUser('rej');
    const req = await post('/requests/me')
      .set(await bearer(u))
      .send({ password: PW, confirm: true })
      .expect(200);
    const row = await db.accountDeletionRequest.findFirstOrThrow({
      where: { reference: req.body.reference },
    });
    await admin('post', `/${row.id}/reject`, { reason: 'x' }).expect(400);
    await admin('post', `/${row.id}/reject`, { reason: 'Could not confirm identity' }).expect(200);
    expect(
      await db.accountDeletionRequest.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ status: 'REJECTED', rejectionReason: 'Could not confirm identity' });
    await admin('post', `/${row.id}/process`).expect(409);
    // a rejected request frees the customer to ask again
    await post('/requests/me')
      .set(await bearer(u))
      .send({ password: PW, confirm: true })
      .expect(200);
    await http().get('/api/v1/admin/account-deletions').expect(401);
    await http()
      .get('/api/v1/admin/account-deletions')
      .set(await bearer(u))
      .expect(401);
    await http()
      .post(`/api/v1/admin/account-deletions/${row.id}/process`)
      .set('Cookie', cookie)
      .expect(403); // missing admin header
  });

  it('the public request endpoint is rate limited', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 8; i++)
      codes.push(
        (
          await http()
            .post('/api/v1/account-deletion/requests')
            .set('X-Forwarded-For', '203.0.113.77')
            .send({ email: email('rl'), confirm: true })
        ).status,
      );
    expect(codes).toContain(429);
  });

  it('says plainly when email delivery is not set up', async () => {
    const mail = app.get(MailService) as unknown as { c: Record<string, unknown> };
    const key = mail.c.RESEND_API_KEY;
    mail.c.RESEND_API_KEY = undefined;
    const r = await post('/requests')
      .send({ email: email('known'), confirm: true })
      .expect(503);
    expect(JSON.stringify(r.body)).toMatch(/Email delivery isn.t set up/);
    mail.c.RESEND_API_KEY = key;
  });

  it("my-requests lists only the caller's own requests, and needs a session", async () => {
    const a = await mkUser('mine-a');
    const b = await mkUser('mine-b');
    await http().get('/api/v1/account-deletion/my-requests').expect(401);
    expect(
      (
        await http()
          .get('/api/v1/account-deletion/my-requests')
          .set(await bearer(a))
          .expect(200)
      ).body.data,
    ).toEqual([]);
    await post('/requests/me')
      .set(await bearer(a))
      .send({ password: PW, confirm: true })
      .expect(200);
    const mineA = (
      await http()
        .get('/api/v1/account-deletion/my-requests')
        .set(await bearer(a))
        .expect(200)
    ).body.data;
    expect(mineA).toHaveLength(1);
    expect(mineA[0]).toMatchObject({
      type: 'ACCOUNT_DELETION',
      status: 'VERIFIED',
      processedAt: null,
    });
    // another person sees none of it
    expect(
      (
        await http()
          .get('/api/v1/account-deletion/my-requests')
          .set(await bearer(b))
          .expect(200)
      ).body.data,
    ).toEqual([]);
  });
});
