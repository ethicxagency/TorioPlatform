'use client';

import {
  DEFAULT_PRESET,
  isPresetKey,
  parseIso,
  resolvePreset,
  todayIn,
  validateRange,
  type CivilDate,
  type DateRange,
  type PresetKey,
} from '@torio/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';

export interface RangeSelection {
  preset: PresetKey;
  range: DateRange;
  today: CivilDate;
  /** Undefined = all channels. */
  channel: DashboardChannel | undefined;
}

const KEY = 'torio:dashboard-range';
type Stored = { range?: string; from?: string; to?: string; channel?: string };
export type DashboardChannel = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER';
const CHANNELS: DashboardChannel[] = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER'];
const read = (): Stored => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
};
const write = (v: Stored) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: the URL still carries the selection */
  }
};

/**
 * The dashboard's selected range. It lives in the URL (`?range=this_year` or `?range=custom&from=…&to=…`, plus `&channel=…`) so it survives reloads and can be shared, and is mirrored to sessionStorage so it also survives
 * navigating away and back. Presets are resolved against "today" in the workspace's reporting time zone.
 */
export function useDashboardRange(timeZone: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = useMemo(() => todayIn(timeZone), [timeZone]);

  const sel = useMemo<RangeSelection>(() => {
    // The URL wins; with no range in it, fall back to what this session last chose.
    const stored = params.get('range') || typeof window === 'undefined' ? {} : read();
    const pick = (k: keyof Stored) => params.get(k) ?? stored[k];
    const r = pick('range');
    let preset: PresetKey = r && isPresetKey(r) ? r : DEFAULT_PRESET;
    let range: DateRange;
    if (preset === 'custom') {
      const from = pick('from') ?? '';
      const to = pick('to') ?? '';
      // A hand-edited or stale URL falls back to the default rather than querying nonsense.
      if (parseIso(from) && parseIso(to) && !validateRange({ from, to }, today))
        range = { from, to };
      else {
        preset = DEFAULT_PRESET;
        range = resolvePreset(DEFAULT_PRESET as Exclude<PresetKey, 'custom'>, today);
      }
    } else range = resolvePreset(preset, today);
    const c = pick('channel');
    const channel = CHANNELS.includes(c as DashboardChannel) ? (c as DashboardChannel) : undefined;
    return { preset, range, today, channel };
  }, [params, today]);

  // A selection that arrived through the URL (shared link, reload) is remembered too.
  useEffect(() => {
    if (!params.get('range')) return;
    write({
      range: sel.preset,
      from: sel.preset === 'custom' ? sel.range.from : undefined,
      to: sel.preset === 'custom' ? sel.range.to : undefined,
      channel: sel.channel,
    });
  }, [params, sel]);

  const push = useCallback(
    (next: { preset: PresetKey; from?: string; to?: string; channel?: DashboardChannel }) => {
      const q = new URLSearchParams();
      q.set('range', next.preset);
      if (next.preset === 'custom' && next.from && next.to) {
        q.set('from', next.from);
        q.set('to', next.to);
      }
      if (next.channel) q.set('channel', next.channel);
      write({ range: next.preset, from: next.from, to: next.to, channel: next.channel });
      router.replace(`${pathname}?${q}`, { scroll: false });
    },
    [pathname, router],
  );

  return {
    ...sel,
    setPreset: (preset: Exclude<PresetKey, 'custom'>) => push({ preset, channel: sel.channel }),
    setCustom: (from: string, to: string) =>
      push({ preset: 'custom', from, to, channel: sel.channel }),
    setChannel: (channel: DashboardChannel | undefined) =>
      push({ preset: sel.preset, from: sel.range.from, to: sel.range.to, channel }),
  };
}
