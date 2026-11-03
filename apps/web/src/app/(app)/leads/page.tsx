import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LeadsPage } from '@/features/leads/components/leads-page';

export const metadata: Metadata = { title: 'Leads' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeadsPage />
    </Suspense>
  );
}
