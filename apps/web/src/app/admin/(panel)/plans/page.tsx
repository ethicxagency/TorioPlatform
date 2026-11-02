import type { Metadata } from 'next';
import { PlansPage } from '@/features/admin/components/pages-b';

export const metadata: Metadata = { title: 'Plans & Pricing' };

export default function Page() {
  return <PlansPage />;
}
