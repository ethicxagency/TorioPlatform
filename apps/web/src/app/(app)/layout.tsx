import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/app-shell';
import { RequireAuth } from '@/components/shell/require-auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

/** The signed-in app is never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };
