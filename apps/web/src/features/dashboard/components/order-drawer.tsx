'use client';

import Link from 'next/link';
import { ChannelIcon } from '@/components/channel-icon';
import { useShell } from '@/components/shell/shell-context';
import { buildOrderDetail } from '../model';

const label = 'mb-2 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-faint';

export function OrderDrawer() {
  const { orderId, openOrder } = useShell();
  const od = buildOrderDetail(orderId);
  if (!od) return null;
  const close = () => openOrder(null);
  return (
    <>
      <div onClick={close} className="fixed inset-0 z-[80] bg-[rgba(13,37,61,0.25)]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Order details"
        className="fixed bottom-0 right-0 top-0 z-[81] flex w-[min(420px,100vw)] animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)]"
      >
        <div className="flex items-center gap-2.5 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-semibold">{od.id}</span>
              <span
                className="rounded-md px-2 py-px text-[11.5px] font-medium"
                style={{ background: od.sBg, color: od.sColor }}
              >
                {od.status}
              </span>
            </div>
            <div className="mt-0.5 text-[12.5px] text-faint">{od.date}</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-[#F3F4F6]"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5A6A82"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-5 py-[18px]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-line-subtle text-xs font-semibold text-muted">
              {od.initials}
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">{od.customer}</div>
              <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <ChannelIcon channel={od.channel} size={14} decorative />
                {od.channel}
              </div>
            </div>
            <Link href="/inbox" onClick={() => openOrder(null)} className="text-[13px] font-medium">
              Open conversation
            </Link>
          </div>
          <div>
            <div className={label}>Items</div>
            {od.items.map((it) => (
              <div key={it.name} className="flex justify-between gap-3 py-1.5 text-[13.5px]">
                <span>
                  {it.name} <span className="text-faint">× {it.qty}</span>
                </span>
                <span className="tabular-nums">{it.price}</span>
              </div>
            ))}
            <div className="mt-1.5 flex flex-col gap-1 border-t border-line-subtle pt-2 text-[13px] text-muted">
              <div className="flex justify-between">
                <span>Delivery</span>
                <span className="tabular-nums">{od.delivery}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-ink">
                <span>Total</span>
                <span className="tabular-nums">{od.amount}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment</span>
                <span>{od.payment}</span>
              </div>
            </div>
          </div>
          <div>
            <div className={label}>Timeline</div>
            {od.timeline.map((tl) => (
              <div key={tl.text} className="flex gap-2.5 py-[5px] text-[13px]">
                <span
                  className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                  style={{ background: tl.dot }}
                />
                <span className="flex-1">{tl.text}</span>
                <span className="text-xs text-faint">{tl.time}</span>
              </div>
            ))}
          </div>
          {od.needsConfirm && (
            <div className="rounded-[10px] border border-[#FBE3B5] bg-warning-soft px-3 py-2.5 text-[12.5px] text-[#7A4700]">
              This order is waiting for confirmation. Confirm with the customer in Inbox before
              dispatch.
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-line-subtle px-5 py-3.5">
          <Link
            href="/orders"
            onClick={() => openOrder(null)}
            className="flex h-9 flex-1 items-center justify-center rounded-full border border-line bg-white text-[13px] font-medium text-ink no-underline hover:bg-wash hover:text-ink hover:no-underline"
          >
            Open in Orders
          </Link>
          <Link
            href="/inbox"
            onClick={() => openOrder(null)}
            className="flex h-9 flex-1 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white no-underline hover:bg-primary-hover hover:text-white hover:no-underline"
          >
            Message customer
          </Link>
        </div>
      </aside>
    </>
  );
}
