'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { useOverview } from '../queries';
import { Notice, SubscriptionBadge } from './bits';
import { OverviewTab } from './overview-tab';
import { CardsTab, HistoryTab, InfoTab, UsageTab } from './other-tabs';
import { PlansTab } from './plans-tab';

/** In-page sections, in reading order. `plans` is its own view (choosing a plan), reached from Manage Subscription. */
const SECTIONS = [
  { key: 'overview', label: 'Current plan' },
  { key: 'usage', label: 'Usage & Limits' },
  { key: 'payment-methods', label: 'Payment Methods' },
  { key: 'history', label: 'Billing History' },
  { key: 'info', label: 'Billing Information' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

export function BillingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useShell();
  const { workspaceId: ws, can, isLoading, error: wsError } = useWorkspace();
  const q = useOverview(can('billing:read') ? ws : null);
  const [message, setMessage] = useState('');
  const param = params.get('tab');
  const plansView = param === 'plans';
  const target = SECTIONS.find((t) => t.key === param)?.key as SectionKey | undefined;
  // Old ?tab=usage style links land on their section of the single page.
  useEffect(() => {
    if (!target || target === 'overview') return;
    document.getElementById(`billing-${target}`)?.scrollIntoView({ block: 'start' });
  }, [target, plansView, params]);
  const result = params.get('result');
  const canManage = can('billing:manage');
  const go = (t: string) =>
    router.replace(t === 'overview' ? '/billing' : `/billing?tab=${t}`, { scroll: false });
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
          Billing &amp; Subscriptions {o && <SubscriptionBadge o={o} />}
        </h1>
        {plansView ? (
          <Button variant="outline" onClick={() => go('overview')}>
            <ArrowLeft size={16} aria-hidden /> Back to billing
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={!o}
            onClick={() => go('plans')}
            title={canManage ? undefined : 'You can view plans; only the owner can change them'}
          >
            Manage Subscription
          </Button>
        )}
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

      {o && plansView && (
        <PlansTab
          ws={ws}
          o={o}
          canManage={canManage}
          initialInterval={o.subscription?.interval ?? 'MONTH'}
          onMessage={say}
        />
      )}

      {!plansView && (
        <>
          <nav
            aria-label="Billing sections"
            className="-mx-1 flex gap-1 overflow-x-auto border-b border-line-subtle px-1 [scrollbar-width:none]"
          >
            {SECTIONS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-current={
                  target === t.key || (!target && t.key === 'overview') ? 'location' : undefined
                }
                onClick={() => {
                  go(t.key);
                  document
                    .getElementById(`billing-${t.key}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={cn(
                  '-mb-px h-9 shrink-0 cursor-pointer border-b-2 px-3 text-[13px] font-medium transition-colors duration-150 motion-reduce:transition-none',
                  target === t.key || (!target && t.key === 'overview')
                    ? 'border-primary font-semibold text-primary-hover'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-col gap-8">
            {o && (
              <section id="billing-overview" className="scroll-mt-4">
                <OverviewTab ws={ws} o={o} canManage={canManage} go={go} onMessage={say} />
              </section>
            )}
            {o && (
              <section id="billing-usage" className="scroll-mt-4">
                <UsageTab ws={ws} o={o} go={go} />
              </section>
            )}
            {o && (
              <section id="billing-payment-methods" className="scroll-mt-4">
                <CardsTab ws={ws} o={o} canManage={canManage} />
              </section>
            )}
            <section id="billing-history" className="scroll-mt-4">
              <HistoryTab ws={ws} canManage={canManage} />
            </section>
            <section id="billing-info" className="scroll-mt-4">
              <InfoTab ws={ws} canManage={canManage} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
