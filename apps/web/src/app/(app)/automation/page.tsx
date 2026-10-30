import type { Metadata } from 'next';
import { AutomationPage } from '@/features/automation/components/automation-page';

export const metadata: Metadata = { title: 'Automation' };

export default function Page() {
  return <AutomationPage />;
}
