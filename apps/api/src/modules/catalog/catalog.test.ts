import { BadRequestException } from '@nestjs/common';
import type { BrainConfig } from '@torio/contracts';
import { describe, expect, it } from 'vitest';
import { parseFeed } from '../brain/imports/xml';
import { buildFeedXml, selectForFeed, xmlText } from './catalog-feed.service';
import { applyCandidates, CatalogImportService } from './catalog-import.service';
import { catalogMapping, mapCatalogItems, safeHttpUrl } from './catalog-map';

type P = BrainConfig['products'][number];
const base = (o: Partial<P>): P => ({
  id: 'p1',
  name: 'Tee',
  category: '',
  description: '',
  price: '500 BDT',
  variants: '',
  sizes: '',
  colors: '',
  stock: 'In stock',
  benefits: '',
  usage: '',
  limitations: '',
  faqs: '',
  ...o,
});

const GOOGLE = `<?xml version="1.0"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>S</title>
<item><g:id>A1</g:id><title>Blue Shirt</title><description>&lt;b&gt;Soft&lt;/b&gt; cotton &lt;script&gt;x()&lt;/script&gt;</description>
<link>https://shop.test/a1</link><g:image_link>https://cdn.test/1.jpg</g:image_link>
<g:additional_image_link>https://cdn.test/2.jpg</g:additional_image_link><g:additional_image_link>https://cdn.test/3.jpg</g:additional_image_link>
<g:price>1500.00 BDT</g:price><g:sale_price>1200.00 BDT</g:sale_price><g:availability>in_stock</g:availability><g:brand>Acme</g:brand><g:gtin>123</g:gtin></item>
<item><g:id>A2</g:id><title>Red Hat</title><g:price>300 BDT</g:price><g:image_link>javascript:alert(1)</g:image_link></item>
<item><g:id>A1</g:id><title>Dup</title><g:price>1 BDT</g:price></item>
<item><g:id>A3</g:id><g:price>1 BDT</g:price></item></channel></rss>`;

describe('catalog mapping', () => {
  const items = parseFeed(GOOGLE).items;
  const r = mapCatalogItems(items, catalogMapping(items));
  it('reads Google Merchant fields, sale price as the price and the list price as compare-at', () => {
    const a = r.items.find((i) => i.externalId === 'A1')!;
    expect(a.price).toBe('1200 BDT');
    expect(a.compareAtPrice).toBe('1500 BDT');
    expect(a.brand).toBe('Acme');
    expect(a.stock).toBe('In stock');
    expect(a.images).toEqual(['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg', 'https://cdn.test/3.jpg']);
  });
  it('strips markup from descriptions and drops non-http image links', () => {
    expect(r.items[0]!.description).not.toMatch(/[<>]/);
    expect(r.items[0]!.description).toContain('Soft cotton');
    expect(r.items.find((i) => i.externalId === 'A2')!.images).toEqual([]);
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
    expect(safeHttpUrl('https://u:p@x.test/a')).toBe('');
    expect(safeHttpUrl('/relative.jpg')).toBe('');
  });
  it('skips items without a title and ignores duplicates inside the feed', () => {
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.items).toHaveLength(2);
  });
  it('never expands entities or external references (XXE)', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&xxe;</title><price>1</price></item></channel></rss>`;
    const it2 = parseFeed(xml).items;
    const m = mapCatalogItems(it2, catalogMapping(it2));
    expect(JSON.stringify(m)).not.toContain('root:');
  });
});

describe('applyCandidates', () => {
  const items = parseFeed(GOOGLE).items;
  const cands = mapCatalogItems(items, catalogMapping(items)).items;
  const opts = { mode: 'update', status: 'ACTIVE', sourceId: 'src1', source: 'FEED' } as const;

  it('creates products once: a re-run changes nothing (idempotent)', () => {
    const products: P[] = [];
    const a = applyCandidates(products, cands, opts);
    expect(a.created).toBe(2);
    expect(products[0]).toMatchObject({ source: 'FEED', sourceId: 'src1', externalId: 'A1', status: 'ACTIVE' });
    const b = applyCandidates(products, cands, opts);
    expect(b).toMatchObject({ created: 0, updated: 0, skipped: 2 });
    expect(products).toHaveLength(2);
  });
  it('updates feed-owned products but never a field a person edited', () => {
    const products: P[] = [];
    applyCandidates(products, cands, opts);
    products[0]!.price = '999 BDT';
    products[0]!.edited = ['price'];
    const changed = cands.map((c) => (c.externalId === 'A1' ? { ...c, price: '1100 BDT', brand: 'New' } : c));
    const r = applyCandidates(products, changed, opts);
    expect(r.updated).toBe(1);
    expect(products[0]!.price).toBe('999 BDT');
    expect(products[0]!.brand).toBe('New');
    expect(r.notes.join(' ')).toMatch(/edited by hand/);
  });
  it('leaves products created by hand or on the Intelligent page alone', () => {
    const products = [base({ name: 'Blue Shirt', source: 'MANUAL' }), base({ id: 'p2', name: 'Red Hat' })];
    const r = applyCandidates(products, cands, opts);
    expect(r).toMatchObject({ created: 0, updated: 0, skipped: 2 });
    expect(products[0]!.price).toBe('500 BDT');
  });
  it('skip mode never touches an existing product, and the workspace cap is respected', () => {
    const products = [base({ name: 'Blue Shirt', source: 'FEED' })];
    expect(applyCandidates(products, cands, { ...opts, mode: 'skip' }).updated).toBe(0);
    const full = Array.from({ length: 1000 }, (_, i) => base({ id: `x${i}`, name: `N${i}` }));
    expect(applyCandidates(full, cands, opts).capped).toBe(2);
  });
});

describe('security of the import fetch', () => {
  const svc = new CatalogImportService({} as never, { get: async () => ({ config: { products: [] } }) } as never);
  it.each(['http://127.0.0.1/f.xml', 'http://localhost/f.xml', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'ftp://x.test/f.xml', 'http://10.0.0.5/f.xml', 'http://user:pw@example.com/f.xml'])(
    'refuses %s',
    async (url) => {
      await expect(svc.preview('w', { url })).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('refuses text that is not a product feed', async () => {
    await expect(svc.preview('w', { xml: '<html><body>hello world, not a feed</body></html>' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('outbound feeds', () => {
  const ctx = { storeName: 'Shop & Co', storeUrl: 'https://shop.test', fallbackCurrency: 'BDT' };
  const ok = base({ id: 'a', name: 'Tee <b>', price: '1200', compareAtPrice: '1500', url: 'https://shop.test/t', images: ['https://cdn.test/t.jpg', 'https://cdn.test/t2.jpg'], brand: 'Acme', status: 'ACTIVE' });
  it('publishes only active products with the data a channel requires, and says why others are left out', () => {
    const sel = selectForFeed(
      [ok, base({ id: 'd', name: 'Draft', status: 'DRAFT' }), base({ id: 'n', name: 'NoImg', url: 'https://s.test/x', status: 'ACTIVE' }), base({ id: 'o', name: 'Out', stock: 'Out of stock', url: 'https://s.test/o', images: ['https://c.test/o.jpg'] })],
      { inStockOnly: true, fallbackCurrency: 'BDT' },
    );
    expect(sel.map((s) => s.product.id)).toEqual(['a', 'n', 'o']); // the draft is never listed
    expect(sel.find((s) => s.product.id === 'a')!.excluded).toEqual([]);
    expect(sel.find((s) => s.product.id === 'n')!.excluded).toContain('no image');
    expect(sel.find((s) => s.product.id === 'o')!.excluded).toContain('out of stock');
  });
  it('builds an escaped Google/Meta RSS feed with sale price and extra images', () => {
    const g = buildFeedXml('GOOGLE', [ok], ctx);
    expect(g).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(g).toContain('<g:price>1500.00 BDT</g:price>');
    expect(g).toContain('<g:sale_price>1200.00 BDT</g:sale_price>');
    expect(g).toContain('<g:additional_image_link>https://cdn.test/t2.jpg</g:additional_image_link>');
    expect(g).toContain('Tee &lt;b&gt;');
    expect(g).toContain('Shop &amp; Co');
    expect(g).toContain('<g:availability>in_stock</g:availability>');
    expect(buildFeedXml('META', [ok], ctx)).toContain('<g:availability>in stock</g:availability>');
  });
  it('builds the custom XML format and strips characters XML forbids', () => {
    const c = buildFeedXml('CUSTOM', [ok], ctx);
    expect(c).toContain('<products>');
    expect(c).toContain('<title>Tee &lt;b&gt;</title>');
    expect(xmlText('a\u0000b&"')).toBe('ab&amp;&quot;');
    // the result must itself be readable XML
    expect(parseFeed(c).items[0]!['title']).toBe('Tee <b>'.replace(/<[^>]*>/g, ' ').trim() || 'Tee');
  });
});
