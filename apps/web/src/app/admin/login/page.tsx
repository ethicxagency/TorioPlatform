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
      <div className="w-full max-w-[400px] rounded-[16px] border border-line bg-white p-7 shadow-[0_1px_2px_rgba(13,37,61,0.04)]">
        <div className="mb-4 flex items-center gap-2">
          <TorioLogo className="-ml-2 block h-10 w-auto" />
          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-primary-hover">
            Admin
          </span>
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
