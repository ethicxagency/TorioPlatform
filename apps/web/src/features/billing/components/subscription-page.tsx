'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { useOverview } from '../queries';
import { Notice, SubscriptionBadge } from './bits';
import { OverviewTab } from './overview-tab';
import { UsageTab } from './other-tabs';
import { PlansTab } from './plans-tab';

/**
 * Settings → Subscription: the plan (with its actions), usage against its limits, and choosing a plan. Invoices, payment
 * methods and billing details live on the Billing page. There is no subscription event history to show: Torio does not
 * keep one that is exposed, and nothing is invented in its place.
 */
export function SubscriptionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useShell();
  const { workspaceId: ws, can, isLoading, error: wsError } = useWorkspace();
  const q = useOverview(can('billing:read') ? ws : null);
  const [message, setMessage] = useState('');
  const plansView = params.get('tab') === 'plans';
  const result = params.get('result');
  const canManage = can('billing:manage');
  // ?tab=usage (an older link) scrolls to the usage section.
  const focusUsage = params.get('tab') === 'usage';
  useEffect(() => {
    if (focusUsage)
      document.getElementById('subscription-usage')?.scrollIntoView({ block: 'start' });
  }, [focusUsage, q.data]);
  const go = (t: string) => {
    if (t === 'invoices') router.push('/billing/invoices');
    else
      router.replace(t === 'plans' ? '/billing/subscription?tab=plans' : '/billing/subscription', {
        scroll: false,
      });
  };
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
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-page-title">
          Subscription {o && <SubscriptionBadge o={o} />}
        </h1>
        {plansView && (
          <Button variant="outline" onClick={() => go('overview')}>
            <ArrowLeft size={16} aria-hidden /> Back to subscription
          </Button>
        )}
      </header>

      {q.isPending && <Skeleton className="h-24 w-full" />}
      {q.isError && !o && (
        <Notice tone="bad">Couldn&apos;t load your subscription. {q.error?.message}</Notice>
      )}
      {o && !o.providerConfigured && (
        <Notice tone="warn">
          Payments aren&apos;t connected, so plans can be reviewed but nothing can be purchased or
          changed yet.
        </Notice>
      )}
      {o?.hasFailedPayment && (
        <Notice tone="bad">
          A payment failed. Retry it from{' '}
          <button
            type="button"
            onClick={() => go('invoices')}
            className="cursor-pointer font-semibold underline"
          >
            Billing
          </button>{' '}
          to keep your subscription.
        </Notice>
      )}
      {result === 'success' && (
        <Notice>
          Back from the provider. Your subscription appears here as soon as the provider confirms it
          (usually within seconds).
        </Notice>
      )}
      {result === 'cancelled' && <Notice>Checkout was cancelled. Nothing was changed.</Notice>}
      {message && <Notice>{message}</Notice>}

      {o && plansView && (
        <PlansTab
          ws={ws}
          o={o}
          canManage={canManage}
          initialInterval={o.subscription?.interval ?? 'MONTH'}
          onMessage={say}
        />
      )}
      {o && !plansView && (
        <>
          <section id="subscription-plan" className="scroll-mt-4">
            <OverviewTab ws={ws} o={o} canManage={canManage} go={go} onMessage={say} />
          </section>
          <section
            id="subscription-usage"
            aria-label="Usage and limits"
            className="flex scroll-mt-4 flex-col gap-3"
          >
            <h2 className="m-0 text-[15px] font-semibold">Usage &amp; limits</h2>
            <UsageTab ws={ws} o={o} go={go} />
          </section>
        </>
      )}
    </div>
  );
}
