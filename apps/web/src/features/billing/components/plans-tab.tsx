'use client';

import { annualSavingsPct } from '@torio/contracts';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import { useBillingMutations, usePlans } from '../queries';
import type { Interval, Overview, Plan, Preview } from '../types';
import { Card, money, Notice, PlaceholderTag } from './bits';
import { ComparePlans } from './compare-plans';

const limitText = (v: number | undefined) =>
  v === undefined ? '—' : v < 0 ? 'Unlimited' : v.toLocaleString();

export function PlansTab({
  ws,
  o,
  canManage,
  initialInterval,
  onMessage,
}: {
  ws: string;
  o: Overview;
  canManage: boolean;
  initialInterval: Interval;
  onMessage: (m: string) => void;
}) {
  const plans = usePlans(ws);
  const [interval, setIntervalState] = useState<Interval>(initialInterval);
  const [target, setTarget] = useState<Plan | null>(null);
  const curInterval = o.subscription?.interval ?? 'MONTH';

  if (plans.isPending) return <Skeleton className="h-72 w-full" />;
  if (plans.isError || !plans.data) return <Notice tone="bad">Couldn&apos;t load plans.</Notice>;
  const list = plans.data;
  const price = (p: Plan) => (interval === 'YEAR' ? p.yearlyMinor : p.monthlyMinor);
  const label = (p: Plan) => {
    if (p.key === o.plan.key && (p.key === 'free' || interval === curInterval))
      return 'Current plan';
    if (p.key === o.plan.key) return interval === 'YEAR' ? 'Switch to yearly' : 'Switch to monthly';
    return p.rank > o.plan.rank ? 'Upgrade' : 'Downgrade';
  };
  const why = (p: Plan): string | null => {
    if (label(p) === 'Current plan') return 'This is your current plan';
    if (!canManage) return 'Only the workspace owner can change plans';
    if (!o.providerConfigured) return 'Payments aren’t connected yet';
    if (p.rank > 0 && !p.purchasable) return 'No provider price is configured for this plan';
    if (!o.subscription && !o.actions.canCheckout) return 'Checkout isn’t available right now';
    if (o.subscription && !o.actions.canChange && p.rank > 0)
      return 'Your subscription can’t be changed right now';
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Billing interval"
          className="inline-flex rounded-xl border border-line bg-white p-0.5"
        >
          {(['MONTH', 'YEAR'] as const).map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={interval === i}
              onClick={() => setIntervalState(i)}
              className={cn(
                'h-8 cursor-pointer rounded-[10px] px-3.5 text-[13px]',
                interval === i ? 'bg-primary-soft font-semibold text-primary-hover' : 'text-muted',
              )}
            >
              {i === 'MONTH' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
        {list.some((p) => annualSavingsPct(p) > 0) && (
          <span className="text-xs text-success">
            Save up to {Math.max(...list.map((p) => annualSavingsPct(p)))}% with yearly billing
          </span>
        )}
      </div>
      {list.some((p) => p.placeholderPricing) && (
        <Notice tone="warn">
          Prices on this page are <b>placeholders</b> until real pricing is configured. The amount
          actually charged is always the price set at the payment provider.
        </Notice>
      )}

      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-4">
        {list.map((p) => {
          const current = p.key === o.plan.key;
          const blocked = why(p);
          return (
            <li
              key={p.key}
              className={cn(
                'flex flex-col rounded-card border bg-white p-4',
                current ? 'border-primary shadow-[0_0_0_3px_rgba(91,92,226,0.12)]' : 'border-line',
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="m-0 text-[15px] font-semibold">{p.name}</h3>
                {current && (
                  <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10.5px] font-medium text-primary-hover">
                    Current
                  </span>
                )}
                {p.recommended && !current && (
                  <span className="rounded bg-success-soft px-1.5 py-0.5 text-[10.5px] font-medium text-success">
                    Recommended
                  </span>
                )}
              </div>
              <p className="m-0 mt-1 min-h-[34px] text-[12.5px] text-muted">{p.description}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-metric">{money(price(p), p.currency)}</span>
                <span className="text-xs text-faint">
                  {p.key === 'free' ? 'forever' : `/ ${interval === 'YEAR' ? 'year' : 'month'}`}
                </span>
              </div>
              <div className="mt-1 min-h-[18px] text-xs text-faint">
                {interval === 'YEAR' && annualSavingsPct(p) > 0 && (
                  <span className="text-success">Saves {annualSavingsPct(p)}% vs monthly</span>
                )}
                {p.placeholderPricing && (
                  <span className="ml-1">
                    <PlaceholderTag />
                  </span>
                )}
              </div>
              <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-[12.5px]">
                <li>{limitText(p.limits.members)} team members</li>
                <li>{limitText(p.limits.channels)} channels</li>
                <li>{limitText(p.limits.contacts)} contacts</li>
                <li>{limitText(p.limits.messages)} messages / month</li>
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-muted">
                    <Check size={13} className="mt-0.5 shrink-0 text-success" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-4">
                <Button
                  className="w-full"
                  variant={current ? 'outline' : 'primary'}
                  disabled={!!blocked}
                  title={blocked ?? undefined}
                  onClick={() => setTarget(p)}
                >
                  {label(p)}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Card title="Compare plans">
        <ComparePlans plans={list} currentKey={o.plan.key} interval={interval} />
      </Card>

      {target && (
        <ChangeDialog
          ws={ws}
          o={o}
          plan={target}
          interval={interval}
          onClose={() => setTarget(null)}
          onDone={(m) => {
            setTarget(null);
            onMessage(m);
          }}
        />
      )}
    </div>
  );
}

function ChangeDialog({
  ws,
  o,
  plan,
  interval,
  onClose,
  onDone,
}: {
  ws: string;
  o: Overview;
  plan: Plan;
  interval: Interval;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const m = useBillingMutations(ws);
  const [pv, setPv] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = m.preview.mutate;
  useEffect(() => {
    preview(
      { planKey: plan.key, interval },
      { onSuccess: setPv, onError: (e) => setError(e.message) },
    );
  }, [preview, plan.key, interval]);

  const needsAck = !!pv?.overages.length;
  const confirm = async () => {
    if (!pv || busy) return;
    setBusy(true);
    setError('');
    try {
      if (!o.subscription) {
        const r = await m.checkout.mutateAsync({ planKey: plan.key, interval });
        window.location.assign(r.url); // hosted checkout: card details never touch Torio
        return;
      }
      const r = await m.change.mutateAsync({
        planKey: plan.key,
        interval,
        acknowledgeOverage: ack,
      });
      onDone(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };

  const title = !pv
    ? 'Review plan change'
    : pv.kind === 'upgrade'
      ? `Upgrade to ${plan.name}`
      : pv.kind === 'downgrade'
        ? `Downgrade to ${plan.name}`
        : `Switch to ${interval === 'YEAR' ? 'yearly' : 'monthly'} billing`;
  return (
    <Modal
      title={title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !pv || !!pv.blockedReason || (needsAck && !ack)}
            onClick={() => void confirm()}
          >
            {busy ? 'Working…' : !o.subscription ? 'Continue to secure checkout' : 'Confirm change'}
          </Button>
        </>
      }
    >
      {!pv && !error && <Skeleton className="h-28 w-full" />}
      {pv && (
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="rounded-xl bg-wash p-3">
            <div className="font-semibold">
              {plan.name} · {money(pv.priceMinor, pv.currency)} /{' '}
              {interval === 'YEAR' ? 'year' : 'month'}
            </div>
            {pv.placeholderPricing && (
              <div className="mt-1">
                <PlaceholderTag />
              </div>
            )}
            <p className="mb-0 mt-2 text-muted">{pv.effective}</p>
            <p className="mb-0 mt-1 text-xs text-faint">
              Torio doesn&apos;t estimate prorated amounts. The payment provider calculates them and
              they appear on your next invoice.
            </p>
          </div>
          {pv.gained.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
                You get
              </div>
              <ul className="m-0 list-disc pl-5 text-muted">
                {pv.gained.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {pv.lost.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
                You lose
              </div>
              <ul className="m-0 list-disc pl-5 text-muted">
                {pv.lost.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {needsAck && (
            <div role="alert" className="rounded-xl bg-warning-soft p-3 text-warning">
              Your current usage is above this plan&apos;s limits:
              <ul className="m-0 mt-1 list-disc pl-5">
                {pv.overages.map((x) => (
                  <li key={x.metric}>
                    {x.label}: {x.used} used, limit {x.limit}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-start gap-2 text-ink">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5"
                />
                I understand I&apos;m over these limits and may need to remove items or upgrade
                again.
              </label>
            </div>
          )}
          {pv.blockedReason && <Notice tone="warn">{pv.blockedReason}</Notice>}
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </Modal>
  );
}
