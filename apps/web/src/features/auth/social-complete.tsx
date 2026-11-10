'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { emailSchema } from '@torio/contracts';
import { MailCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';
import { refreshSession } from '@/lib/api';
import { authPost, safeNext, SOCIAL_ERRORS } from '@/lib/auth-flow';
import { toast } from '@/lib/toast';
import { AuthHeading } from './auth-layout';
import { AuthLink, FormAlert, SubmitButton, TextField } from './auth-ui';

const schema = z.object({ email: emailSchema });

/**
 * Finishing a social sign-in that needs an email proven first: ask for an address (Facebook gave none), tell the
 * customer to check their inbox, or, when they arrive from the emailed link, complete the sign-in.
 */
export function SocialComplete() {
  const params = useSearchParams();
  const token = params.get('token');
  if (token) return <FromLink token={token} />;
  return params.get('step') === 'email' ? <AskEmail /> : <CheckInbox />;
}

const CheckInbox = ({ email }: { email?: string }) => (
  <>
    <MailCheck size={28} className="mb-4 text-primary" aria-hidden />
    <AuthHeading
      title="Check your email"
      text={`${email ? `We sent a confirmation link to ${email}. ` : 'We sent you a confirmation link. '}Open it in this browser to finish signing in. It works once and expires in 30 minutes.`}
    />
    <AuthLink href="/login">Back to sign in</AuthLink>
  </>
);

function AskEmail() {
  const [sent, setSent] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async (v) => {
    try {
      const r = await authPost('oauth/email', v);
      if (r.ok) return setSent(v.email);
      setError('root', {
        message:
          r.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : 'That sign-in expired. Go back and start again.',
      });
    } catch {
      setError('root', { message: 'Couldn’t reach Torio. Check your connection and try again.' });
    }
  });
  if (sent) return <CheckInbox email={sent} />;
  return (
    <>
      <AuthHeading
        title="One more step"
        text="Your account didn’t share an email address. Enter one and we’ll send a link to confirm it’s yours."
      />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {errors.root && <FormAlert>{errors.root.message}</FormAlert>}
        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <SubmitButton busy={isSubmitting} busyText="Sending…">
          Send confirmation link
        </SubmitButton>
      </form>
    </>
  );
}

function FromLink({ token }: { token: string }) {
  const router = useRouter();
  const { adopt } = useAuth();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void authPost('oauth/complete', { token }).then(async (r) => {
      if (!r.ok) return setFailed(true);
      const s = await refreshSession();
      if (!s) return setFailed(true);
      adopt(s);
      toast.success('Signed in successfully.');
      router.replace(safeNext((r.json as { next?: string } | null)?.next));
    });
  }, [token, adopt, router]);
  if (failed)
    return (
      <>
        <AuthHeading
          title={SOCIAL_ERRORS.invalid_state!.title}
          text="This confirmation link is invalid, expired or already used. Start the sign-in again."
        />
        <AuthLink href="/login">Back to sign in</AuthLink>
      </>
    );
  return <AuthHeading title="Finishing sign-in…" />;
}
