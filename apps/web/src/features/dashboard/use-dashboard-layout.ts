'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_ORDER, type WidgetKey } from './data';

const KEY = 'torio-dashboard-layout';
const EVENT = 'torio-dashboard-layout-change';

export interface DashboardLayout {
  order: WidgetKey[];
  hidden: Partial<Record<WidgetKey, boolean>>;
}

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(EVENT, cb);
  };
};
/** One layout per workspace; the old browser-wide key is still read so existing preferences carry over. */
const keyFor = (ws: string | null) => (ws ? `${KEY}:${ws}` : KEY);
const readKey = (key: string): string | null => {
  try {
    return localStorage.getItem(key) ?? localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Sanitises persisted layout: drops unknown keys and appends widgets added since it was saved. */
export function parseLayout(raw: string | null): DashboardLayout {
  const fallback: DashboardLayout = { order: [...DEFAULT_ORDER], hidden: {} };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { order?: unknown; hidden?: unknown } | null;
    if (!parsed || !Array.isArray(parsed.order)) return fallback;
    const order = parsed.order.filter((k): k is WidgetKey =>
      DEFAULT_ORDER.includes(k as WidgetKey),
    );
    DEFAULT_ORDER.forEach((k) => {
      if (!order.includes(k)) order.push(k);
    });
    const hidden =
      parsed.hidden && typeof parsed.hidden === 'object'
        ? (parsed.hidden as DashboardLayout['hidden'])
        : {};
    return { order, hidden };
  } catch {
    return fallback;
  }
}

/** Per-workspace layout preference (non-sensitive UI state), kept in this browser's localStorage. */
export function useDashboardLayout(ws: string | null = null) {
  const key = keyFor(ws);
  const read = useCallback(() => readKey(key), [key]);
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const layout = useMemo(() => parseLayout(raw), [raw]);

  const save = useCallback(
    (next: DashboardLayout) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable: layout simply won't persist */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return {
    ...layout,
    move(k: WidgetKey, dir: -1 | 1) {
      const o = [...layout.order];
      const i = o.indexOf(k);
      const j = i + dir;
      if (j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j]!, o[i]!];
      save({ ...layout, order: o });
    },
    toggle(k: WidgetKey) {
      const hidden = { ...layout.hidden };
      if (hidden[k]) delete hidden[k];
      else hidden[k] = true;
      save({ ...layout, hidden });
    },
    reset() {
      save({ order: [...DEFAULT_ORDER], hidden: {} });
    },
  };
}
