import { BadRequestException } from '@nestjs/common';
import { emptyBrainConfig, type BrainConfig } from '@torio/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeedService } from './feed.service';
import { ProductReviewService } from './product-review.service';
import { ScanService } from './scan.service';
import { fakeDb } from './test-db';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

describe('ProductReviewService', () => {
  let db: ReturnType<typeof fakeDb>;
  let svc: ProductReviewService;
  let current: BrainConfig;
  let saves: number;
  let ids: Record<string, string>;

  const addJob = (ws: string, kind: string, sourceName: string) => {
    const src = { id: `s-${db.t.sources.length + 1}`, workspaceId: ws, kind, name: sourceName };
    db.t.sources.push(src);
    const job = {
      id: `j-${db.t.jobs.length + 1}`,
      workspaceId: ws,
      kind,
      sourceId: src.id,
      status: 'NEEDS_REVIEW',
      createdAt: new Date(),
    };
    db.t.jobs.push(job);
    return job.id;
  };
  let n = 0;
  const addRec = (
    ws: string,
    jobId: string,
    name: string,
    data: Record<string, string>,
    extra: Record<string, unknown> = {},
  ) => {
    const id = `r-${++n}`;
    db.t.records.push({
      id,
      workspaceId: ws,
      jobId,
      category: 'product',
      title: name,
      data: { name, ...data },
      original: { name, ...data },
      confidence: 80,
      warnings: [],
      status: 'PENDING',
      createdAt: new Date(Date.now() + n),
      ...extra,
    });
    return id;
  };

  beforeEach(() => {
    db = fakeDb();
    n = 0;
    saves = 0;
    current = emptyBrainConfig();
    const prisma = { client: db.client } as never;
    const brain = {
      get: async () => ({ config: structuredClone(current), version: 1 }),
      save: async (_w: string, _u: string, cfg: BrainConfig) => ((saves++, (current = cfg)), {}),
    };
    const scans = new ScanService(
      prisma,
      brain as never,
      new FeedService(prisma),
      {} as never,
      {} as never,
      {} as never,
    );
    svc = new ProductReviewService(prisma, brain as never, scans);
    const web = addJob(WS, 'WEBSITE', 'shop.test');
    const feed = addJob(WS, 'XML_FEED', 'Main feed');
    const meta = addJob(WS, 'META_CATALOG', 'Meta Catalog: Main');
    ids = {
      vaseWeb: addRec(
        WS,
        web,
        'Nordic Vase',
        { price: '1500', currency: 'BDT', description: 'Hand made vase.' },
        { confidence: 70 },
      ),
      vaseFeed: addRec(WS, feed, 'nordic  vase', {
        price: '1600',
        currency: 'BDT',
        category: 'Home',
        externalId: 'A1',
      }),
      vaseMeta: addRec(WS, meta, 'Nordic Vase', {
        price: '1500',
        currency: 'BDT',
        stock: 'Out of stock',
      }),
      lamp: addRec(WS, feed, 'Lamp', { price: '2500', currency: 'BDT', externalId: 'C3' }),
      mug: addRec(WS, feed, 'Mug', { price: '250', currency: 'BDT', externalId: 'M1' }),
      foreign: addRec(OTHER, addJob(OTHER, 'XML_FEED', 'Other store feed'), 'Secret Product', {
        price: '1',
      }),
    };
  });

  it('shows one product once, with where each version came from and exactly where they disagree', async () => {
    const r = await svc.list(WS);
    expect(r.totals).toMatchObject({ groups: 3, candidates: 5, approved: 0, conflicts: 1 });
    const g = r.groups[0]!;
    expect(g.name).toBe('Nordic Vase');
    expect(g.candidates.map((c) => c.source.kind).sort()).toEqual([
      'META_CATALOG',
      'WEBSITE',
      'XML_FEED',
    ]);
    expect(g.candidates.find((c) => c.source.kind === 'XML_FEED')!.source.name).toBe('Main feed');
    const price = g.conflicts.find((c) => c.field === 'price')!;
    expect(price.values.map((v) => v.value).sort()).toEqual(['1500', '1500', '1600']);
    expect(g.conflicts.map((c) => c.field)).not.toContain('description'); // only one source has one: nothing to disagree about
    expect(JSON.stringify(r)).not.toContain('Secret Product'); // another store's entry is never shown
  });

  it('compares with the matching product in Brain, and does not touch it unless told to', async () => {
    current.products.push({
      id: 'p1',
      name: 'Nordic vase',
      category: '',
      description: 'Mine',
      price: '1400 BDT',
      variants: '',
      sizes: '',
      colors: '',
      stock: 'In stock',
      benefits: '',
      usage: '',
      limitations: '',
      faqs: '',
    });
    const g = (await svc.list(WS)).groups.find((x) => x.name === 'Nordic Vase')!;
    expect(g.inBrain).toMatchObject({ price: '1400', currency: 'BDT', description: 'Mine' });
    expect(g.conflicts.find((c) => c.field === 'price')!.values[0]).toMatchObject({
      from: 'brain',
      value: '1400',
    });
    // keep the website version without updating Brain: the import leaves the existing product as it is
    await svc.resolve(WS, {
      recordIds: [ids.vaseWeb!, ids.vaseFeed!, ids.vaseMeta!],
      winnerId: ids.vaseWeb!,
      fields: {},
      updateBrain: false,
    });
    const res = await svc.importApproved(WS, USER);
    expect(res.skippedDuplicates).toBe(1);
    expect(current.products[0]!.price).toBe('1400 BDT');
  });

  it('resolving keeps one version, takes chosen fields from others, and rejects the rest', async () => {
    const all = [ids.vaseWeb!, ids.vaseFeed!, ids.vaseMeta!];
    await svc.resolve(WS, {
      recordIds: all,
      winnerId: ids.vaseWeb!,
      fields: { price: ids.vaseFeed!, category: ids.vaseFeed!, stock: ids.vaseMeta! },
      updateBrain: false,
    });
    const rec = (id: string) => db.t.records.find((r) => r.id === id)!;
    expect(rec(ids.vaseWeb!)).toMatchObject({
      status: 'APPROVED',
      data: {
        price: '1600',
        category: 'Home',
        stock: 'Out of stock',
        description: 'Hand made vase.',
      },
    });
    expect(rec(ids.vaseWeb!).original.price).toBe('1500'); // the original stays visible
    expect(rec(ids.vaseFeed!).status).toBe('REJECTED');
    expect(rec(ids.vaseMeta!).status).toBe('REJECTED');
    // the group is settled: it no longer needs a decision, but its approved version is still listed until imported
    const r = await svc.list(WS);
    expect(r.groups.find((g) => g.name === 'Nordic Vase')!.candidates).toHaveLength(1);
  });

  it('keeping Brain’s version rejects every candidate; bad requests are refused', async () => {
    await svc.resolve(WS, {
      recordIds: [ids.vaseWeb!, ids.vaseFeed!, ids.vaseMeta!],
      winnerId: null,
      fields: {},
      updateBrain: false,
    });
    expect(
      db.t.records
        .filter((r) => r.title.toLowerCase().includes('vase'))
        .every((r) => r.status === 'REJECTED'),
    ).toBe(true);
    await expect(
      svc.resolve(WS, {
        recordIds: [ids.vaseWeb!],
        winnerId: ids.vaseWeb!,
        fields: {},
        updateBrain: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException); // already settled
    await expect(
      svc.resolve(WS, {
        recordIds: [ids.lamp!, ids.mug!],
        winnerId: ids.lamp!,
        fields: {},
        updateBrain: false,
      }),
    ).rejects.toThrow('not the same product');
    await expect(
      svc.resolve(WS, {
        recordIds: [ids.lamp!],
        winnerId: ids.mug!,
        fields: {},
        updateBrain: false,
      }),
    ).rejects.toThrow('must be one of');
    await expect(
      svc.resolve(OTHER, {
        recordIds: [ids.lamp!],
        winnerId: ids.lamp!,
        fields: {},
        updateBrain: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException); // another store's entry
  });

  it('approve-clear approves only products nothing disagrees about; import adds approved ones from every source in one save', async () => {
    expect((await svc.approveClear(WS)).updated).toBe(2); // Lamp and Mug; the vase has three versions
    await svc.resolve(WS, {
      recordIds: [ids.vaseWeb!, ids.vaseFeed!, ids.vaseMeta!],
      winnerId: ids.vaseFeed!,
      fields: {},
      updateBrain: false,
    });
    const res = await svc.importApproved(WS, USER);
    expect(res.imported).toBe(3);
    expect(saves).toBe(1);
    expect(current.products.map((p) => p.name).sort()).toEqual(
      ['Lamp', 'Mug', 'nordic  vase'].map((x) => x).sort(),
    );
    expect(current.products.find((p) => p.name === 'Lamp')!.price).toBe('2500 BDT');
    // jobs whose entries are all decided are finished
    expect(db.t.jobs.find((j) => j.id === 'j-1')!.status).toBe('COMPLETED');
    expect(db.t.records.find((r) => r.id === ids.foreign)!.status).toBe('PENDING'); // another store untouched
  });

  it('with updateBrain the chosen values update the matching product, and nothing unapproved is imported', async () => {
    current.products.push({
      id: 'p1',
      name: 'Nordic Vase',
      category: '',
      description: 'Mine',
      price: '1400 BDT',
      variants: '',
      sizes: '',
      colors: '',
      stock: 'In stock',
      benefits: '',
      usage: '',
      limitations: '',
      faqs: '',
    });
    await expect(svc.importApproved(WS, USER)).rejects.toBeInstanceOf(BadRequestException); // nothing approved yet
    await svc.resolve(WS, {
      recordIds: [ids.vaseWeb!, ids.vaseFeed!, ids.vaseMeta!],
      winnerId: ids.vaseFeed!,
      fields: { price: 'brain' },
      updateBrain: true,
    });
    await svc.importApproved(WS, USER);
    const p = current.products.find((x) => x.name === 'Nordic Vase')!;
    expect(p.price).toBe('1400 BDT'); // "keep Brain's price"
    expect(p.category).toBe('Home'); // taken from the chosen version
    expect(p.description).toBe('Mine'); // untouched
    expect(current.products.some((x) => x.name === 'Lamp')).toBe(false); // never approved
  });
});
