import type { Metadata } from 'next';
import { DeletionRequestsPage } from '@/features/admin/components/deletions';

export const metadata: Metadata = { title: 'Deletion requests' };

export default function Page() {
  return <DeletionRequestsPage />;
}
