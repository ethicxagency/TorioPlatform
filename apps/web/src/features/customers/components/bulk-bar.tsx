'use client';

import { Select } from '@/components/ui/select';
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
        <Select
          aria-label="Assign owner"
          value={''}
          placeholder="Assign owner…"
          onChange={(v) => v && onAssign(v === 'none' ? null : v)}
          options={[
            { value: 'none', label: 'Unassign' },
            ...owners.map((o) => ({ value: o.id, label: o.name })),
          ]}
          disabled={busy || !canWrite}
          tone="dark"
        />
      </label>
      <Select
        aria-label="Change status"
        value={''}
        placeholder="Change status…"
        onChange={(v) => v && onStatus(v as CustomerStatus)}
        options={[...STATUSES.map((s) => ({ value: s.key, label: s.label }))]}
        disabled={busy || !canWrite}
        tone="dark"
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-1.5"
      >
        <Tag size={13} aria-hidden />
        <Select
          aria-label="Tag action"
          value={mode}
          onChange={(v) => setMode(v as typeof mode)}
          options={[
            { value: 'ADD_TAGS', label: 'Add tag' },
            { value: 'REMOVE_TAGS', label: 'Remove tag' },
          ]}
          tone="dark"
        />
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
