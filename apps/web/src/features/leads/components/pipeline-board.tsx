'use client';

import { useState } from 'react';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { cn } from '@/lib/utils';
import { STAGES } from '../constants';
import type { Lead, LeadStage } from '../types';
import { ScoreIndicator, SourceBadge } from './badges';

interface Props {
  leads: Lead[];
  total: number;
  canWrite: boolean;
  now: number;
  onOpen: (l: Lead) => void;
  onMove: (l: Lead, stage: LeadStage) => void;
}

/** Native drag-and-drop with a keyboard alternative (the "Move to" select on each card). Moves are persisted by the caller and rolled back on failure. */
export function PipelineBoard({ leads, total, canWrite, now, onOpen, onMove }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);

  return (
    <div>
      {total > leads.length && (
        <p role="status" className="mb-2 text-xs text-muted">
          Showing the first {leads.length} of {total} matching leads. Narrow the filters to see the
          rest.
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-3" role="group" aria-label="Pipeline stages">
        {STAGES.map((s) => {
          const items = leads.filter((l) => l.stage === s.key);
          return (
            <section
              key={s.key}
              aria-label={`${s.label}, ${items.length} leads`}
              onDragOver={(e) => {
                if (canWrite && dragId) {
                  e.preventDefault();
                  setOver(s.key);
                }
              }}
              onDragLeave={() => setOver((o) => (o === s.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const lead = leads.find((l) => l.id === dragId);
                setOver(null);
                setDragId(null);
                if (lead && lead.stage !== s.key) onMove(lead, s.key);
              }}
              className={cn(
                'flex max-h-[calc(100vh-340px)] min-h-[200px] w-[272px] shrink-0 flex-col rounded-xl border bg-white/60 transition-colors',
                over === s.key ? 'border-primary bg-primary-soft/60' : 'border-line',
              )}
            >
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                <h3 className="m-0 flex-1 text-[13px] font-semibold">{s.label}</h3>
                <span className="rounded-md bg-wash-2 px-1.5 py-px text-xs tabular-nums text-muted">
                  {items.length}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-faint">
                    {canWrite ? 'Drop a lead here' : 'No leads'}
                  </div>
                )}
                {items.map((l) => (
                  <article
                    key={l.id}
                    draggable={canWrite}
                    onDragStart={(e) => {
                      setDragId(l.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    className={cn(
                      'rounded-lg border border-line bg-white p-2.5 shadow-[0_1px_2px_rgba(0,55,112,0.04)]',
                      canWrite && 'cursor-grab active:cursor-grabbing',
                      dragId === l.id && 'opacity-50',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(l)}
                      className="block w-full cursor-pointer text-left"
                    >
                      <span className="block truncate text-[13.5px] font-medium">{l.name}</span>
                      <span className="block truncate text-xs text-muted">{l.company ?? '—'}</span>
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <ScoreIndicator score={l.score} showLabel={false} />
                      <SourceBadge source={l.source} />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-faint">
                      {l.owner ? (
                        <span
                          title={l.owner.name}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E6E6FA] text-[9px] font-semibold text-primary-hover"
                        >
                          {initialsOf(l.owner.name)}
                        </span>
                      ) : (
                        <span>Unassigned</span>
                      )}
                      <span className="flex-1 text-right">{fmtAgo(l.lastActivityAt, now)}</span>
                    </div>
                    {canWrite && (
                      <select
                        aria-label={`Move ${l.name} to stage`}
                        value={l.stage}
                        onChange={(e) => onMove(l, e.target.value as LeadStage)}
                        className="mt-2 h-7 w-full rounded-md border border-line bg-white px-1.5 text-xs text-muted"
                      >
                        {STAGES.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
