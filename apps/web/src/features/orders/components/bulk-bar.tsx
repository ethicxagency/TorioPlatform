'use client';

import { Download, X } from 'lucide-react';
import { ORDER_STATUS_LABEL } from '@torio/contracts';
import type { OrderStatusTarget } from '../queries';

interface Props {
  count: number;
  canWrite: boolean;
  busy: boolean;
  onClear: () => void;
  onStatus: (s: OrderStatusTarget) => void;
  onExport: () => void;
}

const TARGETS: OrderStatusTarget[] = ['CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'];

/** Acts on the selected orders only. Each order is checked against the server's transition rules; ineligible ones are reported, not changed. */
export function OrderBulkBar({ count, canWrite, busy, onClear, onStatus, onExport }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-2 rounded-xl bg-ink px-3 py-2 text-[12.5px] text-white"
    >
      <span className="font-semibold">{count} selected</span>
      <select
        aria-label="Change status"
        disabled={busy || !canWrite}
        value=""
        onChange={(e) => e.target.value && onStatus(e.target.value as OrderStatusTarget)}
        className="h-8 rounded-lg border border-white/20 bg-white/10 px-2 text-[12.5px] text-white disabled:opacity-50 [&>option]:text-ink"
      >
        <option value="">Change status…</option>
        {TARGETS.map((t) => (
          <option key={t} value={t}>
            {t === 'CANCELLED' ? 'Cancel orders' : `Mark ${ORDER_STATUS_LABEL[t].toLowerCase()}`}
          </option>
        ))}
      </select>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onExport}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 hover:bg-white/10"
      >
        <Download size={13} />
        Export
      </button>
      <button
        type="button"
        aria-label="Clear selection"
        onClick={onClear}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-white/10"
      >
        <X size={14} />
      </button>
    </div>
  );
}
