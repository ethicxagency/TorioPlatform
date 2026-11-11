'use client';

import { Select } from '@/components/ui/select';
import { Download, Tag, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { STAGES } from '../constants';
import type { LeadStage } from '../types';

interface Props {
  count: number;
  owners: { id: string; name: string }[];
  canWrite: boolean;
  canDelete: boolean;
  busy: boolean;
  onClear: () => void;
  onAssign: (ownerId: string | null) => void;
  onStage: (s: LeadStage) => void;
  onTags: (tags: string[]) => void;
  onExport: () => void;
  onDelete: () => void;
}

export function BulkBar({
  count,
  owners,
  canWrite,
  canDelete,
  busy,
  onClear,
  onAssign,
  onStage,
  onTags,
  onExport,
  onDelete,
}: Props) {
  const [tag, setTag] = useState('');
  const addTag = () => {
    const t = tag.trim();
    if (t) onTags([t.slice(0, 40)]);
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
        onChange={(v) => v && onStage(v as LeadStage)}
        options={[...STAGES.map((s) => ({ value: s.key, label: s.label }))]}
        disabled={busy || !canWrite}
        tone="dark"
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTag();
        }}
        className="flex items-center gap-1.5"
      >
        <Tag size={13} aria-hidden />
        <input
          aria-label="Add tag to selected leads"
          value={tag}
          maxLength={40}
          disabled={busy || !canWrite}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Add tag"
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
      {canDelete && (
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[#FFB4B4] hover:bg-white/10"
        >
          <Trash2 size={13} />
          Delete
        </button>
      )}
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
