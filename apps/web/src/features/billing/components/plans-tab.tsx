'use client';

import { annualSavingsPct } from '@torio/contracts';
import {
  Check,
  Contact,
  MessageSquare,
  Plug,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import { useBillingMutations, usePlans } from '../queries';
import type { Interval, Overview, Plan, Preview } from '../types';
import { Card, money, Notice, PlaceholderTag } from './bits';
import { ComparePlans } from './compare-plans';
import { planIdentity } from './plan-identity';

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
          className="relative inline-grid grid-cols-2 rounded-xl border border-line bg-wash p-0.5"
        >
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[10px] bg-white shadow-[0_1px_3px_rgba(0,55,112,0.12)] transition-transform duration-200 ease-out motion-reduce:transition-none',
              interval === 'YEAR' && 'translate-x-full',
            )}
          />
          {(['MONTH', 'YEAR'] as const).map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={interval === i}
              onClick={() => setIntervalState(i)}
              className={cn(
                'relative z-10 h-8 min-w-[84px] cursor-pointer rounded-[10px] border-none bg-transparent px-3.5 text-[13px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none',
                interval === i ? 'font-semibold text-primary-hover' : 'text-muted hover:text-ink',
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
        <Notice tone="warn" icon={TriangleAlert}>
          Prices on this page are <b>placeholders</b> until real pricing is configured. The amount
          actually charged is always the price set at the payment provider.
        </Notice>
      )}

      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-4">
        {list.map((p) => {
          const current = p.key === o.plan.key;
          const blocked = why(p);
          const id = planIdentity(p.key);
          const featured = p.recommended && !current;
          const premium = p.key === 'scale' && !current;
          const reason = current ? null : blocked;
          const limitsRows: [LucideIcon, string][] = [
            [Users, `${limitText(p.limits.members)} team members`],
            [Plug, `${limitText(p.limits.channels)} channels`],
            [Contact, `${limitText(p.limits.contacts)} contacts`],
            [MessageSquare, `${limitText(p.limits.messages)} messages / month`],
          ];
          return (
            <li
              key={p.key}
              className={cn(
                'relative flex flex-col rounded-card border bg-white p-4 transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(0,55,112,0.08)] motion-reduce:transition-none sm:p-5',
                current
                  ? 'border-primary shadow-[0_0_0_3px_rgba(91,92,226,0.12)]'
                  : featured
                    ? 'border-primary-line shadow-[0_0_0_3px_rgba(91,92,226,0.08)]'
                    : premium
                      ? 'border-[#DDD0F7]'
                      : 'border-line',
              )}
              style={
                premium
                  ? { backgroundImage: 'linear-gradient(180deg,#FAF7FF,#fff 120px)' }
                  : undefined
              }
            >
              {(current || featured) && (
                <span
                  className={cn(
                    'absolute -top-2.5 right-4 rounded-full border px-2 py-0.5 text-[10.5px] font-medium',
                    current
                      ? 'border-primary-line bg-primary-soft text-primary-hover'
                      : 'border-[#BFE8CF] bg-success-soft text-success',
                  )}
                >
                  {current ? 'Current' : 'Recommended'}
                </span>
              )}
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                  style={{ backgroundColor: id.tint, color: id.color }}
                >
                  <id.icon size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 text-[16px] font-semibold">{p.name}</h3>
                  <p className="m-0 mt-1 min-h-[38px] text-[12.5px] leading-snug text-muted">
                    {p.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[28px] font-metric leading-none">
                  {money(price(p), p.currency)}
                </span>
                <span className="text-[12.5px] text-faint">
                  {p.key === 'free' ? 'Forever' : `/ ${interval === 'YEAR' ? 'year' : 'month'}`}
                </span>
              </div>
              <div className="mt-1.5 flex min-h-[22px] flex-wrap items-center gap-1.5 text-xs">
                {interval === 'YEAR' && annualSavingsPct(p) > 0 && (
                  <span className="text-success">Saves {annualSavingsPct(p)}% vs monthly</span>
                )}
                {p.placeholderPricing && <PlaceholderTag />}
              </div>
              <ul className="m-0 mt-4 flex list-none flex-col gap-2 border-t border-line-subtle p-0 pt-4 text-[13px]">
                {limitsRows.map(([Icon, text]) => (
                  <li key={text} className="flex items-center gap-2.5 text-ink">
                    <Icon size={14} aria-hidden className="shrink-0 text-faint" />
                    {text}
                  </li>
                ))}
              </ul>
              {p.features.length > 0 && (
                <ul className="m-0 mt-3 flex list-none flex-col gap-2 border-t border-line-subtle p-0 pt-3 text-[12.5px]">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-muted">
                      <Check size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-5">
                <Button
                  className="w-full"
                  variant={current ? 'outline' : 'primary'}
                  disabled={!!blocked}
                  aria-describedby={reason ? `why-${p.key}` : undefined}
                  title={blocked ?? undefined}
                  onClick={() => setTarget(p)}
                >
                  {label(p)}
                </Button>
                <p
                  id={`why-${p.key}`}
                  className="m-0 mt-1.5 min-h-[16px] text-center text-[11.5px] text-faint"
                >
                  {reason}
                </p>
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
