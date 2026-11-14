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

// ---------- Email delivery (Super Admin) ----------

export const EMAIL_STATUSES = [
  'QUEUED',
  'ACCEPTED',
  'DELIVERED',
  'OPENED',
  'CLICKED',
  'TEMP_FAILED',
  'FAILED',
  'COMPLAINED',
  'UNSUBSCRIBED',
] as const;
export const emailStatusSchema = z.enum(EMAIL_STATUSES);

export const emailDeliveryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: emailStatusSchema.optional(),
});
export const emailDeliverySchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  kind: z.string(),
  to: z.string(),
  subject: z.string(),
  status: emailStatusSchema,
  error: z.string().describe('Why it failed, or null').nullable(),
  attempts: z.number().int(),
  createdAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().describe('When the provider accepted it, or null').nullable(),
  deliveredAt: z.iso.datetime().describe('When the provider reported delivery, or null').nullable(),
  lastEvent: z.string().describe('The last provider event, or null').nullable(),
  lastEventAt: z.iso.datetime().describe('When it happened, or null').nullable(),
});
export const emailDeliveryListSchema = z.object({
  data: z.array(emailDeliverySchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
  summary: z.object({
    activeProvider: z
      .string()
      .describe('mailgun, resend, or null when nothing can send')
      .nullable(),
    last24h: z.record(z.string(), z.number().int()),
    lastDeliveredAt: z.iso
      .datetime()
      .describe('Last delivery the provider reported, or null')
      .nullable(),
    lastFailure: z
      .object({ at: z.iso.datetime(), to: z.string(), error: z.string().nullable() })
      .nullable(),
    webhookReady: z.boolean(),
  }),
});
export const emailTemplateListSchema = z.object({
  data: z.array(z.object({ key: z.string(), subject: z.string() })),
});
export const emailPreviewSchema = z.object({
  key: z.string(),
  subject: z.string(),
  text: z.string(),
  html: z.string(),
});

// ---------- Meta tracking events (Super Admin) ----------

export const metaEventQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD']).optional(),
});
export const metaEventListSchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      eventName: z.string(),
      eventId: z.string(),
      /** The order (or other record) the event is about, when it has one. */
      reference: z.string().describe('The order reference, or null').nullable(),
      status: z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD']),
      attempts: z.number().int(),
      lastError: z.string().describe('Why the last attempt failed, or null').nullable(),
      eventTime: z.iso.datetime(),
      sentAt: z.iso.datetime().describe('When Meta accepted it, or null').nullable(),
      nextTryAt: z.iso
        .datetime()
        .describe('When the next automatic attempt is due, or null')
        .nullable(),
    }),
  ),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
  summary: z.object({
    counts: z.record(z.string(), z.number().int()),
    lastSentAt: z.iso.datetime().describe('Last event Meta accepted, or null').nullable(),
    serverTrackingOn: z.boolean(),
    browserTrackingOn: z.boolean(),
  }),
});
export const metaRetryResultSchema = z.object({ retried: z.number().int() });

// ---------- SSLCommerz payments ----------

export const GATEWAY_TX_STATUSES = [
  'INITIATED',
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'REJECTED',
  'REVIEW',
] as const;
export const gatewayTxStatusSchema = z.enum(GATEWAY_TX_STATUSES);

export const sslCheckoutSchema = z.strictObject({
  planKey: z.string().min(1).max(40),
  interval: z.enum(['MONTH', 'YEAR']),
});
export const sslCheckoutResultSchema = z.object({ url: z.string(), tranId: z.string() });

export const gatewayTxSchema = z.object({
  id: z.uuid(),
  tranId: z.string(),
  workspaceId: z.uuid(),
  workspaceName: z.string().describe('Store name, or null').nullable(),
  planKey: z.string(),
  interval: z.enum(['MONTH', 'YEAR']),
  amountMinor: z.number().int(),
  currency: z.string(),
  environment: z.string(),
  status: gatewayTxStatusSchema,
  reason: z.string().describe('Why it failed, was rejected or needs review, or null').nullable(),
  paymentMethod: z.string().describe('How it was paid, when the gateway said, or null').nullable(),
  gatewayRef: z.string().describe('The gateway bank transaction reference, or null').nullable(),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().describe('When the payment was validated, or null').nullable(),
});
export const gatewayTxListSchema = z.object({
  data: z.array(gatewayTxSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export const gatewayTxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: gatewayTxStatusSchema.optional(),
});

// ---------- Workspace Meta Pixel ----------

export const workspacePixelSchema = z.object({
  status: integrationStatusSchema,
  enabled: z.boolean(),
  encryptionReady: z.boolean(),
  pixelId: z.string().describe('The Pixel id, or null').nullable(),
  testEventCode: z.string().describe('The test event code, or null').nullable(),
  /** Whether purchases are sent through the Conversions API (needs a verified connection). */
  conversionsApi: z.boolean(),
  hasToken: z.boolean(),
  lastTestedAt: z.iso.datetime().describe('Time of the last test, or null').nullable(),
  lastSuccessAt: z.iso.datetime().describe('Time of the last successful test, or null').nullable(),
  lastError: z.string().describe('The last test failure, or null').nullable(),
  problems: z.array(z.string()),
  canTest: z.boolean(),
  canEnable: z.boolean(),
  extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export const workspacePixelSaveSchema = z.strictObject({
  pixelId: z.string().trim().max(30).nullable().optional(),
  testEventCode: z.string().trim().max(40).nullable().optional(),
  conversionsApi: z.boolean().optional(),
});
