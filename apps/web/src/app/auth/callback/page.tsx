import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthLayout } from '@/features/auth/auth-layout';
import { SocialCallback } from '@/features/auth/social-callback';

export const metadata: Metadata = { title: 'Signing in', robots: { index: false } };

export default function Page() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <SocialCallback />
      </Suspense>
    </AuthLayout>
  );
}
