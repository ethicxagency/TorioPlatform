'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

/**
 * A signed-in customer who lands on the public page (for example with the routing cookie cleared) is taken to their
 * dashboard once the session is confirmed. Renders nothing; visitors are never redirected.
 */
export function SignedInRedirect() {
  const { status } = useAuth();
  useEffect(() => {
    // A full navigation: the server (src/proxy.ts) now sees the routing cookie and serves the dashboard.
    if (status === 'authed') window.location.replace('/');
  }, [status]);
  return null;
}
