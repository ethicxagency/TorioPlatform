import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for the public pricing feed: it must mirror Super Admin's plans and leak nothing private. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('public plans (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const sfx = Math.random().toString(36).slice(2, 8);
  const keys = { live: `pub-${sfx}-live`, draft: `pub-${sfx}-draft`, ph: `pub-${sfx}-ph` };
  const limits = {
    members: 3,
    channels: null,
    contacts: 100,
    messages: 1000,
    whatsapp: null,
    instagram: null,
    messenger: null,
  };
  const base = {
    description: 'Public description',
    rank: 90,
    recommended: false,
    currency: 'BDT',
    limits,
    features: ['Feature A', 'Feature B'],
    entitlements: ['courier'],
    aiCredits: 777,
    priceIdMonth: 'price_secret_m',
    priceIdYear: 'price_secret_y',
  };
  const get = () => request(app.getHttpServer()).get('/api/v1/public/plans');
  const mine = (body: { data: { key: string }[] }) =>
    body.data.filter((p) => Object.values(keys).includes(p.key));

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
    await db.planDefinition.createMany({
      data: [
        {
          key: keys.live,
          name: 'Live plan',
          monthlyMinor: 70_000,
          yearlyMinor: 0,
          placeholderPricing: false,
          status: 'ACTIVE',
          ...base,
        },
        {
          key: keys.draft,
          name: 'Draft plan',
          monthlyMinor: 90_000,
          yearlyMinor: 900_000,
          placeholderPricing: false,
          status: 'DISABLED',
          ...base,
        },
        {
          key: keys.ph,
          name: 'Placeholder plan',
          monthlyMinor: 10_000,
          yearlyMinor: 100_000,
          placeholderPricing: true,
          status: 'ACTIVE',
          ...base,
        },
      ],
    });
  });
  afterAll(async () => {
    await db.planDefinition.deleteMany({ where: { key: { in: Object.values(keys) } } });
    await db.$disconnect();
    await app.close();
  });

  it('needs no sign-in, is cacheable, and lists only published plans with real pricing', async () => {
    const res = await get().expect(200);
    expect(res.headers['cache-control']).toMatch(/s-maxage=60/);
    const found = mine(res.body);
    expect(found.map((p) => p.key)).toEqual([keys.live]); // not the disabled draft, not the placeholder
    // the free default is never a priced card
    expect(res.body.data.every((p: { key: string; rank: number }) => p.rank > 0)).toBe(true);
  });

  it('shows the configured price, features and limits, and invents no price for an interval that is not set', async () => {
    const p = mine((await get().expect(200)).body)[0] as Record<string, unknown>;
    expect(p).toMatchObject({
      name: 'Live plan',
      currency: 'BDT',
      monthlyMinor: 70_000,
      monthlyAvailable: true,
      yearlyAvailable: false,
      features: ['Feature A', 'Feature B'],
      entitlements: ['courier'],
      limits: { members: 3, channels: -1, contacts: 100, messages: 1000 },
    });
  });

  it('never exposes provider price ids, AI credits, status, subscriber counts or other internals', async () => {
    const p = mine((await get().expect(200)).body)[0] as Record<string, unknown>;
    for (const k of [
      'priceIdMonth',
      'priceIdYear',
      'aiCredits',
      'status',
      'subscribers',
      'id',
      'placeholderPricing',
    ])
      expect(p).not.toHaveProperty(k);
    expect(JSON.stringify(p)).not.toMatch(/price_secret|777/);
  });

  it('follows Super Admin: an edit, then publishing a draft, shows up on the next request', async () => {
    await db.planDefinition.update({
      where: { key: keys.live },
      data: { monthlyMinor: 80_000, yearlyMinor: 800_000, features: ['Only feature'] },
    });
    const p = mine((await get().expect(200)).body)[0] as unknown as {
      monthlyMinor: number;
      yearlyMinor: number;
      yearlyAvailable: boolean;
      features: string[];
    };
    expect([p.monthlyMinor, p.yearlyMinor, p.yearlyAvailable, p.features]).toEqual([
      80_000,
      800_000,
      true,
      ['Only feature'],
    ]);
    await db.planDefinition.update({ where: { key: keys.draft }, data: { status: 'ACTIVE' } });
    expect(
      mine((await get().expect(200)).body)
        .map((x) => x.key)
        .sort(),
    ).toEqual([keys.live, keys.draft].sort());
    await db.planDefinition.update({ where: { key: keys.live }, data: { status: 'DISABLED' } });
    expect(mine((await get().expect(200)).body).map((x) => x.key)).toEqual([keys.draft]);
  });
});
