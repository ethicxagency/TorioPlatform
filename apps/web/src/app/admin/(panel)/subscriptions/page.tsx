import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SubscriptionsPage } from '@/features/admin/components/pages-b';

export const metadata: Metadata = { title: 'Subscriptions & Billing' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SubscriptionsPage />
    </Suspense>
  );
}
