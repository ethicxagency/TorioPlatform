import { CATALOG_FIELDS, type CatalogField, type CatalogMapping } from '@torio/contracts';
import { detectedTags, parsePrice, stockOf, type RawItem } from '../brain/imports/xml';

/** Source tags tried, in order, for each catalog field when the person has not chosen one. Covers Google Merchant, Meta and WooCommerce-style feeds. */
const DEFAULTS: Record<CatalogField, string[]> = {
  externalId: ['id', 'product_id', 'item_group_id', 'guid'],
  name: ['title', 'name', 'product_name', 'product_title', 'item_name'],
  description: ['description', 'summary', 'content', 'short_description'],
  price: ['price', 'regular_price', 'amount', 'unit_price'],
  salePrice: ['sale_price', 'special_price', 'discount_price'],
  currency: ['currency'],
  stock: ['availability', 'stock', 'stock_status', 'in_stock'],
  sku: ['sku', 'mpn', 'model'],
  brand: ['brand', 'manufacturer', 'vendor'],
  category: ['product_type', 'category', 'google_product_category', 'type'],
  url: ['link', 'url', 'product_url', 'product_link'],
  image: ['image_link', 'image', 'image_url', 'picture', 'thumbnail'],
  additionalImages: ['additional_image_link', 'additional_image', 'additional_images', 'gallery'],
  gtin: ['gtin', 'ean', 'upc', 'barcode'],
  mpn: ['mpn'],
  colors: ['color', 'colour'],
  sizes: ['size'],
};

export const CATALOG_FIELD_LABEL: Record<CatalogField, string> = {
  externalId: 'Product ID',
  name: 'Title',
  description: 'Description',
  price: 'Price',
  salePrice: 'Sale price',
  currency: 'Currency',
  stock: 'Availability',
  sku: 'SKU',
  brand: 'Brand',
  category: 'Category',
  url: 'Product page',
  image: 'Image',
  additionalImages: 'Additional images',
  gtin: 'GTIN',
  mpn: 'MPN',
  colors: 'Colours',
  sizes: 'Sizes',
};

export function catalogMapping(items: RawItem[], given: CatalogMapping = {}): CatalogMapping {
  const tags = new Set(detectedTags(items));
  const out: CatalogMapping = {};
  for (const f of CATALOG_FIELDS) {
    const g = given[f];
    if (g !== undefined) {
      if (g === '' || tags.has(g)) out[f] = g;
      continue;
    }
    // mpn doubles as a SKU fallback, so only claim it for mpn when it is not already the SKU column
    const d = DEFAULTS[f].find((t) => tags.has(t));
    if (d) out[f] = d;
  }
  if (out.mpn && out.mpn === out.sku && given.mpn === undefined) delete out.mpn;
  return out;
}

export interface CatalogCandidate {
  /** Stable key within the feed: the feed's own ID, else SKU, else the name. Used to select and to match. */
  key: string;
  externalId: string;
  name: string;
  description: string;
  /** Plain amount, e.g. "1450" or "1450.5"; with the currency appended as Brain stores prices ("1450 BDT"). */
  price: string;
  compareAtPrice: string;
  stock: 'In stock' | 'Low stock' | 'Out of stock' | 'Pre-order' | '';
  sku: string;
  brand: string;
  category: string;
  url: string;
  images: string[];
  gtin: string;
  mpn: string;
  colors: string;
  sizes: string;
  warnings: string[];
}

export interface CatalogMapResult {
  items: CatalogCandidate[];
  invalid: number;
  duplicates: number;
  issues: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Only a plain http(s) address is kept as an image or link: no javascript:, data: or relative paths from an untrusted feed. */
export function safeHttpUrl(v: string): string {
  const t = v.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(t) || t.length > 500) return '';
  try {
    const u = new URL(t);
    return u.username || u.password ? '' : u.toString();
  } catch {
    return '';
  }
}

/**
 * Maps raw feed items to catalog candidates. Nothing is invented: a missing price or availability stays missing and is
 * flagged. Imported text has already been reduced to plain text by the feed reader (markup is stripped, entities decoded),
 * so descriptions are safe to show and to publish again.
 */
export function mapCatalogItems(
  raw: RawItem[],
  mapping: CatalogMapping,
  currencyOverride = '',
): CatalogMapResult {
  const pick = (it: RawItem, f: CatalogField) => {
    const tag = mapping[f];
    return tag ? (it[tag] ?? '').trim() : '';
  };
  const items: CatalogCandidate[] = [];
  const keys = new Set<string>();
  const issues = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  let noPrice = 0;
  for (const it of raw) {
    const name = pick(it, 'name').slice(0, 120);
    if (!name) {
      invalid++;
      issues.add('Some items have no title and were skipped.');
      continue;
    }
    const externalId = pick(it, 'externalId').slice(0, 120);
    const sku = pick(it, 'sku').slice(0, 80);
    const key = (externalId || sku || norm(name)).slice(0, 200);
    if (keys.has(key)) {
      duplicates++;
      continue;
    }
    keys.add(key);
    const warnings: string[] = [];
    const cur = (pick(it, 'currency') || currencyOverride).toUpperCase().slice(0, 3);
    const reg = parsePrice(pick(it, 'price'));
    const sale = parsePrice(pick(it, 'salePrice'));
    const currency = reg.currency || sale.currency || cur;
    let price = reg.amount;
    let compare = '';
    if (sale.amount && (!price || Number(sale.amount) < Number(price))) {
      compare = price;
      price = sale.amount;
    }
    if (!price) {
      noPrice++;
      warnings.push('No readable price.');
    } else if (!currency) warnings.push('No currency in the feed; the workspace currency applies.');
    const withCur = (v: string) => (v && currency ? `${v} ${currency}`.slice(0, 20) : v);
    const stock = stockOf(pick(it, 'stock'));
    if (!stock) warnings.push('Availability missing or not recognised.');
    const imgTag = mapping.image;
    const extraTag = mapping.additionalImages;
    const images = [
      ...(imgTag ? [it[imgTag] ?? ''] : []),
      ...(extraTag
        ? [
            it[extraTag] ?? '',
            ...Object.keys(it)
              .filter((k) => k.startsWith(`${extraTag}#`))
              .map((k) => it[k] ?? ''),
          ].flatMap((v) => v.split(/[,\s]+(?=https?:)/))
        : []),
    ]
      .map(safeHttpUrl)
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .slice(0, 10);
    if (!images.length) warnings.push('No usable image.');
    const description = pick(it, 'description').slice(0, 1000);
    if (!description) warnings.push('No description.');
    items.push({
      key,
      externalId,
      name,
      description,
      price: withCur(price),
      compareAtPrice: withCur(compare),
      stock: stock as CatalogCandidate['stock'],
      sku,
      brand: pick(it, 'brand').slice(0, 120),
      category: pick(it, 'category').split(/[>/]/).pop()!.trim().slice(0, 60),
      url: safeHttpUrl(pick(it, 'url')),
      images,
      gtin: pick(it, 'gtin').slice(0, 40),
      mpn: pick(it, 'mpn').slice(0, 60),
      colors: pick(it, 'colors').slice(0, 300),
      sizes: pick(it, 'sizes').slice(0, 300),
      warnings,
    });
  }
  if (noPrice) issues.add(`${noPrice} item${noPrice === 1 ? ' has' : 's have'} no readable price.`);
  if (duplicates)
    issues.add(
      `${duplicates} duplicate${duplicates === 1 ? '' : 's'} inside the feed (same ID, SKU or title) ignored.`,
    );
  return { items, invalid, duplicates, issues: [...issues] };
}
