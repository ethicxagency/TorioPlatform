import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AcceptInvite } from './accept-invite';

export const metadata: Metadata = { title: 'Accept invitation', robots: { index: false } };

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[420px] rounded-card border border-line bg-white p-6">
        <Suspense fallback={null}>
          <AcceptInvite />
        </Suspense>
      </div>
    </main>
  );
}
