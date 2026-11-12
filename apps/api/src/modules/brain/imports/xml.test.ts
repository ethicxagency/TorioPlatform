import { describe, expect, it } from 'vitest';
import { detectedTags, effectiveMapping, mapItems, parseFeed, parsePrice, stockOf } from './xml';

const GOOGLE = `<?xml version="1.0"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>Shop</title>
<item><g:id>A1</g:id><title><![CDATA[Nordic Vase & Co]]></title><description>&lt;p&gt;Hand made.&lt;/p&gt;</description>
 <g:price>1,500.00 BDT</g:price><g:availability>in stock</g:availability><link>https://shop.test/p/a1</link><g:image_link>https://shop.test/a1.jpg</g:image_link>
 <g:product_type>Home &gt; Decor &gt; Vases</g:product_type><g:shipping><g:country>BD</g:country><g:price>60 BDT</g:price></g:shipping></item>
<item><g:id>B2</g:id><title>Linen Cushion</title><g:price>900</g:price><g:availability>out_of_stock</g:availability></item>
<item><g:id>B2</g:id><title>Linen Cushion (dup id)</title><g:price>900</g:price></item>
<item><g:id>C3</g:id><title>No Price Lamp</title></item>
<item><g:id>D4</g:id><g:price>10 USD</g:price></item></channel></rss>`;

describe('parseFeed', () => {
  it('reads Google Shopping items, decoding CDATA and entities and ignoring nested shipping prices', () => {
    const f = parseFeed(GOOGLE);
    expect(f.format).toBe('rss');
    expect(f.items).toHaveLength(5);
    expect(f.items[0]).toMatchObject({
      id: 'A1',
      title: 'Nordic Vase & Co',
      description: 'Hand made.',
      price: '1,500.00 BDT',
      link: 'https://shop.test/p/a1',
    });
    expect(detectedTags(f.items)).toContain('availability');
  });
  it('reads Atom entries and plain <product> lists, and never processes DTDs or entities', () => {
    expect(
      parseFeed(
        '<feed><entry><title>Hat</title><link href="https://x.test/hat"/><id>1</id></entry></feed>',
      ).items[0],
    ).toMatchObject({ title: 'Hat', link: 'https://x.test/hat' });
    expect(
      parseFeed('<products><product><name>Cap</name><price>5</price></product></products>').items,
    ).toHaveLength(1);
    const bomb =
      '<!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;">]><rss><channel><item><title>&b;</title></item></channel></rss>';
    expect(parseFeed(bomb).items[0]!['title']).toBe('&b;'); // left as text, never expanded
    expect(parseFeed('not xml at all').items).toEqual([]);
  });
});

describe('mapping and validation', () => {
  it('uses Google defaults, skips unnamed items, drops duplicates, and flags missing price and availability', () => {
    const f = parseFeed(GOOGLE);
    const m = effectiveMapping(f.items);
    expect(m).toMatchObject({
      name: 'title',
      price: 'price',
      externalId: 'id',
      stock: 'availability',
      url: 'link',
      image: 'image_link',
    });
    const r = mapItems(f.items, m);
    expect(r.products.map((p) => p.data['name'])).toEqual([
      'Nordic Vase & Co',
      'Linen Cushion',
      'No Price Lamp',
    ]);
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.missingPrice).toBe(1);
    const vase = r.products[0]!;
    expect(vase.data).toMatchObject({
      price: '1500',
      currency: 'BDT',
      stock: 'In stock',
      category: 'Vases',
      externalId: 'A1',
    });
    expect(vase.warnings).toEqual([]);
    expect(r.products[1]!.data['stock']).toBe('Out of stock');
    expect(r.products[2]!.warnings.join(' ')).toMatch(/No price/);
  });
  it('a currency override fills only a missing currency, and a custom mapping wins', () => {
    const items = [{ nm: 'Mug', cost: '250', qty: 'preorder' }];
    const m = effectiveMapping(items, { name: 'nm', price: 'cost', stock: 'qty' });
    const r = mapItems(items, m, 'bdt');
    expect(r.products[0]!.data).toMatchObject({
      name: 'Mug',
      price: '250',
      currency: 'BDT',
      stock: 'Pre-order',
    });
    expect(
      mapItems(
        [{ title: 'A', price: '5 USD' }],
        effectiveMapping([{ title: 'A', price: '5 USD' }]),
        'BDT',
      ).products[0]!.data['currency'],
    ).toBe('USD');
    expect(effectiveMapping(items, { name: 'does_not_exist' }).name).toBeUndefined();
  });
});

describe('non-product feeds', () => {
  it('says so when no item has a price', () => {
    const r = mapItems([{ title: 'Post one' }, { title: 'Post two' }], { name: 'title' });
    expect(r.issues.join(' ')).toMatch(/may not be a product feed/);
  });
});

describe('values', () => {
  it('parses prices in common shapes and rejects unreadable ones', () => {
    expect(parsePrice('1,500.00 BDT')).toEqual({ amount: '1500', currency: 'BDT' });
    expect(parsePrice('1.500,50 EUR')).toEqual({ amount: '1500.5', currency: 'EUR' });
    expect(parsePrice('1,500 BDT')).toEqual({ amount: '1500', currency: 'BDT' });
    expect(parsePrice('1,234,567')).toEqual({ amount: '1234567', currency: '' });
    expect(parsePrice('19,99 EUR')).toEqual({ amount: '19.99', currency: 'EUR' });
    expect(parsePrice('USD 19.99')).toEqual({ amount: '19.99', currency: 'USD' });
    expect(parsePrice('call us').amount).toBe('');
  });
  it('recognises availability words', () => {
    expect([
      stockOf('in_stock'),
      stockOf('OUT OF STOCK'),
      stockOf('backorder'),
      stockOf('maybe'),
    ]).toEqual(['In stock', 'Out of stock', 'Pre-order', '']);
  });
});
