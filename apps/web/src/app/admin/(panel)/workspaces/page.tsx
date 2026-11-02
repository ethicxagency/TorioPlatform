import type { Metadata } from 'next';
import { WorkspacesPage } from '@/features/admin/components/pages-a';

export const metadata: Metadata = { title: 'Workspaces' };

export default function Page() {
  return <WorkspacesPage />;
}
