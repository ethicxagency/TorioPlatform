'use client';

import { useLayoutEffect, type RefObject } from 'react';

const MARGIN = 8;
const GAP = 6;

/**
 * Positions a `position: fixed` popover (rendered in a portal, so no ancestor can clip it) against its
 * trigger: right-aligned to the trigger, clamped to the viewport on both sides, below the trigger or
 * flipped above when there is more room there, with a max height so tall content scrolls inside the panel.
 * Re-measured on resize and on any scroll (capture, so scrolling inner panes counts too).
 */
export function useAnchoredPopover(
  trigger: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  open: boolean,
) {
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current;
      const el = panel.current;
      if (!t || !el) return;
      const r = t.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(el.offsetWidth, vw - MARGIN * 2);
      const left = Math.min(Math.max(r.right - width, MARGIN), vw - MARGIN - width);
      const below = vh - r.bottom - GAP - MARGIN;
      const above = r.top - GAP - MARGIN;
      const wanted = el.scrollHeight;
      const flip = wanted > below && above > below;
      const room = Math.max(flip ? above : below, 120);
      el.style.setProperty('left', `${Math.round(left)}px`);
      el.style.setProperty('max-height', `${Math.floor(room)}px`);
      const height = Math.min(wanted, room);
      el.style.setProperty('top', `${Math.round(flip ? r.top - GAP - height : r.bottom + GAP)}px`);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const ro = new ResizeObserver(place);
    if (panel.current) ro.observe(panel.current);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      ro.disconnect();
    };
  }, [trigger, panel, open]);
}
