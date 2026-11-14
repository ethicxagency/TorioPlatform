import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/modules/auth/auth.service';
import { PasswordService } from '../src/modules/auth/password.service';

/**
 * Real-PostgreSQL tests for sign-in methods and pictures: a first password for a Google-only account, the personal avatar, and
 * the workspace logo (separate records, separate permissions). Needs TEST_DATABASE_URL with the account_security_and_images
 * migration applied.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('sign-in methods and pictures (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string, sid?: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const http = () => request(app.getHttpServer());
  const png = (w = 600, h = 300) =>
    sharp({
      create: { width: w, height: h, channels: 4, background: { r: 91, g: 92, b: 226, alpha: 1 } },
    })
      .png()
      .toBuffer();

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.THROTTLE_DISABLED = 'true';
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    const jwt = app.get(JwtService);
    auth = async (id, sid = 's') => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid })}`,
    });
    const hash = await app.get(PasswordService).hash('Random-unusable-pass-1');
    const mk = (n: string, extra: object = {}) =>
      db.user.create({
        data: {
          email: `${n}-${sfx}@t.co`,
          name: n,
          passwordHash: hash,
          emailVerifiedAt: new Date(),
          ...extra,
        },
      });
    const [social, owner, agent, outsider] = await Promise.all([
      mk('social', {
        image: 'https://lh3.googleusercontent.com/p',
        imageSource: 'PROVIDER',
        providerImage: 'https://lh3.googleusercontent.com/p',
      }),
      mk('owner'),
      mk('agent'),
      mk('outsider'),
    ]);
    await db.userIdentity.create({
      data: {
        userId: social.id,
        provider: 'GOOGLE',
        providerUserId: `g-${sfx}`,
        email: social.email,
      },
    });
    const ws = await db.workspace.create({ data: { name: 'Brand', slug: `img-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'Other', slug: `img-b-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: ws.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: ws.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    for (const u of [social, owner, agent, outsider]) {
      await db.session.create({
        data: {
          userId: u.id,
          familyId: `fam-${u.id}`,
          refreshTokenHash: `${u.id}-${sfx}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    Object.assign(ids, {
      social: social.id,
      owner: owner.id,
      agent: agent.id,
      outsider: outsider.id,
      ws: ws.id,
      wsB: wsB.id,
      socialEmail: social.email,
    });
  });

  afterAll(async () => {
    await db.storedImage.deleteMany({
      where: { ownerId: { in: [ids.social!, ids.owner!, ids.ws!, ids.wsB!] } },
    });
    await db.workspace.deleteMany({ where: { id: { in: [ids.ws!, ids.wsB!] } } });
    await db.user.deleteMany({
      where: { id: { in: [ids.social!, ids.owner!, ids.agent!, ids.outsider!] } },
    });
    await db.$disconnect();
    await app.close();
  });

  it('a Google-only account shows no password, sets one with a valid code, keeps Google, and can then sign in with it', async () => {
    const h = await auth(ids.social!);
    const me = await http().get('/api/v1/users/me').set(h).expect(200);
    expect(me.body).toMatchObject({
      hasPassword: false,
      providers: ['GOOGLE'],
      hasProviderImage: true,
      imageSource: 'PROVIDER',
    });
    expect(JSON.stringify(me.body)).not.toMatch(/g-|providerUserId|passwordHash/);
    await http()
      .post('/api/v1/users/me/password')
      .set(h)
      .send({ currentPassword: 'x'.repeat(12), newPassword: 'Brand-new-pass-12' })
      .expect(400); // change needs a password first
    // a wrong code is refused; the right one (issued the way the mail step does) works once
    await db.emailToken.create({
      data: {
        userId: ids.social!,
        type: 'PASSWORD_SET_CODE',
        tokenHash: hashToken(`${ids.social}:123456`),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const body = (code: string) => ({
      code,
      newPassword: 'Brand-new-pass-12',
      confirmPassword: 'Brand-new-pass-12',
    });
    await http().post('/api/v1/users/me/password/set').set(h).send(body('000000')).expect(400);
    await http()
      .post('/api/v1/users/me/password/set')
      .set(h)
      .send({ ...body('123456'), confirmPassword: 'nope-nope-nope-12' })
      .expect(400);
    const ok = await http()
      .post('/api/v1/users/me/password/set')
      .set(h)
      .send(body('123456'))
      .expect(200);
    expect(ok.body).toMatchObject({ hasPassword: true, providers: ['GOOGLE'] });
    await http().post('/api/v1/users/me/password/set').set(h).send(body('123456')).expect(409);
    const row = await db.user.findUnique({ where: { id: ids.social! } });
    expect(row?.passwordHash).not.toContain('Brand-new-pass');
    expect(await db.userIdentity.count({ where: { userId: ids.social! } })).toBe(1);
    expect(
      await db.auditLog.count({ where: { actorId: ids.social!, action: 'user.password_set' } }),
    ).toBe(1);
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: ids.socialEmail, password: 'Brand-new-pass-12' });
    expect(login.status).toBe(200);
  });

  it('a custom avatar replaces the provider picture, is stored as a WebP, is served safely, and replacing deletes the old one', async () => {
    const h = await auth(ids.social!);
    const up = await http()
      .put('/api/v1/users/me/avatar')
      .set(h)
      .attach('file', await png(), 'a.png')
      .expect(200);
    expect(up.body).toMatchObject({ imageSource: 'CUSTOM', hasProviderImage: true });
    expect(up.body.image).toMatch(/\/api\/v1\/images\/[0-9a-f-]{36}$/);
    const id = up.body.image.split('/').pop();
    const img = await http().get(`/api/v1/images/${id}`).expect(200);
    expect(img.headers['content-type']).toBe('image/webp');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.headers['cache-control']).toMatch(/immutable/);
    expect((await sharp(img.body).metadata()).width).toBe(512);
    const up2 = await http()
      .put('/api/v1/users/me/avatar')
      .set(h)
      .attach('file', await png(400, 400), 'b.png')
      .expect(200);
    expect(up2.body.image).not.toBe(up.body.image);
    await http().get(`/api/v1/images/${id}`).expect(404); // the old picture is gone, not left behind
    expect(
      await db.storedImage.count({ where: { kind: 'USER_AVATAR', ownerId: ids.social! } }),
    ).toBe(1);
    // the provider picture is restored on request, and the uploaded copy is deleted
    const back = await http().post('/api/v1/users/me/avatar/provider').set(h).expect(200);
    expect(back.body).toMatchObject({
      image: 'https://lh3.googleusercontent.com/p',
      imageSource: 'PROVIDER',
    });
    expect(
      await db.storedImage.count({ where: { kind: 'USER_AVATAR', ownerId: ids.social! } }),
    ).toBe(0);
    const none = await http().delete('/api/v1/users/me/avatar').set(h).expect(200);
    expect(none.body).toMatchObject({ image: null, imageSource: 'NONE' });
  });

  it('refuses files that are not images, are too big, or are scripts renamed as pictures', async () => {
    const h = await auth(ids.social!);
    await http()
      .put('/api/v1/users/me/avatar')
      .set(h)
      .attach('file', Buffer.from('GIF89a....'), 'a.gif')
      .expect(400);
    await http()
      .put('/api/v1/users/me/avatar')
      .set(h)
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(400);
    await http()
      .put('/api/v1/users/me/avatar')
      .set(h)
      .attach('file', Buffer.alloc(3 * 1024 * 1024, 1), {
        filename: 'big.png',
        contentType: 'image/png',
      })
      .expect((r) => expect([400, 413]).toContain(r.status));
    await http().put('/api/v1/users/me/avatar').set(h).expect(400);
  });

  it('the workspace logo is a separate record: admins can set it, agents and other stores cannot, and it never touches a personal picture', async () => {
    const owner = await auth(ids.owner!);
    const L = `/api/v1/workspaces/${ids.ws}/logo`;
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="200" height="60" fill="#5B5CE2"/></svg>',
    );
    const set = await http()
      .put(L)
      .set(owner)
      .attach('file', svg, { filename: 'logo.svg', contentType: 'image/svg+xml' })
      .expect(200);
    expect(set.body.logo).toMatch(/\/api\/v1\/images\//);
    const served = await http()
      .get(`/api/v1/images/${set.body.logo.split('/').pop()}`)
      .expect(200);
    expect(served.headers['content-type']).toBe('image/webp'); // an SVG is never stored or served
    await http()
      .put(L)
      .set(owner)
      .attach(
        'file',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'),
        { filename: 'x.svg', contentType: 'image/svg+xml' },
      )
      .expect(400);
    await http()
      .put(L)
      .set(await auth(ids.agent!))
      .attach('file', await png(), 'logo.png')
      .expect(403);
    await http()
      .put(L)
      .set(await auth(ids.outsider!))
      .attach('file', await png(), 'logo.png')
      .expect(404);
    await http()
      .delete(L)
      .set(await auth(ids.agent!))
      .expect(403);
    expect(
      await db.storedImage.count({ where: { kind: 'WORKSPACE_LOGO', ownerId: ids.ws! } }),
    ).toBe(1);
    expect((await db.user.findUnique({ where: { id: ids.owner! } }))?.image).toBeNull();
    expect((await db.workspace.findUnique({ where: { id: ids.wsB! } }))?.logo).toBeNull();
    // it is listed for members (so the store switcher updates), and removing it deletes the file
    const list = await http().get('/api/v1/workspaces').set(owner).expect(200);
    expect(list.body.data.find((w: { id: string }) => w.id === ids.ws).logo).toBe(set.body.logo);
    const gone = await http().delete(L).set(owner).expect(200);
    expect(gone.body.logo).toBeNull();
    expect(
      await db.storedImage.count({ where: { kind: 'WORKSPACE_LOGO', ownerId: ids.ws! } }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          workspaceId: ids.ws!,
          action: { in: ['workspace.logo_update', 'workspace.logo_remove'] },
        },
      }),
    ).toBe(2);
  });
});
