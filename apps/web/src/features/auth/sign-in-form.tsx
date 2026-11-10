'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@torio/contracts';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { AuthHeading } from './auth-layout';
import { AuthLink, FormAlert, PasswordField, SubmitButton, TextField } from './auth-ui';
import { OrDivider, SocialButtons } from './social-buttons';
import { useNext, withNext } from './use-next';

export function SignInForm() {
  const { adopt } = useAuth();
  const { next, params, router } = useNext();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  // A customer sent here by an expired session, or after resetting their password, is told why.
  const notice =
    params.get('reset') === '1'
      ? 'Your password was changed. Sign in with the new one.'
      : params.get('expired') === '1'
        ? 'Your session expired. Please sign in again.'
        : null;

  const onSubmit = handleSubmit(async (values) => {
    let res;
    try {
      res = await api.POST('/api/v1/auth/login', { body: values });
    } catch {
      setError('root', { message: 'Couldn’t reach Torio. Check your connection and try again.' });
      return;
    }
    if (!res.data) {
      const m = (res.error as { error?: { message?: string } } | undefined)?.error?.message;
      setError('root', {
        message:
          res.response.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : (m ?? 'Unable to sign in'),
      });
      return;
    }
    adopt(res.data);
    toast.success('Signed in successfully.');
    router.push(next);
  });

  return (
    <>
      <AuthHeading title="Welcome Back" text="Sign in to your Torio account to continue." />
      {notice && (
        <div className="mb-5">
          <FormAlert tone="info">{notice}</FormAlert>
        </div>
      )}
      <SocialButtons next={next} />
      <OrDivider>Or continue with email</OrDivider>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {errors.root && <FormAlert>{errors.root.message}</FormAlert>}
        <TextField
          label="Email Address"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="flex flex-col gap-1.5">
          <PasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your password"
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="text-right text-[13px]">
            <AuthLink href="/forgot-password">Forgot password?</AuthLink>
          </div>
        </div>
        <SubmitButton busy={isSubmitting} busyText="Signing in…" className="mt-1">
          Sign In
        </SubmitButton>
      </form>
      <p className="m-0 mt-7 text-center text-[13.5px] text-muted">
        Don’t have an account? <AuthLink href={withNext('/signup', next)}>Create account</AuthLink>
      </p>
    </>
  );
}
