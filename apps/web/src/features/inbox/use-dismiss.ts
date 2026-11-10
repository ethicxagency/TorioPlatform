'use client';

import { useEffect, type RefObject } from 'react';

/** Calls `onDismiss` on outside pointer-down while `active`. Escape is handled globally by the shell. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  /** A portaled panel outside `ref` that still counts as inside. */
  extra?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !extra?.current?.contains(t)) onDismiss();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [ref, extra, active, onDismiss]);
}
