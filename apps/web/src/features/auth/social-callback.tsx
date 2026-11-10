'use client';

import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { refreshSession } from '@/lib/api';
import { safeNext, SOCIAL_ERRORS } from '@/lib/auth-flow';
import { toast } from '@/lib/toast';
import { AuthHeading } from './auth-layout';
import { AuthLink } from './auth-ui';

/**
 * Where the API sends the browser after Google/Facebook. On success the API has already set the session cookie, so
 * this page only adopts it (through the normal refresh call) and moves on. On failure it explains the reason code.
 */
export function SocialCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const { adopt } = useAuth();
  const reason = params.get('reason');
  const failed = params.get('status') !== 'ok';
  const [lost, setLost] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (failed || ran.current) return;
    ran.current = true;
    void refreshSession().then((s) => {
      if (!s) return setLost(true);
      adopt(s);
      toast.success('Signed in successfully.');
      router.replace(safeNext(params.get('next')));
    });
  }, [failed, params, router, adopt]);

  if (failed || lost) {
    const e =
      SOCIAL_ERRORS[lost ? 'invalid_state' : (reason ?? '')] ?? SOCIAL_ERRORS.provider_error!;
    return (
      <>
        <AuthHeading title={e.title} text={e.text} />
        <AuthLink href="/login">Back to sign in</AuthLink>
      </>
    );
  }
  return (
    <div role="status" className="flex items-center gap-3 text-[15px] text-muted">
      <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />
      Signing you in…
    </div>
  );
}
