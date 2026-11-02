import { z } from 'zod';

const schema = z.object({
  // Origin of the API. Empty means same origin: on Vercel the API service is mounted at /api on the
  // web's own domain, so the client calls relative /api/v1/... paths.
  NEXT_PUBLIC_API_URL: z.union([z.literal(''), z.url()]),
});

// Next inlines NEXT_PUBLIC_* at build time, so each must be referenced explicitly.
// NEXT_PUBLIC_VERCEL_ENV is a Vercel system variable, present only in Vercel builds.
const parsed = schema.safeParse({
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NEXT_PUBLIC_VERCEL_ENV ? '' : 'http://localhost:4000'),
});

if (!parsed.success) {
  throw new Error(
    `Invalid web environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
  );
}

export const env = parsed.data;
