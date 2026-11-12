import { describe, expect, it } from 'vitest';
import { csvItems, faqMapping, headerKeys, mapFaqs, parseCsv } from './csv';
import { effectiveMapping, mapItems } from './xml';

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, embedded newlines, a BOM, CRLF and blank lines', () => {
    const r = parseCsv(
      '﻿Name,Description,Price\r\n"Vase, large","He said ""hi""\nsecond line",1500\r\n\r\nMug,,250\r\n',
    );
    expect(r).toEqual([
      ['Name', 'Description', 'Price'],
      ['Vase, large', 'He said "hi"\nsecond line', '1500'],
      ['Mug', '', '250'],
    ]);
  });
  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b;c\n1;2;3')[1]).toEqual(['1', '2', '3']);
    expect(parseCsv('a\tb\n1\t2')[1]).toEqual(['1', '2']);
  });
  it('does not run away on junk or a huge file', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('x\n' + 'row\n'.repeat(6000)).length).toBeLessThanOrEqual(5002);
  });
});

describe('headers and products', () => {
  it('turns header names into keys, uniquely', () => {
    expect(headerKeys(['Product Name', 'Price (BDT)', 'price (bdt)', ''])).toEqual([
      'product_name',
      'price_bdt',
      'price_bdt_2',
      'column_4',
    ]);
  });
  it('maps a typical shop export to products using the shared mapping and validation', () => {
    const t = csvItems(
      'Product Name,SKU,Price,Category,Stock,Image URL\nNordic Vase,A1,"1,500.00 BDT",Home,in stock,https://s.test/a1.jpg\nBare,B2,,,\n,C3,5,,',
    );
    expect(t.items).toHaveLength(3);
    const m = effectiveMapping(t.items);
    expect(m).toMatchObject({
      name: 'product_name',
      externalId: 'sku',
      price: 'price',
      category: 'category',
      stock: 'stock',
      image: 'image_url',
    });
    const r = mapItems(t.items, m);
    expect(r.products.map((p) => p.data['name'])).toEqual(['Nordic Vase', 'Bare']);
    expect(r.invalid).toBe(1);
    expect(r.products[0]!.data).toMatchObject({
      price: '1500',
      currency: 'BDT',
      stock: 'In stock',
      externalId: 'A1',
    });
    expect(r.missingPrice).toBe(1);
  });
  it('a file with no data rows yields nothing', () => {
    expect(csvItems('Name,Price').items).toEqual([]);
  });
});

describe('FAQs', () => {
  it('maps question and answer columns, skips incomplete rows, ignores duplicate questions, and keeps unknown categories as General', () => {
    const t = csvItems(
      'Question,Answer,Category\nDo you deliver?,Yes nationwide within three days.,Delivery\ndo you  deliver?,Dup answer here please.,Delivery\nNo answer,,General\nCOD?,Cash on delivery is available.,Shipping stuff\nShort,Ok,Orders',
    );
    const m = faqMapping(t.headers);
    expect(m).toEqual({ question: 'question', answer: 'answer', category: 'category' });
    const r = mapFaqs(t.items, m);
    expect(r.faqs.map((f) => f.data['q'])).toEqual(['Do you deliver?', 'COD?', 'Short']);
    expect(r.faqs[0]!.data['cat']).toBe('Delivery');
    expect(r.faqs[1]!.data['cat']).toBe('General');
    expect(r.faqs[1]!.warnings.join(' ')).toMatch(/not one Brain uses/);
    expect(r.faqs[2]!.warnings.join(' ')).toMatch(/very short/);
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
  });
  it('a chosen mapping wins, and an unknown column is ignored', () => {
    const t = csvItems('Topic,Reply\nShipping,We ship daily.');
    expect(faqMapping(t.headers)).toEqual({ question: 'topic', answer: 'reply' });
    expect(faqMapping(t.headers, { question: 'nope' }).question).toBeUndefined();
  });
});
