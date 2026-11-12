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
  sources: z.array(importSourceViewSchema),
  jobs: z.array(importJobViewSchema),
});
export type ImportOverview = z.infer<typeof importOverviewSchema>;
