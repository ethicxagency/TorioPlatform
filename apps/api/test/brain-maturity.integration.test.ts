import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { emptyBrainConfig, evaluateMaturity, type BrainConfig } from '@torio/contracts';
import { createPrismaClient, Prisma, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Brain maturity served by the API and stored with the saved document. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('brain maturity (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = (ws = ids.ws) => `/api/v1/workspaces/${ws}/brain`;
  const http = () => request(app.getHttpServer());

  const profile = (): BrainConfig => {
    const d = emptyBrainConfig();
    d.identity.name = 'Lumi Skincare';
    d.identity.category = 'Beauty & Cosmetics';
    d.identity.country = 'Bangladesh';
    d.identity.website = 'https://lumi.example.com';
    d.identity.audience = 'Adults with sensitive or eczema-prone skin who want simple routines';
    d.identity.usp = 'Dermatologist-tested formulas with no added fragrance or alcohol';
    d.identity.positioning = 'Affordable clinical-grade skincare for everyday sensitive skin';
    d.identity.description =
      'Lumi Skincare sells gentle, fragrance-free moisturisers and cleansers formulated for sensitive skin.';
    return d;
  };

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
    const [owner, outsider] = await Promise.all([mk('mowner'), mk('moutsider')]);
    const ws = await db.workspace.create({ data: { name: 'M', slug: `bm-${sfx}` } });
    const ws2 = await db.workspace.create({ data: { name: 'M2', slug: `bm2-${sfx}` } });
    Object.assign(ids, { owner: owner.id, outsider: outsider.id, ws: ws.id, ws2: ws2.id });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: ws.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: ws2.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
  });
  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.ws!, ids.ws2!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.outsider!] } } });
    await db.$disconnect();
    await app.close();
  });

  it('a Brain that was never saved is BORN with a real evaluation (not a placeholder)', async () => {
    const r = await http()
      .get(base())
      .set(await auth(ids.owner!))
      .expect(200);
    expect(r.body.maturity).toMatchObject({ stage: 'BORN', score: 0, nextStage: 'BABY' });
    expect(r.body.maturity.dimensions).toHaveLength(4);
    expect(r.body.maturity.recommendations[0].section).toBe('identity');
  });

  it('saving evaluates exactly the saved document, stores it, and returns it', async () => {
    const config = profile();
    const r = await http()
      .put(base())
      .set(await auth(ids.owner!))
      .send({ config, baseVersion: 0 })
      .expect(200);
    expect(r.body.maturity.stage).toBe('BABY');
    expect(r.body.maturity.score).toBe(evaluateMaturity(config).score);
    const row = await db.brainConfig.findUniqueOrThrow({ where: { workspaceId: ids.ws! } });
    expect(row.maturityAt).not.toBeNull();
    expect((row.maturity as { stage: string }).stage).toBe('BABY');
    // a GET serves the same evaluation
    const g = await http()
      .get(base())
      .set(await auth(ids.owner!))
      .expect(200);
    expect(g.body.maturity.score).toBe(r.body.maturity.score);
  });

  it('a later save recalculates; unsaved edits never count; setup completion stays separate', async () => {
    const before = (
      await http()
        .get(base())
        .set(await auth(ids.owner!))
    ).body;
    const richer = profile();
    richer.products = [
      {
        id: 'p1',
        name: 'Barrier Repair Cream',
        category: 'Skincare',
        description:
          'Rich fragrance-free moisturiser with ceramides and niacinamide for dry, sensitive skin.',
        price: '1200',
        variants: '50ml',
        sizes: '',
        colors: '',
        stock: 'In stock',
        benefits: '',
        usage: '',
        limitations: '',
        faqs: '',
      },
    ];
    const after = (
      await http()
        .put(base())
        .set(await auth(ids.owner!))
        .send({ config: richer, baseVersion: before.version })
        .expect(200)
    ).body;
    expect(after.maturity.score).toBeGreaterThan(before.maturity.score);
    expect(after.maturity.setupCompletion).not.toBe(after.maturity.score);
    expect(after.maturity.stats.products).toBe(1);
  });

  it('a save that fails validation stores nothing and leaves the evaluation untouched', async () => {
    const cur = (
      await http()
        .get(base())
        .set(await auth(ids.owner!))
    ).body;
    const bad = { ...profile(), identity: { ...profile().identity, name: '' } };
    await http()
      .put(base())
      .set(await auth(ids.owner!))
      .send({ config: bad, baseVersion: cur.version })
      .expect(400);
    const after = (
      await http()
        .get(base())
        .set(await auth(ids.owner!))
    ).body;
    expect(after.version).toBe(cur.version);
    expect({ ...after.maturity, evaluatedAt: 0 }).toEqual({ ...cur.maturity, evaluatedAt: 0 });
  });

  it('an evaluation from an older engine (or a corrupted one) is recomputed from the saved document', async () => {
    const row = await db.brainConfig.findUniqueOrThrow({ where: { workspaceId: ids.ws! } });
    await db.brainConfig.update({
      where: { workspaceId: ids.ws! },
      data: { maturity: { engine: 0, stage: 'EXPERT', score: 100 } },
    });
    const g = (
      await http()
        .get(base())
        .set(await auth(ids.owner!))
    ).body;
    expect(g.maturity.stage).not.toBe('EXPERT');
    expect(g.maturity.score).toBe(evaluateMaturity(row.data as BrainConfig).score);
    await db.brainConfig.update({
      where: { workspaceId: ids.ws! },
      data: { maturity: Prisma.DbNull },
    });
    expect(
      (
        await http()
          .get(base())
          .set(await auth(ids.owner!))
          .expect(200)
      ).body.maturity.engine,
    ).toBe(1);
  });

  it('is isolated per store: another store cannot read or affect this one', async () => {
    await http()
      .get(base())
      .set(await auth(ids.outsider!))
      .expect(404);
    const other = (
      await http()
        .get(base(ids.ws2))
        .set(await auth(ids.outsider!))
        .expect(200)
    ).body;
    expect(other.maturity.stage).toBe('BORN');
  });
});
