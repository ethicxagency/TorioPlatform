'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';

/** Client-side gate: restores the session from the refresh cookie, otherwise sends the user to /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anon') router.replace('/login');
  }, [status, router]);

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
