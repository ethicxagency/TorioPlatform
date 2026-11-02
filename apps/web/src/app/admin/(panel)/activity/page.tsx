import type { Metadata } from 'next';
import { ActivityPage } from '@/features/admin/components/pages-b';

export const metadata: Metadata = { title: 'Activity & Logs' };

export default function Page() {
  return <ActivityPage />;
}
