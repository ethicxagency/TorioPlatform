import { z } from 'zod';

/** The platform integrations a Super Admin configures. Each keeps its own record, secrets and verification. */
export const INTEGRATION_KEYS = ['mailgun', 'torio_meta_pixel', 'sslcommerz'] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];
export const integrationKeySchema = z.enum(INTEGRATION_KEYS);

/**
 * What a saved integration can honestly be:
 * - NOT_CONFIGURED: required fields or secrets are missing;
 * - UNVERIFIED: configured, but never tested, or changed since its last successful test;
 * - VERIFIED: the provider accepted exactly this configuration in a test;
 * - FAILED: the last test of this configuration was rejected.
 * Saving credentials never makes an integration VERIFIED.
 */
export const integrationStatusSchema = z.enum([
  'NOT_CONFIGURED',
  'UNVERIFIED',
  'VERIFIED',
  'FAILED',
]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const integrationFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(['text', 'email', 'select', 'boolean']),
  required: z.boolean(),
  hint: z.string().nullable(),
  placeholder: z.string().nullable(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).nullable(),
});

export const integrationSecretSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  /** Whether a value is saved. The value itself is never returned. */
  set: z.boolean(),
  hint: z.string().nullable(),
});

export const integrationValueSchema = z.union([z.string(), z.boolean()]).nullable();

export const integrationSummarySchema = z.object({
  key: integrationKeySchema,
  name: z.string(),
  category: z.enum(['Email', 'Marketing & Analytics', 'Payments']),
  description: z.string(),
  enabled: z.boolean(),
  status: integrationStatusSchema,
  lastTestedAt: z.iso.datetime().describe('Time of the last test, or null').nullable(),
  lastSuccessAt: z.iso.datetime().describe('Time of the last successful test, or null').nullable(),
});
export const integrationListSchema = z.object({
  encryptionReady: z.boolean(),
  data: z.array(integrationSummarySchema),
});

export const integrationViewSchema = integrationSummarySchema.extend({
  encryptionReady: z.boolean(),
  /** What it needs, in plain words. */
  requirements: z.array(z.string()),
  fields: z.array(integrationFieldSchema),
  values: z.record(z.string(), integrationValueSchema),
  secrets: z.array(integrationSecretSchema),
  /** Fixed values Torio computes, e.g. the addresses a provider must be told. */
  readOnly: z.array(
    z.object({ label: z.string(), value: z.string(), hint: z.string().nullable() }),
  ),
  lastError: z.string().describe('The last test failure, or null').nullable(),
  /** What is missing before it can be tested or enabled. */
  problems: z.array(z.string()),
  canTest: z.boolean(),
  canEnable: z.boolean(),
  updatedAt: z.iso.datetime().describe('Last change, or null').nullable(),
  extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const integrationSaveSchema = z.strictObject({
  /** Only the fields to change. A null or empty value clears a field. */
  values: z.record(z.string(), integrationValueSchema).default({}),
  /** Switching SSLCommerz to live processing needs this explicit confirmation. */
  confirmLive: z.boolean().optional(),
});
export type IntegrationSaveInput = z.infer<typeof integrationSaveSchema>;

export const integrationEnableSchema = z.strictObject({ enabled: z.boolean() });
export const integrationSecretValueSchema = z.strictObject({
  value: z.string().trim().min(6, 'That value is too short').max(512),
});
export const integrationTestEmailSchema = z.strictObject({ to: z.email() });

export const integrationTestResultSchema = z.object({
  ok: z.boolean(),
  status: integrationStatusSchema,
  message: z.string(),
  checks: z.array(z.object({ label: z.string(), ok: z.boolean(), detail: z.string().nullable() })),
});
