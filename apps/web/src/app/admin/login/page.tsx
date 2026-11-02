import { TorioLogo } from '@/components/shell/torio-logo';
import type { Metadata } from 'next';
import { AdminLoginForm } from '@/features/admin/components/login-form';

export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[400px] rounded-card border border-line bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <TorioLogo className="-ml-2 block h-10 w-auto" />
          <span className="text-[13px] font-semibold text-muted">Admin</span>
        </div>
        <h1 className="m-0 font-page-title">Sign in</h1>
        <p className="mb-5 mt-1 text-[13px] text-muted">
          For Torio platform administrators only. Customer accounts can&apos;t sign in here.
        </p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
