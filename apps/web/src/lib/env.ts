import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
});

// Next inlines NEXT_PUBLIC_* at build time, so each must be referenced explicitly.
const parsed = schema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});

if (!parsed.success) {
  throw new Error(
    `Invalid web environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
  );
}

export const env = parsed.data;
