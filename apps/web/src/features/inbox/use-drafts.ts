'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'torio-inbox-drafts';
type Drafts = Record<string, string>;

const load = (): Drafts => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Drafts;
  } catch {
    return {};
  }
};

/** Per-conversation composer drafts, persisted in this browser (debounced). Drafts may hold customer text, so they are cleared on sign-out. */
export function useDrafts() {
  const [drafts, setDrafts] = useState<Drafts>(load);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(drafts));
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [drafts]);

  const setDraft = useCallback((id: string, text: string) => {
    setDrafts((d) => {
      const next = { ...d };
      if (text) next[id] = text;
      else delete next[id];
      return next;
    });
  }, []);

  return { drafts, setDraft };
}

export const clearStoredDrafts = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
