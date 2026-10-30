import type { Metadata } from 'next';
import { SettingsShell } from '@/features/settings/components/settings-shell';

export const metadata: Metadata = { title: 'Settings' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
