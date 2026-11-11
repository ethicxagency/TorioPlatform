'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth';

/** Rows-per-page choices. The API accepts 1–100 for every list that offers them. */
export const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Display preferences live in this browser, per signed-in person and table: they are not synced across devices and
 * nothing about them reaches the server. Reads are wrapped so private windows or blocked storage just use the defaults.
 */
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};
const memory = new Map<string, string>();
const readRaw = (key: string) => {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
};

function useStored<T>(table: string, name: string, initial: T, valid: (v: unknown) => v is T) {
  const { user } = useAuth();
  const key = `torio:${user?.id ?? 'anon'}:${table}:${name}`;
  // The server and the first client render use the default; the stored value takes over right after hydration.
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const value = useMemo<T>(() => {
    if (raw === null) return initial;
    try {
      const v: unknown = JSON.parse(raw);
      return valid(v) ? v : initial;
    } catch {
      return initial;
    }
    // `initial` and `valid` are constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  const set = useCallback(
    (v: T) => {
      memory.set(key, JSON.stringify(v));
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage unavailable: the choice lasts until reload */
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set] as const;
}

const isSize = (v: unknown): v is number => typeof v === 'number' && PAGE_SIZES.includes(v);
const isKeys = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

export const usePageSize = (table: string, fallback = 25) =>
  useStored<number>(table, 'pageSize', fallback, isSize);

/** The keys of the columns the person has hidden. */
export const useHiddenColumns = (table: string) => useStored<string[]>(table, 'hidden', [], isKeys);
