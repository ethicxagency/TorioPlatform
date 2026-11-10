'use client';

import { cn } from '@/lib/utils';
import { useState } from 'react';
import { AUTH_STATUS, CustomerAuthApp, useAuthCfg } from './meta-auth-app';
import { MetaDeveloperPage, STATUS, useCfg } from './meta-developer';

/**
 * Super Admin → Meta Developer. Torio uses two separate Meta apps: Torio Platform (Business Messaging: Messenger,
 * Instagram, WhatsApp) and Torio Auth (customer Facebook Login). Each has its own settings, secret, test and status;
 * a problem in one never changes the other.
 */
export function MetaAppsPage() {
  const [app, setApp] = useState<'business' | 'auth'>('business');
  const biz = useCfg();
  const auth = useAuthCfg();
  const tabs = [
    {
      key: 'business' as const,
      label: 'Business Messaging',
      sub: 'Torio Platform: Messenger, Instagram, WhatsApp',
      st: biz.data ? STATUS[biz.data.status] : null,
    },
    {
      key: 'auth' as const,
      label: 'Customer Authentication',
      sub: 'Torio Auth: customer Facebook Login',
      st: auth.data ? AUTH_STATUS[auth.data.status] : null,
    },
  ];
  return (
    <div>
      <div role="tablist" aria-label="Meta apps" className="mb-5 grid gap-2 sm:grid-cols-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={app === t.key}
            onClick={() => setApp(t.key)}
            className={cn(
              'flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none',
              app === t.key
                ? 'border-primary bg-primary-soft'
                : 'border-line bg-white hover:bg-wash',
            )}
          >
            <span className="flex w-full items-center justify-between gap-2 text-[14px] font-semibold">
              {t.label}
              {t.st && (
                <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', t.st.cls)}>
                  {t.st.label}
                </span>
              )}
            </span>
            <span className="text-xs text-muted">{t.sub}</span>
          </button>
        ))}
      </div>
      {app === 'business' ? <MetaDeveloperPage /> : <CustomerAuthApp />}
    </div>
  );
}
