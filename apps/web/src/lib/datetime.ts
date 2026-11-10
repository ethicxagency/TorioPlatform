import { useSyncExternalStore } from 'react';

/**
 * Workspace time zone, the one zone every workspace-level date and time is shown in (timestamps stay UTC in the
 * database and API; only display converts). Set once from the workspace record by the app shell, so a page never
 * reaches for the browser's zone by accident. Until a workspace has loaded, formatting falls back to the browser.
 */
let workspaceZone: string | null = null;
const listeners = new Set<() => void>();

export function setWorkspaceTimeZone(zone: string | null | undefined) {
  const next = zone || null;
  if (next === workspaceZone) return;
  workspaceZone = next;
  listeners.forEach((l) => l());
}
export const getWorkspaceTimeZone = () => workspaceZone;
export const useWorkspaceTimeZone = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => workspaceZone,
    () => null,
  );

type Input = string | number | Date;
const toDate = (v: Input) => (v instanceof Date ? v : new Date(v));

/** Intl options with the workspace zone applied (an invalid zone is dropped rather than thrown). */
function withZone(opts: Intl.DateTimeFormatOptions, zone: string | null | undefined) {
  return zone ? { ...opts, timeZone: zone } : opts;
}

function format(
  v: Input,
  kind: 'dateTime' | 'date' | 'time',
  opts: Intl.DateTimeFormatOptions,
  zone: string | null | undefined,
): string {
  const d = toDate(v);
  const call = (o: Intl.DateTimeFormatOptions) =>
    kind === 'date'
      ? d.toLocaleDateString('en-US', o)
      : kind === 'time'
        ? d.toLocaleTimeString('en-US', o)
        : d.toLocaleString('en-US', o);
  try {
    return call(withZone(opts, zone));
  } catch {
    return call(opts);
  }
}

/** Date and time in the workspace zone, e.g. "Nov 10, 2026, 11:43 AM". */
export const fmtDateTime = (
  v: Input,
  zone: string | null | undefined = workspaceZone,
  opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
) => format(v, 'dateTime', opts, zone);

/** Date only in the workspace zone. Pass Intl options for the shape (defaults to "Nov 10, 2026"). */
export const fmtDate = (
  v: Input,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
  zone: string | null | undefined = workspaceZone,
) => format(v, 'date', opts, zone);

/** Date and time with custom Intl options, in the workspace zone. */
export const fmtStamp = (
  v: Input,
  opts: Intl.DateTimeFormatOptions,
  zone: string | null | undefined = workspaceZone,
) => format(v, 'dateTime', opts, zone);

/** Time of day in the workspace zone, e.g. "11:43 AM". */
export const fmtClock = (
  v: Input,
  opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' },
  zone: string | null | undefined = workspaceZone,
) => format(v, 'time', opts, zone);

/** Y-M-D of an instant as seen in the workspace zone (for "same day" and day-boundary maths). */
export function zonedYmd(v: Input, zone: string | null | undefined = workspaceZone) {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    withZone({ year: 'numeric', month: '2-digit', day: '2-digit' }, zone),
  )
    .format(toDate(v))
    .split('-')
    .map(Number);
  return { y: parts[0]!, m: parts[1]!, d: parts[2]! };
}

/** Whole calendar days between two instants, counted in the workspace zone (DST-safe). */
export function zonedDayDiff(a: Input, b: Input, zone: string | null | undefined = workspaceZone) {
  const x = zonedYmd(a, zone);
  const y = zonedYmd(b, zone);
  return Math.round((Date.UTC(x.y, x.m - 1, x.d) - Date.UTC(y.y, y.m - 1, y.d)) / 86_400_000);
}
