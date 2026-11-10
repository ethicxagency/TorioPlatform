import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthLayout } from '@/features/auth/auth-layout';
import { VerifyEmail } from '@/features/auth/verify-email';

export const metadata: Metadata = { title: 'Verify email', robots: { index: false } };

export default function Page() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </AuthLayout>
  );
}
