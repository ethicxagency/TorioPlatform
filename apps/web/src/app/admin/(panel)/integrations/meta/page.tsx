import type { Metadata } from 'next';
import { MetaAppsPage } from '@/features/admin/components/meta-apps';

export const metadata: Metadata = { title: 'Meta Developer' };

export default function Page() {
  return <MetaAppsPage />;
}
