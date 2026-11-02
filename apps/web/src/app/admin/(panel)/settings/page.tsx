import type { Metadata } from 'next';
import { SettingsPage } from '@/features/admin/components/pages-b';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return <SettingsPage />;
}
