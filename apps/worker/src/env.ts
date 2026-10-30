import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
});

export type WorkerEnv = z.infer<typeof schema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid worker environment:\n${lines.join('\n')}`);
  }
  return r.data;
}
