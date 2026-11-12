/**
 * Rule-based extraction from public HTML. It only reports what the page actually says: structured data (JSON-LD, Open
 * Graph), visible contact links, FAQ markup and policy pages. Nothing here invents a value; every entry carries the URL it
 * came from and a confidence that reflects how direct the evidence is.
 */

export type Category = 'business' | 'product' | 'faq' | 'policy';

export interface Candidate {
  category: Category;
  title: string;
  data: Record<string, string>;
  sourceUrl: string;
  /** 0-100. Structured data scores higher than text inferred from a page. */
  confidence: number;
  warnings: string[];
}

export interface PageInfo {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
  jsonld: unknown[];
  meta: Record<string, string>;
  emails: string[];
  phones: string[];
  socials: string[];
  details: { q: string; a: string }[];
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)),
    )
    .replace(/&([a-z]+);/gi, (m, n: string) => ENT[n.toLowerCase()] ?? m);

const clean = (s: string, max = 2000) =>
  decode(s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const SOCIAL =
  /^(https?:)?\/\/(www\.)?(facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|wa)\.(com|me)\//i;

function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && val !== undefined && !(key in out)) out[key] = decode(val).trim();
  }
  return out;
}

function jsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      out.push(JSON.parse(m[1]!.trim()));
    } catch {
      /* malformed structured data is ignored */
    }
  }
  return out;
}

export function parsePage(url: string, html: string): PageInfo {
  const body = html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '', 200);
  const meta = metaTags(html);
  const links: string[] = [];
  const emails = new Set<string>();
  const phones = new Set<string>();
  const socials = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    const href = decode(m[1]!).trim();
    if (/^mailto:/i.test(href)) {
      const e = href.slice(7).split('?')[0]!.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) emails.add(e);
    } else if (/^tel:/i.test(href)) {
      const p = href.slice(4).replace(/[^\d+]/g, '');
      if (p.length >= 7) phones.add(p);
    } else if (SOCIAL.test(href)) socials.add(href.split('?')[0]!);
    else if (!/^(javascript|data):/i.test(href)) {
      try {
        links.push(new URL(href, url).toString());
      } catch {
        /* ignore unparsable links */
      }
    }
  }
  const details: { q: string; a: string }[] = [];
  for (const m of body.matchAll(
    /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
  )) {
    const q = clean(m[1]!, 300);
    const a = clean(m[2]!, 2000);
    if (q && a) details.push({ q, a });
  }
  for (const m of body.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const q = clean(m[1]!, 300);
    const a = clean(m[2]!, 2000);
    if (q.endsWith('?') && a) details.push({ q, a });
  }
  return {
    url,
    title,
    description: meta['description'] ?? meta['og:description'] ?? '',
    text: clean(body, 12000),
    links,
    jsonld: jsonLd(html),
    meta,
    emails: [...emails],
    phones: [...phones],
    socials: [...socials],
    details,
  };
}

/** Flattens @graph, arrays and ItemList nesting into the individual typed nodes. */
function nodes(x: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(x)) x.forEach((n) => nodes(n, out));
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    out.push(o);
    if (o['@graph']) nodes(o['@graph'], out);
    if (o['itemListElement']) nodes(o['itemListElement'], out);
    if (o['item']) nodes(o['item'], out);
    if (o['mainEntity']) nodes(o['mainEntity'], out);
    if (o['hasPart']) nodes(o['hasPart'], out);
  }
  return out;
}
const typesOf = (n: Record<string, unknown>) =>
  ([] as unknown[]).concat(n['@type'] ?? []).map((t) => String(t).toLowerCase());
const str = (v: unknown, max = 1000): string => {
  if (typeof v === 'string') return clean(v, max);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return str(v[0], max);
  if (v && typeof v === 'object' && 'name' in v) return str((v as { name: unknown }).name, max);
  return '';
};

const STOCK: Record<string, string> = {
  instock: 'In stock',
  limitedavailability: 'Low stock',
  outofstock: 'Out of stock',
  soldout: 'Out of stock',
  preorder: 'Pre-order',
  presale: 'Pre-order',
};
const stockOf = (a: unknown) =>
  STOCK[
    String(a ?? '')
      .split('/')
      .pop()!
      .toLowerCase()
  ] ?? '';

function offerOf(p: Record<string, unknown>) {
  const o = ([] as unknown[]).concat(p['offers'] ?? [])[0] as Record<string, unknown> | undefined;
  if (!o) return { price: '', currency: '', stock: '' };
  const price = str(
    o['price'] ??
      o['lowPrice'] ??
      (o['priceSpecification'] as Record<string, unknown> | undefined)?.['price'],
  );
  return {
    price,
    currency: str(o['priceCurrency']),
    stock: stockOf(o['availability']),
  };
}

const POLICY_KINDS: [RegExp, string, string][] = [
  [/(shipping|delivery)/i, 'shipping', 'Shipping and delivery'],
  [/(return|refund)/i, 'returns', 'Returns and refunds'],
  [/(exchange)/i, 'exchange', 'Exchanges'],
  [/(payment|how-to-pay|cash-on-delivery|cod)/i, 'payment', 'Payment methods'],
  [/(terms|conditions)/i, 'terms', 'Terms and conditions'],
  [/(privacy)/i, 'privacy', 'Privacy policy'],
];

/** The kind of policy a page is about, judged from its address and title only. */
export function policyKind(url: string, title: string): { key: string; label: string } | null {
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    /* use the title alone */
  }
  for (const [re, key, label] of POLICY_KINDS)
    if (re.test(path) || re.test(title)) return { key, label };
  return null;
}

/** Entries found on one page. Empty when the page carries nothing recognisable. */
export function candidatesFromPage(p: PageInfo): Candidate[] {
  const out: Candidate[] = [];
  const all = p.jsonld.flatMap((j) => nodes(j));

  // Business profile: Organization / LocalBusiness / Store, then Open Graph as a weaker source.
  for (const n of all) {
    const t = typesOf(n);
    if (
      !t.some((x) =>
        ['organization', 'localbusiness', 'store', 'onlinestore', 'corporation'].includes(x),
      )
    )
      continue;
    const addr = n['address'] as Record<string, unknown> | undefined;
    const data: Record<string, string> = {};
    const set = (k: string, v: string) => v && (data[k] = v);
    set('name', str(n['name'], 120));
    set('description', str(n['description'], 1000));
    set('email', str(n['email'], 120));
    set('phone', str(n['telephone'], 40));
    set('website', str(n['url'], 200));
    set('country', str(addr?.['addressCountry'], 80));
    set('category', str(n['additionalType'] ?? n['@type'], 80));
    if (data['name'])
      out.push({
        category: 'business',
        title: data['name'],
        data,
        sourceUrl: p.url,
        confidence: 85,
        warnings: [],
      });
    break;
  }
  if (
    !out.some((c) => c.category === 'business') &&
    (p.meta['og:site_name'] || p.meta['og:title'])
  ) {
    const data: Record<string, string> = {};
    if (p.meta['og:site_name']) data['name'] = p.meta['og:site_name'];
    if (p.description) data['description'] = p.description.slice(0, 1000);
    if (data['name'] && /^(\/|)$/.test(safePath(p.url)))
      out.push({
        category: 'business',
        title: data['name'],
        data,
        sourceUrl: p.url,
        confidence: 55,
        warnings: ['From the page’s social sharing tags, not from a business profile.'],
      });
  }

  // Products
  const seen = new Set<string>();
  for (const n of all) {
    if (!typesOf(n).includes('product')) continue;
    const name = str(n['name'], 120);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const { price, currency, stock } = offerOf(n);
    const data: Record<string, string> = { name };
    const set = (k: string, v: string) => v && (data[k] = v);
    set('description', str(n['description'], 1000));
    set('category', str(n['category'], 60));
    set('price', price);
    set('currency', currency);
    set('stock', stock);
    set('colors', str(n['color'], 300));
    set('url', str(n['url'], 300) || p.url);
    set('image', str(n['image'], 300));
    const warnings: string[] = [];
    if (!price) warnings.push('No price was published for this product.');
    if (!data['description']) warnings.push('No description was published.');
    if (!stock)
      warnings.push('Availability was not published; it imports as In stock, so check it.');
    out.push({
      category: 'product',
      title: name,
      data,
      sourceUrl: p.url,
      confidence: 70 + (price ? 15 : 0) + (data['description'] ? 10 : 0),
      warnings,
    });
  }
  if (
    !out.some((c) => c.category === 'product') &&
    /^(product|og:product)/i.test(p.meta['og:type'] ?? '')
  ) {
    const name = p.meta['og:title'] ?? '';
    if (name) {
      const price = p.meta['product:price:amount'] ?? p.meta['og:price:amount'] ?? '';
      out.push({
        category: 'product',
        title: name,
        data: {
          name,
          ...(p.description && { description: p.description.slice(0, 1000) }),
          ...(price && { price }),
          ...((p.meta['product:price:currency'] ?? p.meta['og:price:currency']) && {
            currency: (p.meta['product:price:currency'] ?? p.meta['og:price:currency'])!,
          }),
          url: p.url,
        },
        sourceUrl: p.url,
        confidence: 60,
        warnings: [
          ...(price ? [] : ['No price was published for this product.']),
          'Availability was not published; it imports as In stock, so check it.',
        ],
      });
    }
  }

  // FAQs: FAQPage markup is direct evidence; details/summary and dt/dd are visible on the page too.
  const faqSeen = new Set<string>();
  const addFaq = (q: string, a: string, conf: number) => {
    const k = q.toLowerCase();
    if (!q || !a || faqSeen.has(k)) return;
    faqSeen.add(k);
    out.push({
      category: 'faq',
      title: q.slice(0, 120),
      data: { q: q.slice(0, 300), a: a.slice(0, 2000) },
      sourceUrl: p.url,
      confidence: conf,
      warnings: [],
    });
  };
  for (const n of all) {
    if (!typesOf(n).includes('question')) continue;
    const ans = n['acceptedAnswer'] as Record<string, unknown> | undefined;
    addFaq(str(n['name'], 300), str(ans?.['text'], 2000), 90);
  }
  // Collapsible blocks are FAQs only when they read like questions or sit on a help/FAQ page; otherwise they are things like
  // filter facets ("Sort by", "Size") on a collection page.
  const faqPage =
    /\/(faqs?|help|support|customer-service|questions)(\/|$)/i.test(safePath(p.url)) ||
    /^\s*(faqs?\b|frequently asked|help\b|support\b)/i.test(p.title);
  for (const d of p.details)
    if (d.q.trim().endsWith('?') || faqPage) addFaq(d.q, d.a, d.q.trim().endsWith('?') ? 75 : 60);

  // Policy pages: the page's own text, shortened, for a person to review. Never rewritten.
  // an individual product page is a product, even when its name says "returns" or "delivery"
  const pk = /\/products?\//i.test(safePath(p.url)) ? null : policyKind(p.url, p.title);
  if (pk && p.text.length > 120)
    out.push({
      category: 'policy',
      title: pk.label,
      data: { kind: pk.key, text: p.text.slice(0, 1500) },
      sourceUrl: p.url,
      confidence: 60,
      warnings: p.text.length > 1500 ? ['Shortened to the first 1,500 characters.'] : [],
    });

  return out;
}

function safePath(u: string) {
  try {
    const p = new URL(u).pathname;
    return p === '/' ? '' : p;
  } catch {
    return 'x';
  }
}

/** Contact and social details gathered across all pages, as one business entry's extra facts. */
export function contactOf(pages: PageInfo[]) {
  const first = <T>(xs: T[][]) => [...new Set(xs.flat())];
  return {
    emails: first(pages.map((p) => p.emails)).slice(0, 3),
    phones: first(pages.map((p) => p.phones)).slice(0, 3),
    socials: first(pages.map((p) => p.socials)).slice(0, 6),
  };
}

/** Which links are worth visiting next; higher first. Same-site filtering is the caller's job. */
export function linkPriority(url: string): number {
  const path = safePath(url).toLowerCase();
  if (!path) return 0;
  if (/(faq|help|support)/.test(path)) return 90;
  if (/(shipping|delivery|return|refund|exchange|payment|policy|policies|terms)/.test(path))
    return 85;
  if (/(about|contact|story)/.test(path)) return 70;
  if (/\/products?\//.test(path)) return 80; // an individual product page carries the product data
  if (/(product|shop|collection|catalog|store|item)/.test(path)) return 50;
  if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|ico|mp4)$/.test(path)) return -1;
  if (/(login|cart|checkout|account|wp-admin|cdn-cgi|feed|tag|search)/.test(path)) return -1;
  return 20;
}
