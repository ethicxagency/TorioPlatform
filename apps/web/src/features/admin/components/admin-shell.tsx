'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Tags,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { adminRequest, setAdminUnauthorizedHandler } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminMe, type AdminProfile } from '../queries';

interface Shell {
  admin: AdminProfile;
  toast: (m: string) => void;
  registerEscape: (fn: () => void) => () => void;
}
const Ctx = createContext<Shell | null>(null);
export const useAdminShell = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdminShell must be used inside <AdminShell>');
  return v;
};

const NAV = [
  {
    group: 'MAIN',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/customers', label: 'Customers', icon: Users },
      { href: '/admin/workspaces', label: 'Workspaces', icon: Building2 },
      { href: '/admin/subscriptions', label: 'Subscriptions & Billing', icon: CreditCard },
      { href: '/admin/plans', label: 'Plans & Pricing', icon: Tags },
    ],
  },
  {
    group: 'PLATFORM',
    items: [
      { href: '/admin/activity', label: 'Activity & Logs', icon: ScrollText },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/** Admin chrome. Authorisation is enforced by the API on every call; this only reflects the signed-in state. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useAdminMe();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  // Stack of Escape handlers (drawers/dialogs). A stable object held in state so it is never read during render.
  const [escapes] = useState<{ stack: (() => void)[] }>(() => ({ stack: [] }));
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    setAdminUnauthorizedHandler(() => {
      qc.clear();
      router.replace('/admin/login');
    });
    return () => setAdminUnauthorizedHandler(null);
  }, [qc, router]);
  useEffect(() => {
    if (me.isError) router.replace('/admin/login');
  }, [me.isError, router]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && escapes.stack.at(-1)?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [escapes]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(t);
  }, [message]);

  const registerEscape = useCallback(
    (fn: () => void) => {
      escapes.stack.push(fn);
      return () => {
        escapes.stack = escapes.stack.filter((f) => f !== fn);
      };
    },
    [escapes],
  );
  const value = useMemo(
    () => (me.data ? { admin: me.data, toast: setMessage, registerEscape } : null),
    [me.data, registerEscape],
  );

  if (!value)
    return (
      <div className="p-6" aria-busy="true" aria-label="Loading admin">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );

  const logout = async () => {
    await adminRequest('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    qc.clear();
    router.replace('/admin/login');
  };
  const nav = (
    <nav aria-label="Admin" className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="px-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.06em] text-faint">
            {g.group}
          </div>
          <ul className="m-0 list-none p-0">
            {g.items.map((i) => {
              const active =
                i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] no-underline hover:bg-white/70 hover:no-underline',
                      active ? 'bg-primary-soft font-semibold text-primary-hover' : 'text-muted',
                    )}
                  >
                    <i.icon size={15} aria-hidden />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-line-subtle px-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
        <img src="/torio-icon.png" alt="" width={28} height={28} className="h-7 w-7" />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Torio Admin</span>
      </div>
      {nav}
      <div className="border-t border-line-subtle p-3">
        <div className="mb-2 px-1">
          <div className="truncate text-[13px] font-semibold">{value.admin.name}</div>
          <div className="truncate text-xs text-faint">{value.admin.email}</div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13.5px] text-muted hover:bg-white/70"
        >
          <LogOut size={15} aria-hidden /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <Ctx.Provider value={value}>
      <div className="flex min-h-screen bg-canvas">
        <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 border-r border-line bg-[#FAFAFD] lg:block">
          {sidebar}
        </aside>
        {open && (
          <div
            className="fixed inset-0 z-[60] lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
          >
            <div
              className="absolute inset-0 bg-[rgba(13,37,61,0.3)]"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-[260px] bg-[#FAFAFD] shadow-popover">
              {sidebar}
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-white"
            >
              <Menu size={16} />
            </button>
            <span className="text-[15px] font-semibold">Torio Admin</span>
          </header>
          <main className="mx-auto max-w-[1180px] px-4 pb-10 pt-5 sm:px-6">{children}</main>
        </div>
        {message && (
          <div
            role="status"
            className="fixed bottom-5 left-1/2 z-[100] max-w-[90vw] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-[13px] text-white shadow-popover"
          >
            {message}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
