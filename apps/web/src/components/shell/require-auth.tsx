'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';

/** Client-side gate: restores the session from the refresh cookie, otherwise sends the user to /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const { stores, isLoading, error } = useWorkspace();
  // An account with no store cannot use the app: first-store setup is mandatory. The API enforces the same by refusing
  // every store-scoped request without a membership; this only sends the person to the right place.
  const needsStore = status === 'authed' && !isLoading && !error && stores.length === 0;
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    // Remember where they were going, so signing in lands them there (validated again on the way back).
    if (status === 'anon')
      router.replace(
        pathname && pathname !== '/' ? `/login?next=${encodeURIComponent(pathname)}` : '/login',
      );
    if (needsStore) router.replace('/onboarding');
  }, [status, router, pathname, needsStore]);

  if (status !== 'authed' || isLoading || needsStore) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-canvas"
        aria-busy="true"
        aria-label="Signing you in"
      >
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  return <>{children}</>;
}
