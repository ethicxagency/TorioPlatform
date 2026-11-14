import { z } from 'zod';
import { PRODUCT_SOURCES, PRODUCT_STATUSES, STOCK_STATES } from './brain';

/**
 * Products & Catalog. The catalog is a view over the same product records Brain (the Intelligent page) holds, not a second
 * product store: a product has one id, and an edit made in either place is the same edit.
 */

const iso = z.string();
const money = z
  .string()
  .trim()
  .max(20)
  .regex(/^\d+(\.\d{1,4})?$/, 'Enter a price in numbers, such as 1450 or 1450.50.');

export const CATALOG_SORTS = ['name', 'price', 'updated', 'stock'] as const;

export const catalogListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  source: z.enum(PRODUCT_SOURCES).optional(),
  stock: z.enum(STOCK_STATES).optional(),
  sort: z.enum(CATALOG_SORTS).default('updated'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;

export const catalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string(),
  description: z.string(),
  /** The price as a number, or null when the stored text is not a plain price. */
  price: z.number().nullable(),
  priceText: z.string(),
  compareAtPrice: z.number().nullable(),
  currency: z.string(),
  category: z.string(),
  brand: z.string(),
  url: z.string(),
  gtin: z.string(),
  mpn: z.string(),
  stock: z.enum(STOCK_STATES),
  stockQty: z.number().int().nullable(),
  status: z.enum(PRODUCT_STATUSES),
  source: z.enum(PRODUCT_SOURCES),
  sourceName: z.string().nullable(),
  externalId: z.string(),
  images: z.array(z.string()),
  variants: z.string(),
  sizes: z.string(),
  colors: z.string(),
  /** Fields changed by hand, which a scheduled sync will not overwrite. */
  edited: z.array(z.string()),
  createdAt: iso.nullable(),
  updatedAt: iso.nullable(),
});
export type CatalogProduct = z.infer<typeof catalogProductSchema>;

export const catalogStatsSchema = z.object({
  total: z.number().int(),
  active: z.number().int(),
  draft: z.number().int(),
  archived: z.number().int(),
  outOfStock: z.number().int(),
  imported: z.number().int(),
  connectedFeeds: z.number().int(),
  limit: z.number().int(),
});
export type CatalogStats = z.infer<typeof catalogStatsSchema>;

export const catalogListSchema = z.object({
  items: z.array(catalogProductSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  stats: catalogStatsSchema,
  /** The Brain version the list was read at; shown for diagnostics only. */
  version: z.number().int(),
});
export type CatalogList = z.infer<typeof catalogListSchema>;

export const catalogProductInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a product name.').max(120),
  description: z.string().max(1000).default(''),
  price: money,
  compareAtPrice: money.optional().or(z.literal('')),
  currency: z.string().trim().toUpperCase().length(3).optional().or(z.literal('')),
  sku: z.string().trim().max(80).default(''),
  category: z.string().trim().max(60).default(''),
  brand: z.string().trim().max(120).default(''),
  url: z.string().trim().max(500).default(''),
  gtin: z.string().trim().max(40).default(''),
  mpn: z.string().trim().max(60).default(''),
  stock: z.enum(STOCK_STATES).default('In stock'),
  stockQty: z.number().int().min(0).max(1_000_000).nullable().default(null),
  status: z.enum(PRODUCT_STATUSES).default('ACTIVE'),
  images: z.array(z.string().trim().max(500)).max(10).default([]),
  variants: z.string().max(300).default(''),
  sizes: z.string().max(300).default(''),
  colors: z.string().max(300).default(''),
});
export type CatalogProductInput = z.infer<typeof catalogProductInputSchema>;

export const catalogProductUpdateSchema = catalogProductInputSchema.extend({
  /** The `updatedAt` the editor loaded. If the product changed since (Brain or a sync), the save is refused, not overwritten. */
  baseUpdatedAt: z.string().nullable(),
});
export type CatalogProductUpdate = z.infer<typeof catalogProductUpdateSchema>;

export const catalogBulkStatusSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(200),
  status: z.enum(PRODUCT_STATUSES),
});
export const catalogBulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(200),
});
export const catalogBulkResultSchema = z.object({
  changed: z.number().int(),
  /** Deleted-on-request products kept as archived because a live feed would bring them straight back. */
  archived: z.number().int(),
  missing: z.number().int(),
});
export type CatalogBulkResult = z.infer<typeof catalogBulkResultSchema>;

// ---------- importing ----------

export const CATALOG_FIELDS = [
  'externalId',
  'name',
  'description',
  'price',
  'salePrice',
  'currency',
  'stock',
  'sku',
  'brand',
  'category',
  'url',
  'image',
  'additionalImages',
  'gtin',
  'mpn',
  'colors',
  'sizes',
] as const;
export type CatalogField = (typeof CATALOG_FIELDS)[number];
export const catalogMappingSchema = z.partialRecord(z.enum(CATALOG_FIELDS), z.string().max(80));
export type CatalogMapping = z.infer<typeof catalogMappingSchema>;

export const IMPORT_MODES = ['skip', 'update'] as const;

/** Where the XML comes from: a link the server fetches, or the text of a file the person chose. Exactly one. */
export const catalogImportSourceSchema = z
  .object({
    url: z.string().trim().min(4).max(500).optional(),
    xml: z
      .string()
      .min(10)
      .max(6 * 1024 * 1024)
      .optional(),
    mapping: catalogMappingSchema.optional(),
    currency: z.string().trim().length(3).optional(),
  })
  .refine((v) => !!v.url !== !!v.xml, { message: 'Give either a link or a file.' });

export const catalogImportPreviewItemSchema = z.object({
  key: z.string(),
  externalId: z.string(),
  name: z.string(),
  price: z.string(),
  image: z.string(),
  sku: z.string(),
  /** `existing` when this product is already in the catalog (matched by feed ID, SKU, then name). */
  match: z.enum(['new', 'existing']),
  warnings: z.array(z.string()),
});

export const catalogImportPreviewSchema = z.object({
  format: z.string(),
  totalItems: z.number().int(),
  valid: z.number().int(),
  invalid: z.number().int(),
  duplicatesInFeed: z.number().int(),
  existing: z.number().int(),
  truncated: z.boolean(),
  tags: z.array(z.string()),
  mapping: z.record(z.string(), z.string()),
  issues: z.array(z.string()),
  items: z.array(catalogImportPreviewItemSchema),
});
export type CatalogImportPreview = z.infer<typeof catalogImportPreviewSchema>;

export const catalogImportRunSchema = z
  .object({
    url: z.string().trim().min(4).max(500).optional(),
    xml: z
      .string()
      .min(10)
      .max(6 * 1024 * 1024)
      .optional(),
    mapping: catalogMappingSchema.optional(),
    currency: z.string().trim().length(3).optional(),
    /** The preview `key`s to import. Omitted: every valid product. */
    keys: z.array(z.string().max(200)).max(5000).optional(),
    mode: z.enum(IMPORT_MODES).default('skip'),
    status: z.enum(['ACTIVE', 'DRAFT']).default('ACTIVE'),
    /** A saved feed also syncs again on a schedule. Only for links. */
    saveAsFeed: z
      .object({
        name: z.string().trim().min(1).max(80),
        frequency: z.enum(['manual', 'daily', 'weekly']).default('daily'),
      })
      .optional(),
  })
  .refine((v) => !!v.url !== !!v.xml, { message: 'Give either a link or a file.' })
  .refine((v) => !v.saveAsFeed || !!v.url, { message: 'Only a link can sync on a schedule.' });

export const catalogImportResultSchema = z.object({
  jobId: z.string().nullable(),
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  capped: z.number().int(),
  notes: z.array(z.string()),
  feedId: z.string().nullable(),
});
export type CatalogImportResult = z.infer<typeof catalogImportResultSchema>;

// ---------- inbound feeds and sync activity ----------

export const catalogFeedSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED']),
  frequency: z.enum(['manual', 'daily', 'weekly']),
  mode: z.enum(IMPORT_MODES),
  lastSyncedAt: iso.nullable(),
  lastError: z.string().nullable(),
  productCount: z.number().int(),
  createdAt: iso,
});
export type CatalogFeed = z.infer<typeof catalogFeedSchema>;

export const catalogFeedUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  frequency: z.enum(['manual', 'daily', 'weekly']).optional(),
  mode: z.enum(IMPORT_MODES).optional(),
  mapping: catalogMappingSchema.optional(),
  currency: z.string().trim().length(3).optional(),
});

export const syncActivitySchema = z.object({
  id: z.string(),
  kind: z.string(),
  sourceName: z.string().nullable(),
  status: z.string(),
  startedAt: iso.nullable(),
  finishedAt: iso.nullable(),
  createdAt: iso,
  error: z.string().nullable(),
  stats: z.record(z.string(), z.unknown()).nullable(),
});
export type SyncActivity = z.infer<typeof syncActivitySchema>;

// ---------- outbound feeds (sales channels) ----------

export const FEED_CHANNELS = ['GOOGLE', 'META', 'TIKTOK', 'CUSTOM'] as const;
export const CHANNEL_LABEL: Record<(typeof FEED_CHANNELS)[number], string> = {
  GOOGLE: 'Google Merchant Center',
  META: 'Meta Commerce Catalog',
  TIKTOK: 'TikTok Catalog',
  CUSTOM: 'Custom XML',
};

export const outboundFeedCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  channel: z.enum(FEED_CHANNELS),
  /** Products to include. The default is active products only; drafts and archived are never published. */
  inStockOnly: z.boolean().default(false),
});
export const outboundFeedUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  inStockOnly: z.boolean().optional(),
});

export const outboundFeedSchema = z.object({
  id: z.string(),
  name: z.string(),
  channel: z.enum(FEED_CHANNELS),
  status: z.enum(['ACTIVE', 'PAUSED']),
  inStockOnly: z.boolean(),
  /** The full feed address, including its secret token. Only managers see it. */
  url: z.string(),
  productCount: z.number().int(),
  lastServedAt: iso.nullable(),
  servedCount: z.number().int(),
  createdAt: iso,
});
export type OutboundFeed = z.infer<typeof outboundFeedSchema>;

export const salesChannelsSchema = z.object({
  feeds: z.array(outboundFeedSchema),
  /** Provider connections already set up on the Intelligent page. A connection here means a real, verified link, never a guess. */
  connections: z.array(
    z.object({
      kind: z.enum(['META_CATALOG', 'GOOGLE_MERCHANT']),
      label: z.string(),
      connected: z.boolean(),
      name: z.string().nullable(),
      lastSyncedAt: iso.nullable(),
      lastError: z.string().nullable(),
    }),
  ),
});
export type SalesChannels = z.infer<typeof salesChannelsSchema>;

export const outboundFeedPreviewSchema = z.object({
  included: z.number().int(),
  excludedCount: z.number().int(),
  /** Draft and archived products, which a feed never publishes. */
  notPublished: z.number().int(),
  excluded: z.array(z.object({ id: z.string(), name: z.string(), reasons: z.array(z.string()) })),
  sampleXml: z.string(),
});
export type OutboundFeedPreview = z.infer<typeof outboundFeedPreviewSchema>;
