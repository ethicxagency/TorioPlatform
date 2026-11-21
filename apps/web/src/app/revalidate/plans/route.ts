import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { PLANS_TAG } from '@/lib/public-plans';

/**
 * Called by the API when a Super Admin saves or publishes a plan, so the public pricing refreshes immediately.
 * It is not under /api (Vercel routes that prefix to the API service) and needs the shared secret. It changes nothing
 * and returns nothing but "ok": it only expires cached pages.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = req.headers.get('x-revalidate-secret') ?? '';
  const ok =
    !!secret &&
    secret.length >= 16 &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  revalidateTag(PLANS_TAG, { expire: 0 });
  revalidatePath('/pricing');
  revalidatePath('/welcome');
  return NextResponse.json({ ok: true });
}
