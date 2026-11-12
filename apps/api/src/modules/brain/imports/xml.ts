import { STOCK_STATES } from '@torio/contracts';
import { decode } from './extract';

/**
 * A small, dependency-free reader for product feeds (Google Shopping RSS/Atom and similar). It is deliberately not a full
 * XML parser: no DTDs, no entity definitions and no external references are ever processed, so feeds cannot make it fetch
 * or expand anything. It reads each product's direct child elements as text.
 */

export const MAX_FEED_ITEMS = 5000;

export const TORIO_FIELDS = [
  'externalId',
  'name',
  'description',
  'price',
  'category',
  'stock',
  'colors',
  'sizes',
  'url',
  'image',
] as const;
export type TorioField = (typeof TORIO_FIELDS)[number];
export type FeedMapping = Partial<Record<TorioField, string>>;

export const FIELD_LABEL: Record<TorioField, string> = {
  externalId: 'Product ID',
  name: 'Name',
  description: 'Description',
  price: 'Price',
  category: 'Category',
  stock: 'Availability',
  colors: 'Colours',
  sizes: 'Sizes',
  url: 'Product page',
  image: 'Image',
};

/** Source tags tried, in order, for each Torio field when no mapping is given. */
const DEFAULTS: Record<TorioField, string[]> = {
  externalId: ['id', 'sku', 'mpn', 'gtin', 'item_group_id'],
  name: ['title', 'name', 'product_name'],
  description: ['description', 'summary', 'content'],
  price: ['price', 'sale_price', 'amount'],
  category: ['product_type', 'category', 'google_product_category', 'type'],
  stock: ['availability', 'stock', 'stock_status'],
  colors: ['color', 'colour'],
  sizes: ['size'],
  url: ['link', 'url', 'product_url'],
  image: ['image_link', 'image', 'picture', 'thumbnail'],
};

export type RawItem = Record<string, string>;

const local = (tag: string) => tag.toLowerCase().replace(/^[a-z0-9_-]+:/, '');
const text = (s: string) =>
  decode(
    decode(
      s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) => c)
        .replace(/<(?!\/?[a-z])/gi, '&lt;'),
    ).replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

/** Direct children of one element body, as { localName: text }. Nested elements count as their own text (first one wins). */
function children(body: string): RawItem {
  const out: RawItem = {};
  const re = /<([A-Za-z_][\w:.-]*)(\s[^>]*)?(\/>|>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const name = m[1]!;
    if (m[3] === '/>' || (m[2] ?? '').trimEnd().endsWith('/')) {
      const href = /href\s*=\s*"([^"]*)"/i.exec(m[2] ?? '')?.[1]; // Atom <link href="..."/>
      if (href && !(local(name) in out)) out[local(name)] = decode(href);
      continue;
    }
    // find the matching close tag at the same depth
    let depth = 1;
    const open = new RegExp(
      `<${name.replace(/[.]/g, '\\.')}(\\s[^>]*)?>|</${name.replace(/[.]/g, '\\.')}>`,
      'g',
    );
    open.lastIndex = re.lastIndex;
    let end = -1;
    let o: RegExpExecArray | null;
    while ((o = open.exec(body))) {
      if (o[0].startsWith('</')) {
        if (--depth === 0) {
          end = o.index;
          break;
        }
      } else depth++;
    }
    if (end < 0) continue;
    const inner = body.slice(re.lastIndex, end);
    const key = local(name);
    // nested sections (shipping, tax, additional images) keep only their own first scalar; the parent tag's text is used
    if (!(key in out)) out[key] = text(inner);
    re.lastIndex = end + name.length + 3;
  }
  return out;
}

export interface ParsedFeed {
  format: 'rss' | 'atom' | 'xml' | 'unknown';
  items: RawItem[];
  truncated: boolean;
}

export function parseFeed(xml: string): ParsedFeed {
  const src = xml.replace(/<\?xml[^>]*\?>/i, '').replace(/<!DOCTYPE[^>]*(\[[\s\S]*?\])?>/gi, '');
  const format: ParsedFeed['format'] = /<rss[\s>]/i.test(src)
    ? 'rss'
    : /<feed[\s>]/i.test(src)
      ? 'atom'
      : /<(products|catalog|offers)[\s>]/i.test(src)
        ? 'xml'
        : 'unknown';
  const itemTag = /<item[\s>]/i.test(src)
    ? 'item'
    : /<entry[\s>]/i.test(src)
      ? 'entry'
      : /<product[\s>]/i.test(src)
        ? 'product'
        : /<offer[\s>]/i.test(src)
          ? 'offer'
          : null;
  if (!itemTag) return { format, items: [], truncated: false };
  const items: RawItem[] = [];
  const re = new RegExp(`<${itemTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${itemTag}>`, 'gi');
  let m: RegExpExecArray | null;
  let truncated = false;
  while ((m = re.exec(src))) {
    if (items.length >= MAX_FEED_ITEMS) {
      truncated = true;
      break;
    }
    const it = children(m[1]!);
    if (Object.keys(it).length) items.push(it);
  }
  return { format, items, truncated };
}

/** Every tag name seen across items, most common first. These are the choices offered for field mapping. */
export function detectedTags(items: RawItem[]): string[] {
  const n = new Map<string, number>();
  for (const it of items.slice(0, 200))
    for (const k of Object.keys(it)) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** The mapping that will actually be used: the person's choices, else the first default tag present in the feed. */
export function effectiveMapping(items: RawItem[], given: FeedMapping = {}): FeedMapping {
  const tags = new Set(detectedTags(items));
  const out: FeedMapping = {};
  for (const f of TORIO_FIELDS) {
    const g = given[f];
    if (g !== undefined) {
      if (g === '' || tags.has(g)) out[f] = g;
      continue;
    }
    const d = DEFAULTS[f].find((t) => tags.has(t));
    if (d) out[f] = d;
  }
  return out;
}

const STOCK_MAP: [RegExp, (typeof STOCK_STATES)[number]][] = [
  [/^(in[ _-]?stock|available|instock)$/i, 'In stock'],
  [/^(out[ _-]?of[ _-]?stock|sold[ _-]?out|unavailable|outofstock)$/i, 'Out of stock'],
  [/^(pre[ _-]?order|preorder|backorder|back[ _-]?order)$/i, 'Pre-order'],
  [/^(limited|low[ _-]?stock|limitedavailability)$/i, 'Low stock'],
];
export const stockOf = (v: string) => STOCK_MAP.find(([re]) => re.test(v.trim()))?.[1] ?? '';

/** "1,500.00 BDT", "BDT 1500", "1500", "1.500,00 EUR" → { amount: "1500", currency: "BDT" }. Empty amount when unreadable. */
export function parsePrice(raw: string): { amount: string; currency: string } {
  const cur = /\b([A-Z]{3})\b/.exec(raw.toUpperCase())?.[1] ?? '';
  const num = /\d[\d.,\s]*/.exec(raw)?.[0]?.trim() ?? '';
  if (!num) return { amount: '', currency: cur };
  let n = num.replace(/\s/g, '');
  const lastDot = n.lastIndexOf('.');
  const lastComma = n.lastIndexOf(',');
  if (lastComma > lastDot)
    n = n.replace(/\./g, '').replace(',', '.'); // 1.500,00
  else n = n.replace(/,/g, ''); // 1,500.00
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return { amount: '', currency: cur };
  return {
    amount: Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, ''),
    currency: cur,
  };
}

export interface MappedProduct {
  externalId: string;
  data: Record<string, string>;
  warnings: string[];
}
export interface MapResult {
  products: MappedProduct[];
  invalid: number;
  duplicates: number;
  missingPrice: number;
  issues: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Maps raw items to products, validating as it goes. Nothing is invented: a missing field stays missing and is flagged. */
export function mapItems(items: RawItem[], mapping: FeedMapping, currencyOverride = ''): MapResult {
  const pick = (it: RawItem, f: TorioField) => {
    const tag = mapping[f];
    return tag ? (it[tag] ?? '').trim() : '';
  };
  const products: MappedProduct[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  let missingPrice = 0;
  const issues = new Set<string>();
  for (const it of items) {
    const name = pick(it, 'name').slice(0, 120);
    if (!name) {
      invalid++;
      issues.add('Some items have no name and were skipped.');
      continue;
    }
    const id = pick(it, 'externalId') || '';
    const idKey = id ? `id:${id}` : '';
    if ((idKey && ids.has(idKey)) || names.has(norm(name))) {
      duplicates++;
      continue;
    }
    if (idKey) ids.add(idKey);
    names.add(norm(name));
    const warnings: string[] = [];
    const data: Record<string, string> = { name };
    const set = (k: string, v: string) => v && (data[k] = v);
    set('description', pick(it, 'description').slice(0, 1000));
    set('category', pick(it, 'category').split(/[>/]/).pop()!.trim().slice(0, 60));
    const rawPrice = pick(it, 'price');
    if (rawPrice) {
      const p = parsePrice(rawPrice);
      if (p.amount) {
        data['price'] = p.amount;
        const cur = p.currency || currencyOverride.toUpperCase();
        if (cur) data['currency'] = cur;
        else warnings.push('The feed gives no currency for this price.');
      } else {
        warnings.push(`The price "${rawPrice.slice(0, 30)}" could not be read.`);
        missingPrice++;
      }
    } else {
      warnings.push('No price in the feed.');
      missingPrice++;
    }
    const stock = stockOf(pick(it, 'stock'));
    if (stock) data['stock'] = stock;
    else
      warnings.push('Availability missing or not recognised; it imports as In stock, so check it.');
    set('colors', pick(it, 'colors').slice(0, 300));
    set('sizes', pick(it, 'sizes').slice(0, 300));
    set('url', pick(it, 'url').slice(0, 300));
    set('image', pick(it, 'image').slice(0, 300));
    if (id) data['externalId'] = id;
    if (!data['description']) warnings.push('No description in the feed.');
    products.push({ externalId: id, data, warnings });
  }
  if (missingPrice)
    issues.add(`${missingPrice} item${missingPrice === 1 ? ' has' : 's have'} no readable price.`);
  if (duplicates)
    issues.add(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} (same ID or name) ignored.`);
  return { products, invalid, duplicates, missingPrice, issues: [...issues] };
}
