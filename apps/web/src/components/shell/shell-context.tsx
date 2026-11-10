'use client';

import { usePathname } from 'next/navigation';
import { isSettingsPath } from '@/features/settings/nav';
import { toast, type Toast } from '@/lib/toast';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

const subscribeResize = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
/** Viewport width; 1440 on the server so SSR output matches the desktop design. */
export const useViewportWidth = () =>
  useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth,
    () => 1440,
  );

interface ShellState {
  vw: number;
  mobile: boolean;
  wide: boolean;
  /** 'full' (228px), 'rail' (68px, expands on hover) or 'none' (mobile drawer). */
  sidebarMode: 'full' | 'rail' | 'none';
  expanded: boolean;
  /** On a Settings route (including Billing): keeps Settings highlighted in the main sidebar. */
  settingsMode: boolean;
  /** Width left for page content next to the sidebar. */
  contentWidth: number;
  userCollapsed: boolean;
  mobileNav: boolean;
  orderId: string | null;
  setSidebarHover: (v: boolean) => void;
  toggleSidebar: () => void;
  setMobileNav: (v: boolean) => void;
  openOrder: (id: string | null) => void;
  /** Where "Back" in Settings returns to: the last page opened outside Settings (or the dashboard). */
  lastAppPath: () => string;
  toast: Toast;
  /** Used by the shell's Escape handler; pages register their own popovers to close. */
  registerEscape: (fn: () => void) => () => void;
}

const Ctx = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useShell must be used inside <ShellProvider>');
  return v;
}

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const vw = useViewportWidth();
  const settingsMode = isSettingsPath(usePathname());
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [sbHover, setSbHover] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const escapes = useRef(new Set<() => void>());
  const pathname = usePathname();
  const lastApp = useRef('/');
  // Remember the last page outside Settings (also across a refresh) so Back in Settings returns to it.
  useEffect(() => {
    try {
      if (!isSettingsPath(pathname)) {
        lastApp.current = pathname + window.location.search;
        sessionStorage.setItem('torio.lastAppPath', lastApp.current);
      } else if (lastApp.current === '/') {
        lastApp.current = sessionStorage.getItem('torio.lastAppPath') ?? '/';
      }
    } catch {
      /* storage can be blocked; Back then falls back to the dashboard */
    }
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOrderId(null);
        setMobileNav(false);
        escapes.current.forEach((fn) => fn());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo<ShellState>(() => {
    const mobile = vw < 768;
    const wide = vw >= 1280;
    // Settings is its own navigation mode: a full sidebar from tablet up, the drawer on phones.
    const sidebarMode = mobile
      ? 'none'
      : settingsMode
        ? 'full'
        : !wide || userCollapsed
          ? 'rail'
          : 'full';
    const expanded =
      sidebarMode === 'full' ||
      (sidebarMode === 'rail' && sbHover) ||
      (sidebarMode === 'none' && mobileNav);
    const sbPx =
      sidebarMode === 'full'
        ? settingsMode
          ? vw >= 1024
            ? 268
            : 232
          : 228
        : sidebarMode === 'rail'
          ? 68
          : 0;
    return {
      vw,
      mobile,
      wide,
      sidebarMode,
      expanded,
      settingsMode,
      contentWidth: vw - sbPx,
      userCollapsed,
      mobileNav,
      orderId,
      setSidebarHover: (v) => sidebarMode === 'rail' && setSbHover(v),
      toggleSidebar: () => {
        setUserCollapsed((x) => !x);
        setSbHover(false);
      },
      setMobileNav,
      openOrder: setOrderId,
      lastAppPath: () => lastApp.current,
      toast,
      registerEscape: (fn) => {
        escapes.current.add(fn);
        return () => {
          escapes.current.delete(fn);
        };
      },
    };
  }, [vw, userCollapsed, sbHover, mobileNav, orderId, settingsMode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
