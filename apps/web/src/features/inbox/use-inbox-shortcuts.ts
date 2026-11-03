'use client';

import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  next: () => void;
  prev: () => void;
  reply: () => void;
  note: () => void;
  resolve: () => void;
  snooze: () => void;
  assign: () => void;
  profile: () => void;
  help: () => void;
  /** Whether a conversation is open (some shortcuts need one). */
  hasActive: boolean;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  );
};

/** Single-key Inbox shortcuts. Never fire while typing or with modifier keys. */
export function useInboxShortcuts(h: ShortcutHandlers) {
  const ref = useRef(h);
  useEffect(() => {
    ref.current = h;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      // A modal (e.g. Create order) owns the keyboard: J/K must not switch the conversation behind it.
      if (document.querySelector('[aria-modal="true"]')) return;
      const h = ref.current;
      const needsActive: Record<string, () => void> = {
        r: h.reply,
        n: h.note,
        e: h.resolve,
        s: h.snooze,
        a: h.assign,
        p: h.profile,
      };
      const k = e.key.toLowerCase();
      if (k === 'j') {
        e.preventDefault();
        h.next();
      } else if (k === 'k') {
        e.preventDefault();
        h.prev();
      } else if (e.key === '?') {
        e.preventDefault();
        h.help();
      } else if (needsActive[k] && h.hasActive) {
        e.preventDefault();
        needsActive[k]!();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
