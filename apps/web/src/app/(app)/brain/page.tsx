import type { Metadata } from 'next';
import { BrainPage } from '@/features/brain/components/brain-page';

export const metadata: Metadata = { title: 'Brain' };

export default function Page() {
  return <BrainPage />;
}
