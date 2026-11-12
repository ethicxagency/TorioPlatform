import { describe, expect, it } from 'vitest';
import { candidatesFromPage, linkPriority, parsePage, policyKind } from './extract';

const page = (url: string, html: string) => candidatesFromPage(parsePage(url, html));

describe('candidatesFromPage', () => {
  it('reads products from JSON-LD, with price, currency and availability, and warns on what is missing', () => {
    const html = `<html><head><title>Vase</title><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"Product","name":"Nordic Vase","description":"Hand made.","offers":{"@type":"Offer","price":"1500","priceCurrency":"BDT","availability":"https://schema.org/InStock"}},
        {"@type":"Product","name":"Bare Product"}]}</script></head><body></body></html>`;
    const c = page('https://shop.test/p/vase', html).filter((x) => x.category === 'product');
    expect(c).toHaveLength(2);
    expect(c[0]!.data).toMatchObject({
      name: 'Nordic Vase',
      price: '1500',
      currency: 'BDT',
      stock: 'In stock',
    });
    expect(c[0]!.confidence).toBeGreaterThan(c[1]!.confidence);
    expect(c[1]!.warnings.join(' ')).toMatch(/No price/);
    expect(c[0]!.sourceUrl).toBe('https://shop.test/p/vase');
  });

  it('reads FAQ pages from FAQPage markup and details/summary, without duplicates', () => {
    const html = `<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"Do you deliver?","acceptedAnswer":{"@type":"Answer","text":"Yes, nationwide."}}]}</script>
      <details><summary>Do you deliver?</summary><p>Yes, nationwide.</p></details>
      <details><summary>Can I pay on delivery?</summary><p>Cash on delivery is available.</p></details>`;
    const c = page('https://shop.test/faq', html).filter((x) => x.category === 'faq');
    expect(c.map((x) => x.data['q'])).toEqual(['Do you deliver?', 'Can I pay on delivery?']);
    expect(c[0]!.confidence).toBe(90);
  });

  it('turns a policy page into a reviewable excerpt of its own text, and never invents one', () => {
    const body = 'We ship within 2 to 4 working days across Bangladesh. '.repeat(5);
    const c = page(
      'https://shop.test/pages/shipping-policy',
      `<title>Shipping policy</title><body><p>${body}</p></body>`,
    );
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ category: 'policy', data: { kind: 'shipping' } });
    expect(c[0]!.data['text']).toContain('2 to 4 working days');
    expect(
      page(
        'https://shop.test/products/free-returns-coverage',
        `<title>Free Returns Coverage</title><body><p>${body}</p></body>`,
      ),
    ).toEqual([]);
    expect(page('https://shop.test/blog/hello', '<title>Hello</title><body>Short.</body>')).toEqual(
      [],
    );
  });

  it('reads a business profile from Organization markup, or weakly from Open Graph on the home page only', () => {
    const org = `<script type="application/ld+json">{"@type":"Organization","name":"UrbanNest","url":"https://urbannest.test","telephone":"+8801700000000","address":{"addressCountry":"BD"}}</script>`;
    expect(page('https://urbannest.test/', org)[0]).toMatchObject({
      category: 'business',
      confidence: 85,
      data: { name: 'UrbanNest', country: 'BD' },
    });
    const og =
      '<meta property="og:site_name" content="UrbanNest"><meta name="description" content="Home decor.">';
    const home = page('https://urbannest.test/', og);
    expect(home[0]!.confidence).toBeLessThan(60);
    expect(page('https://urbannest.test/about/team', og)).toEqual([]);
  });
});

describe('collapsible blocks', () => {
  it('are FAQs only when they read like questions or sit on a help page, never filter facets', () => {
    const facets =
      '<details><summary>Sort By</summary><p>Featured Best selling</p></details><details><summary>Size</summary><p>8 9 10</p></details>';
    expect(page('https://shop.test/collections/shoes', facets)).toEqual([]);
    expect(
      page(
        'https://shop.test/collections/shoes',
        '<details><summary>Do you ship abroad?</summary><p>Yes, worldwide.</p></details>',
      ),
    ).toHaveLength(1);
    expect(
      page(
        'https://shop.test/pages/faq',
        '<details><summary>Delivery times</summary><p>Two to four days.</p></details>',
      ),
    ).toHaveLength(1);
  });
});

describe('parsePage', () => {
  it('collects contact links and socials, ignores scripts, and resolves relative links', () => {
    const p = parsePage(
      'https://a.test/x/',
      `<a href="mailto:Hello@A.test?subject=hi">m</a><a href="tel:+880 1700-000000">t</a>
       <a href="https://facebook.com/a.test?ref=1">f</a><a href="../about">about</a><a href="javascript:void(0)">x</a>
       <script>var secret="do not read"</script><p>Visible</p>`,
    );
    expect(p.emails).toEqual(['hello@a.test']);
    expect(p.phones).toEqual(['+8801700000000']);
    expect(p.socials).toEqual(['https://facebook.com/a.test']);
    expect(p.links).toContain('https://a.test/about');
    expect(p.text).toContain('Visible');
    expect(p.text).not.toContain('secret');
  });
});

describe('helpers', () => {
  it('ranks policy and support pages above generic ones and skips assets and accounts', () => {
    expect(linkPriority('https://a.test/pages/faq')).toBeGreaterThan(
      linkPriority('https://a.test/blog/post'),
    );
    expect(linkPriority('https://a.test/logo.png')).toBe(-1);
    expect(linkPriority('https://a.test/cart')).toBe(-1);
  });
  it('recognises policy kinds from the address or title', () => {
    expect(policyKind('https://a.test/pages/return-policy', '')?.key).toBe('returns');
    expect(policyKind('https://a.test/p', 'Delivery information')?.key).toBe('shipping');
    expect(policyKind('https://a.test/p', 'Our story')).toBeNull();
  });
});
