'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, passwordSchema, type ForgotPasswordInput } from '@torio/contracts';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthHeading } from './auth-layout';
import { AuthLink, FormAlert, PasswordField, SubmitButton, TextField } from './auth-ui';
import { useAuthConfig } from './social-buttons';

const NETWORK = 'Couldn’t reach Torio. Check your connection and try again.';

export function ForgotPasswordForm() {
  const cfg = useAuthConfig();
  const [sent, setSent] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const r = await api.POST('/api/v1/auth/forgot-password', { body: v });
      if (r.response.status === 429)
        return setError('root', { message: 'Too many requests. Wait a minute and try again.' });
      if (!r.response.ok)
        return setError('root', { message: 'Something went wrong. Please try again.' });
      setSent(v.email);
    } catch {
      setError('root', { message: NETWORK });
    }
  });

  if (sent)
    return (
      <>
        <MailCheck size={28} className="mb-4 text-primary" aria-hidden />
        <AuthHeading
          title="Check your email"
          text={`If an account exists for ${sent}, we’ve sent a link to reset the password. It works once and expires in an hour.`}
        />
        <AuthLink href="/login">Back to sign in</AuthLink>
      </>
    );
  return (
    <>
      <AuthHeading
        title="Reset your password"
        text="Enter your email and we’ll send you a reset link."
      />
      {cfg.data && !cfg.data.email && (
        <div className="mb-5">
          <FormAlert>
            Email delivery isn’t set up for this Torio deployment, so reset links can’t be sent. Ask
            the administrator to set it up.
          </FormAlert>
        </div>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {errors.root && <FormAlert>{errors.root.message}</FormAlert>}
        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <SubmitButton busy={isSubmitting} busyText="Sending…">
          Send reset link
        </SubmitButton>
      </form>
      <p className="m-0 mt-7 text-center text-[13.5px] text-muted">
        <AuthLink href="/login">Back to sign in</AuthLink>
      </p>
    </>
  );
}

const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string().min(1, 'Confirm your password') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' });

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [invalid, setInvalid] = useState(token.length < 20);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  const password = useWatch({ control, name: 'password' });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const r = await api.POST('/api/v1/auth/reset-password', {
        body: { token, password: v.password },
      });
      if (r.response.status === 400) return setInvalid(true);
      if (r.response.status === 429)
        return setError('root', { message: 'Too many attempts. Wait a minute and try again.' });
      if (!r.response.ok)
        return setError('root', { message: 'Something went wrong. Please try again.' });
      toast.success('Password updated successfully.');
      router.replace('/login?reset=1');
    } catch {
      setError('root', { message: NETWORK });
    }
  });

  if (invalid)
    return (
      <>
        <AuthHeading
          title="This link can’t be used"
          text="The reset link is invalid, has expired, or was already used. Request a new one."
        />
        <AuthLink href="/forgot-password">Request a new link</AuthLink>
      </>
    );
  return (
    <>
      <AuthHeading title="Choose a new password" text="You’ll be signed out of every device." />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {errors.root && <FormAlert>{errors.root.message}</FormAlert>}
        <PasswordField
          label="New password"
          autoComplete="new-password"
          meter
          value={password}
          hint="10+ characters with upper and lower case letters and a number."
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <SubmitButton busy={isSubmitting} busyText="Saving…">
          Update password
        </SubmitButton>
      </form>
    </>
  );
}
