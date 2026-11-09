import type { Metadata } from 'next';
import { MetaDeveloperPage } from '@/features/admin/components/meta-developer';

export const metadata: Metadata = { title: 'Meta Developer' };

export default function Page() {
  return <MetaDeveloperPage />;
}
