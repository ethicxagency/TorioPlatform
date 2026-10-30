'use client';

import { Download, Tag, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { STATUSES } from '../constants';
import type { CustomerStatus } from '../types';

interface Props {
  count: number;
  owners: { id: string; name: string }[];
  canWrite: boolean;
  busy: boolean;
  onClear: () => void;
  onAssign: (ownerId: string | null) => void;
  onStatus: (s: CustomerStatus) => void;
  onTags: (action: 'ADD_TAGS' | 'REMOVE_TAGS', tags: string[]) => void;
  onExport: () => void;
}

const sel =
  'h-8 rounded-lg border border-white/20 bg-white/10 px-2 text-[12.5px] text-white disabled:opacity-50 [&>option]:text-ink';

/** Acts on the selected customers only (the count shown), never on every row matching the filters. */
export function CustomerBulkBar({
  count,
  owners,
  canWrite,
  busy,
  onClear,
  onAssign,
  onStatus,
  onTags,
  onExport,
}: Props) {
  const [tag, setTag] = useState('');
  const [mode, setMode] = useState<'ADD_TAGS' | 'REMOVE_TAGS'>('ADD_TAGS');
  const submit = () => {
    const t = tag.trim().slice(0, 40);
    if (t) onTags(mode, [t]);
    setTag('');
  };
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-2 rounded-xl bg-ink px-3 py-2 text-[12.5px] text-white"
    >
      <span className="font-semibold">{count} selected</span>
      <label className="flex items-center gap-1.5">
        <UserPlus size={13} aria-hidden />
        <select
          aria-label="Assign owner"
          disabled={busy || !canWrite}
          value=""
          onChange={(e) =>
            e.target.value && onAssign(e.target.value === 'none' ? null : e.target.value)
          }
          className={sel}
        >
          <option value="">Assign owner…</option>
          <option value="none">Unassign</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <select
        aria-label="Change status"
        disabled={busy || !canWrite}
        value=""
        onChange={(e) => e.target.value && onStatus(e.target.value as CustomerStatus)}
        className={sel}
      >
        <option value="">Change status…</option>
        {STATUSES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-1.5"
      >
        <Tag size={13} aria-hidden />
        <select
          aria-label="Tag action"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className={sel}
        >
          <option value="ADD_TAGS">Add tag</option>
          <option value="REMOVE_TAGS">Remove tag</option>
        </select>
        <input
          aria-label="Tag name"
          value={tag}
          maxLength={40}
          disabled={busy || !canWrite}
          onChange={(e) => setTag(e.target.value)}
          placeholder="tag, Enter"
          className="h-8 w-24 rounded-lg border border-white/20 bg-white/10 px-2 text-[12.5px] text-white placeholder:text-white/50"
        />
      </form>
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
