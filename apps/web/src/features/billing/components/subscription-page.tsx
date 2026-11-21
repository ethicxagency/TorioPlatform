'use client';

import { planIntent } from '@/lib/plan-intent';
import { ArrowLeft, Info } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { useGatewayPayment, useOverview } from '../queries';
import { Notice, SubscriptionBadge } from './bits';
import { DetailsNotice } from './details-notice';
import { OverviewTab } from './overview-tab';
import { UsageSection } from './usage-section';
import { PlansTab } from './plans-tab';
import { PlanSummary } from './plan-summary';

/**
 * Settings → Subscription: the plan (with its actions), usage against its limits, and choosing a plan. Invoices, payment
 * methods and billing details live on the Billing page. There is no subscription event history to show: Torio does not
 * keep one that is exposed, and nothing is invented in its place.
 */
/** What happened to the payment the customer just came back from, from the server's check with the gateway, not from the URL. */
function GatewayResult({
  result,
  payment,
  loading,
  error,
}: {
  result: string | null;
  payment: { status: string; tranId: string; reason: string | null } | undefined;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <Notice>Checking your payment with SSLCommerz…</Notice>;
  if (error) return <Notice tone="bad">We couldn&apos;t check that payment: {error}</Notice>;
  if (!payment) return null;
  const ref = <span className="text-faint"> Reference {payment.tranId}.</span>;
  switch (payment.status) {
    case 'PAID':
      return (
        <Notice>
          <b>Payment confirmed.</b> Your plan is active.{ref}
        </Notice>
      );
    case 'INITIATED':
    case 'PENDING':
      return (
        <Notice>
          {result === 'cancelled' || result === 'failed'
            ? 'This payment was not completed. Nothing was changed.'
            : 'Your payment is still being confirmed by SSLCommerz. This page updates by itself; your plan starts only once it is confirmed.'}
          {ref}
        </Notice>
      );
    case 'CANCELLED':
      return <Notice>The payment was cancelled. Nothing was changed.{ref}</Notice>;
    case 'FAILED':
      return (
        <Notice tone="bad">
          The payment did not go through{payment.reason ? `: ${payment.reason}` : ''}. Nothing was
          changed.{ref}
        </Notice>
      );
    case 'REJECTED':
    case 'REVIEW':
      return (
        <Notice tone="warn">
          We couldn&apos;t confirm this payment automatically, so your plan has not changed
          {payment.reason ? ` (${payment.reason})` : ''}. Contact support with the reference.{ref}
        </Notice>
      );
    default:
      return (
        <Notice>
          Payment status: {payment.status}.{ref}
        </Notice>
      );
  }
}

export function SubscriptionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useShell();
  const { workspaceId: ws, can, isLoading, error: wsError } = useWorkspace();
  const q = useOverview(can('billing:read') ? ws : null);
  const [message, setMessage] = useState('');
  const plansView = params.get('tab') === 'plans';
  // A plan picked on the public pricing page: shown highlighted. Nothing is bought until the owner confirms here.
  const chosen = planIntent(params);
  const result = params.get('result');
  const tran = params.get('tran');
  const payment = useGatewayPayment(can('billing:read') ? ws : null, tran);
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
        <div className="min-w-0">
          <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-page-title">
            Subscription &amp; Billing {o && <SubscriptionBadge o={o} />}
          </h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Manage your plan, explore available features and control your workspace subscription.
          </p>
        </div>
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
      {o && plansView && <PlanSummary o={o} />}
      {plansView && <DetailsNotice ws={ws} />}
      {o && !o.providerConfigured && (
        <Notice tone="warn" icon={Info}>
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
      {tran ? (
        <GatewayResult
          result={result}
          payment={payment.data}
          loading={payment.isPending}
          error={payment.isError ? payment.error.message : null}
        />
      ) : (
        <>
          {result === 'success' && (
            <Notice>
              Back from the provider. Your subscription appears here as soon as the provider
              confirms it (usually within seconds).
            </Notice>
          )}
          {result === 'cancelled' && <Notice>Checkout was cancelled. Nothing was changed.</Notice>}
        </>
      )}
      {message && <Notice>{message}</Notice>}

      {o && plansView && (
        <PlansTab
          ws={ws}
          o={o}
          canManage={canManage}
          initialInterval={chosen?.interval ?? o.subscription?.interval ?? 'MONTH'}
          focusPlan={chosen?.plan ?? null}
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
            <UsageSection ws={ws} o={o} go={go} />
          </section>
        </>
      )}
    </div>
  );
}
