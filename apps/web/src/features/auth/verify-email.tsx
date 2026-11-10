'use client';

import { CheckCircle2, MailCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { AuthHeading } from './auth-layout';
import { AuthLink, FormAlert } from './auth-ui';
import { useAuthConfig } from './social-buttons';

const COOLDOWN = 60;

/** Pending (no token): ask the signed-in customer to check their inbox. With a token: confirm it with the server. */
export function VerifyEmail() {
  const token = useSearchParams().get('token');
  return token ? <Confirm token={token} /> : <Pending />;
}

function Confirm({ token }: { token: string }) {
  const [state, setState] = useState<'working' | 'ok' | 'bad' | 'error'>('working');
  const { patchUser } = useAuth();
  const ran = useRef(false);
  useEffect(() => {
    // One attempt: the link is single-use, so a strict-mode double run must not burn it.
    if (ran.current) return;
    ran.current = true;
    api
      .POST('/api/v1/auth/verify-email', { body: { token } })
      .then((r) => {
        if (r.response.ok) {
          setState('ok');
          patchUser({ emailVerified: true });
          toast.success('Email verified successfully.');
        } else setState(r.response.status === 400 ? 'bad' : 'error');
      })
      .catch(() => setState('error'));
  }, [token, patchUser]);

  if (state === 'working') return <AuthHeading title="Verifying your email…" />;
  if (state === 'ok')
    return (
      <>
        <CheckCircle2 size={28} className="mb-4 text-success" aria-hidden />
        <AuthHeading title="Email verified" text="Your email address is confirmed." />
        <AuthLink href="/">Continue to Torio</AuthLink>
      </>
    );
  return (
    <>
      <AuthHeading
        title={state === 'bad' ? 'This link can’t be used' : 'Couldn’t verify right now'}
        text={
          state === 'bad'
            ? 'The verification link is invalid, has expired, or was already used. Sign in and ask for a new one.'
            : 'Check your connection and open the link again.'
        }
      />
      <AuthLink href="/verify-email">Request a new link</AuthLink>
    </>
  );
}

function Pending() {
  const { user, status } = useAuth();
  const router = useRouter();
  const cfg = useAuthConfig();
  const [left, setLeft] = useState(COOLDOWN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'anon') router.replace('/login');
    if (user?.emailVerified) router.replace('/');
  }, [status, user, router]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const resend = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.POST('/api/v1/auth/resend-verification');
      if (r.response.ok) {
        toast.success('Verification email sent.');
        setLeft(COOLDOWN);
      } else if (r.response.status === 429) {
        setLeft(COOLDOWN);
        setError('Please wait a moment before asking for another email.');
      } else if (r.response.status === 503)
        setError('Email delivery isn’t set up for this Torio deployment.');
      else setError('The email couldn’t be sent. Try again shortly.');
    } catch {
      setError('Couldn’t reach Torio. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <MailCheck size={28} className="mb-4 text-primary" aria-hidden />
      <AuthHeading
        title="Verify your email"
        text={
          user
            ? `We sent a verification link to ${user.email}. Open it to confirm your address.`
            : 'Open the verification link we emailed you.'
        }
      />
      {cfg.data && !cfg.data.email && (
        <div className="mb-4">
          <FormAlert>
            Email delivery isn’t set up for this Torio deployment, so no verification email was
            sent. You can keep using your account.
          </FormAlert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <FormAlert>{error}</FormAlert>
        </div>
      )}
      <button
        type="button"
        onClick={resend}
        disabled={busy || left > 0 || cfg.data?.email === false}
        className="flex h-11 w-full cursor-pointer items-center justify-center rounded-[var(--radius-input)] border border-line-input bg-white text-[14.5px] font-semibold text-ink transition-colors hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      >
        {busy ? 'Sending…' : left > 0 ? `Resend email in ${left}s` : 'Resend email'}
      </button>
      <p className="m-0 mt-6 text-center text-[13.5px] text-muted">
        <AuthLink href="/">Continue to Torio</AuthLink>
      </p>
    </>
  );
}
