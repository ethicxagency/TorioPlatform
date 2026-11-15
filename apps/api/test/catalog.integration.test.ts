import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Products & Catalog over the shared Brain products: permissions, isolation, conflicts, import and feeds. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

const XML = `<?xml version="1.0"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
<item><g:id>X1</g:id><title>Imported Cap</title><link>https://shop.test/cap</link><g:image_link>https://cdn.test/cap.jpg</g:image_link><g:price>250 BDT</g:price><g:availability>in_stock</g:availability></item>
<item><g:id>X2</g:id><title>Imported Bag</title><g:price>900 BDT</g:price></item></channel></rss>`;

describe.skipIf(!url)('catalog (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<'owner' | 'other' | 'agent' | 'wsA' | 'wsB', string>;
  const http = () => request(app.getHttpServer());
  const P = (ws: string, p = '') => `/api/v1/workspaces/${ws}/catalog${p}`;
  const input = (o: Record<string, unknown> = {}) => ({
    name: 'Blue Tee',
    price: '1200',
    sku: `SKU-${sfx}`,
    url: 'https://shop.test/tee',
    images: ['https://cdn.test/tee.jpg'],
    ...o,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.THROTTLE_DISABLED = 'true';
    process.env.CHANNEL_ENCRYPTION_KEY = 'integration-test-encryption-key-32-chars-min!';
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
    const [owner, other, agent] = await Promise.all([mk('own'), mk('oth'), mk('agt')]);
    const wsA = await db.workspace.create({
      data: { name: 'CatA', slug: `cat-a-${sfx}`, defaultCurrency: 'BDT' },
    });
    const wsB = await db.workspace.create({ data: { name: 'CatB', slug: `cat-b-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsB.id, userId: other.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
      ],
    });
    Object.assign(ids, {
      owner: owner.id,
      other: other.id,
      agent: agent.id,
      wsA: wsA.id,
      wsB: wsB.id,
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { slug: { endsWith: sfx } } });
    await db.user.deleteMany({ where: { email: { endsWith: `-${sfx}@t.co` } } });
    await app.close();
    await db.$disconnect();
  });

  let productId = '';
  it('an agent can view but not create; an owner can create', async () => {
    await http()
      .get(P(ids.wsA, '/products'))
      .set(await auth(ids.agent))
      .expect(200);
    await http()
      .post(P(ids.wsA, '/products'))
      .set(await auth(ids.agent))
      .send(input())
      .expect(403);
    const r = await http()
      .post(P(ids.wsA, '/products'))
      .set(await auth(ids.owner))
      .send(input())
      .expect(201);
    productId = r.body.id;
    expect(r.body).toMatchObject({
      name: 'Blue Tee',
      price: 1200,
      status: 'ACTIVE',
      source: 'MANUAL',
    });
  });

  it('is the same product record Brain holds (one source of truth)', async () => {
    const brain = await http()
      .get(`/api/v1/workspaces/${ids.wsA}/brain`)
      .set(await auth(ids.owner))
      .expect(200);
    expect(brain.body.config.products.map((p: { id: string }) => p.id)).toContain(productId);
  });

  it('another workspace cannot see or change it', async () => {
    await http()
      .get(P(ids.wsA, '/products'))
      .set(await auth(ids.other))
      .expect(404);
    const list = await http()
      .get(P(ids.wsB, '/products'))
      .set(await auth(ids.other))
      .expect(200);
    expect(list.body.total).toBe(0);
    await http()
      .get(P(ids.wsB, `/products/${productId}`))
      .set(await auth(ids.other))
      .expect(404);
  });

  it('refuses a duplicate SKU and a stale edit instead of overwriting', async () => {
    await http()
      .post(P(ids.wsA, '/products'))
      .set(await auth(ids.owner))
      .send(input({ name: 'Other' }))
      .expect(409);
    const cur = (
      await http()
        .get(P(ids.wsA, `/products/${productId}`))
        .set(await auth(ids.owner))
    ).body;
    const ok = await http()
      .put(P(ids.wsA, `/products/${productId}`))
      .set(await auth(ids.owner))
      .send({ ...input({ price: '1300' }), baseUpdatedAt: cur.updatedAt })
      .expect(200);
    expect(ok.body.price).toBe(1300);
    expect(ok.body.edited).toContain('price');
    await http()
      .put(P(ids.wsA, `/products/${productId}`))
      .set(await auth(ids.owner))
      .send({ ...input({ price: '1400' }), baseUpdatedAt: cur.updatedAt })
      .expect(409);
  });

  it('imports XML idempotently and reports the summary', async () => {
    const pv = await http()
      .post(P(ids.wsA, '/import/preview'))
      .set(await auth(ids.owner))
      .send({ xml: XML })
      .expect(200);
    expect(pv.body).toMatchObject({ valid: 2, existing: 0 });
    const run = { xml: XML, mode: 'skip', status: 'ACTIVE' };
    const a = await http()
      .post(P(ids.wsA, '/import'))
      .set(await auth(ids.owner))
      .send(run)
      .expect(200);
    expect(a.body).toMatchObject({ created: 2, updated: 0 });
    const b = await http()
      .post(P(ids.wsA, '/import'))
      .set(await auth(ids.owner))
      .send(run)
      .expect(200);
    expect(b.body).toMatchObject({ created: 0, skipped: 2 });
    const list = await http()
      .get(P(ids.wsA, '/products?source=XML_IMPORT'))
      .set(await auth(ids.owner))
      .expect(200);
    expect(list.body.total).toBe(2);
    const act = await http()
      .get(P(ids.wsA, '/activity'))
      .set(await auth(ids.owner))
      .expect(200);
    expect(act.body.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks internal addresses for URL imports', async () => {
    await http()
      .post(P(ids.wsA, '/import/preview'))
      .set(await auth(ids.owner))
      .send({ url: 'http://169.254.169.254/latest' })
      .expect(400);
  });

  it('bulk status and bulk delete', async () => {
    await http()
      .post(P(ids.wsA, '/products/bulk-status'))
      .set(await auth(ids.agent))
      .send({ ids: [productId], status: 'DRAFT' })
      .expect(403);
    const r = await http()
      .post(P(ids.wsA, '/products/bulk-status'))
      .set(await auth(ids.owner))
      .send({ ids: [productId], status: 'DRAFT' })
      .expect(200);
    expect(r.body.changed).toBe(1);
    const stats = (
      await http()
        .get(P(ids.wsA, '/stats'))
        .set(await auth(ids.owner))
    ).body;
    expect(stats.draft).toBe(1);
    const d = await http()
      .post(P(ids.wsA, '/products/bulk-delete'))
      .set(await auth(ids.owner))
      .send({ ids: [productId] })
      .expect(200);
    expect(d.body.changed).toBe(1);
  });

  it('publishes a tokenized feed that can be rotated, paused and deleted', async () => {
    const f = await http()
      .post(P(ids.wsA, '/channels/feeds'))
      .set(await auth(ids.owner))
      .send({ name: 'Google', channel: 'GOOGLE' })
      .expect(201);
    await http()
      .get(P(ids.wsA, '/channels'))
      .set(await auth(ids.agent))
      .expect(403); // the secret address is for managers only
    const path = (u: string) => new URL(u).pathname;
    const xml = await http().get(path(f.body.url)).expect(200);
    expect(xml.headers['content-type']).toMatch(/xml/);
    expect(xml.text).toContain('Imported Cap'); // active, with link + image + price
    expect(xml.text).not.toContain('Imported Bag'); // no image or link: left out, not published broken
    await http().get('/api/v1/catalog-feed/not-a-real-token-not-a-real-token-1234567').expect(404);
    const rot = await http()
      .post(P(ids.wsA, `/channels/feeds/${f.body.id}/rotate`))
      .set(await auth(ids.owner))
      .expect(200);
    await http().get(path(f.body.url)).expect(404);
    await http().get(path(rot.body.url)).expect(200);
    await http()
      .patch(P(ids.wsA, `/channels/feeds/${f.body.id}`))
      .set(await auth(ids.owner))
      .send({ status: 'PAUSED' })
      .expect(200);
    await http().get(path(rot.body.url)).expect(404);
    await http()
      .delete(P(ids.wsA, `/channels/feeds/${f.body.id}`))
      .set(await auth(ids.owner))
      .expect(200);
  });
});
