'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { oauthStartUrl } from '@/lib/auth-flow';
import { cn } from '@/lib/utils';
import { FormAlert } from './auth-ui';

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: async () => {
      const { data } = await api.GET('/api/v1/auth/config');
      if (!data) throw new Error('config');
      return data;
    },
    staleTime: 60_000,
  });
}

/** Official Google "G" (four-colour mark, unmodified). */
const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

/** Official Facebook "f" mark in Facebook blue. */
const FacebookF = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#1877F2"
      d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
    />
  </svg>
);

const btn =
  'flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[var(--radius-input)] border border-line-input bg-white text-[14.5px] font-semibold text-ink no-underline transition-colors duration-150 hover:border-[#C9CBD3] hover:bg-wash hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

/**
 * Continue with Google / Facebook. Each is a plain link to the API's start endpoint (a full-page redirect to the
 * provider and back), so no provider script runs in the page. A provider whose credentials aren't set on the server
 * is shown disabled with the reason, never as a button that goes nowhere.
 */
export function SocialButtons({ next }: { next: string }) {
  const cfg = useAuthConfig();
  const [busy, setBusy] = useState<'google' | 'facebook' | null>(null);
  const items = [
    {
      key: 'google' as const,
      label: 'Continue with Google',
      icon: <GoogleG />,
      on: cfg.data?.google,
    },
    {
      key: 'facebook' as const,
      label: 'Continue with Facebook',
      icon: <FacebookF />,
      on: cfg.data?.facebook,
    },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((p) =>
        p.on === false ? (
          <button
            key={p.key}
            type="button"
            disabled
            title="Not set up on this deployment yet"
            className={cn(btn, 'cursor-not-allowed opacity-55 hover:bg-white')}
          >
            {p.icon}
            {p.label}
          </button>
        ) : (
          <a
            key={p.key}
            href={cfg.isPending ? undefined : oauthStartUrl(p.key, next)}
            aria-disabled={cfg.isPending || busy !== null}
            onClick={(e) => {
              // One redirect at a time: a second click while leaving does nothing.
              if (busy || cfg.isPending) return e.preventDefault();
              setBusy(p.key);
            }}
            className={cn(
              btn,
              (cfg.isPending || (busy && busy !== p.key)) && 'pointer-events-none opacity-70',
            )}
          >
            {p.icon}
            {busy === p.key ? 'Redirecting…' : p.label}
          </a>
        ),
      )}
      {cfg.data && !cfg.data.google && !cfg.data.facebook && (
        <FormAlert tone="info">
          Google and Facebook sign-in aren’t set up on this deployment yet. Use email and password.
        </FormAlert>
      )}
    </div>
  );
}

export function OrDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-3 text-[12.5px] text-faint" role="separator">
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
