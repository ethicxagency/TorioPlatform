import { z } from 'zod';

/** The route Meta's channel OAuth redirects back to. Fixed by the API; a channel redirect URI must end with exactly this path. */
export const META_CALLBACK_PATH = '/api/v1/channels/meta/callback';
/** The route customers' "Continue with Facebook" redirects back to. A different flow from the channel callback above. */
export const FACEBOOK_LOGIN_CALLBACK_PATH = '/api/v1/auth/oauth/facebook/callback';
export const META_WEBHOOK_PATH = '/api/v1/webhooks/meta';
export const WHATSAPP_WEBHOOK_PATH = '/api/v1/webhooks/whatsapp';

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$|^localhost$/,
    'Enter a domain like app.example.com',
  );
const url = z.string().trim().max(500).url('Enter a full URL, e.g. https://app.example.com');
const nul = <T extends z.ZodType>(s: T) => s.nullable().optional();

/**
 * Checks one OAuth redirect URI against the one route its flow serves, never another flow's. Returns the problems
 * (empty = valid): must parse, be https (http only for localhost), be exactly `expectedPath` with no query or fragment,
 * and sit on a trusted host, so a callback can never be pointed at an arbitrary site.
 */
export function checkRedirectUri(
  uri: string,
  expectedPath: string,
  opts: { trustedHosts: string[]; production: boolean },
): string[] {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return ['Not a valid URL.'];
  }
  const out: string[] = [];
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(local && !opts.production))
    out.push('Use HTTPS (plain http is only allowed for localhost outside production).');
  if (u.username || u.password) out.push('Credentials in a URL are not allowed.');
  if (u.search || u.hash) out.push('A redirect URI must not contain a query string or fragment.');
  if (u.pathname.replace(/\/$/, '') !== expectedPath)
    out.push(`The path must be exactly ${expectedPath}.`);
  if (!opts.trustedHosts.map((h) => h.toLowerCase()).includes(u.hostname.toLowerCase()) && !local)
    out.push(
      `The host ${u.hostname} isn’t trusted. Add its domain under Trusted application domains first.`,
    );
  return out;
}

/** Non-secret settings. `null` clears a value so the deployment environment applies again. */
export const metaConfigPatchSchema = z
  .object({
    appName: nul(z.string().trim().min(1).max(80)),
    appId: nul(
      z
        .string()
        .trim()
        .regex(/^\d{6,20}$/, 'The App ID is the numeric id from Meta (App settings → Basic)')
        .refine(
          (v) => !isRetiredMetaAppId(v),
          'This App ID belonged to the old shared Meta configuration and can’t be used. Use this app’s own App ID.',
        ),
    ),
    apiVersion: nul(
      z
        .string()
        .trim()
        .regex(/^v\d+\.\d+$/, 'Use a version like v27.0'),
    ),
    businessId: nul(
      z
        .string()
        .trim()
        .regex(/^\d{5,25}$/, 'Numeric Business Portfolio ID'),
    ),
    appMode: nul(z.enum(['DEVELOPMENT', 'LIVE'])),
    appDomain: nul(hostname),
    websiteUrl: nul(url),
    oauthRedirectUri: nul(url),
    allowedRedirectUris: z.array(url).max(10).optional(),
    oauthStateTtlMinutes: nul(z.number().int().min(1).max(60)),
    allowedDomains: z.array(hostname).max(20).optional(),
    successUrl: nul(url),
    failureUrl: nul(url),
    webhookBaseUrl: nul(url),
    webhookEnabled: nul(z.boolean()),
    whatsappConfigId: nul(z.string().trim().min(4).max(40)),
    discoverWhatsapp: nul(z.boolean()),
    messengerEnabled: z.boolean().optional(),
    instagramEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
  })
  .strict();
export type MetaConfigPatch = z.infer<typeof metaConfigPatchSchema>;

export const metaConfigSaveSchema = z.object({
  patch: metaConfigPatchSchema,
  /** Required when the preview says the change may affect connected channels. */
  confirm: z.boolean().optional(),
});
export const metaConfigPreviewSchema = z.object({ patch: metaConfigPatchSchema });

const source = z.enum(['database', 'environment', 'default', 'unset']);
const secretState = z.object({ configured: z.boolean(), source });
const problem = z.object({
  field: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
});

export const metaAdminConfigSchema = z.object({
  values: z.object({
    appName: z.string().nullable(),
    appId: z.string().nullable(),
    apiVersion: z.string(),
    businessId: z.string().nullable(),
    appMode: z.enum(['DEVELOPMENT', 'LIVE']).nullable(),
    appDomain: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    oauthRedirectUri: z.string().nullable(),
    allowedRedirectUris: z.array(z.string()),
    oauthStateTtlMinutes: z.number().int(),
    allowedDomains: z.array(z.string()),
    successUrl: z.string().nullable(),
    failureUrl: z.string().nullable(),
    webhookBaseUrl: z.string().nullable(),
    webhookEnabled: z.boolean(),
    whatsappConfigId: z.string().nullable(),
    discoverWhatsapp: z.boolean(),
    messengerEnabled: z.boolean(),
    instagramEnabled: z.boolean(),
    whatsappEnabled: z.boolean(),
  }),
  /** Where each effective value comes from, so an admin knows whether the environment or the dashboard wins. */
  sources: z.record(z.string(), source),
  secrets: z.object({ appSecret: secretState, webhookVerifyToken: secretState }),
  derived: z.object({
    callbackPath: z.string(),
    redirectUriToRegister: z.string().nullable(),
    metaWebhookUrl: z.string().nullable(),
    whatsappWebhookUrl: z.string().nullable(),
  }),
  status: z.enum(['CONFIGURED', 'INCOMPLETE', 'INVALID', 'NEEDS_ATTENTION']),
  problems: z.array(problem),
  /** Settings that only take effect after a redeploy/restart (deployment-level). */
  deploymentLevel: z.array(
    z.object({ name: z.string(), purpose: z.string(), configured: z.boolean() }),
  ),
  updatedAt: z.iso.datetime().nullable(),
  updatedBy: z.string().nullable(),
});

export const metaPreviewResultSchema = z.object({
  changes: z.array(z.object({ field: z.string(), before: z.string(), after: z.string() })),
  impacts: z.array(z.object({ severity: z.enum(['warning', 'danger']), message: z.string() })),
  requiresConfirmation: z.boolean(),
  errors: z.array(z.object({ field: z.string(), message: z.string() })),
});

export const metaSecretSchema = z.object({
  value: z.string().trim().min(8).max(500),
  /** Required when connected channels depend on the current value. */
  confirm: z.boolean().optional(),
});
export const metaSecretClearSchema = z.object({ confirm: z.literal(true) });
export const metaTokenGenerateSchema = z.object({ confirm: z.boolean().optional() });
export const metaGeneratedTokenSchema = z.object({ token: z.string() });

export const metaTestResultSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.iso.datetime(),
  httpStatus: z.number().int().nullable(),
  metaCode: z.number().int().nullable(),
  message: z.string(),
  resolution: z.string().nullable(),
  details: z.array(z.object({ label: z.string(), value: z.string() })),
});

export const metaDiagnosticsSchema = z.object({
  checkedAt: z.iso.datetime(),
  checks: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      status: z.enum(['ok', 'warning', 'fail', 'unknown']),
      detail: z.string(),
    }),
  ),
  webhook: z.object({
    lastVerifiedAt: z.iso.datetime().nullable(),
    lastReceivedAt: z.iso.datetime().nullable(),
    processed24h: z.number().int(),
    failed24h: z.number().int(),
    pending: z.number().int(),
    recentErrors: z.array(
      z.object({ at: z.iso.datetime(), provider: z.string(), error: z.string() }),
    ),
  }),
  products: z.array(
    z.object({
      key: z.enum(['LOGIN', 'MESSENGER', 'INSTAGRAM', 'WHATSAPP']),
      label: z.string(),
      enabled: z.boolean(),
      requiredPermissions: z.array(z.string()),
      connectedChannels: z.number().int(),
      attention: z.number().int(),
      /** Whether Meta has approved these permissions can't be read from the API: shown as unknown, never assumed. */
      appReview: z.literal('unknown'),
      warnings: z.array(z.string()),
    }),
  ),
});

export const metaSecurityStatusSchema = z.object({
  algorithm: z.string(),
  masterKeyConfigured: z.boolean(),
  previousKeyConfigured: z.boolean(),
  secretsSealedWith: z.object({
    current: z.number().int(),
    previous: z.number().int(),
    unreadable: z.number().int(),
  }),
  rotationPending: z.boolean(),
  lastKeyRotationAt: z.iso.datetime().nullable(),
  notes: z.array(z.string()),
});
export const metaReencryptResultSchema = z.object({
  reencrypted: z.number().int(),
  alreadyCurrent: z.number().int(),
  failed: z.number().int(),
});

export const metaActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().max(80).optional(),
});
export const metaActivityListSchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      adminEmail: z.string(),
      reason: z.string().nullable(),
      /** Field names and non-secret before/after only; secrets are never recorded. */
      metadata: z.record(z.string(), z.unknown()).nullable(),
      ipAddress: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  meta: z.object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() }),
});

/** The two Meta apps Torio uses, kept completely apart. */
export const META_APP_IDS = {
  BUSINESS_MESSAGING: '3850545818418490',
  AUTH: '2321020315413901',
} as const;

/**
 * App IDs that belonged to an earlier, shared Meta configuration and are no longer either of Torio's two apps.
 * They are never resolved, validated against or used as a fallback; a stored or environment value that matches one is ignored.
 */
export const RETIRED_META_APP_IDS: readonly string[] = ['1533990358131449'];

export const isRetiredMetaAppId = (id: string | null | undefined): boolean =>
  !!id && RETIRED_META_APP_IDS.includes(id.trim());

/** Customer Authentication app ("Torio Auth"): Facebook Login for customers only. Non-secret settings; `null` clears a value. */
export const metaAuthPatchSchema = z
  .object({
    appName: nul(z.string().trim().min(1).max(80)),
    appId: nul(
      z
        .string()
        .trim()
        .regex(/^\d{6,20}$/, 'The App ID is the numeric id from Meta (App settings → Basic)')
        .refine(
          (v) => !isRetiredMetaAppId(v),
          'This App ID belonged to the old shared Meta configuration and can’t be used. Use this app’s own App ID.',
        ),
    ),
    apiVersion: nul(
      z
        .string()
        .trim()
        .regex(/^v\d+\.\d+$/, 'Use a version like v27.0'),
    ),
    appMode: nul(z.enum(['DEVELOPMENT', 'LIVE'])),
    appDomain: nul(hostname),
    websiteUrl: nul(url),
    customerAuthRedirectUri: nul(url),
    customerAuthAllowedRedirectUris: z.array(url).max(10).optional(),
  })
  .strict();
export type MetaAuthPatch = z.infer<typeof metaAuthPatchSchema>;
export const metaAuthSaveSchema = z.object({ patch: metaAuthPatchSchema });

export const metaAuthConfigSchema = z.object({
  values: z.object({
    appName: z.string().nullable(),
    appId: z.string().nullable(),
    apiVersion: z.string(),
    appMode: z.enum(['DEVELOPMENT', 'LIVE']).nullable(),
    appDomain: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    customerAuthRedirectUri: z.string().nullable(),
    customerAuthAllowedRedirectUris: z.array(z.string()),
  }),
  sources: z.record(z.string(), source),
  secrets: z.object({ appSecret: secretState }),
  /** Where the App ID / Secret pair really comes from right now ("saved here" only when both are saved). */
  credentialsFrom: z.enum(['database', 'environment', 'none']),
  derived: z.object({
    callbackPath: z.string(),
    generatedRedirectUri: z.string().nullable(),
    matchesRoute: z.boolean(),
    registerInMeta: z.string().nullable(),
    scopes: z.array(z.string()),
    suggestedAppId: z.string(),
  }),
  status: z.enum(['CONFIGURED', 'INCOMPLETE', 'INVALID']),
  problems: z.array(problem),
  lastLoginAt: z.iso.datetime().nullable(),
  lastTestAt: z.iso.datetime().nullable(),
  lastTestOk: z.boolean().nullable(),
  updatedAt: z.iso.datetime().nullable(),
  updatedBy: z.string().nullable(),
});
