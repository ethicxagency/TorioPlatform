import { BadRequestException } from '@nestjs/common';
import { emptyBrainConfig, type BrainConfig } from '@torio/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { CsvImportService } from './csv-import.service';
import { FeedService } from './feed.service';
import { ScanService } from './scan.service';
import { fakeDb } from './test-db';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const PRODUCTS =
  'Product Name,SKU,Price,Stock\nNordic Vase,A1,"1,500 BDT",in stock\nLinen Cushion,B2,900 BDT,out of stock\n,C3,5,\n';
const FAQS =
  'Question,Answer,Category\nDo you deliver?,Yes, nationwide within three days.,Delivery\nCOD?,Cash on delivery is available for all orders.,Payments\n';

describe('CsvImportService', () => {
  let db: ReturnType<typeof fakeDb>;
  let svc: CsvImportService;
  let scans: ScanService;
  let current: BrainConfig;

  beforeEach(() => {
    db = fakeDb();
    current = emptyBrainConfig();
    const prisma = { client: db.client } as never;
    svc = new CsvImportService(prisma);
    const brain = {
      get: async () => ({ config: structuredClone(current), version: 1 }),
      save: async (_w: string, _u: string, c: BrainConfig) => ((current = c), {}),
    };
    scans = new ScanService(
      prisma,
      brain as never,
      new FeedService(prisma),
      {} as never,
      {} as never,
      {} as never,
    );
  });
  const make = (type: 'products' | 'faqs', csv: string, name = 'export.csv', ws = WS) =>
    svc.create(ws, USER, { type, csv, name });

  it('previews products with mapping, counts and issues, and stores nothing', () => {
    const p = svc.preview({ type: 'products', csv: PRODUCTS });
    expect(p).toMatchObject({ format: 'csv-products', totalItems: 3, valid: 2, invalid: 1 });
    expect(p.mapping).toMatchObject({
      name: 'product_name',
      externalId: 'sku',
      price: 'price',
      stock: 'stock',
    });
    expect(p.tags).toContain('product_name');
    expect(p.sample[0]!.data).toMatchObject({
      name: 'Nordic Vase',
      price: '1500',
      currency: 'BDT',
    });
    expect(db.t.jobs).toHaveLength(0);
    expect(
      svc.preview({ type: 'products', csv: PRODUCTS, mapping: { name: 'sku' } }).sample[0]!.data[
        'name'
      ],
    ).toBe('A1');
  });

  it('refuses empty, header-only and unmappable files', () => {
    expect(() => svc.preview({ type: 'products', csv: 'Name,Price' })).toThrow(BadRequestException);
    expect(() => svc.preview({ type: 'products', csv: 'x'.repeat(2_600_000) })).toThrow(/2.5 MB/);
    return expect(make('products', 'Foo,Bar\n1,2')).rejects.toThrow(/Nothing in that file/);
  });

  it('a products file becomes proposals for review under its own source, and Brain is untouched until approved', async () => {
    const id = await make('products', PRODUCTS);
    const d = await scans.detail(WS, id);
    expect(d.job).toMatchObject({
      kind: 'MANUAL',
      status: 'NEEDS_REVIEW',
      stats: { items: 3, products: 2, invalid: 1 },
    });
    expect(db.t.sources[0]).toMatchObject({ kind: 'MANUAL', name: 'CSV: export.csv' });
    const recs = (await scans.records(WS, id)).data;
    expect(recs.map((r) => r.title).sort()).toEqual(['Linen Cushion', 'Nordic Vase']);
    expect(recs.every((r) => r.status === 'PENDING' && r.data['change'] === 'new')).toBe(true);
    expect(current.products).toHaveLength(0);
    for (const r of recs) await scans.review(WS, r.id, { status: 'APPROVED' });
    expect((await scans.importApproved(WS, USER, id)).imported).toBe(2);
    expect(current.products.map((p) => p.price).sort()).toEqual(['1500 BDT', '900 BDT']);
  });

  it('re-uploading the same file proposes only what changed', async () => {
    const first = await make('products', PRODUCTS);
    for (const r of (await scans.records(WS, first)).data)
      await scans.review(WS, r.id, { status: 'APPROVED' });
    await scans.importApproved(WS, USER, first);
    const second = await make('products', PRODUCTS.replace('1,500 BDT', '1,800 BDT'));
    expect((await scans.detail(WS, second)).job.stats).toMatchObject({
      products: 0,
      changed: 1,
      unchanged: 1,
    });
    expect(db.t.sources).toHaveLength(1);
    const third = await make('products', PRODUCTS.replace('1,500 BDT', '1,800 BDT'));
    const t = await scans.detail(WS, third);
    expect(t.job.status).toBe('NEEDS_REVIEW'); // the second upload's change was never imported, so it is proposed again
  });

  it('FAQs: categories are kept when Brain uses them, duplicates and incomplete rows are dropped, and approval imports them active', async () => {
    const id = await make(
      'faqs',
      FAQS.replace('Yes, nationwide', 'Yes nationwide') + 'Bad row,,General\n',
    );
    const d = await scans.detail(WS, id);
    expect(d.job.stats).toMatchObject({ items: 3, faqs: 2, invalid: 1 });
    const recs = (await scans.records(WS, id)).data;
    expect(recs.every((r) => r.category === 'faq')).toBe(true);
    for (const r of recs) await scans.review(WS, r.id, { status: 'APPROVED' });
    await scans.importApproved(WS, USER, id);
    expect(current.faqs.map((f) => [f.q, f.cat, f.active])).toEqual([
      ['Do you deliver?', 'Delivery', true],
      ['COD?', 'Payments', true],
    ]);
    // the same file again has nothing new
    const again = await make('faqs', FAQS.replace('Yes, nationwide', 'Yes nationwide'));
    expect((await scans.detail(WS, again)).job.status).toBe('COMPLETED');
  });

  it('stores are isolated, and a finished file import cannot be retried from the activity list', async () => {
    const id = await make('products', PRODUCTS);
    await expect(scans.detail(OTHER, id)).rejects.toThrow('Import not found');
    await expect(scans.retry(WS, USER, id)).rejects.toThrow(/Only a failed or cancelled/);
    await expect(scans.cancel(WS, id)).rejects.toThrow(/already finished/);
  });
});
