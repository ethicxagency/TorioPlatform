import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InboxPage } from '@/features/inbox/components/inbox-page';

export const metadata: Metadata = { title: 'Inbox' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InboxPage />
    </Suspense>
  );
}
