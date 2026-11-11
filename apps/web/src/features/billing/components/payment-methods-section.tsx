'use client';

import { CreditCard, PlugZap, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useBillingMutations, useCards } from '../queries';
import type { Overview, SavedCard } from '../types';
import { IconTile, RowMenu } from './billing-ui';

/**
 * Saved payment methods, managed through the payment provider only: a card is added on the provider's own secure page,
 * and Torio keeps just the brand, last four digits and expiry. When no provider is connected there is no add action at
 * all, only one compact status explaining why; no card registration is ever simulated.
 */
export function PaymentMethodsSection({
  ws,
  o,
  canManage,
}: {
  ws: string;
  o: Overview;
  canManage: boolean;
}) {
  const { toast } = useShell();
  const q = useCards(ws);
  const m = useBillingMutations(ws);
  const [removing, setRemoving] = useState<SavedCard | null>(null);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
  const connected = o.providerConfigured;
  const off = !connected
    ? 'Unavailable until a payment provider is connected'
    : !canManage
      ? 'Only the workspace owner can manage payment methods'
      : undefined;
  const cards = q.data ?? [];

  return (
    <section
      aria-label="Payment methods"
      className="rounded-[14px] border border-line bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <IconTile icon={CreditCard} color="#5B5CE2" />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-semibold">Payment methods</h2>
          <p className="m-0 text-[12.5px] text-muted">
            Cards are added on the payment provider&apos;s secure page.
          </p>
        </div>
        {connected && (
          <Button
            size="sm"
            disabled={!!off || m.cardSession.isPending}
            title={off}
            onClick={() =>
              m.cardSession.mutate(undefined, {
                onSuccess: (r) => window.location.assign(r.url),
                onError: err,
              })
            }
          >
            <Plus size={14} aria-hidden /> Add payment method
          </Button>
        )}
      </div>

      {!connected && (
        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-xl border border-[#F3DFB6] bg-[#FFFAF0] px-3.5 py-3"
        >
          <IconTile icon={PlugZap} color="#D97706" size={28} />
          <div>
            <div className="text-[13px] font-semibold text-ink">Payment provider not connected</div>
            <p className="m-0 text-[12.5px] text-muted">
              Payment methods and online payments are currently unavailable. Adding a card becomes
              possible once a provider is connected.
            </p>
          </div>
        </div>
      )}

      {q.isPending && <Skeleton className="mt-4 h-20 w-full" />}
      {q.isError && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
        >
          Couldn&apos;t load payment methods.
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {q.data && cards.length === 0 && connected && (
        <p className="m-0 mt-4 rounded-xl bg-wash px-3.5 py-3 text-[13px] text-muted">
          No saved payment methods yet.
        </p>
      )}
      {cards.length > 0 && (
        <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
          {cards.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-3 rounded-xl border border-line p-3.5 transition-colors duration-150 hover:border-line-input motion-reduce:transition-none"
            >
              <span
                aria-hidden
                className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-wash text-muted"
              >
                <CreditCard size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold capitalize text-ink">{c.brand}</span>
                  {c.isDefault && (
                    <span className="rounded-full bg-primary-soft px-2 py-px text-[10.5px] font-semibold text-primary-hover">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-[13px] tabular-nums text-ink">•••• {c.last4}</div>
                <div className="text-xs text-faint">
                  Expires {String(c.expMonth).padStart(2, '0')}/{c.expYear}
                </div>
                {!c.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={!!off || m.makeDefault.isPending}
                    title={off}
                    onClick={() =>
                      m.makeDefault.mutate(c.id, {
                        onSuccess: () => toast('Default payment method updated'),
                        onError: err,
                      })
                    }
                  >
                    Set as default
                  </Button>
                )}
              </div>
              <RowMenu
                label={`More actions for ${c.brand} ending ${c.last4}`}
                actions={[
                  {
                    label: 'Remove payment method',
                    icon: Trash2,
                    danger: true,
                    disabled: !!off,
                    onSelect: () => setRemoving(c),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.brand} •••• ${removing.last4}?`}
          body="The card is removed from your account at the payment provider. Future charges can’t use it."
          confirmLabel="Remove"
          busy={m.removeCard.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            m.removeCard.mutate(removing.id, {
              onSuccess: () => {
                toast('Payment method removed');
                setRemoving(null);
              },
              onError: (e) => {
                err(e);
                setRemoving(null);
              },
            })
          }
        />
      )}
    </section>
  );
}
