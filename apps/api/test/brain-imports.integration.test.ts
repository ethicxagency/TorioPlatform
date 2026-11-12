import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Import overview: store isolation, permissions, and the "tables not migrated yet" state. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('brain imports overview (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<'owner' | 'other' | 'wsA' | 'wsB', string>;
  const http = () => request(app.getHttpServer());
  const path = (ws: string) => `/api/v1/workspaces/${ws}/brain/imports`;

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
    const [owner, other, agent] = await Promise.all([mk('own'), mk('oth'), mk('agt')]);
    const wsA = await db.workspace.create({ data: { name: 'ImpA', slug: `imp-a-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'ImpB', slug: `imp-b-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsB.id, userId: other.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
      ],
    });
    Object.assign(ids, { owner: owner.id, other: other.id, wsA: wsA.id, wsB: wsB.id });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { slug: { endsWith: sfx } } });
    await db.user.deleteMany({ where: { email: { endsWith: `-${sfx}@t.co` } } });
    await app.close();
    await db.$disconnect();
  });

  it('needs a session; a non-member gets 404, never store data', async () => {
    await http().get(path(ids.wsA)).expect(401);
    await http().get(path(ids.wsA)).set(await auth(ids.other)).expect(404);
  });

  it('returns an empty, honest overview; never another store’s sources', async () => {
    const r = await http().get(path(ids.wsA)).set(await auth(ids.owner)).expect(200);
    expect(typeof r.body.ready).toBe('boolean');
    expect(r.body.sources).toEqual([]);
    expect(r.body.jobs).toEqual([]);
    if (!r.body.ready) return; // the migration has not been applied to this database
    await db.importSource.create({
      data: { workspaceId: ids.wsB, kind: 'XML_FEED', name: 'B feed', url: 'https://b.example/feed.xml' },
    });
    const a = await http().get(path(ids.wsA)).set(await auth(ids.owner)).expect(200);
    expect(a.body.sources).toEqual([]);
    const b = await http().get(path(ids.wsB)).set(await auth(ids.other)).expect(200);
    expect(b.body.sources.map((s: { name: string }) => s.name)).toEqual(['B feed']);
  });
});
