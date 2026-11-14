'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { env } from '@/lib/env';

const KEY = 'torio_marketing_consent';
/** Only these public marketing pages are tracked. Account, privacy and deletion pages never are. */
const TRACKED = new Set(['/', '/brain']);

type Fbq = ((...a: unknown[]) => void) & {
  callMethod?: (...a: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
};
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const read = (): 'granted' | 'denied' | null => {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
};
const optedOutByBrowser = () =>
  (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true ||
  navigator.doNotTrack === '1';

function loadPixel(id: string) {
  if (window.fbq) return;
  const f = function (...a: unknown[]) {
    if (f.callMethod) f.callMethod(...a);
    else f.queue.push(a);
  } as Fbq;
  f.queue = [];
  f.loaded = true;
  f.version = '2.0';
  window.fbq = f;
  window._fbq = f;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  f('init', id);
}

/**
 * Torio's own Meta Pixel on the public marketing pages only. It does nothing unless Super Admin has switched browser tracking on
 * (the API says so), the visitor has accepted, and their browser is not asking not to be tracked. Nothing loads from Meta before the
 * visitor chooses. The visitor can reopen the choice from the small "Analytics choice" button on these pages.
 */
export function PublicTracking() {
  // The public Torio Brain page is served from an internal path at /brain.
  const raw = usePathname();
  const pathname = raw === '/torio-brain' ? '/brain' : raw;
  const [pixel, setPixel] = useState<string | null>(null);
  // Nothing is rendered until the API has answered, so reading the stored choice here cannot mismatch the server's output.
  const [choice, setChoice] = useState<'granted' | 'denied' | null>(() =>
    typeof window === 'undefined' ? null : read(),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/public/tracking`, { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { metaPixelId?: string | null } | null) => {
        if (live) setPixel(j?.metaPixelId ?? null);
      })
      .catch(() => undefined)
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  const allowed = !!pixel && choice === 'granted' && !optedOutByBrowser();
  useEffect(() => {
    if (!allowed || !pixel) return;
    loadPixel(pixel);
  }, [allowed, pixel]);
  useEffect(() => {
    if (!allowed || !window.fbq || !TRACKED.has(pathname)) return;
    const id = crypto.randomUUID();
    window.fbq('track', 'PageView', {}, { eventID: id });
    if (pathname === '/brain')
      window.fbq(
        'track',
        'ViewContent',
        { content_name: 'Torio Brain', content_category: 'product_page' },
        { eventID: crypto.randomUUID() },
      );
  }, [allowed, pathname]);

  // Ask once, and only when there is something to consent to.
  if (!ready || !pixel || optedOutByBrowser() || !TRACKED.has(pathname)) return null;
  const set = (v: 'granted' | 'denied' | null) => {
    try {
      if (v) window.localStorage.setItem(KEY, v);
      else window.localStorage.removeItem(KEY);
    } catch {
      /* the choice then only lasts for this visit */
    }
    if (v === 'denied') window.fbq?.('consent', 'revoke');
    setChoice(v);
  };
  if (choice !== null)
    return (
      <button
        type="button"
        onClick={() => set(null)}
        className="fixed bottom-3 left-3 z-[60] h-8 cursor-pointer rounded-full border border-line bg-white/90 px-3 text-xs font-medium text-muted backdrop-blur hover:text-ink"
      >
        Analytics choice
      </button>
    );
  return (
    <div
      role="region"
      aria-label="Analytics choice"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-[640px] flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-popover sm:inset-x-6"
    >
      <p className="m-0 min-w-[220px] flex-1 text-[13px] leading-snug text-muted">
        Torio uses a Meta Pixel on this public website to measure which pages lead to sign-ups. It
        stays off unless you accept.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => set('denied')}
          className="h-9 cursor-pointer rounded-[10px] border border-line bg-white px-3.5 text-[13px] font-semibold text-ink"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => set('granted')}
          className="h-9 cursor-pointer rounded-[10px] border-none bg-primary px-3.5 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
