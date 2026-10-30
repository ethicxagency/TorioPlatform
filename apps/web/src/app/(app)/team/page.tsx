import type { Metadata } from 'next';
import { TeamPage } from '@/features/team/components/team-page';

export const metadata: Metadata = { title: 'Teams' };

export default function Page() {
  return <TeamPage />;
}
