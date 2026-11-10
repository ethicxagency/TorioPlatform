'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ApiSchemas } from '@torio/api-client';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from './api';

/**
 * Routing hint for `/` (dashboard vs public page, see src/proxy.ts). It carries no identity: the API still checks the
 * real session on every request.
 */
const HINT = 'torio_authed';
const setHint = (on: boolean) => {
  try {
    document.cookie = on
      ? `${HINT}=1; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      : `${HINT}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* cookies blocked: `/` then shows the public page until the landing page confirms the session */
  }
};

type AuthResponse = ApiSchemas['AuthResponseDto'];
type User = AuthResponse['user'];
type Status = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: Status;
  user: User | null;
  /** Adopt a successful login/register response. */
  adopt: (r: AuthResponse) => void;
  /** Keep the header in sync after the profile changes. */
  patchUser: (p: Partial<User>) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const useAuth = (): AuthState => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const adopt = useCallback((r: AuthResponse) => {
    setAccessToken(r.accessToken);
    setUser(r.user);
    setStatus('authed');
    setHint(true);
  }, []);

  useEffect(() => {
    let live = true;
    void refreshSession().then((r) => {
      if (!live) return;
      if (r) adopt(r);
      else {
        setHint(false);
        setStatus('anon');
      }
    });
    setSessionLostHandler(() => {
      setAccessToken(null);
      setUser(null);
      setHint(false);
      setStatus('anon');
    });
    return () => {
      live = false;
      setSessionLostHandler(null);
    };
  }, [adopt]);

  const patchUser = useCallback((p: Partial<User>) => setUser((u) => (u ? { ...u, ...p } : u)), []);

  const signOut = useCallback(async () => {
    await api.POST('/api/v1/auth/logout', { body: {} }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setHint(false);
    setStatus('anon');
  }, []);

  const value = useMemo(
    () => ({ status, user, adopt, patchUser, signOut }),
    [status, user, adopt, patchUser, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
