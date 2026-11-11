'use client';

import { Brain, Check, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmtAgoIso } from './bits';
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
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-3.5">
        {/* a larger tinted container with a little depth: an inner white tile on a soft indigo plate */}
        <span
          aria-hidden
          className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[15px] border border-primary-line bg-gradient-to-br from-primary-soft to-[#F6F0FF] shadow-[0_1px_2px_rgba(91,92,226,0.12)]"
        >
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-white shadow-[0_2px_8px_-2px_rgba(91,92,226,0.35)]">
            <Brain size={22} strokeWidth={1.6} className="text-primary" />
          </span>
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 font-page-title">Brain</h1>
            <span
              data-testid="header-stage"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{
                backgroundColor: meta.tint,
                color: meta.color,
                boxShadow: `inset 0 0 0 1px ${meta.color}40`,
              }}
              title={`Brain stage: ${meta.label}`}
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full"
                style={{ backgroundColor: meta.iconBg }}
              >
                <StageIcon size={10} aria-hidden />
              </span>
              {m.stage}
            </span>
          </div>
          <p className="m-0 mt-0.5 text-[13px] text-muted">Your business. Your rules. Your AI.</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-5 gap-y-2">
        <div
          className="min-w-[188px] max-w-full"
          title="Setup progress: how much of the recommended setup is filled in. It is separate from the intelligence score."
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11.5px] font-medium text-muted">Setup Progress</span>
            <span className="text-[18px] font-semibold leading-none tabular-nums text-ink">
              {setup}
              <span className="text-[12px] font-medium text-muted">%</span>
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuenow={setup}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-wash-2"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#5B5CE2] to-[#8B5CF6] transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${setup}%` }}
            />
          </div>
          <div
            aria-live="polite"
            className={cn(
              'mt-1 text-[11.5px]',
              dirty ? 'font-medium text-[#7A4700]' : 'text-faint',
            )}
          >
            {dirty
              ? 'Unsaved changes'
              : savedAt
                ? `Last saved ${fmtAgoIso(savedAt)}`
                : 'Never saved'}
          </div>
        </div>
        {showActions && (
          <div className="flex flex-wrap items-center gap-2">
            <SaveControls {...controls} />
          </div>
        )}
      </div>
    </header>
  );
}
