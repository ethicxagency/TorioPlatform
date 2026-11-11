'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@torio/contracts';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { AuthHeading } from './auth-layout';
import {
  AuthLink,
  FormAlert,
  PasswordField,
  PasswordRules,
  SubmitButton,
  TextField,
} from './auth-ui';
import { OrDivider, SocialButtons, useAuthConfig } from './social-buttons';
import { useNext, withNext } from './use-next';

const schema = registerSchema
  .omit({ workspaceName: true })
  .extend({ confirm: z.string().min(1, 'Confirm your password') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' });
type Values = z.infer<typeof schema>;

export function SignUpForm() {
  const { adopt } = useAuth();
  const [registered, setRegistered] = useState(false);
  const { next, router } = useNext(registered);
  const cfg = useAuthConfig();
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const password = useWatch({ control, name: 'password' });

  const onSubmit = handleSubmit(async ({ confirm: _c, ...body }) => {
    void _c;
    let res;
    try {
      res = await api.POST('/api/v1/auth/register', { body });
    } catch {
      setError('root', { message: 'Couldn’t reach Torio. Check your connection and try again.' });
      return;
    }
    if (!res.data) {
      const m = (res.error as { error?: { message?: string } } | undefined)?.error?.message;
      if (res.response.status === 409)
        setError('email', {
          message: 'An account with this email already exists. Sign in instead.',
        });
      else
        setError('root', {
          message:
            res.response.status === 429
              ? 'Too many attempts. Wait a minute and try again.'
              : (m ?? 'Unable to create your account'),
        });
      return;
    }
    setRegistered(true);
    adopt(res.data);
    toast.success('Account created successfully.');
    // Only say a verification email was sent when this deployment can actually send one.
    // A new account has no store yet: the first one is created in onboarding (an invite link keeps its own destination).
    router.push(cfg.data?.email ? '/verify-email' : next === '/' ? '/onboarding' : next);
  });

  const closed = cfg.data && !cfg.data.registrationOpen;
  return (
    <>
      <AuthHeading
        title="Create your account"
        text="Get started with Torio and bring all your customer conversations into one intelligent platform."
      />
      {closed && (
        <div className="mb-5">
          <FormAlert>New sign-ups are closed right now.</FormAlert>
        </div>
      )}
      <SocialButtons next={next} />
      <OrDivider>Or sign up with email</OrDivider>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {errors.root && <FormAlert>{errors.root.message}</FormAlert>}
        <TextField
          label="Full Name"
          autoComplete="name"
          placeholder="Your name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Work Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          placeholder="At least 10 characters"
          meter
          value={password}
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordRules value={password ?? ''} />
        <PasswordField
          label="Confirm Password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <SubmitButton
          busy={isSubmitting}
          busyText="Creating account…"
          disabled={!!closed}
          className="mt-1"
        >
          Create Account
        </SubmitButton>
      </form>
      <p className="m-0 mt-7 text-center text-[13.5px] text-muted">
        Already have an account? <AuthLink href={withNext('/login', next)}>Sign in</AuthLink>
      </p>
    </>
  );
}
