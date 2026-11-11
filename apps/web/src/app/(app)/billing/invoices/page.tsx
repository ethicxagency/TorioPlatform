import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BillingInvoicesPage } from '@/features/billing/components/invoices-page';

export const metadata: Metadata = { title: 'Billing' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BillingInvoicesPage />
    </Suspense>
  );
}
