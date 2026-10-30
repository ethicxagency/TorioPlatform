'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@torio/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_INFO } from '@/features/team/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Your name is required').max(100),
  password: passwordSchema,
});
type Values = z.infer<typeof schema>;
const msg = (e: unknown, f: string) =>
  (e as { error?: { message?: string } } | undefined)?.error?.message ?? f;

export function AcceptInvite() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const qc = useQueryClient();
  const { status, user, adopt } = useAuth();
  const preview = useQuery({
    queryKey: ['invite-preview', token],
    enabled: token.length >= 20,
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/invitations/preview', {
        params: { query: { token } },
      });
      if (!data) throw new Error(msg(error, 'This invitation is invalid or has expired'));
      return data;
    },
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (token.length < 20 || preview.isError)
    return (
      <div role="alert">
        <h1 className="m-0 text-xl font-semibold">Invitation unavailable</h1>
        <p className="mb-0 mt-2 text-sm text-muted">
          {preview.error?.message ?? 'This invitation link is invalid or has expired.'} Ask your
          workspace admin for a new link.
        </p>
      </div>
    );
  if (preview.isPending)
    return (
      <p className="m-0 text-sm text-muted" aria-busy="true">
        Checking your invitation…
      </p>
    );
  const inv = preview.data;

  const enter = async () => {
    await qc.invalidateQueries({ queryKey: ['workspaces'] });
    router.replace('/');
  };

  const createAccount = handleSubmit(async (v) => {
    const res = await api.POST('/api/v1/invitations/accept-new', {
      body: { token, name: v.name, password: v.password },
    });
    if (!res.data)
      return setError('root', { message: msg(res.error, 'Could not accept the invitation') });
    const login = await api.POST('/api/v1/auth/login', {
      body: { email: inv.email, password: v.password },
    });
    if (!login.data)
      return setError('root', { message: 'Account created. Please sign in to continue.' });
    adopt(login.data);
    await enter();
  });

  const acceptExisting = async () => {
    const res = await api.POST('/api/v1/invitations/accept', { body: { token } });
    if (!res.data)
      return setError('root', { message: msg(res.error, 'Could not accept the invitation') });
    await enter();
  };

  const signedInMatches = status === 'authed' && user?.email.toLowerCase() === inv.email;
  const signedInOther = status === 'authed' && !signedInMatches;

  return (
    <div>
      <h1 className="m-0 text-xl font-semibold tracking-[-0.015em]">Join {inv.workspaceName}</h1>
      <p className="mb-4 mt-1 text-[13px] text-muted">
        You&apos;ve been invited as <b>{ROLE_INFO[inv.role].label}</b> using <b>{inv.email}</b>.
      </p>
      {signedInMatches ? (
        <div className="flex flex-col gap-3">
          <Button onClick={() => void acceptExisting()} disabled={isSubmitting}>
            Accept invitation
          </Button>
          {errors.root && (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {errors.root.message}
            </p>
          )}
        </div>
      ) : signedInOther ? (
        <p role="alert" className="m-0 text-[13px] text-muted">
          You&apos;re signed in as {user?.email}, but this invitation is for {inv.email}. Sign out
          and open the link again with the right account.
        </p>
      ) : (
        <form onSubmit={createAccount} noValidate className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            Your name
            <Input autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
            {errors.name && (
              <span role="alert" className="text-xs font-normal text-danger">
                {errors.name.message}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            Choose a password
            <Input
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password && (
              <span role="alert" className="text-xs font-normal text-danger">
                {errors.password.message}
              </span>
            )}
          </label>
          {errors.root && (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {errors.root.message}
              {/already exists/.test(errors.root.message ?? '') && (
                <>
                  {' '}
                  <Link href="/login">Sign in</Link>, then open this link again.
                </>
              )}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account and join'}
          </Button>
          <p className="m-0 text-center text-xs text-muted">
            Already have an account? <Link href="/login">Sign in</Link>, then open this link again.
          </p>
        </form>
      )}
    </div>
  );
}
