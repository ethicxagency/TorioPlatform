'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { useOverview } from '../queries';
import { Notice, SubscriptionBadge } from './bits';
import { OverviewTab } from './overview-tab';
import { CardsTab, HistoryTab, InfoTab, UsageTab } from './other-tabs';
import { PlansTab } from './plans-tab';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'plans', label: 'Plans & Pricing' },
  { key: 'usage', label: 'Usage & Limits' },
  { key: 'payment-methods', label: 'Payment Methods' },
  { key: 'history', label: 'Billing History' },
  { key: 'info', label: 'Billing Information' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function BillingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useShell();
  const { workspaceId: ws, can, isLoading, error: wsError } = useWorkspace();
  const q = useOverview(can('billing:read') ? ws : null);
  const [message, setMessage] = useState('');
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'overview') as Tab;
  const result = params.get('result');
  const canManage = can('billing:manage');
  const go = (t: string) => router.replace(t === 'overview' ? '/billing' : `/billing?tab=${t}`);
  const say = (m: string) => {
    setMessage(m);
    toast(m);
  };

  if (isLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (wsError || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('billing:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Billing is available to workspace owners and admins.
      </div>
    );
  const o = q.data;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pb-10 pt-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-faint">
            Workspace / <span className="text-muted">Billing & Subscriptions</span>
          </nav>
          <h1 className="m-0 flex flex-wrap items-center gap-2 font-page-title">
            Billing &amp; Subscriptions {o && <SubscriptionBadge o={o} />}
          </h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Manage your subscription, payments, invoices, and usage.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!o}
          onClick={() => go('plans')}
          title={canManage ? undefined : 'You can view plans; only the owner can change them'}
        >
          Manage Subscription
        </Button>
      </header>

      {q.isPending && <Skeleton className="h-24 w-full" />}
      {q.isError && !o && (
        <Notice tone="bad">Couldn&apos;t load billing. {q.error?.message}</Notice>
      )}
      {o && !o.providerConfigured && (
        <Notice tone="warn">
          <b>Payments aren&apos;t connected.</b> You can review plans, usage and billing details,
          but nothing can be purchased, changed or paid until a payment provider is configured.
          Nothing here is simulated.
        </Notice>
      )}
      {o?.hasFailedPayment && (
        <Notice tone="bad">
          A payment failed. Update your payment method and retry the payment from Billing History to
          keep your subscription.
        </Notice>
      )}
      {result === 'success' && (
        <Notice>
          Back from the provider. Your subscription or payment method appears here as soon as the
          provider confirms it (usually within seconds). Refresh if it hasn&apos;t shown up yet.
        </Notice>
      )}
      {result === 'cancelled' && <Notice>Checkout was cancelled. Nothing was changed.</Notice>}
      {message && <Notice>{message}</Notice>}

      <div
        role="tablist"
        aria-label="Billing sections"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            className={cn(
              '-mb-px h-9 shrink-0 cursor-pointer border-b-2 px-3 text-[13px]',
              tab === t.key
                ? 'border-primary font-semibold text-primary-hover'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {o && tab === 'overview' && (
        <OverviewTab ws={ws} o={o} canManage={canManage} go={go} onMessage={say} />
      )}
      {o && tab === 'plans' && (
        <PlansTab
          ws={ws}
          o={o}
          canManage={canManage}
          initialInterval={o.subscription?.interval ?? 'MONTH'}
          onMessage={say}
        />
      )}
      {o && tab === 'usage' && <UsageTab ws={ws} o={o} go={go} />}
      {o && tab === 'payment-methods' && <CardsTab ws={ws} o={o} canManage={canManage} />}
      {tab === 'history' && <HistoryTab ws={ws} canManage={canManage} />}
      {tab === 'info' && <InfoTab ws={ws} canManage={canManage} />}
    </div>
  );
}
