'use client';

import { LANDING_HREF } from '@torio/contracts';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useProfile } from '../queries';

const KEY = 'torio:landed';

/**
 * Applies the user's "start page" preference once per browser session, when the app is opened at "/".
 * Clicking Dashboard later in the session is never redirected.
 */
export function LandingRedirect() {
  const router = useRouter();
  const landing = useProfile().data?.landingPage;
  useEffect(() => {
    if (!landing) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === '1';
      sessionStorage.setItem(KEY, '1');
    } catch {
      seen = true;
    }
    if (!seen && landing !== 'dashboard') router.replace(LANDING_HREF[landing]);
  }, [landing, router]);
  return null;
}
