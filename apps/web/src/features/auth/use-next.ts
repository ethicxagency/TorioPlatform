'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { safeNext } from '@/lib/auth-flow';
import { useAuth } from '@/lib/auth';
import { billingUrlFor, planIntent } from '@/lib/plan-intent';

/** The page the customer was heading to (validated), and a redirect away from auth pages once signed in. */
export function useNext(hold = false) {
  const params = useSearchParams();
  const router = useRouter();
  const { status } = useAuth();
  const intent = planIntent(params);
  // A plan picked on the pricing page is where the customer is heading, unless a specific page was asked for.
  const next = params.get('next')
    ? safeNext(params.get('next'))
    : intent
      ? billingUrlFor(intent)
      : '/';
  useEffect(() => {
    // `hold` lets a form that is about to navigate somewhere specific (sign-up -> verify email) keep the redirect off.
    if (status === 'authed' && !hold) router.replace(next);
  }, [status, next, router, hold]);
  return { next, intent, params, router, signedIn: status === 'authed' };
}

export const withNext = (path: string, next: string) =>
  next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`;
