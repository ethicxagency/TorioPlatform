'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@torio/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function LoginForm() {
  const router = useRouter();
  const { adopt } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    const { data, error } = await api.POST('/api/v1/auth/login', { body: values });
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
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Email
        <Input
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && (
          <span role="alert" className="text-xs font-normal text-danger">
            {errors.email.message}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Password
        <Input
          type="password"
          autoComplete="current-password"
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
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="h-10">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
