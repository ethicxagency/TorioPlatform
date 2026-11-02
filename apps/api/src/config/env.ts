import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_URL: z.url(),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
    REDIS_URL: z
      .string()
      .regex(/^rediss?:\/\//, 'must be a redis:// URL')
      .optional(),
    REDIS_REQUIRED: bool,
    CORS_ALLOWED_ORIGINS: z
      .string()
      .min(1)
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    COOKIE_SECURE: bool,
    // Billing (all optional: without STRIPE_SECRET_KEY nothing can be bought or changed, and the UI says so).
    STRIPE_SECRET_KEY: z.string().min(8).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(8).optional(),
    // Meta / WhatsApp Cloud API (all optional: without them WhatsApp can't be connected and the UI says so).
    META_APP_SECRET: z.string().min(8).optional(),
    META_WEBHOOK_VERIFY_TOKEN: z.string().min(8).optional(),
    META_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default('v21.0'),
    /** Secret used to encrypt provider tokens at rest. Rotating it invalidates stored tokens. */
    CHANNEL_ENCRYPTION_KEY: z.string().min(32, 'must be at least 32 characters').optional(),
    /** JSON: { "starter": { "month": "price_…", "year": "price_…" }, … } */
    BILLING_PRICE_IDS: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v) return {} as Record<string, { month?: string; year?: string }>;
        try {
          const parsed = z
            .record(
              z.string(),
              z.object({ month: z.string().optional(), year: z.string().optional() }),
            )
            .parse(JSON.parse(v));
          return parsed;
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'must be JSON like {"starter":{"month":"price_…"}}',
          });
          return z.NEVER;
        }
      }),
  })
  .superRefine((env, ctx) => {
    if (env.CORS_ALLOWED_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'wildcard origin is not allowed',
      });
    }
    if (env.REDIS_REQUIRED && !env.REDIS_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'required when REDIS_REQUIRED=true',
      });
    }
    if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_WEBHOOK_SECRET'],
        message: 'required when STRIPE_SECRET_KEY is set (webhooks must be signature-verified)',
      });
    }
    if (env.META_APP_SECRET && (!env.META_WEBHOOK_VERIFY_TOKEN || !env.CHANNEL_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['META_APP_SECRET'],
        message:
          'META_WEBHOOK_VERIFY_TOKEN and CHANNEL_ENCRYPTION_KEY are required when META_APP_SECRET is set',
      });
    }
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parses and validates process env. Error text lists variable names only, never values. */
export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
