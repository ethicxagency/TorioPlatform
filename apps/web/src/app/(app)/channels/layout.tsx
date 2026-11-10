import { SettingsShell } from '@/features/settings/components/settings-shell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
