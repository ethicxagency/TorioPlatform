import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomersPage } from '@/features/customers/components/customers-page';

export const metadata: Metadata = { title: 'Customers' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CustomersPage />
    </Suspense>
  );
}
