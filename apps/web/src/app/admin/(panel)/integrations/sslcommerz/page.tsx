import type { Metadata } from 'next';
import { IntegrationPage } from '@/features/admin/components/integration-page';

export const metadata: Metadata = { title: 'SSLCommerz' };

export default function Page() {
  return <IntegrationPage k="sslcommerz" />;
}
