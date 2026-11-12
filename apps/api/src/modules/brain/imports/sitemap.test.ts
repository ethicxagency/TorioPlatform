import { describe, expect, it } from 'vitest';
import {
  isSitemapIndex,
  pickSitemapPages,
  productSitemaps,
  sitemapLocs,
  sitemapsFromRobots,
} from './sitemap';

describe('sitemap helpers', () => {
  it('reads locs (including CDATA and entities) and detects an index', () => {
    const xml =
      '<urlset><url><loc>https://a.test/products/x?a=1&amp;b=2</loc></url><url><loc><![CDATA[https://a.test/p/y]]></loc></url></urlset>';
    expect(sitemapLocs(xml)).toEqual(['https://a.test/products/x?a=1&b=2', 'https://a.test/p/y']);
    expect(isSitemapIndex('<sitemapindex></sitemapindex>')).toBe(true);
    expect(isSitemapIndex(xml)).toBe(false);
  });
  it('finds sitemap lines in robots.txt', () => {
    expect(
      sitemapsFromRobots(
        'User-agent: *\nDisallow: /x\nSitemap: https://a.test/sitemap.xml\nsitemap: https://a.test/s2.xml',
      ),
    ).toEqual(['https://a.test/sitemap.xml', 'https://a.test/s2.xml']);
  });
  it('samples product pages across the list and a few help pages, only from the same site', () => {
    const urls = [
      ...Array.from({ length: 40 }, (_, i) => `https://shop.test/products/item-${i}`),
      'https://shop.test/pages/shipping-policy',
      'https://shop.test/pages/faq',
      'https://shop.test/blog/news',
      'https://evil.test/products/x',
      'https://shop.test/cart',
    ];
    const pick = pickSitemapPages(urls, 'https://www.shop.test', 5, 2);
    expect(pick.filter((u) => u.includes('/products/'))).toHaveLength(5);
    expect(pick).toContain('https://shop.test/pages/faq');
    expect(
      pick.some((u) => u.includes('evil.test') || u.endsWith('/cart') || u.includes('/blog/')),
    ).toBe(false);
    expect(pick.find((u) => u.includes('item-0'))).toBeTruthy();
    expect(pick.find((u) => u.includes('item-39'))).toBeFalsy(); // spread, not just the tail
  });
  it('prefers product sitemaps from an index', () => {
    expect(
      productSitemaps(['https://a.test/pages.xml', 'https://a.test/sitemap_products_1.xml']),
    ).toEqual(['https://a.test/sitemap_products_1.xml']);
    expect(
      productSitemaps(['https://a.test/a.xml', 'https://a.test/b.xml', 'https://a.test/c.xml']),
    ).toHaveLength(2);
  });
});
