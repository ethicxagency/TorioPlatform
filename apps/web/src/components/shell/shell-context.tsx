'use client';

import {
  createContext,
  useCallback,
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
  /** Width left for page content next to the sidebar. */
  contentWidth: number;
  userCollapsed: boolean;
  mobileNav: boolean;
  orderId: string | null;
  toastText: string | null;
  setSidebarHover: (v: boolean) => void;
  toggleSidebar: () => void;
  setMobileNav: (v: boolean) => void;
  openOrder: (id: string | null) => void;
  toast: (text: string) => void;
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
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [sbHover, setSbHover] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const escapes = useRef(new Set<() => void>());

  const toast = useCallback((text: string) => {
    clearTimeout(toastTimer.current);
    setToastText(text);
    toastTimer.current = setTimeout(() => setToastText(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

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
    const sidebarMode = mobile ? 'none' : wide && !userCollapsed ? 'full' : 'rail';
    const expanded =
      sidebarMode === 'full' ||
      (sidebarMode === 'rail' && sbHover) ||
      (sidebarMode === 'none' && mobileNav);
    const sbPx = sidebarMode === 'full' ? 228 : sidebarMode === 'rail' ? 68 : 0;
    return {
      vw,
      mobile,
      wide,
      sidebarMode,
      expanded,
      contentWidth: vw - sbPx,
      userCollapsed,
      mobileNav,
      orderId,
      toastText,
      setSidebarHover: (v) => sidebarMode === 'rail' && setSbHover(v),
      toggleSidebar: () => {
        setUserCollapsed((x) => !x);
        setSbHover(false);
      },
      setMobileNav,
      openOrder: setOrderId,
      toast,
      registerEscape: (fn) => {
        escapes.current.add(fn);
        return () => {
          escapes.current.delete(fn);
        };
      },
    };
  }, [vw, userCollapsed, sbHover, mobileNav, orderId, toastText, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
