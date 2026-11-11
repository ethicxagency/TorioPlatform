'use client';

import {
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  CreditCard,
  Hourglass,
  Repeat,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';
import { useTimeZone } from '@/features/settings/queries';
import { useBillingMutations } from '../queries';
import type { Overview } from '../types';
import { planIdentity } from './plan-identity';
import { Card, fmtDate, money, Notice, PlaceholderTag, SubscriptionBadge } from './bits';

export function OverviewTab({
  ws,
  o,
  canManage,
  go,
  onMessage,
}: {
  ws: string;
  o: Overview;
  canManage: boolean;
  go: (tab: string) => void;
  onMessage: (m: string) => void;
}) {
  const tz = useTimeZone();
  const m = useBillingMutations(ws);
  const [cancelling, setCancelling] = useState(false);
  const s = o.subscription;
  const price = s ? (s.interval === 'YEAR' ? o.plan.yearlyMinor : o.plan.monthlyMinor) : 0;
  const manage = (reason: string) => (canManage ? undefined : reason);
  const providerOff = !o.providerConfigured ? 'Payments aren’t connected yet' : undefined;
  const dis = (v: boolean, reason?: string) => ({ disabled: v || !!reason, title: reason });
  const id = planIdentity(o.plan.key);
  const ends = !!s && (s.cancelAtPeriodEnd || s.status === 'CANCELED');
  const blocks: { label: string; icon: LucideIcon; value: React.ReactNode }[] = [
    {
      label: 'Price',
      icon: Wallet,
      value: s ? (
        <>
          {`${money(price, o.plan.currency)} / ${s.interval === 'YEAR' ? 'year' : 'month'}`}
          {o.plan.placeholderPricing && <PlaceholderTag />}
        </>
      ) : (
        'Free'
      ),
    },
    {
      label: 'Billing cycle',
      icon: Repeat,
      value: s ? (s.interval === 'YEAR' ? 'Yearly' : 'Monthly') : 'No billing',
    },
    ...(s
      ? [
          { label: 'Started', icon: CalendarCheck, value: fmtDate(s.startedAt, tz) },
          {
            label: ends ? 'Access until' : 'Renews',
            icon: CalendarClock,
            value: fmtDate(s.currentPeriodEnd, tz),
          },
        ]
      : [{ label: 'Renewal', icon: CalendarClock, value: 'No renewal required' }]),
    ...(o.nextPayment
      ? [
          {
            label: 'Next payment',
            icon: CreditCard,
            value: (
              <>
                {money(o.nextPayment.amountMinor, o.nextPayment.currency)} on{' '}
                {fmtDate(o.nextPayment.date, tz)}
                {o.nextPayment.placeholderPricing && <PlaceholderTag />}
              </>
            ),
          },
        ]
      : []),
    ...(s?.trialEnd
      ? [{ label: 'Trial ends', icon: Hourglass, value: fmtDate(s.trialEnd, tz) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card title="Current subscription">
        <div className="flex flex-wrap items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
            style={{ backgroundColor: id.tint, color: id.color }}
          >
            <id.icon size={22} />
          </span>
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-[18px] font-semibold">{o.plan.name}</h3>
              <SubscriptionBadge o={o} />
            </div>
            <p className="m-0 mt-0.5 text-[13px] text-muted">{o.plan.description}</p>
          </div>
        </div>

        <dl className="m-0 mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((b) => (
            <div key={b.label} className="rounded-xl bg-wash px-3.5 py-3">
              <dt className="flex items-center gap-1.5 text-xs text-faint">
                <b.icon size={13} aria-hidden /> {b.label}
              </dt>
              <dd className="m-0 mt-1 flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-ink">
                {b.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {!s && (
            <Button onClick={() => go('plans')}>
              <ArrowUpRight aria-hidden /> Upgrade plan
            </Button>
          )}
          {s && o.plan.rank < 3 && !s.cancelAtPeriodEnd && (
            <Button
              onClick={() => go('plans')}
              {...dis(
                !o.actions.canChange,
                o.actions.canChange
                  ? manage('Only the workspace owner can change plans')
                  : 'Your subscription can’t be changed right now',
              )}
            >
              <ArrowUpRight aria-hidden /> Upgrade plan
            </Button>
          )}
          {s && (
            <Button
              variant="outline"
              onClick={() => go('plans')}
              {...dis(
                !o.actions.canChange,
                o.actions.canChange
                  ? manage('Only the workspace owner can change plans')
                  : 'Your subscription can’t be changed right now',
              )}
            >
              Change plan
            </Button>
          )}
          {o.actions.canRetryPayment && (
            <Button variant="outline" onClick={() => go('invoices')}>
              Retry payment
            </Button>
          )}
          {o.actions.canResume && (
            <Button
              variant="outline"
              disabled={!canManage || m.resume.isPending}
              title={manage('Only the workspace owner can reactivate')}
              onClick={() =>
                m.resume.mutate(undefined, {
                  onSuccess: (r) => onMessage(r.message),
                  onError: (e) => onMessage(e.message),
                })
              }
            >
              Reactivate subscription
            </Button>
          )}
          {s && (
            <Button
              variant="outline"
              className="text-danger"
              onClick={() => setCancelling(true)}
              {...dis(
                !o.actions.canCancel || !canManage,
                !canManage
                  ? manage('Only the workspace owner can cancel')
                  : !o.actions.canCancel
                    ? 'There is nothing to cancel right now'
                    : providerOff,
              )}
            >
              Cancel subscription
            </Button>
          )}
        </div>
        {o.actions.access === 'full_until_period_end' && s && (
          <div className="mt-3">
            <Notice tone="warn">
              Your subscription ends on {fmtDate(s.currentPeriodEnd, tz)}. You keep full access
              until then, then move to the Free plan. You can reactivate before that date.
            </Notice>
          </div>
        )}
        {s?.status === 'PAST_DUE' && (
          <div className="mt-3">
            <Notice tone="bad">
              Your last payment failed. Update your payment method and retry. Feature restrictions
              for past-due accounts aren’t enforced yet; the provider may cancel the subscription if
              payment keeps failing.
            </Notice>
          </div>
        )}
        {s?.status === 'CANCELED' && o.actions.access === 'none' && (
          <div className="mt-3">
            <Notice>
              This subscription has ended. You are on the Free plan and can start a new subscription
              from Plans & Pricing.
            </Notice>
          </div>
        )}
      </Card>

      {cancelling && (
        <CancelDialog
          ws={ws}
          o={o}
          onClose={() => setCancelling(false)}
          onDone={(msg) => {
            setCancelling(false);
            onMessage(msg);
          }}
        />
      )}
    </div>
  );
}

function CancelDialog({
  ws,
  o,
  onClose,
  onDone,
}: {
  ws: string;
  o: Overview;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const tz = useTimeZone();
  const m = useBillingMutations(ws);
  const [atEnd, setAtEnd] = useState(true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const end = fmtDate(o.subscription?.currentPeriodEnd, tz);
  return (
    <Modal
      title="Cancel subscription"
      onClose={m.cancel.isPending ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={m.cancel.isPending} onClick={onClose}>
            Keep subscription
          </Button>
          <Button
            className="bg-danger hover:bg-danger"
            disabled={m.cancel.isPending}
            onClick={() =>
              m.cancel.mutate(
                { atPeriodEnd: atEnd, ...(reason.trim() && { reason: reason.trim() }) },
                { onSuccess: (r) => onDone(r.message), onError: (e) => setError(e.message) },
              )
            }
          >
            {m.cancel.isPending ? 'Cancelling…' : atEnd ? 'Cancel at period end' : 'Cancel now'}
          </Button>
        </>
      }
    >
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 text-[13px]">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
          When should it end?
        </legend>
        <label className="flex items-start gap-2 rounded-xl border border-line p-3">
          <input
            type="radio"
            name="when"
            checked={atEnd}
            onChange={() => setAtEnd(true)}
            className="mt-0.5"
          />
          <span>
            <b>At the end of the billing period</b> ({end}). You keep full access until then. You
            can reactivate before it ends.
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-xl border border-line p-3">
          <input
            type="radio"
            name="when"
            checked={!atEnd}
            onChange={() => setAtEnd(false)}
            className="mt-0.5"
          />
          <span>
            <b>Immediately.</b> Your paid plan ends right away and you move to Free. Any refund for
            unused time is decided by the provider, not Torio.
          </span>
        </label>
      </fieldset>
      <label className="mt-3 flex flex-col gap-1 text-[12.5px] font-medium">
        Reason (optional)
        <textarea
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-line bg-white p-2.5 text-[13px] font-normal"
        />
      </label>
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </Modal>
  );
}
