'use client';

import { formatMoney } from '../money';
import { Check, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCustomerConversations, useCustomers } from '@/features/customers/queries';
import { EMPTY_CUSTOMER_FILTERS, type CustomerItem } from '@/features/customers/types';
import { Modal } from '@/features/leads/components/modal';
import { useDebounced } from '@/features/leads/use-debounced';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { CHANNEL_LABEL, DEFAULT_CURRENCY, orderCurrencies } from '../constants';
import type { CreateOrderBody } from '../queries';
import {
  LinesEditor,
  newLine,
  parsePricing,
  PricingFields,
  TotalsSummary,
  validateLines,
  type Line,
  type Pricing,
} from './order-fields';

interface Props {
  /** Pre-selected customer, e.g. when creating from a customer profile. */
  customer?: { id: string; name: string } | null;
  onClose: () => void;
  onCreate: (body: CreateOrderBody) => Promise<unknown>;
}

const STEPS = ['Customer', 'Items', 'Pricing', 'Details', 'Review'] as const;
const field = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink';

export function CreateOrderDialog({ customer: initial, onClose, onCreate }: Props) {
  const { workspaceId: ws, workspace } = useWorkspace();
  const [step, setStep] = useState(initial ? 1 : 0);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(initial ?? null);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const found = useCustomers(ws, {
    filters: { ...EMPTY_CUSTOMER_FILTERS, q },
    sort: 'createdAt',
    dir: 'desc',
    page: 1,
    pageSize: 8,
  });
  const convs = useCustomerConversations(ws, customer?.id ?? null);
  const currencyChoices = orderCurrencies(workspace?.defaultCurrency);
  const [currency, setCurrency] = useState<string>(currencyChoices[0] ?? DEFAULT_CURRENCY);
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [pricing, setPricing] = useState<Pricing>({ discount: '', shipping: '', tax: '' });
  const [address, setAddress] = useState('');
  const [method, setMethod] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One key per dialog session: a retry after a network failure can't create a second order.
  const requestId = useRef(crypto.randomUUID());

  const v = useMemo(() => validateLines(lines), [lines]);
  const pr = parsePricing(pricing);
  const pricingOk = Object.keys(pr.errors).length === 0;
  const discountOk =
    !v.items.length ||
    pr.discount <= v.items.reduce((a, i) => a + i.quantity * i.unitPriceMinor, 0);

  const canNext =
    step === 0
      ? !!customer
      : step === 1
        ? v.items.length === lines.length
        : step === 2
          ? pricingOk && discountOk
          : true;
  const next = () => {
    if (!canNext) return setShowErrors(true);
    setShowErrors(false);
    setStep((s) => s + 1);
  };

  const submit = async () => {
    if (!customer || busy) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({
        customerId: customer.id,
        ...(conversationId && { conversationId }),
        currency: currency as CreateOrderBody['currency'],
        items: v.items,
        discountMinor: pr.discount,
        shippingMinor: pr.shipping,
        taxMinor: pr.tax,
        ...(address.trim() && { shippingAddress: address.trim() }),
        ...(method.trim() && { shippingMethod: method.trim() }),
        ...(note.trim() && { note: note.trim() }),
        requestId: requestId.current,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the order');
      setBusy(false);
    }
  };

  const customers = found.data?.data ?? [];
  const pickable = (c: CustomerItem) => ({ id: c.id, name: c.name });

  return (
    <Modal
      title="Create order"
      description={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
      onClose={busy ? () => undefined : onClose}
      className="sm:max-w-[640px]"
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {step > (initial ? 1 : 0) && (
            <Button variant="outline" disabled={busy} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Continue</Button>
          ) : (
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? 'Creating…' : 'Create order'}
            </Button>
          )}
        </>
      }
    >
      <ol aria-label="Progress" className="m-0 mb-4 flex list-none gap-1.5 p-0">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i < step ? 'bg-primary' : i === step ? 'bg-primary/60' : 'bg-line',
            )}
          >
            <span className="sr-only">{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <label className="flex h-9 items-center gap-2 rounded-[10px] border border-line bg-white px-2.5">
            <Search size={15} className="text-faint" aria-hidden />
            <input
              type="search"
              aria-label="Search customers"
              placeholder="Search by name, email or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
            />
          </label>
          <ul className="m-0 flex max-h-[280px] list-none flex-col gap-1.5 overflow-y-auto p-0">
            {found.isPending && <li className="text-[13px] text-muted">Loading customers…</li>}
            {found.isError && (
              <li role="alert" className="text-[13px] text-danger">
                Couldn&apos;t load customers.
              </li>
            )}
            {!found.isPending && !found.isError && customers.length === 0 && (
              <li className="text-[13px] text-muted">No customers match.</li>
            )}
            {customers.map((c) => {
              const on = customer?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCustomer(pickable(c))}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left',
                      on ? 'border-primary bg-primary-soft' : 'border-line hover:bg-wash',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}
                      </span>
                    </span>
                    {on && <Check size={15} className="text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="m-0 text-[12.5px] text-muted">
            Need someone new? Add them on the{' '}
            <Link href="/customers" className="text-primary">
              Customers page
            </Link>{' '}
            first, so a duplicate isn&apos;t created here.
          </p>
          {showErrors && !customer && (
            <div role="alert" className="text-xs text-danger">
              Choose a customer to continue.
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <label className="flex w-[140px] flex-col gap-1 text-[11.5px] text-faint">
            Currency
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={field}
            >
              {currencyChoices.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <LinesEditor
            lines={lines}
            currency={currency}
            errors={showErrors ? v.errors : {}}
            onChange={setLines}
          />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <PricingFields
            value={pricing}
            currency={currency}
            errors={showErrors ? pr.errors : {}}
            onChange={setPricing}
          />
          {showErrors && !discountOk && (
            <div role="alert" className="text-xs text-danger">
              The discount can&apos;t be more than the subtotal.
            </div>
          )}
          <TotalsSummary items={v.items} pricing={pr} currency={currency} />
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-wash p-3 text-[12.5px] text-muted">
            The order starts as <b>Pending</b>, <b>Unpaid</b> and <b>Unfulfilled</b>. Torio
            doesn&apos;t process payments: after you create it, record payments you&apos;ve received
            by hand from the order.
          </div>
          <label className="flex flex-col gap-1 text-[11.5px] text-faint">
            Shipping address (optional)
            <textarea
              value={address}
              maxLength={500}
              rows={2}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-lg border border-line bg-white p-2.5 text-[13px] text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-faint">
            Shipping method (optional)
            <input
              value={method}
              maxLength={120}
              onChange={(e) => setMethod(e.target.value)}
              className={field}
            />
          </label>
          {(convs.data?.length ?? 0) > 0 && (
            <label className="flex flex-col gap-1 text-[11.5px] text-faint">
              Link to a conversation (optional)
              <select
                value={conversationId}
                onChange={(e) => setConversationId(e.target.value)}
                className={field}
              >
                <option value="">Not linked</option>
                {convs.data!.map((c) => (
                  <option key={c.id} value={c.id}>
                    {CHANNEL_LABEL[c.provider]} · {c.preview.slice(0, 40) || 'Conversation'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-[11.5px] text-faint">
            Internal note (optional, never shown to the customer)
            <textarea
              value={note}
              maxLength={2000}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-lg border border-line bg-white p-2.5 text-[13px] text-ink"
            />
          </label>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-3 text-[13px]">
          <div>
            <div className="text-[11.5px] text-faint">Customer</div>
            <div className="font-medium">{customer?.name}</div>
          </div>
          <div>
            <div className="mb-1 text-[11.5px] text-faint">Items</div>
            <ul className="m-0 list-none p-0">
              {v.items.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-3 py-0.5">
                  <span className="truncate">
                    {i.quantity} × {i.name}
                  </span>
                  <span className="tabular-nums text-muted">
                    {formatMoney(i.quantity * i.unitPriceMinor, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <TotalsSummary items={v.items} pricing={pr} currency={currency} />
          {(address || method) && (
            <div className="text-muted">
              Ship to {address || '—'}
              {method && ` · ${method}`}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
            >
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
