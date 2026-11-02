import type { Metadata } from 'next';
import { CustomersPage } from '@/features/admin/components/pages-a';

export const metadata: Metadata = { title: 'Customers' };

export default function Page() {
  return <CustomersPage />;
}
