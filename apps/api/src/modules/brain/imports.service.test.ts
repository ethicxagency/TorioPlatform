import { beforeEach, describe, expect, it } from 'vitest';
import { ImportsService } from './imports.service';
import { fakeDb } from './imports/test-db';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('ImportsService.overview totals', () => {
  let db: ReturnType<typeof fakeDb>;
  let svc: ImportsService;
  beforeEach(() => {
    db = fakeDb();
    svc = new ImportsService({ client: db.client } as never);
  });
  const rec = (ws: string, status: string, category = 'product') =>
    db.t.records.push({
      id: `r${db.t.records.length}`,
      workspaceId: ws,
      jobId: 'j',
      category,
      status,
    });
  const job = (ws: string, status: string, ageDays = 0) =>
    db.t.jobs.push({
      id: `j${db.t.jobs.length}`,
      workspaceId: ws,
      kind: 'XML_FEED',
      status,
      createdAt: new Date(Date.now() - ageDays * 86_400_000),
      sourceId: null,
      stats: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    });

  it('counts this store’s imported, pending and recently failed work, and nothing from another store', async () => {
    rec(WS, 'IMPORTED');
    rec(WS, 'IMPORTED');
    rec(WS, 'IMPORTED', 'faq');
    rec(WS, 'PENDING');
    rec(WS, 'APPROVED');
    rec(WS, 'REJECTED');
    rec(OTHER, 'IMPORTED');
    rec(OTHER, 'PENDING');
    job(WS, 'FAILED');
    job(WS, 'FAILED', 90);
    job(WS, 'COMPLETED');
    job(OTHER, 'FAILED');
    const o = await svc.overview(WS);
    expect(o.ready).toBe(true);
    expect(o.totals).toEqual({
      importedProducts: 2,
      importedEntries: 3,
      pendingReview: 2,
      failedImports: 1,
    });
  });

  it('is all zero for a store that never imported anything', async () => {
    expect((await svc.overview(WS)).totals).toEqual({
      importedProducts: 0,
      importedEntries: 0,
      pendingReview: 0,
      failedImports: 0,
    });
  });
});

describe('ImportsService.provenance', () => {
  it('says where imported products and FAQs came from, including policies imported as FAQs, and nothing for other stores or unimported entries', async () => {
    const db = fakeDb();
    const svc = new ImportsService({ client: db.client } as never);
    db.t.sources.push({ id: 's1', workspaceId: WS, kind: 'XML_FEED', name: 'Main feed' });
    db.t.jobs.push(
      { id: 'j1', workspaceId: WS, kind: 'XML_FEED', sourceId: 's1' },
      { id: 'j2', workspaceId: WS, kind: 'WEBSITE', sourceId: null },
      { id: 'j3', workspaceId: OTHER, kind: 'XML_FEED', sourceId: null },
    );
    const at = new Date('2026-11-12T10:00:00Z');
    const rec = (
      ws: string,
      jobId: string,
      category: string,
      title: string,
      data: Record<string, string>,
      over: Record<string, unknown> = {},
    ) =>
      db.t.records.push({
        id: `r${db.t.records.length}`,
        workspaceId: ws,
        jobId,
        category,
        title,
        data,
        original: data,
        sourceUrl: 'https://page.test/x',
        status: 'IMPORTED',
        updatedAt: at,
        ...over,
      });
    rec(
      WS,
      'j1',
      'product',
      'Nordic  Vase',
      { name: 'Nordic Vase', price: '1800', url: 'https://shop.test/p/vase' },
      { original: { name: 'Nordic Vase', price: '1500', url: 'https://shop.test/p/vase' } },
    );
    rec(WS, 'j2', 'faq', 'Do you deliver?', { q: 'Do you deliver?', a: 'Yes.' });
    rec(WS, 'j2', 'policy', 'Returns and refunds', { kind: 'returns', text: '30 days' });
    rec(WS, 'j1', 'product', 'Pending Thing', { name: 'Pending Thing' }, { status: 'PENDING' });
    rec(OTHER, 'j3', 'product', 'Secret', { name: 'Secret' });
    const p = await svc.provenance(WS);
    expect(Object.keys(p.products)).toEqual(['nordic vase']);
    expect(p.products['nordic vase']).toMatchObject({
      source: { kind: 'XML_FEED', name: 'Main feed' },
      url: 'https://shop.test/p/vase',
      edited: true,
    });
    expect(p.faqs['do you deliver?']).toMatchObject({
      source: { kind: 'WEBSITE', name: 'Website scan' },
      edited: false,
      url: 'https://page.test/x',
    });
    expect(Object.keys(p.faqs)).toContain('what is your return and refund policy?');
    expect(JSON.stringify(p)).not.toContain('Secret');
  });
});
