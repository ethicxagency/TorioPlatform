import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthLayout } from '@/features/auth/auth-layout';
import { SocialComplete } from '@/features/auth/social-complete';

export const metadata: Metadata = { title: 'Finish signing in', robots: { index: false } };

export default function Page() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <SocialComplete />
      </Suspense>
    </AuthLayout>
  );
}
