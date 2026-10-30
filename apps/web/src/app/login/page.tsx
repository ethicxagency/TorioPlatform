import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[400px] rounded-card border border-line bg-white p-6">
        <h1 className="m-0 text-xl font-semibold tracking-[-0.015em]">Sign in to Torio</h1>
        <p className="mb-5 mt-1 text-[13px] text-muted">Use the account for your workspace.</p>
        <LoginForm />
      </div>
    </main>
  );
}
