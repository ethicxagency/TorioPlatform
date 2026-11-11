'use client';

import { Brain, Check, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STAGE_META } from './stage-meta';
import type { BrainMaturity } from '@torio/contracts';

/**
 * The compact Brain header, shown above every tab: identity, the saved maturity stage, setup completion, and the save
 * state and actions. The stage and completion describe the last SAVED Brain.
 */
export interface SaveControlsProps {
  dirty: boolean;
  changed: string[];
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  canWrite: boolean;
  showChanges: boolean;
  onToggleChanges: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

/** The unsaved-changes chip and the Save button. Shown in the header, and in the Summary hero (where the header hides them). */
export function SaveControls({
  dirty,
  changed,
  saveState,
  canWrite,
  showChanges,
  onToggleChanges,
  onDiscard,
  onSave,
}: SaveControlsProps) {
  return (
    <>
      {dirty && (
        <div className="relative">
          <button
            type="button"
            aria-expanded={showChanges}
            onClick={onToggleChanges}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border border-[#FBE3B5] bg-warning-soft px-2.5 text-[12.5px] font-medium text-[#7A4700]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#D98A00]" />
            Unsaved changes ({changed.length})
          </button>
          {showChanges && (
            <div className="absolute left-0 top-11 z-30 w-60 animate-panel-in rounded-xl border border-line glass-menu p-3 shadow-popover">
              <div className="mb-1 text-xs font-semibold text-faint">Changed sections</div>
              <ul className="m-0 mb-2 list-none p-0 text-[13px]">
                {changed.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Button size="sm" variant="outline" onClick={onDiscard}>
                <Undo2 size={13} />
                Discard changes
              </Button>
            </div>
          )}
        </div>
      )}
      {canWrite && (
        <Button
          disabled={!dirty || saveState === 'saving'}
          onClick={onSave}
          variant={saveState === 'error' ? 'outline' : 'primary'}
          className={cn('h-9', saveState === 'error' && 'border-danger text-danger')}
        >
          {saveState === 'saving' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Saving…
            </>
          ) : saveState === 'saved' && !dirty ? (
            <>
              <Check size={14} />
              Saved
            </>
          ) : saveState === 'error' ? (
            'Fix & save'
          ) : (
            'Save Changes'
          )}
        </Button>
      )}
    </>
  );
}

export function BrainHeader({
  maturity: m,
  setup,
  savedAt,
  dirty,
  showActions,
  controls,
}: {
  maturity: BrainMaturity;
  /** Setup completion (the readiness percentage). */
  setup: number;
  savedAt: string | null;
  dirty: boolean;
  /** The Summary hero carries the save actions itself, so the header hides them there. */
  showActions: boolean;
  controls: SaveControlsProps;
}) {
  const meta = STAGE_META[m.stage];
  const StageIcon = meta.icon;
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-primary-line bg-primary-soft">
          <Brain size={20} className="text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 font-page-title">Brain</h1>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-white"
              style={{ backgroundColor: meta.color }}
              title={`Brain stage: ${meta.label}`}
            >
              <StageIcon size={11} aria-hidden />
              {m.stage}
            </span>
          </div>
          <p className="m-0 text-[13px] text-muted">Your business. Your rules. Your AI.</p>
        </div>
      </div>

      <div
        className="flex items-center gap-2 text-[12.5px]"
        title="Setup completion: how much of the recommended setup is filled in"
      >
        <span className="text-muted">Setup</span>
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-wash-2" aria-hidden>
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${setup}%` }}
          />
        </span>
        <span className="font-semibold tabular-nums">{setup}%</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-live="polite"
          className={cn('text-xs', dirty ? 'font-medium text-[#7A4700]' : 'text-faint')}
        >
          {dirty ? 'Unsaved changes' : savedAt ? 'All changes saved' : 'Never saved'}
        </span>
        {showActions && <SaveControls {...controls} />}
      </div>
    </header>
  );
}
