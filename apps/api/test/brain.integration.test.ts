import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { emptyBrainConfig, type BrainConfig } from '@torio/contracts';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for Brain persistence, validation, concurrency and tenant isolation. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('brain (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = (ws = ids.wsA) => `/api/v1/workspaces/${ws}/brain`;
  const http = () => request(app.getHttpServer());
  const cfg = (name = 'UrbanNest'): BrainConfig => ({
    ...emptyBrainConfig(),
    identity: { ...emptyBrainConfig().identity, name },
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
    const jwt = app.get(JwtService);
    auth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: 's' })}`,
    });
    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: 'x' } });
    const [owner, agent, outsider] = await Promise.all([mk('owner'), mk('agent'), mk('outsider')]);
    Object.assign(ids, { owner: owner.id, agent: agent.id, outsider: outsider.id });
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `bra-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `brb-${sfx}` } });
    Object.assign(ids, { wsA: wsA.id, wsB: wsB.id });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.agent!, ids.outsider!] } } });
    await db.$disconnect();
    await app.close();
  });

  it('a new workspace has an empty, version-0 Brain (nothing pre-filled)', async () => {
    const res = await http()
      .get(base())
      .set(await auth(ids.agent!))
      .expect(200);
    expect(res.body).toMatchObject({ version: 0, updatedAt: null });
    expect(res.body.config.identity.name).toBe('');
    expect(res.body.config.products).toEqual([]);
  });

  it('only admins/owners can save; agents can read', async () => {
    await http()
      .put(base())
      .set(await auth(ids.agent!))
      .send({ config: cfg(), baseVersion: 0 })
      .expect(403);
    await http()
      .get(base())
      .set(await auth(ids.agent!))
      .expect(200);
  });

  it('rejects invalid documents and incomplete configurations on the server', async () => {
    const owner = await auth(ids.owner!);
    await http()
      .put(base())
      .set(owner)
      .send({ config: { nope: true }, baseVersion: 0 })
      .expect(400);
    const noName = await http()
      .put(base())
      .set(owner)
      .send({ config: cfg(''), baseVersion: 0 })
      .expect(400);
    expect(noName.body.error.message).toMatch(/Business name is required/);
    const badRule = cfg();
    badRule.logic = [
      {
        id: 'r1',
        name: 'Broken',
        enabled: true,
        priority: 'High',
        join: 'and',
        items: [],
        actions: [],
        test: '',
      },
    ];
    await http().put(base()).set(owner).send({ config: badRule, baseVersion: 0 }).expect(400);
    expect((await http().get(base()).set(owner)).body.version).toBe(0); // nothing was stored
  });

  it('saves, increments the version, records who/when, and audits what changed', async () => {
    const owner = await auth(ids.owner!);
    const c = cfg();
    c.faqs = [{ id: 'f1', q: 'COD?', a: 'Yes', cat: 'Payments', active: true }];
    const res = await http().put(base()).set(owner).send({ config: c, baseVersion: 0 }).expect(200);
    expect(res.body).toMatchObject({ version: 1, updatedBy: { id: ids.owner } });
    expect(res.body.config.faqs).toHaveLength(1);
    const log = await db.auditLog.findFirstOrThrow({
      where: { workspaceId: ids.wsA!, action: 'brain.update' },
    });
    expect((log.metadata as { description: string }).description).toMatch(
      /Business profile|Knowledge base/,
    );
    const again = await http()
      .put(base())
      .set(owner)
      .send({ config: { ...c, voice: { ...c.voice, tone: 'Premium' } }, baseVersion: 1 })
      .expect(200);
    expect(again.body.version).toBe(2);
    expect(again.body.config.voice.tone).toBe('Premium');
  });

  it('detects concurrent edits: a stale baseVersion is refused and nothing is overwritten', async () => {
    const owner = await auth(ids.owner!);
    const stale = await http()
      .put(base())
      .set(owner)
      .send({ config: cfg('Overwrite attempt'), baseVersion: 1 })
      .expect(409);
    expect(stale.body.error.message).toMatch(/changed by someone else/);
    expect((await http().get(base()).set(owner)).body.config.identity.name).toBe('UrbanNest');
    await http().put(base()).set(owner).send({ config: cfg(), baseVersion: 0 }).expect(409); // first-save race is also refused
  });

  it('is isolated per workspace', async () => {
    await http()
      .get(base())
      .set(await auth(ids.outsider!))
      .expect(404);
    await http()
      .put(base())
      .set(await auth(ids.outsider!))
      .send({ config: cfg('Hacked'), baseVersion: 2 })
      .expect(404);
    const other = await http()
      .get(base(ids.wsB))
      .set(await auth(ids.outsider!))
      .expect(200);
    expect(other.body.version).toBe(0);
    expect(other.body.config.identity.name).toBe('');
  });
});
