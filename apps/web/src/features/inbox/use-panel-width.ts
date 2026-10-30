'use client';

import { useCallback, useState } from 'react';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

interface Opts {
  storageKey: string;
  min: number;
  max: number;
  initial: number;
  /** +1 when dragging right grows the panel (list), -1 when dragging right shrinks it (profile). */
  direction: 1 | -1;
}

/**
 * Resizable, persisted panel width. Only used by client components rendered after sign-in,
 * so reading localStorage during the initial state is safe. Persists the user's preference,
 * never a viewport-clamped value.
 */
export function usePanelWidth({ storageKey, min, max, initial, direction }: Opts) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem(storageKey) ?? '', 10);
      return saved >= min && saved <= max ? saved : initial;
    } catch {
      return initial;
    }
  });
  const [dragging, setDragging] = useState(false);

  const persist = useCallback(
    (w: number) => {
      try {
        localStorage.setItem(storageKey, String(w));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let latest = startW;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      latest = clamp(startW + direction * (ev.clientX - startX), min, max);
      setWidth(latest);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      setDragging(false);
      persist(latest);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  /** Keyboard support for the separator: arrows resize (Shift = larger steps). */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const delta = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    if (!delta) return;
    e.preventDefault();
    const next = clamp(width + direction * delta, min, max);
    setWidth(next);
    persist(next);
  };

  const reset = () => {
    setWidth(initial);
    persist(initial);
  };

  return { width, dragging, onPointerDown, onKeyDown, reset };
}
