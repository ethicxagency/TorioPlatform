import type { Metadata } from 'next';
import { AdminShell } from '@/features/admin/components/admin-shell';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Torio Admin' },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
