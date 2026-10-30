import type { Metadata } from 'next';
import { ChannelsPage } from '@/features/channels/components/channels-page';

export const metadata: Metadata = { title: 'Channels' };

export default function Page() {
  return <ChannelsPage />;
}
