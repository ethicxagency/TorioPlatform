import type { Metadata } from 'next';
import { CatalogPage } from '@/features/catalog/components/catalog-page';

export const metadata: Metadata = { title: 'Products' };

export default function Page() {
  return <CatalogPage />;
}
