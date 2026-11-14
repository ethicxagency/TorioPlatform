import type { Metadata } from 'next';
import { IntegrationPage } from '@/features/admin/components/integration-page';

export const metadata: Metadata = { title: 'Torio Meta Pixel' };

export default function Page() {
  return <IntegrationPage k="torio_meta_pixel" />;
}
