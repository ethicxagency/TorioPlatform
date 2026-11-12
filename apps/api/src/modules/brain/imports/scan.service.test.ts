import { BadRequestException, ConflictException } from '@nestjs/common';
import { emptyBrainConfig, type BrainConfig } from '@torio/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pagesByUrl: Record<string, { status?: number; body: string } | Error> = {};
vi.mock('./safe-fetch', () => ({
  safeGet: vi.fn(async (u: string) => {
    const p = pagesByUrl[u];
    if (!p) throw new Error('not found');
    if (p instanceof Error) throw p;
    return {
      url: u,
      status: p.status ?? 200,
      contentType: 'text/html',
      body: p.body,
      truncated: false,
    };
  }),
  USER_AGENT: 'test',
  guardedLookup: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (h: string) =>
    h === 'internal.test'
      ? [{ address: '10.0.0.8', family: 4 }]
      : [{ address: '93.184.216.34', family: 4 }],
  ),
}));

import { fakeDb } from './test-db';
import { ScanService } from './scan.service';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

describe('ScanService', () => {
  let db: ReturnType<typeof fakeDb>;
  let svc: ScanService;
  let saved: { cfg: BrainConfig; version: number } | null;
  let current: BrainConfig;

  beforeEach(() => {
    for (const k of Object.keys(pagesByUrl)) delete pagesByUrl[k];
    db = fakeDb();
    saved = null;
    current = emptyBrainConfig();
    const brain = {
      get: async () => ({ config: structuredClone(current), version: 3 }),
      save: async (_w: string, _u: string, cfg: BrainConfig, version: number) => {
        saved = { cfg, version };
        current = cfg;
        return {};
      },
    };
    svc = new ScanService({ client: db.client } as never, brain as never, {} as never, {} as never);
  });

  const SHOP = `<title>Shop</title><meta property="og:site_name" content="UrbanNest"><a href="/pages/shipping-policy">s</a><a href="/products/vase">p</a><a href="/cart">c</a>
    <script type="application/ld+json">{"@type":"Organization","name":"UrbanNest","url":"https://shop.test","telephone":"+8801700000000"}</script>`;
  const SHIP = `<title>Shipping policy</title><p>${'We deliver within three working days across the country. '.repeat(5)}</p>`;
  const VASE = `<title>Vase</title><script type="application/ld+json">{"@type":"Product","name":"Nordic Vase","description":"Ceramic.","offers":{"price":"1500","priceCurrency":"BDT","availability":"InStock"}}</script>`;
  const seed = () => {
    pagesByUrl['https://shop.test/robots.txt'] = { body: 'User-agent: *\nDisallow: /cart' };
    pagesByUrl['https://shop.test/'] = { body: SHOP };
    pagesByUrl['https://shop.test/pages/shipping-policy'] = { body: SHIP };
    pagesByUrl['https://shop.test/products/vase'] = { body: VASE };
  };

  it('refuses internal addresses, bad schemes and names that resolve to a private network', async () => {
    for (const url of [
      'http://localhost',
      'http://169.254.169.254',
      'ftp://shop.test',
      'https://internal.test',
    ])
      await expect(svc.start(WS, USER, { url })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.t.jobs).toHaveLength(0);
  });

  it('crawls within the limits, honours robots.txt, stores proposals with their source, and ends in review', async () => {
    seed();
    const d = await svc.start(WS, USER, { url: 'shop.test' });
    expect(d.job.status).toBe('QUEUED');
    const end = await svc.step(WS, d.job.id, 60_000);
    expect(end.job.status).toBe('NEEDS_REVIEW');
    expect(end.warnings.join(' ')).toMatch(/AI structuring is not configured/);
    const recs = (await svc.records(WS, d.job.id)).data;
    expect(recs.map((r) => r.category).sort()).toEqual(['business', 'policy', 'product']);
    expect(
      recs.every((r) => r.status === 'PENDING' && r.sourceUrl?.startsWith('https://shop.test')),
    ).toBe(true);
    const product = recs.find((r) => r.category === 'product')!;
    expect(product.data).toMatchObject({ name: 'Nordic Vase', price: '1500', currency: 'BDT' });
    // /cart is excluded both by our own rules and by robots; it was never fetched
    expect(Object.keys(pagesByUrl)).toContain('https://shop.test/robots.txt');
    expect(recs.find((r) => r.category === 'business')!.data['phone']).toBe('+8801700000000');
  });

  it('one scan at a time per store, and stores are isolated', async () => {
    seed();
    await svc.start(WS, USER, { url: 'https://shop.test' });
    await expect(svc.start(WS, USER, { url: 'https://shop.test' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    const other = await svc.start(OTHER, USER, { url: 'https://shop.test' });
    await expect(svc.detail(WS, other.job.id)).rejects.toThrow('Import not found');
    await expect(svc.records(WS, other.job.id)).rejects.toThrow('Import not found');
  });

  it('fails clearly when the first page cannot be read, and can be retried', async () => {
    pagesByUrl['https://down.test/robots.txt'] = new Error('nope');
    pagesByUrl['https://down.test/'] = new Error('The site took too long to respond.');
    const d = await svc.start(WS, USER, { url: 'https://down.test' });
    const end = await svc.step(WS, d.job.id, 5000);
    expect(end.job.status).toBe('FAILED');
    expect(end.job.error).toMatch(/could not be read/);
    const again = await svc.retry(WS, USER, d.job.id);
    expect(again.job.id).not.toBe(d.job.id);
    expect(again.job.status).toBe('QUEUED');
  });

  it('cancel stops an active scan and a finished one cannot be cancelled', async () => {
    seed();
    const d = await svc.start(WS, USER, { url: 'https://shop.test' });
    expect((await svc.cancel(WS, d.job.id)).job.status).toBe('CANCELLED');
    await expect(svc.cancel(WS, d.job.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await svc.step(WS, d.job.id)).job.status).toBe('CANCELLED');
  });

  it('only approved entries are imported; existing knowledge is never overwritten; duplicates are skipped', async () => {
    seed();
    current = {
      ...emptyBrainConfig(),
      identity: { ...emptyBrainConfig().identity, name: 'My Own Name' },
      products: [
        {
          id: 'p1',
          name: 'nordic vase',
          category: '',
          description: 'mine',
          price: '1',
          variants: '',
          sizes: '',
          colors: '',
          stock: 'In stock',
          benefits: '',
          usage: '',
          limitations: '',
          faqs: '',
        },
      ],
    };
    const d = await svc.start(WS, USER, { url: 'https://shop.test' });
    await svc.step(WS, d.job.id, 60_000);
    // nothing approved yet: nothing can be imported, and Brain is untouched
    await expect(svc.importApproved(WS, USER, d.job.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(saved).toBeNull();
    const recs = (await svc.records(WS, d.job.id)).data;
    for (const r of recs.filter((x) => x.category !== 'product'))
      await svc.review(WS, r.id, { status: 'APPROVED' });
    const prod = recs.find((x) => x.category === 'product')!;
    await svc.review(WS, prod.id, { status: 'REJECTED' });
    const res = await svc.importApproved(WS, USER, d.job.id);
    expect(res.imported).toBe(2);
    expect(saved!.version).toBe(3);
    expect(saved!.cfg.identity.name).toBe('My Own Name'); // not overwritten
    expect(saved!.cfg.identity.website).toBe('https://shop.test'); // blank filled
    expect(saved!.cfg.products).toHaveLength(1); // the rejected product was not added
    expect(saved!.cfg.faqs.some((f) => f.q.includes('shipping') && f.active)).toBe(true);
    // imported entries are final: they can no longer be edited here
    const imported = (await svc.records(WS, d.job.id)).data.filter((r) => r.status === 'IMPORTED');
    await expect(svc.review(WS, imported[0]!.id, { status: 'PENDING' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('edits keep the original value visible', async () => {
    seed();
    const d = await svc.start(WS, USER, { url: 'https://shop.test' });
    await svc.step(WS, d.job.id, 60_000);
    const prod = (await svc.records(WS, d.job.id)).data.find((x) => x.category === 'product')!;
    const r = await svc.review(WS, prod.id, { data: { ...prod.data, price: '1800' } });
    expect(r.data['price']).toBe('1800');
    expect(r.original['price']).toBe('1500');
    expect(r.edited).toBe(true);
  });
});
