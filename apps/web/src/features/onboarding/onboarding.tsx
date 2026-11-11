'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { TorioLogo } from '@/components/shell/torio-logo';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/toaster';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { StoreForm } from './store-form';

function Inner() {
  const { status } = useAuth();
  const router = useRouter();
  const additional = useSearchParams().get('new') === '1';
  const { stores, isLoading } = useWorkspace();

  useEffect(() => {
    if (status === 'anon') router.replace('/login?next=%2Fonboarding');
    // Someone who already has a store gets here only through "Add Store" (?new=1); otherwise there is nothing to do.
    if (status === 'authed' && !isLoading && stores.length > 0 && !additional) router.replace('/');
  }, [status, isLoading, stores.length, additional, router]);

  if (status !== 'authed' || isLoading || (stores.length > 0 && !additional))
    return <Skeleton className="mx-auto mt-24 h-8 w-48" />;

  return (
    <>
      <div className="mx-auto w-full max-w-[720px]">
        <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em] text-ink">
          {additional ? 'Add a new store' : 'Let’s set up your store'}
        </h1>
        <p className="m-0 mt-2 text-[15px] text-muted">
          {additional
            ? 'Create another store under your account. It has its own customers, channels and settings.'
            : 'Tell us a little about your business to personalize your Torio workspace.'}
        </p>
        <div className="mt-8 rounded-[20px] border border-line bg-white p-6 shadow-[0_1px_2px_rgba(0,55,112,0.04),0_24px_48px_-16px_rgba(43,44,140,0.12)] sm:p-8">
          <StoreForm additional={additional} />
        </div>
      </div>
      <Toaster />
    </>
  );
}

/** Store setup: mandatory for a new account (no store yet), reachable for more stores through Add Store. */
export function Onboarding() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-canvas px-4 pb-14 pt-8 sm:pt-12">
      <TorioLogo className="mb-8 h-11 w-auto shrink-0 object-contain" />
      <Suspense fallback={<Skeleton className="h-8 w-48" />}>
        <Inner />
      </Suspense>
    </main>
  );
}
