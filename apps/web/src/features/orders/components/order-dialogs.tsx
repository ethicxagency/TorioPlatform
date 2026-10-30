'use client';

import { editBlockReason, outstandingMinor } from '@torio/contracts';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';
import { METHOD_LABEL } from '../constants';
import { formatMoney, parseMinor, toMajor } from '../money';
import type { FulfillmentBody, PaymentBody, UpdateOrderBody } from '../queries';
import type { OrderDetail, PaymentMethod } from '../types';
import {
  LinesEditor,
  linesFromOrder,
  parsePricing,
  PricingFields,
  pricingFromOrder,
  TotalsSummary,
  validateLines,
  type Line,
  type Pricing,
} from './order-fields';

const field = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink';

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };
  return { busy, error, run };
}
const ErrorBox = ({ text }: { text: string }) =>
  text ? (
    <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]">
      {text}
    </div>
  ) : null;

export function PaymentDialog({
  order,
  onClose,
  onSubmit,
}: {
  order: OrderDetail;
  onClose: () => void;
  onSubmit: (body: PaymentBody) => Promise<unknown>;
}) {
  const due = outstandingMinor(order);
  const [amount, setAmount] = useState(toMajor(due));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  // Stable per dialog: a retried submit can't record the same payment twice.
  const requestId = useRef(crypto.randomUUID());
  const s = useSubmit(onClose);
  const minor = parseMinor(amount);
  const err =
    minor === null || minor < 1
      ? 'Enter an amount like 25.00'
      : minor > due
        ? `Can’t be more than the balance (${formatMoney(due, order.currency)})`
        : '';
  return (
    <Modal
      title={`Record payment · #${order.number}`}
      description={`Balance due ${formatMoney(due, order.currency)}`}
      onClose={s.busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={s.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={s.busy}
            onClick={() => {
              setTouched(true);
              if (err || minor === null) return;
              void s.run(() =>
                onSubmit({
                  amountMinor: minor,
                  method,
                  ...(reference.trim() && { reference: reference.trim() }),
                  ...(note.trim() && { note: note.trim() }),
                  requestId: requestId.current,
                }),
              );
            }}
          >
            {s.busy ? 'Saving…' : 'Record payment'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-wash p-3 text-[12.5px] text-muted">
          This logs a payment you already received (cash, transfer, …). Torio doesn&apos;t charge
          cards or contact a payment provider, and can&apos;t refund.
        </div>
        <label className="flex flex-col gap-1 text-[11.5px] text-faint">
          Amount ({order.currency})
          <input
            inputMode="decimal"
            value={amount}
            aria-invalid={touched && !!err}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            className={field}
          />
          {touched && err && (
            <span role="alert" className="text-xs text-danger">
              {err}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-faint">
          Method
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className={field}
          >
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-faint">
          Reference (optional, never a card number)
          <input
            value={reference}
            maxLength={120}
            onChange={(e) => setReference(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-faint">
          Note (optional)
          <input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            className={field}
          />
        </label>
        <ErrorBox text={s.error} />
      </div>
    </Modal>
  );
}

export function FulfillmentDialog({
  order,
  onClose,
  onSubmit,
}: {
  order: OrderDetail;
  onClose: () => void;
  onSubmit: (body: FulfillmentBody) => Promise<unknown>;
}) {
  const [status, setStatus] = useState<'PROCESSING' | 'FULFILLED'>(
    order.fulfillmentStatus === 'PROCESSING' ? 'FULFILLED' : 'PROCESSING',
  );
  const [method, setMethod] = useState(order.shippingMethod ?? '');
  const [carrier, setCarrier] = useState(order.carrier ?? '');
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const [url, setUrl] = useState(order.trackingUrl ?? '');
  const s = useSubmit(onClose);
  return (
    <Modal
      title={`Fulfillment · #${order.number}`}
      onClose={s.busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={s.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={s.busy}
            onClick={() =>
              void s.run(() =>
                onSubmit({
                  status,
                  ...(method.trim() && { shippingMethod: method.trim() }),
                  ...(carrier.trim() && { carrier: carrier.trim() }),
                  ...(tracking.trim() && { trackingNumber: tracking.trim() }),
                  ...(url.trim() && { trackingUrl: url.trim() }),
                }),
              )
            }
          >
            {s.busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-wash p-3 text-[12.5px] text-muted">
          Torio isn&apos;t connected to a carrier, so shipment details are what you enter here and
          are not verified or tracked automatically.
        </div>
        <label className="flex flex-col gap-1 text-[11.5px] text-faint">
          Update to
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={field}
          >
            {order.fulfillmentStatus === 'UNFULFILLED' && (
              <option value="PROCESSING">Processing</option>
            )}
            <option value="FULFILLED">Fulfilled (shipped or handed over)</option>
          </select>
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
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[11.5px] text-faint">
            Carrier (optional)
            <input
              value={carrier}
              maxLength={80}
              onChange={(e) => setCarrier(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-faint">
            Tracking number (optional)
            <input
              value={tracking}
              maxLength={120}
              onChange={(e) => setTracking(e.target.value)}
              className={field}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-[11.5px] text-faint">
          Tracking link (optional, https://…)
          <input
            value={url}
            maxLength={500}
            onChange={(e) => setUrl(e.target.value)}
            className={field}
          />
        </label>
        <ErrorBox text={s.error} />
      </div>
    </Modal>
  );
}

export function EditOrderDialog({
  order,
  onClose,
  onSubmit,
}: {
  order: OrderDetail;
  onClose: () => void;
  onSubmit: (body: UpdateOrderBody) => Promise<unknown>;
}) {
  const [lines, setLines] = useState<Line[]>(() => linesFromOrder(order.items));
  const [pricing, setPricing] = useState<Pricing>(() => pricingFromOrder(order));
  const [address, setAddress] = useState(order.shippingAddress ?? '');
  const [method, setMethod] = useState(order.shippingMethod ?? '');
  const [touched, setTouched] = useState(false);
  const s = useSubmit(onClose);
  const v = validateLines(lines);
  const pr = parsePricing(pricing);
  const locked = editBlockReason(order);
  const ok = locked || (v.items.length === lines.length && Object.keys(pr.errors).length === 0);
  return (
    <Modal
      title={`Edit order #${order.number}`}
      description="Prices are stored on the order and don’t follow later changes."
      onClose={s.busy ? () => undefined : onClose}
      className="sm:max-w-[640px]"
      footer={
        <>
          <Button variant="outline" disabled={s.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={s.busy}
            onClick={() => {
              setTouched(true);
              if (!ok) return;
              void s.run(() =>
                onSubmit({
                  ...(!locked && {
                    items: v.items,
                    discountMinor: pr.discount,
                    shippingMinor: pr.shipping,
                    taxMinor: pr.tax,
                  }),
                  shippingAddress: address.trim() || null,
                  shippingMethod: method.trim() || null,
                }),
              );
            }}
          >
            {s.busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {locked ? (
          <div className="rounded-xl bg-wash p-3 text-[12.5px] text-muted">{locked}.</div>
        ) : (
          <>
            <LinesEditor
              lines={lines}
              currency={order.currency}
              errors={touched ? v.errors : {}}
              onChange={setLines}
            />
            <PricingFields
              value={pricing}
              currency={order.currency}
              errors={touched ? pr.errors : {}}
              onChange={setPricing}
            />
            <TotalsSummary items={v.items} pricing={pr} currency={order.currency} />
          </>
        )}
        <label className="flex flex-col gap-1 text-[11.5px] text-faint">
          Shipping address
          <textarea
            value={address}
            maxLength={500}
            rows={2}
            onChange={(e) => setAddress(e.target.value)}
            className="rounded-lg border border-line bg-white p-2.5 text-[13px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-faint">
          Shipping method
          <input
            value={method}
            maxLength={120}
            onChange={(e) => setMethod(e.target.value)}
            className={field}
          />
        </label>
        <ErrorBox text={s.error} />
      </div>
    </Modal>
  );
}
