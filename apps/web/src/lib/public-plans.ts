import { publicPlanListSchema, type PublicPlan } from '@torio/contracts';
import { env } from '@/lib/env';
import { SITE } from '@/lib/site';

export type PublicPlansResult =
  { status: 'ok'; plans: PublicPlan[] } | { status: 'error'; plans: [] };

/** Cache tag the API-triggered refresh (`/revalidate/plans`) expires. */
export const PLANS_TAG = 'public-plans';
/** Safety net: even if the refresh signal is never delivered, pricing is at most this stale. */
export const PLANS_REVALIDATE_SECONDS = 60;

const origin = () =>
  process.env.API_INTERNAL_URL?.replace(/\/$/, '') || env.NEXT_PUBLIC_API_URL || SITE.url;

/**
 * The published plans, read on the server from the API, which reads the same table Super Admin edits. Never falls back to
 * made-up prices: if the API cannot be reached the caller gets `error` and says so.
 */
export async function getPublicPlans(): Promise<PublicPlansResult> {
  try {
    const res = await fetch(`${origin()}/api/v1/public/plans`, {
      next: { revalidate: PLANS_REVALIDATE_SECONDS, tags: [PLANS_TAG] },
    });
    if (!res.ok) return { status: 'error', plans: [] };
    const parsed = publicPlanListSchema.safeParse(await res.json());
    if (!parsed.success) return { status: 'error', plans: [] };
    return { status: 'ok', plans: [...parsed.data.data].sort((a, b) => a.rank - b.rank) };
  } catch {
    return { status: 'error', plans: [] };
  }
}

export type Interval = 'MONTH' | 'YEAR';

/** The plan CTA: where choosing a plan goes. The plan and interval travel in the URL; the server re-checks both at checkout. */
export const planHref = (key: string, interval: Interval, path: '/signup' | '/login' = '/signup') =>
  `${path}?plan=${encodeURIComponent(key)}&interval=${interval}`;
