'use client';

import {
  daysBetween,
  formatRange,
  parseIso,
  PRESETS,
  toIso,
  validateRange,
  type CivilDate,
  type DateRange,
  type PresetKey,
} from '@torio/contracts';
import { ArrowDown01Icon, Calendar01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Icon } from '@/components/ui/icon';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DayPicker, type DateRange as PickerRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import { useShell } from '@/components/shell/shell-context';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { cn } from '@/lib/utils';

interface Props {
  /** Layout classes for the wrapper (e.g. flex sizing in the page header). */
  className?: string;
  preset: PresetKey;
  range: DateRange;
  today: CivilDate;
  /** Kept for callers; the reporting time zone is applied by the server, not shown here. */
  timeZone?: string;
  onPreset: (p: Exclude<PresetKey, 'custom'>) => void;
  onCustom: (from: string, to: string) => void;
}

// The picker works with plain calendar dates; these convert without involving the browser's time zone.
const toLocal = (c: CivilDate) => new Date(c.y, c.m - 1, c.d);
const fromLocal = (d: Date): CivilDate => ({
  y: d.getFullYear(),
  m: d.getMonth() + 1,
  d: d.getDate(),
});
const label = (key: PresetKey) => PRESETS.find((p) => p.key === key)!.label;

export function DateRangeSelector({ preset, range, today, onPreset, onCustom, className }: Props) {
  const { registerEscape, mobile, contentWidth } = useShell();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: string; to: string }>(range);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(ref, open, () => close(false));
  useEffect(() => (open ? registerEscape(() => close(true)) : undefined), [open, registerEscape]);

  function close(refocus: boolean) {
    setOpen(false);
    setCustomOpen(false);
    if (refocus) btn.current?.focus();
  }
  const openMenu = () => {
    setDraft(range);
    setCustomOpen(preset === 'custom');
    setOpen(true);
  };

  const error = useMemo(() => {
    const f = parseIso(draft.from);
    const t = parseIso(draft.to);
    if (!draft.from && !draft.to) return 'Choose a start and an end date.';
    if (!f || !t)
      return draft.from && draft.to ? 'Enter valid dates.' : 'Choose both a start and an end date.';
    return validateRange(draft, today);
  }, [draft, today]);
  const days =
    !error && parseIso(draft.from) && parseIso(draft.to)
      ? daysBetween(parseIso(draft.from)!, parseIso(draft.to)!)
      : 0;

  const selected: PickerRange | undefined = useMemo(() => {
    const f = parseIso(draft.from);
    const t = parseIso(draft.to);
    return f || t
      ? { from: f ? toLocal(f) : undefined, to: t ? toLocal(t) : undefined }
      : undefined;
  }, [draft]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[data-preset]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (!items.length) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]!.focus();
  };

  const wide = !mobile && contentWidth >= 760;
  // Keep the popover inside the viewport: it is right-aligned to the button, which can sit far from the right edge.
  useLayoutEffect(() => {
    const el = pop.current;
    if (!el) return;
    // Measured from the anchor, not the element, so the entry animation can't skew the numbers.
    const anchor = ref.current?.getBoundingClientRect();
    if (!anchor) return;
    const margin = 8;
    const left = anchor.right - el.offsetWidth;
    let dx = 0;
    if (left < margin) dx = margin - left;
    else if (anchor.right > window.innerWidth - margin)
      dx = window.innerWidth - margin - anchor.right;
    el.style.right = dx ? `${-Math.round(dx)}px` : '';
  }, [open, customOpen, wide]);

  const summary = preset === 'custom' ? 'Custom Range' : label(preset);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Date range: ${summary}, ${formatRange(range)}`}
        onClick={() => (open ? close(false) : openMenu())}
        className={cn(
          'flex h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-3 text-[13px] transition-colors duration-150 hover:bg-wash motion-reduce:transition-none',
          open && 'border-primary bg-primary-soft',
        )}
      >
        <Icon icon={Calendar01Icon} size={14} className="shrink-0 text-muted" />
        <span className="font-semibold text-ink">{summary}</span>
        <span className="text-muted max-sm:hidden">{formatRange(range)}</span>
        <Icon
          icon={ArrowDown01Icon}
          size={13}
          className={cn(
            'text-faint transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={pop}
          id={id}
          role="dialog"
          aria-label="Choose date range"
          onKeyDown={onKey}
          className={cn(
            'absolute right-0 top-[52px] z-[45] max-h-[calc(100vh-110px)] overflow-y-auto animate-panel-in rounded-[14px] border border-line glass-menu p-2 shadow-popover',
            customOpen && wide
              ? 'w-[min(720px,calc(100vw-32px))]'
              : 'w-[min(300px,calc(100vw-32px))]',
          )}
        >
          <div className={cn(customOpen && wide && 'grid grid-cols-[232px_1fr] gap-3')}>
            <div
              role="listbox"
              aria-label="Presets"
              className="flex max-h-[min(70vh,460px)] flex-col gap-px overflow-y-auto"
            >
              {PRESETS.map((p) => {
                const on =
                  preset === p.key && (p.key !== 'custom' || customOpen || preset === 'custom');
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="option"
                    aria-selected={on}
                    data-preset
                    onClick={() => {
                      if (p.key === 'custom') {
                        setDraft(range);
                        setCustomOpen(true);
                      } else {
                        onPreset(p.key);
                        close(true);
                      }
                    }}
                    className={cn(
                      'flex h-8 w-full cursor-pointer items-center justify-between rounded-lg px-2.5 text-left text-[13px] hover:bg-wash',
                      on && 'bg-primary-soft font-semibold text-primary-hover',
                    )}
                  >
                    {p.label}
                    {on && <Icon icon={Tick02Icon} size={13} />}
                  </button>
                );
              })}
            </div>

            {customOpen && (
              <div
                className={cn(
                  'flex flex-col gap-2.5',
                  !wide && 'mt-2 border-t border-line-subtle pt-2.5',
                )}
              >
                <div className="grid grid-cols-2 gap-2">
                  {(['from', 'to'] as const).map((k) => (
                    <label
                      key={k}
                      className="flex flex-col gap-1 text-[11.5px] font-medium text-faint"
                    >
                      {k === 'from' ? 'Start date' : 'End date'}
                      <input
                        type="date"
                        value={draft[k]}
                        max={toIso(today)}
                        aria-invalid={!!error && !!draft[k]}
                        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                        className="h-8 rounded-lg border border-line bg-white px-2 text-[13px] text-ink aria-[invalid=true]:border-danger"
                      />
                    </label>
                  ))}
                </div>
                <div className="torio-daypicker overflow-x-auto">
                  <DayPicker
                    mode="range"
                    selected={selected}
                    onSelect={(r) =>
                      setDraft({
                        from: r?.from ? toIso(fromLocal(r.from)) : '',
                        to: r?.to ? toIso(fromLocal(r.to)) : '',
                      })
                    }
                    defaultMonth={
                      parseIso(draft.to) ? toLocal(parseIso(draft.to)!) : toLocal(today)
                    }
                    numberOfMonths={wide ? 2 : 1}
                    captionLayout="dropdown"
                    startMonth={new Date(today.y - 5, 0)}
                    endMonth={toLocal(today)}
                    disabled={{ after: toLocal(today) }}
                    weekStartsOn={1}
                    showOutsideDays
                  />
                </div>
                <div className="min-h-[18px] text-xs" aria-live="polite">
                  {error ? (
                    <span role="alert" className="text-danger">
                      {error}
                    </span>
                  ) : (
                    <span className="text-muted">
                      {formatRange(draft)} · {days} day{days === 1 ? '' : 's'} (inclusive)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft({ from: '', to: '' })}
                    className="h-8 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium text-muted hover:bg-wash"
                  >
                    Clear
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => close(true)}
                    className="h-8 cursor-pointer rounded-lg border border-line bg-white px-3 text-[13px] font-medium hover:bg-wash"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!!error}
                    onClick={() => {
                      onCustom(draft.from, draft.to);
                      close(true);
                    }}
                    className="h-8 cursor-pointer rounded-full bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
