import {
  ConflictException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { emptyBrainConfig, type BrainConfig } from '@torio/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { GraphError } from '../../whatsapp/whatsapp.api';
import { FeedService } from './feed.service';
import { MetaCatalogService, toRaw } from './meta-catalog.service';
import { ScanService } from './scan.service';
import { fakeDb } from './test-db';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'EAAG-super-secret-long-lived-token';

type P = {
  id: string;
  retailer_id?: string;
  name?: string;
  price?: string;
  currency?: string;
  availability?: string;
  url?: string;
};
const product = (id: string, name: string, price: string): P => ({
  id: `m${id}`,
  retailer_id: id,
  name,
  price,
  currency: 'BDT',
  availability: 'in stock',
  url: `https://shop.test/p/${id}`,
});

describe('MetaCatalogService', () => {
  let db: ReturnType<typeof fakeDb>;
  let svc: MetaCatalogService;
  let scans: ScanService;
  let handler: ((st: { w: string; u: string }, code: string) => Promise<string>) | null;
  let granted: Set<string>;
  let pages: Record<string, { products: P[]; next: string | null }>;
  let failWith: Error | null;
  let enabled: boolean;
  let ready: boolean;
  let current: BrainConfig;

  beforeEach(() => {
    db = fakeDb();
    handler = null;
    granted = new Set(['catalog_management', 'business_management']);
    failWith = null;
    enabled = true;
    ready = true;
    current = emptyBrainConfig();
    pages = {
      first: {
        products: [product('A1', 'Nordic Vase', '1500'), product('B2', 'Linen Cushion', '900')],
        next: 'p2',
      },
      p2: {
        products: [product('B2', 'Linen Cushion', '900'), product('C3', 'Lamp', '2500')],
        next: null,
      },
    };
    const graph = {
      exchangeCode: async () => ({ access_token: 'short' }),
      longLivedUserToken: async () => ({ access_token: TOKEN, expires_in: 5_000_000 }),
      grantedPermissions: async () => granted,
      businesses: async (t: string) => {
        if (failWith) throw failWith;
        expect(t).toBe(TOKEN);
        return [{ id: 'biz1', name: 'UrbanNest Ltd' }];
      },
      ownedCatalogs: async () => [{ id: 'cat1', name: 'Main catalog', product_count: 3 }],
      catalogProducts: async (_t: string, _c: string, after?: string) => {
        if (failWith) throw failWith;
        return pages[after ?? 'first']!;
      },
    };
    const meta = {
      registerCatalogHandler: (fn: typeof handler) => (handler = fn),
      get catalogOauthReady() {
        return ready;
      },
      startCatalog: async () => ({
        url: 'https://www.facebook.com/dialog/oauth?scope=business_management,catalog_management',
      }),
    };
    const crypto = {
      encrypt: (s: string) => `enc:${Buffer.from(s).toString('base64')}`,
      decrypt: (s: string) => Buffer.from(s.slice(4), 'base64').toString(),
    };
    const mc = {
      load: async () => undefined,
      current: {
        webUrl: 'https://web.test/',
        appId: '123456',
        appSecret: 'secret-secret',
        oauthRedirectUri: 'https://api.test/cb',
      },
    };
    const prisma = { client: db.client } as never;
    svc = new MetaCatalogService(
      prisma,
      meta as never,
      { get: () => graph } as never,
      mc as never,
      crypto as never,
      {
        get META_CATALOG_ENABLED() {
          return enabled;
        },
      } as never,
    );
    const brain = {
      get: async () => ({ config: structuredClone(current), version: 1 }),
      save: async (_w: string, _u: string, cfg: BrainConfig) => ((current = cfg), {}),
    };
    scans = new ScanService(prisma, brain as never, new FeedService(prisma), svc, {} as never);
  });

  const connect = async (ws = WS) => handler!({ w: ws, u: USER }, 'auth-code');
  const ready_ = async () => {
    await connect();
    const list = await svc.catalogs(WS);
    await svc.select(WS, list.data[0]!.id);
  };

  it('is honestly unavailable until the operator enables it and Meta is configured', async () => {
    enabled = false;
    expect(await svc.status(WS)).toMatchObject({ available: false, connected: false });
    expect((await svc.status(WS)).reason).toMatch(/catalog_management/);
    await expect(svc.connect(WS, USER)).rejects.toBeInstanceOf(ServiceUnavailableException);
    enabled = true;
    ready = false;
    expect((await svc.status(WS)).reason).toMatch(/not configured/);
    ready = true;
    expect((await svc.status(WS)).available).toBe(true);
    expect((await svc.connect(WS, USER)).url).toContain('catalog_management');
  });

  it('stores the token encrypted and server-side only; missing permissions connect nothing', async () => {
    granted = new Set(['business_management']);
    expect(await connect()).toMatch(/meta_catalog=missing_permissions$/);
    expect(db.t.secrets).toHaveLength(0);
    granted = new Set(['catalog_management', 'business_management']);
    expect(await connect()).toMatch(/\/brain\?tab=intelligence&meta_catalog=connected$/);
    expect(db.t.secrets[0].ciphertext).not.toContain(TOKEN);
    expect(JSON.stringify(await svc.status(WS))).not.toContain(TOKEN);
    expect(await svc.status(WS)).toMatchObject({ connected: true, catalog: null });
  });

  it('lists the account’s catalogs and only lets one of them be chosen', async () => {
    await connect();
    expect((await svc.catalogs(WS)).data).toEqual([
      { id: 'cat1', name: 'Main catalog', businessName: 'UrbanNest Ltd', productCount: 3 },
    ]);
    await expect(svc.select(WS, 'someone-elses-catalog')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect((await svc.select(WS, 'cat1')).catalog).toEqual({ id: 'cat1', name: 'Main catalog' });
  });

  it('previews mapped products with price and currency', async () => {
    await ready_();
    const p = await svc.preview(WS);
    expect(p).toMatchObject({ format: 'meta-catalog', totalItems: 4, valid: 3, duplicates: 1 });
    expect(p.sample[0]!.data).toMatchObject({
      name: 'Nordic Vase',
      price: '1500',
      currency: 'BDT',
      stock: 'In stock',
      externalId: 'A1',
    });
  });

  it('a sync reads every page, drops duplicates across pages, and proposes products for review only', async () => {
    await ready_();
    const id = await svc.startJob(WS, USER);
    await expect(svc.startJob(WS, USER)).rejects.toBeInstanceOf(ConflictException);
    await svc.step(WS, id);
    const d = await scans.detail(WS, id);
    expect(d.job.status).toBe('NEEDS_REVIEW');
    expect(d.job.stats).toMatchObject({ items: 4, products: 3, changed: 0 });
    expect(d.warnings.join(' ')).toMatch(/1 duplicate/);
    const recs = (await scans.records(WS, id)).data;
    expect(recs.map((r) => r.title).sort()).toEqual(['Lamp', 'Linen Cushion', 'Nordic Vase']);
    expect(recs.every((r) => r.status === 'PENDING' && r.data['change'] === 'new')).toBe(true);
    expect(current.products).toHaveLength(0);
  });

  it('a re-sync proposes only changes, and an expired token ends the job with a reconnect message', async () => {
    await ready_();
    const first = await svc.startJob(WS, USER);
    await svc.step(WS, first);
    for (const r of (await scans.records(WS, first)).data)
      await scans.review(WS, r.id, { status: 'APPROVED' });
    await scans.importApproved(WS, USER, first);
    pages['first']!.products[0] = product('A1', 'Nordic Vase', '1800');
    const second = await svc.startJob(WS, USER);
    await svc.step(WS, second);
    expect((await scans.detail(WS, second)).job.stats).toMatchObject({
      products: 0,
      changed: 1,
      unchanged: 2,
    });
    const rec = (await scans.records(WS, second)).data[0]!;
    expect(rec.warnings.join(' ')).toMatch(/price: 1500 → 1800/);
    await scans.cancel(WS, second).catch(() => undefined);
    failWith = new GraphError('Error validating access token', 400, 190);
    const third = await svc.startJob(WS, USER);
    await svc.step(WS, third);
    const d = await scans.detail(WS, third);
    expect(d.job.status).toBe('FAILED');
    expect(d.job.error).toMatch(/expired or was revoked. Reconnect/);
    expect((await svc.status(WS)).status).toBe('ERROR');
  });

  it('stores are isolated, and disconnecting deletes the token but keeps imported knowledge', async () => {
    await ready_();
    expect((await svc.status(OTHER)).connected).toBe(false);
    await expect(svc.catalogs(OTHER)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.startJob(OTHER, USER)).rejects.toBeInstanceOf(ConflictException);
    await svc.disconnect(WS);
    expect(db.t.secrets).toHaveLength(0);
    expect(await svc.status(WS)).toMatchObject({ connected: false, status: 'DISCONNECTED' });
    await expect(svc.catalogs(WS)).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps catalog fields so the currency is never lost', () => {
    expect(
      toRaw({
        id: '1',
        name: 'Mug',
        price: '$15.00',
        currency: 'USD',
        availability: 'available for order',
      }),
    ).toMatchObject({ price: '$15.00 USD', title: 'Mug' });
    expect(toRaw({ id: '1', name: 'Mug', price: '15.00 USD', currency: 'USD' })['price']).toBe(
      '15.00 USD',
    );
  });
});
