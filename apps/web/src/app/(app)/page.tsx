import type { Metadata } from 'next';
import { LandingRedirect } from '@/features/settings/components/landing-redirect';
import { DashboardPage } from '@/features/dashboard/components/dashboard-page';
import type { DemoState } from '@/features/dashboard/data';

export const metadata: Metadata = { title: 'Dashboard' };

const DEMO: Record<string, DemoState> = {
  loading: 'Loading',
  empty: 'Empty (new workspace)',
  error: 'Error',
};

/** `?demo=loading|empty|error` previews the non-populated states while the real API is not wired in. */
export default async function Page({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  return (
    <>
      <LandingRedirect />
      <DashboardPage demoState={(demo && DEMO[demo]) || 'Populated'} />
    </>
  );
}
