import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_PRODUCTS,
  type BrainConfig,
  type BrainProduct,
  type CatalogBulkResult,
  type CatalogList,
  type CatalogListQuery,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogProductUpdate,
  type CatalogStats,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { BrainService } from '../brain/brain.service';
import { parsePrice } from '../brain/imports/xml';

type Stored = BrainConfig['products'][number];

const uid = () => randomUUID().replace(/-/g, '').slice(0, 12);
export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The fields a person can change by hand, and so the ones a scheduled sync must leave alone afterwards. */
export const TRACKED = [
  'name',
  'description',
  'price',
  'compareAtPrice',
  'stock',
  'sku',
  'brand',
  'category',
  'url',
  'images',
  'gtin',
  'mpn',
  'colors',
  'sizes',
  'variants',
] as const;

export const statusOf = (p: Stored) => p.status ?? 'ACTIVE';
export const sourceOf = (p: Stored) => p.source ?? 'INTELLIGENT';

const num = (v: string | undefined) => {
  const p = parsePrice(v ?? '');
  return p.amount ? Number(p.amount) : null;
};

export function toView(p: Stored, sourceNames: Map<string, string>): CatalogProduct {
  const priceText = p.price ?? '';
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? '',
    description: p.description,
    price: num(priceText),
    priceText,
    compareAtPrice: num(p.compareAtPrice),
    currency: parsePrice(priceText).currency || parsePrice(p.compareAtPrice ?? '').currency,
    category: p.category,
    brand: p.brand ?? '',
    url: p.url ?? '',
    gtin: p.gtin ?? '',
    mpn: p.mpn ?? '',
    stock: p.stock,
    stockQty: p.stockQty ?? null,
    status: statusOf(p),
    source: sourceOf(p),
    sourceName: p.sourceId ? (sourceNames.get(p.sourceId) ?? null) : null,
    externalId: p.externalId ?? '',
    images: p.images ?? [],
    variants: p.variants,
    sizes: p.sizes,
    colors: p.colors,
    edited: p.edited ?? [],
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
  };
}

/** The price text Brain stores: the amount, with the currency when one is given ("1450 BDT"). */
const priceText = (amount: string, currency?: string) =>
  currency ? `${amount} ${currency.toUpperCase()}`.slice(0, 20) : amount;

/**
 * Products & Catalog over the product records Brain already holds. There is no second product table: every method reads
 * and writes the Brain document's `products` through `BrainService.mutateProducts`, so the catalog and the Intelligent page
 * always show the same products with the same ids.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
  ) {}

  private async sourceNames(workspaceId: string) {
    const rows = await this.prisma.client.importSource
      .findMany({ where: { workspaceId }, select: { id: true, name: true } })
      .catch(() => []);
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async stats(workspaceId: string, products?: Stored[]): Promise<CatalogStats> {
    const list = products ?? (await this.brain.get(workspaceId)).config.products;
    const feeds = await this.prisma.client.importSource
      .count({
        where: {
          workspaceId,
          kind: { in: ['XML_FEED', 'META_CATALOG', 'GOOGLE_MERCHANT'] },
          status: { in: ['ACTIVE', 'PAUSED', 'ERROR'] },
        },
      })
      .catch(() => 0);
    return {
      total: list.length,
      active: list.filter((p) => statusOf(p) === 'ACTIVE').length,
      draft: list.filter((p) => statusOf(p) === 'DRAFT').length,
      archived: list.filter((p) => statusOf(p) === 'ARCHIVED').length,
      outOfStock: list.filter((p) => p.stock === 'Out of stock' && statusOf(p) !== 'ARCHIVED')
        .length,
      imported: list.filter((p) => ['XML_IMPORT', 'FEED', 'CHANNEL'].includes(sourceOf(p))).length,
      connectedFeeds: feeds,
      limit: MAX_PRODUCTS,
    };
  }

  async list(workspaceId: string, q: CatalogListQuery): Promise<CatalogList> {
    const doc = await this.brain.get(workspaceId);
    const names = await this.sourceNames(workspaceId);
    const term = norm(q.q ?? '');
    let rows = doc.config.products.filter((p) => {
      if (q.status && statusOf(p) !== q.status) return false;
      if (q.source && sourceOf(p) !== q.source) return false;
      if (q.stock && p.stock !== q.stock) return false;
      if (!term) return true;
      return norm(
        `${p.name} ${p.sku ?? ''} ${p.category} ${p.brand ?? ''} ${p.externalId ?? ''}`,
      ).includes(term);
    });
    const dir = q.dir === 'asc' ? 1 : -1;
    const STOCK_RANK = {
      'Out of stock': 0,
      'Low stock': 1,
      'Pre-order': 2,
      'In stock': 3,
    } as const;
    rows = [...rows].sort((a, b) => {
      switch (q.sort) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'price':
          return dir * ((num(a.price) ?? -1) - (num(b.price) ?? -1));
        case 'stock':
          return dir * (STOCK_RANK[a.stock] - STOCK_RANK[b.stock]);
        default:
          return (
            dir * (a.updatedAt ?? a.createdAt ?? '').localeCompare(b.updatedAt ?? b.createdAt ?? '')
          );
      }
    });
    const start = (q.page - 1) * q.pageSize;
    return {
      items: rows.slice(start, start + q.pageSize).map((p) => toView(p, names)),
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
      stats: await this.stats(workspaceId, doc.config.products),
      version: doc.version,
    };
  }

  async get(workspaceId: string, id: string): Promise<CatalogProduct> {
    const doc = await this.brain.get(workspaceId);
    const p = doc.config.products.find((x) => x.id === id);
    if (!p) throw new NotFoundException('Product not found.');
    return toView(p, await this.sourceNames(workspaceId));
  }

  private apply(p: Stored, i: CatalogProductInput) {
    const currency = i.currency || parsePrice(p.price ?? '').currency;
    p.name = i.name.trim();
    p.description = i.description;
    p.price = priceText(i.price, currency);
    p.compareAtPrice = i.compareAtPrice ? priceText(i.compareAtPrice, currency) : '';
    p.sku = i.sku;
    p.category = i.category;
    p.brand = i.brand;
    p.url = i.url;
    p.gtin = i.gtin;
    p.mpn = i.mpn;
    p.stockQty = i.stockQty;
    p.stock = i.stockQty === 0 ? 'Out of stock' : i.stock;
    p.status = i.status;
    p.images = i.images.filter(Boolean);
    p.variants = i.variants;
    p.sizes = i.sizes;
    p.colors = i.colors;
    p.updatedAt = new Date().toISOString();
  }

  async create(workspaceId: string, userId: string, input: CatalogProductInput) {
    const id = uid();
    await this.brain.mutateProducts(
      workspaceId,
      userId,
      `Added the product ${input.name}`,
      (products) => {
        if (products.length >= MAX_PRODUCTS)
          throw new BadRequestException(`A workspace holds up to ${MAX_PRODUCTS} products.`);
        if (
          input.sku &&
          products.some((p) => (p.sku ?? '').toLowerCase() === input.sku.toLowerCase())
        )
          throw new ConflictException(`Another product already uses the SKU ${input.sku}.`);
        const p: Stored = {
          id,
          name: '',
          category: '',
          description: '',
          price: '',
          variants: '',
          sizes: '',
          colors: '',
          stock: 'In stock',
          benefits: '',
          usage: '',
          limitations: '',
          faqs: '',
          source: 'MANUAL',
          createdAt: new Date().toISOString(),
        };
        this.apply(p, input);
        products.push(p);
      },
    );
    return this.get(workspaceId, id);
  }

  async update(workspaceId: string, userId: string, id: string, input: CatalogProductUpdate) {
    await this.brain.mutateProducts(workspaceId, userId, `Edited a product`, (products) => {
      const p = products.find((x) => x.id === id);
      if (!p) throw new NotFoundException('Product not found.');
      if ((p.updatedAt ?? null) !== (input.baseUpdatedAt ?? null))
        throw new ConflictException(
          'This product was changed somewhere else (the Intelligent page, a feed sync or another person). Reload it to see the latest version, then apply your edit again.',
        );
      if (
        input.sku &&
        products.some((x) => x.id !== id && (x.sku ?? '').toLowerCase() === input.sku.toLowerCase())
      )
        throw new ConflictException(`Another product already uses the SKU ${input.sku}.`);
      const before = structuredClone(p) as Record<string, unknown>;
      this.apply(p, input);
      const after = p as unknown as Record<string, unknown>;
      // Remember what a person changed so a later sync leaves it alone.
      const touched = TRACKED.filter(
        (f) => JSON.stringify(before[f] ?? '') !== JSON.stringify(after[f] ?? ''),
      );
      if (touched.length) p.edited = [...new Set([...(p.edited ?? []), ...touched])];
    });
    return this.get(workspaceId, id);
  }

  async setStatus(
    workspaceId: string,
    userId: string,
    ids: string[],
    status: BrainProduct['status'],
  ) {
    const set = new Set(ids);
    return this.brain.mutateProducts(
      workspaceId,
      userId,
      `Set ${ids.length} product(s) to ${status}`,
      (products) => {
        let changed = 0;
        for (const p of products)
          if (set.has(p.id) && statusOf(p) !== status) {
            p.status = status;
            p.updatedAt = new Date().toISOString();
            changed++;
          }
        return {
          changed,
          archived: 0,
          missing: ids.length - products.filter((p) => set.has(p.id)).length,
        } satisfies CatalogBulkResult;
      },
    );
  }

  /**
   * Removes products. A product a live feed owns is archived instead, because the next sync would bring it straight back;
   * archiving keeps it out of the catalogue, the feeds and the order picker. Order lines are snapshots of name, SKU and
   * price, so past orders are unaffected either way. Source data in the external feed is never touched.
   */
  async remove(workspaceId: string, userId: string, ids: string[]): Promise<CatalogBulkResult> {
    const set = new Set(ids);
    const live = await this.prisma.client.importSource
      .findMany({
        where: { workspaceId, status: { in: ['ACTIVE', 'PAUSED', 'ERROR'] } },
        select: { id: true },
      })
      .catch(() => []);
    const liveIds = new Set(live.map((s) => s.id));
    return this.brain.mutateProducts(
      workspaceId,
      userId,
      `Deleted ${ids.length} product(s)`,
      (products) => {
        let changed = 0;
        let archived = 0;
        const found = products.filter((p) => set.has(p.id));
        for (const p of found) {
          if (
            p.sourceId &&
            liveIds.has(p.sourceId) &&
            ['FEED', 'XML_IMPORT', 'CHANNEL'].includes(sourceOf(p))
          ) {
            if (statusOf(p) !== 'ARCHIVED') {
              p.status = 'ARCHIVED';
              p.updatedAt = new Date().toISOString();
            }
            archived++;
          } else {
            products.splice(products.indexOf(p), 1);
            changed++;
          }
        }
        return { changed, archived, missing: ids.length - found.length };
      },
    );
  }
}
