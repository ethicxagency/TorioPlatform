import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthLayout } from '@/features/auth/auth-layout';
import { ForgotPasswordForm } from '@/features/auth/recovery-forms';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false } };

export default function Page() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
