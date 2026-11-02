'use client';

import { useLayoutEffect, type RefObject } from 'react';

const MARGIN = 8;

/**
 * Shifts an absolutely positioned popover sideways so it stays inside the viewport, e.g. a right-aligned
 * menu whose trigger sits near the left edge on a phone. Measured from layout boxes (offsetParent +
 * offsetLeft), so the entry animation's transform can't skew the numbers; the shift uses `translate`,
 * which composes with that animation.
 */
export function useKeepInView(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !parent) return;
    const left = parent.getBoundingClientRect().left + el.offsetLeft;
    const right = left + el.offsetWidth;
    let dx = 0;
    if (left < MARGIN) dx = MARGIN - left;
    else if (right > window.innerWidth - MARGIN) dx = window.innerWidth - MARGIN - right;
    el.style.translate = dx ? `${Math.round(dx)}px 0` : '';
  });
}
