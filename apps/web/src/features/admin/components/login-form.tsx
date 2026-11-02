'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin-api';

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field =
    'h-10 w-full rounded-lg border border-line bg-white px-3 text-[14px] aria-[invalid=true]:border-danger';
  return (
    <form
      noValidate
      className="flex flex-col gap-3.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!email.trim() || !password) return setError('Enter your email and password.');
        setBusy(true);
        setError('');
        try {
          await adminRequest('/auth/login', {
            method: 'POST',
            body: { email: email.trim(), password },
          });
          router.replace('/admin');
        } catch (err) {
          setError(
            err instanceof Error && !/Failed|reach/.test(err.message)
              ? err.message
              : 'Could not sign in. Try again.',
          );
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[12.5px] font-medium">
        Email
        <input
          type="email"
          autoComplete="username"
          value={email}
          aria-invalid={!!error}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] font-medium">
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          aria-invalid={!!error}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
      </label>
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
        >
          {error}
        </div>
      )}
      <Button type="submit" disabled={busy} className="h-10">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
