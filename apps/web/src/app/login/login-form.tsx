'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@torio/contracts';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const field =
  'h-12 w-full rounded-[var(--radius-input)] border border-line-input bg-white px-3.5 text-[14.5px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint hover:border-[#C9CBD3] focus:border-primary focus:ring-[3px] focus:ring-primary/15 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 motion-reduce:transition-none';

/**
 * Email + password, the only sign-in method the API offers (POST /auth/login). Sessions are cookie-based with refresh,
 * so there is no separate "remember me"; there is no phone login, password reset or MFA to show yet.
 */
export function LoginForm() {
  const router = useRouter();
  const { adopt } = useAuth();
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    let res;
    try {
      res = await api.POST('/api/v1/auth/login', { body: values });
    } catch {
      setError('root', { message: 'Couldn’t reach Torio. Check your connection and try again.' });
      return;
    }
    const { data, error } = res;
    if (!data) {
      const message =
        (error as { error?: { message?: string } } | undefined)?.error?.message ??
        'Unable to sign in';
      setError('root', { message });
      return;
    }
    adopt(data);
    router.push('/');
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {errors.root && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[10px] border border-[#F3C4C4] bg-danger-soft px-3.5 py-3 text-[13.5px] text-[#8F2424]"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {errors.root.message}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor="login-email" className="text-[13.5px] font-semibold text-ink">
          Email Address
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'login-email-err' : undefined}
          className={field}
          {...register('email')}
        />
        {errors.email && (
          <span id="login-email-err" role="alert" className="text-[12.5px] text-danger">
            {errors.email.message}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="login-password" className="text-[13.5px] font-semibold text-ink">
          Password
        </label>
        <div className="relative">
          <input
            id="login-password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'login-password-err' : undefined}
            className={cn(field, 'pr-12')}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </div>
        {errors.password && (
          <span id="login-password-err" role="alert" className="text-[12.5px] text-danger">
            {errors.password.message}
          </span>
        )}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] active:bg-primary-press transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-80 motion-reduce:transition-none"
      >
        {isSubmitting && (
          <Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden />
        )}
        {isSubmitting ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
