import { BadRequestException, ConflictException } from '@nestjs/common';
import { emptyBrainConfig, type BrainConfig } from '@torio/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files: Record<string, { status?: number; body: string; type?: string } | Error> = {};
vi.mock('./safe-fetch', () => ({
  safeGet: vi.fn(async (u: string) => {
    const f = files[u];
    if (!f) throw new Error('not found');
    if (f instanceof Error) throw f;
    return {
      url: u,
      status: f.status ?? 200,
      contentType: f.type ?? 'application/xml',
      body: f.body,
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

import { FeedService } from './feed.service';
import { ScanService } from './scan.service';
import { fakeDb } from './test-db';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const URL_ = 'https://shop.test/feed.xml';

const feed = (price: string) => `<rss xmlns:g="http://base.google.com/ns/1.0"><channel>
<item><g:id>A1</g:id><title>Nordic Vase</title><g:price>${price} BDT</g:price><g:availability>in stock</g:availability></item>
<item><g:id>B2</g:id><title>Linen Cushion</title><g:price>900 BDT</g:price><g:availability>in stock</g:availability></item></channel></rss>`;

describe('FeedService', () => {
  let db: ReturnType<typeof fakeDb>;
  let feeds: FeedService;
  let scans: ScanService;
  let current: BrainConfig;

  beforeEach(() => {
    for (const k of Object.keys(files)) delete files[k];
    db = fakeDb();
    current = emptyBrainConfig();
    const brain = {
      get: async () => ({ config: structuredClone(current), version: 1 }),
      save: async (_w: string, _u: string, cfg: BrainConfig) => {
        current = cfg;
        return {};
      },
    };
    feeds = new FeedService({ client: db.client } as never);
    scans = new ScanService({ client: db.client } as never, brain as never, feeds, {} as never);
  });

  const create = (over: Record<string, unknown> = {}) =>
    feeds.create(WS, USER, { url: URL_, name: 'Main feed', frequency: 'manual', ...over } as never);

  it('previews counts, mapping, issues and a sample without storing anything', async () => {
    files[URL_] = { body: feed('1500') + '' };
    const p = await feeds.preview(URL_);
    expect(p).toMatchObject({ format: 'rss', totalItems: 2, valid: 2, invalid: 0, duplicates: 0 });
    expect(p.mapping).toMatchObject({ name: 'title', price: 'price', externalId: 'id' });
    expect(p.sample[0]!.data).toMatchObject({
      name: 'Nordic Vase',
      price: '1500',
      currency: 'BDT',
    });
    expect(db.t.sources).toHaveLength(0);
    expect(db.t.jobs).toHaveLength(0);
  });

  it('refuses internal addresses, unreadable feeds and pages that are not feeds', async () => {
    await expect(feeds.preview('http://127.0.0.1/feed.xml')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(feeds.preview('https://internal.test/feed.xml')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    files['https://shop.test/down.xml'] = new Error('The site took too long to respond.');
    await expect(feeds.preview('https://shop.test/down.xml')).rejects.toThrow(/could not be read/);
    files['https://shop.test/page.html'] = {
      body: '<html><body>Hello</body></html>',
      type: 'text/html',
    };
    await expect(feeds.preview('https://shop.test/page.html')).rejects.toThrow(
      /does not look like a product feed/,
    );
  });

  it('a sync proposes products for review and stores nothing in Brain', async () => {
    files[URL_] = { body: feed('1500') };
    const jobId = await create({ currency: 'bdt' });
    await feeds.step(WS, jobId);
    const d = await scans.detail(WS, jobId);
    expect(d.job.status).toBe('NEEDS_REVIEW');
    expect(d.job.stats).toMatchObject({ items: 2, products: 2, changed: 0 });
    const recs = (await scans.records(WS, jobId)).data;
    expect(recs.map((r) => r.title).sort()).toEqual(['Linen Cushion', 'Nordic Vase']);
    expect(
      recs.every(
        (r) => r.status === 'PENDING' && r.category === 'product' && r.data['change'] === 'new',
      ),
    ).toBe(true);
    expect(current.products).toHaveLength(0);
    expect(db.t.sources[0]).toMatchObject({ kind: 'XML_FEED', lastError: null });
  });

  it('a re-sync proposes only changed products, shows what changed, and approval updates the matching product', async () => {
    files[URL_] = { body: feed('1500') };
    const first = await create();
    await feeds.step(WS, first);
    for (const r of (await scans.records(WS, first)).data)
      await scans.review(WS, r.id, { status: 'APPROVED' });
    expect((await scans.importApproved(WS, USER, first)).imported).toBe(2);
    expect(current.products.map((p) => p.price)).toEqual(['1500 BDT', '900 BDT']);
    // the owner edits a product by hand; an unchanged re-sync must not touch it
    current.products[1]!.description = 'Written by me';
    files[URL_] = { body: feed('1800') };
    const sourceId = db.t.sources[0].id as string;
    const second = await feeds.startJob(WS, USER, sourceId);
    await feeds.step(WS, second);
    const d = await scans.detail(WS, second);
    expect(d.job.stats).toMatchObject({ products: 0, changed: 1, unchanged: 1 });
    expect(d.warnings.join(' ')).toMatch(/1 product is unchanged/);
    const recs = (await scans.records(WS, second)).data;
    expect(recs).toHaveLength(1);
    expect(recs[0]!.warnings.join(' ')).toMatch(/price: 1500 → 1800/);
    await scans.review(WS, recs[0]!.id, { status: 'APPROVED' });
    const res = await scans.importApproved(WS, USER, second);
    expect(res.notes.join(' ')).toMatch(/1 existing product was updated/);
    expect(current.products.map((p) => p.price)).toEqual(['1800 BDT', '900 BDT']);
    expect(current.products[1]!.description).toBe('Written by me');
  });

  it('one sync at a time per feed; disconnecting stops it and never removes imported knowledge', async () => {
    files[URL_] = { body: feed('1500') };
    const jobId = await create();
    const sourceId = db.t.sources[0].id as string;
    await expect(feeds.startJob(WS, USER, sourceId)).rejects.toBeInstanceOf(ConflictException);
    await feeds.disconnect(WS, sourceId);
    expect((await scans.detail(WS, jobId)).job.status).toBe('CANCELLED');
    expect(db.t.sources[0].status).toBe('DISCONNECTED');
    await expect(feeds.startJob(WS, USER, sourceId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('a failing feed ends the job with a clear error and marks the source', async () => {
    files[URL_] = { body: feed('1500') };
    const jobId = await create();
    files[URL_] = { status: 503, body: '' };
    await feeds.step(WS, jobId);
    const d = await scans.detail(WS, jobId);
    expect(d.job.status).toBe('FAILED');
    expect(d.job.error).toMatch(/HTTP 503/);
    expect(db.t.sources[0]).toMatchObject({ status: 'ERROR' });
    const again = await scans.retry(WS, USER, jobId);
    expect(again.job.id).not.toBe(jobId);
    expect(again.job.status).toBe('QUEUED');
  });

  it('stores are isolated: another store cannot sync, disconnect or read this feed', async () => {
    files[URL_] = { body: feed('1500') };
    const jobId = await create();
    const sourceId = db.t.sources[0].id as string;
    await expect(feeds.startJob(OTHER, USER, sourceId)).rejects.toThrow('Feed not found');
    await expect(feeds.disconnect(OTHER, sourceId)).rejects.toThrow('Source not found');
    await expect(scans.detail(OTHER, jobId)).rejects.toThrow('Import not found');
  });

  it('scheduled feeds sync when due, manual ones never do', async () => {
    files[URL_] = { body: feed('1500') };
    await create({ frequency: 'manual' });
    db.t.jobs.forEach((j) => (j.status = 'COMPLETED'));
    expect((await feeds.tickDue()).started).toBe(0);
    await create({ frequency: 'daily' }); // same URL: the source is updated, not duplicated
    expect(db.t.sources).toHaveLength(1);
    db.t.jobs.forEach((j) => (j.status = 'COMPLETED'));
    db.t.sources[0].lastSyncedAt = new Date(Date.now() - 2 * 86_400_000);
    expect((await feeds.tickDue()).started).toBe(1);
    expect(db.t.jobs.at(-1)!.status).toBe('NEEDS_REVIEW');
    expect((await feeds.tickDue()).started).toBe(0); // just synced
  });
});
