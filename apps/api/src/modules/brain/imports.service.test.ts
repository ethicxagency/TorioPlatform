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
