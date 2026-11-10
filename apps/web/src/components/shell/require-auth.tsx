'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';

/** Client-side gate: restores the session from the refresh cookie, otherwise sends the user to /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    // Remember where they were going, so signing in lands them there (validated again on the way back).
    if (status === 'anon')
      router.replace(
        pathname && pathname !== '/' ? `/login?next=${encodeURIComponent(pathname)}` : '/login',
      );
  }, [status, router, pathname]);

  if (status !== 'authed') {
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
