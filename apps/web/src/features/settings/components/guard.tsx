'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

interface Guard {
  /** Pages report whether they hold unsaved edits. */
  setDirty: (v: boolean) => void;
  dirty: boolean;
}
const Ctx = createContext<Guard>({ setDirty: () => undefined, dirty: false });
export const useSettingsGuard = () => useContext(Ctx);

export function GuardProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirtyState] = useState(false);
  const setDirty = useCallback((v: boolean) => setDirtyState(v), []);
  const ref = useRef(dirty);
  useEffect(() => {
    ref.current = dirty;
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const value = useMemo(() => ({ dirty, setDirty }), [dirty, setDirty]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Registers a page's unsaved state and clears it when the page unmounts. */
export function useDirty(dirty: boolean) {
  const { setDirty } = useSettingsGuard();
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}
