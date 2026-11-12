import { z } from 'zod';

/** The places business knowledge can be imported from. */
export const IMPORT_SOURCE_KINDS = [
  'WEBSITE',
  'XML_FEED',
  'META_CATALOG',
  'GOOGLE_MERCHANT',
  'MANUAL',
] as const;
export const importSourceKindSchema = z.enum(IMPORT_SOURCE_KINDS);
export type ImportSourceKind = z.infer<typeof importSourceKindSchema>;

const iso = z.iso.datetime();

export const importSourceViewSchema = z.object({
  id: z.uuid(),
  kind: importSourceKindSchema,
  name: z.string(),
  url: z.string().nullable(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED']),
  lastSyncedAt: iso.nullable(),
  lastError: z.string().nullable(),
  /** XML feeds only: how often it is meant to sync (manual, daily or weekly). */
  frequency: z.string().nullable(),
});

export const importJobViewSchema = z.object({
  id: z.uuid(),
  sourceId: z.uuid().nullable(),
  kind: importSourceKindSchema,
  status: z.enum(['QUEUED', 'RUNNING', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED']),
  stats: z.record(z.string(), z.number()).nullable(),
  error: z.string().nullable(),
  startedAt: iso.nullable(),
  finishedAt: iso.nullable(),
  createdAt: iso,
});

/**
 * What the Intelligence page shows about imports. `ready` is false until the import tables exist in the database, in which
 * case there is nothing to list; it is never used to fake data.
 */
export const importOverviewSchema = z.object({
  ready: z.boolean(),
  /** Counts across every source, for the Summary and the Intelligence overview. All zero until something has been imported. */
  totals: z.object({
    importedProducts: z.number().int(),
    importedEntries: z.number().int(),
    pendingReview: z.number().int(),
    failedImports: z.number().int(),
  }),
  sources: z.array(importSourceViewSchema),
  jobs: z.array(importJobViewSchema),
});
export type ImportOverview = z.infer<typeof importOverviewSchema>;

// ---------- website scan ----------

export const IMPORT_CATEGORIES = ['business', 'product', 'faq', 'policy'] as const;
export const importCategorySchema = z.enum(IMPORT_CATEGORIES);
export type ImportCategory = z.infer<typeof importCategorySchema>;

export const websiteScanSchema = z.object({
  url: z.string().trim().min(4).max(300),
  country: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  instructions: z.string().trim().max(500).optional(),
});
export type WebsiteScanInput = z.infer<typeof websiteScanSchema>;

export const importJobDetailSchema = z.object({
  job: importJobViewSchema,
  /** Pages visited and the most this scan will visit. */
  progress: z.object({ pages: z.number().int(), maxPages: z.number().int() }),
  /** Things worth knowing: pages that failed, pages the site's robots file excluded, whether AI structuring ran. */
  warnings: z.array(z.string()),
  url: z.string().nullable(),
});

export const importRecordViewSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  category: importCategorySchema,
  title: z.string(),
  data: z.record(z.string(), z.string()),
  original: z.record(z.string(), z.string()),
  edited: z.boolean(),
  sourceUrl: z.string().nullable(),
  confidence: z.number().int(),
  warnings: z.array(z.string()),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'IMPORTED']),
});
export const importRecordListSchema = z.object({ data: z.array(importRecordViewSchema) });

export const reviewRecordSchema = z
  .object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    data: z.record(z.string().max(40), z.string().max(2000)).optional(),
  })
  .refine((v) => v.status !== undefined || v.data !== undefined, 'Nothing to change.');

export const bulkReviewSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  categories: z.array(importCategorySchema).max(4).optional(),
});

export const importApproveSchema = z.object({
  categories: z.array(importCategorySchema).max(4).optional(),
});
export const importResultSchema = z.object({
  imported: z.number().int(),
  skippedDuplicates: z.number().int(),
  notes: z.array(z.string()),
});

export type ImportJobDetail = z.infer<typeof importJobDetailSchema>;
export type ImportRecordView = z.infer<typeof importRecordViewSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;

// ---------- XML product feed ----------

export const FEED_FIELDS = ['externalId', 'name', 'description', 'price', 'category', 'stock', 'colors', 'sizes', 'url', 'image'] as const;
export const feedMappingSchema = z.partialRecord(z.enum(FEED_FIELDS), z.string().max(80));
export const FEED_FREQUENCIES = ['manual', 'daily', 'weekly'] as const;

export const feedPreviewRequestSchema = z.object({
  url: z.string().trim().min(4).max(500),
  mapping: feedMappingSchema.optional(),
  currency: z.string().trim().length(3).optional(),
});
export const feedCreateSchema = feedPreviewRequestSchema.extend({
  name: z.string().trim().min(1).max(80),
  frequency: z.enum(FEED_FREQUENCIES).default('manual'),
});

export const feedPreviewSchema = z.object({
  format: z.string(),
  totalItems: z.number().int(),
  valid: z.number().int(),
  invalid: z.number().int(),
  duplicates: z.number().int(),
  missingPrice: z.number().int(),
  truncated: z.boolean(),
  tags: z.array(z.string()),
  mapping: z.record(z.string(), z.string()),
  issues: z.array(z.string()),
  sample: z.array(z.object({ data: z.record(z.string(), z.string()), warnings: z.array(z.string()) })),
});
export type FeedPreview = z.infer<typeof feedPreviewSchema>;
export type FeedCreateInput = z.infer<typeof feedCreateSchema>;

// ---------- Meta Catalog ----------

export const metaCatalogStatusSchema = z.object({
  /** True only when the server is set up for it AND the operator has switched catalog import on. */
  available: z.boolean(),
  /** Why it cannot be used, in plain words. Null when available. */
  reason: z.string().nullable(),
  connected: z.boolean(),
  sourceId: z.uuid().nullable(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED']).nullable(),
  lastError: z.string().nullable(),
  catalog: z.object({ id: z.string(), name: z.string() }).nullable(),
  lastSyncedAt: iso.nullable(),
});
export const metaCatalogListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      businessName: z.string().nullable(),
      productCount: z.number().int().nullable(),
    }),
  ),
});
export const metaCatalogSelectSchema = z.object({
  catalogId: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
});
export const metaConnectUrlSchema = z.object({ url: z.string() });
export type MetaCatalogStatus = z.infer<typeof metaCatalogStatusSchema>;
export type MetaCatalogList = z.infer<typeof metaCatalogListSchema>;

// ---------- product review across sources ----------

export const REVIEW_FIELDS = ['price', 'currency', 'description', 'category', 'stock', 'colors', 'sizes'] as const;

export const productCandidateSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  /** Where it came from: the kind of source and its name (a website's host, a feed's name, a catalog). */
  source: z.object({ kind: importSourceKindSchema, name: z.string() }),
  confidence: z.number().int(),
  status: z.enum(['PENDING', 'APPROVED']),
  change: z.enum(['new', 'changed']).nullable(),
  data: z.record(z.string(), z.string()),
  warnings: z.array(z.string()),
  createdAt: iso,
});
export const productGroupSchema = z.object({
  /** The normalised product name; the same product found by several sources shares it. */
  key: z.string(),
  name: z.string(),
  /** The matching product already in Brain, if any. */
  inBrain: z.record(z.string(), z.string()).nullable(),
  candidates: z.array(productCandidateSchema),
  /** Fields where the sources (or Brain) disagree, with each side's value. */
  conflicts: z.array(
    z.object({
      field: z.string(),
      values: z.array(z.object({ from: z.string(), label: z.string(), value: z.string() })),
    }),
  ),
});
export const productReviewSchema = z.object({
  groups: z.array(productGroupSchema),
  totals: z.object({
    groups: z.number().int(),
    candidates: z.number().int(),
    approved: z.number().int(),
    conflicts: z.number().int(),
    inBrain: z.number().int(),
  }),
});
export const resolveProductSchema = z.object({
  /** Every candidate of the group being resolved. */
  recordIds: z.array(z.uuid()).min(1).max(50),
  /** The version to keep. Null keeps Brain's version and rejects them all. */
  winnerId: z.uuid().nullable(),
  /** Per field, whose value to use: a candidate's id, or "brain" to leave Brain's value as it is. */
  fields: z.partialRecord(z.enum(REVIEW_FIELDS), z.string().max(40)).default({}),
  /** When Brain already has this product: update it with the chosen values instead of leaving it alone. */
  updateBrain: z.boolean().default(false),
});
export type ProductReview = z.infer<typeof productReviewSchema>;
export type ProductGroup = z.infer<typeof productGroupSchema>;
export type ProductCandidate = z.infer<typeof productCandidateSchema>;

// ---------- provenance ----------

export const provenanceEntrySchema = z.object({
  source: z.object({ kind: importSourceKindSchema, name: z.string() }),
  /** The page or listing the entry came from, when the source gave one. */
  url: z.string().nullable(),
  importedAt: iso,
  /** True when the person changed it during review, so what Brain holds differs from what the source said. */
  edited: z.boolean(),
});
/** Where imported Brain knowledge came from, keyed by the normalised product name or FAQ question. */
export const provenanceSchema = z.object({
  products: z.record(z.string(), provenanceEntrySchema),
  faqs: z.record(z.string(), provenanceEntrySchema),
});
export type Provenance = z.infer<typeof provenanceSchema>;
export type ProvenanceEntry = z.infer<typeof provenanceEntrySchema>;

// ---------- CSV file import ----------

export const CSV_TYPES = ['products', 'faqs'] as const;
export const csvPreviewRequestSchema = z.object({
  type: z.enum(CSV_TYPES),
  /** The file's text. Up to about 2.5 MB and 5,000 rows. */
  csv: z.string().min(3).max(2_500_000),
  /** Which column feeds which field; omitted fields are matched from the header names. */
  mapping: z.record(z.string().max(30), z.string().max(80)).optional(),
  currency: z.string().trim().length(3).optional(),
});
export const csvCreateSchema = csvPreviewRequestSchema.extend({
  /** The file name, to tell uploads apart in the activity list. */
  name: z.string().trim().min(1).max(80),
});
export type CsvCreateInput = z.infer<typeof csvCreateSchema>;
