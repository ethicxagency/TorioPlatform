import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AiManagementPage } from '@/features/admin/components/ai-management';

export const metadata: Metadata = { title: 'AI Management' };

export default function Page() {
  return (
    <Suspense>
      <AiManagementPage />
    </Suspense>
  );
}
