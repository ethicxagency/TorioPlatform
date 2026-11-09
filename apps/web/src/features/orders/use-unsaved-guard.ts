'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Blocks losing unsaved edits. `attempt(go)` runs `go` straight away when clean, otherwise parks it until the
 * user confirms. In-app links are intercepted too, since the App Router has no navigation-blocking API;
 * the browser's own unload prompt covers reloads and closing the tab.
 */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const [leave, setLeave] = useState<(() => void) | null>(null);

  const attempt = useCallback(
    (go: () => void) => {
      if (dirty) setLeave(() => go);
      else go();
    },
    [dirty],
  );

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname + url.search === location.pathname + location.search) return;
      e.preventDefault();
      e.stopPropagation();
      const to = url.pathname + url.search + url.hash;
      setLeave(() => () => router.push(to));
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, router]);

  return {
    attempt,
    leaving: leave !== null,
    keepEditing: () => setLeave(null),
    confirmLeave: () => {
      const go = leave;
      setLeave(null);
      go?.();
    },
  };
}
