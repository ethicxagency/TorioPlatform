import { decode, linkPriority } from './extract';

/** Pure helpers for reading sitemaps. Fetching is done by the scan, with the same safe fetcher as pages. */

export const MAX_SITEMAP_URLS = 5000;

export const sitemapLocs = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)]
    .map((m) => decode(m[1]!).trim())
    .slice(0, MAX_SITEMAP_URLS);

export const isSitemapIndex = (xml: string) => /<sitemapindex[\s>]/i.test(xml);

/** `Sitemap:` lines of a robots.txt. */
export const sitemapsFromRobots = (robots: string): string[] =>
  [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]!).slice(0, 3);

const hostKey = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Picks a small, spread-out sample of pages worth reading from a sitemap: individual product pages first (they carry the
 * product data), then help and policy pages. Only the site's own addresses are considered.
 */
export function pickSitemapPages(
  urls: string[],
  origin: string,
  products = 8,
  others = 4,
): string[] {
  const own = urls.filter((u) => hostKey(u) === hostKey(origin) && linkPriority(u) >= 0);
  const spread = (xs: string[], n: number) => {
    if (xs.length <= n) return xs;
    const step = xs.length / n;
    return Array.from({ length: n }, (_, i) => xs[Math.floor(i * step)]!);
  };
  const prod = spread(
    own.filter((u) => /\/products?\//i.test(u)),
    products,
  );
  const rest = spread(
    own.filter((u) => linkPriority(u) >= 85 && !prod.includes(u)),
    others,
  );
  return [...rest, ...prod];
}

/** Of a sitemap index's children, the ones most likely to list products. */
export const productSitemaps = (children: string[]): string[] => {
  const p = children.filter((c) => /product/i.test(c));
  return (p.length ? p : children).slice(0, 2);
};
