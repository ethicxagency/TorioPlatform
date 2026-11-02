import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BillingPage } from '@/features/billing/components/billing-page';

export const metadata: Metadata = { title: 'Billing & Subscriptions' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BillingPage />
    </Suspense>
  );
}
