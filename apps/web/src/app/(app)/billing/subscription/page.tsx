import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SubscriptionPage } from '@/features/billing/components/subscription-page';

export const metadata: Metadata = { title: 'Subscription' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SubscriptionPage />
    </Suspense>
  );
}
