'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  UserX,
  Building2,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  ScrollText,
  Settings,
  Sparkles,
  Tags,
  Users,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HEADER_ICON_BTN } from '@/components/shell/header-popover';
import { NAV_ICON, NAV_PANEL_CLASS, NavItem } from '@/components/shell/nav-item';
import { TorioLogo } from '@/components/shell/torio-logo';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/toaster';
import { toast, type Toast } from '@/lib/toast';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { adminRequest, setAdminUnauthorizedHandler } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminMe, type AdminProfile } from '../queries';

interface Shell {
  admin: AdminProfile;
  toast: Toast;
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
      { href: '/admin/deletions', label: 'Deletion requests', icon: UserX },
    ],
  },
  {
    group: 'INTEGRATIONS',
    items: [
      { href: '/admin/integrations/meta', label: 'Meta Developer', icon: Plug },
      { href: '/admin/ai', label: 'AI Management', icon: Sparkles },
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
    () => (me.data ? { admin: me.data, toast, registerEscape } : null),
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
  const initials = value.admin.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const nav = (
    <nav
      aria-label="Admin"
      className={cn(NAV_PANEL_CLASS, 'h-full w-[228px] overflow-y-auto border-r border-line')}
    >
      {NAV.map((g, gi) => (
        <div key={g.group} className={cn('flex flex-col gap-0.5', gi > 0 && 'mt-2')}>
          <div className="px-3 pb-1 pt-1 text-[10.5px] font-semibold tracking-[0.06em] text-faint">
            {g.group}
          </div>
          {g.items.map((i) => {
            const active =
              i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href);
            return (
              <NavItem
                key={i.href}
                href={i.href}
                label={i.label}
                active={active}
                icon={(color) => (
                  <i.icon
                    size={NAV_ICON.size}
                    strokeWidth={NAV_ICON.strokeWidth}
                    color={color}
                    aria-hidden
                  />
                )}
              />
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <Ctx.Provider value={value}>
      <div className="relative flex h-screen flex-col overflow-hidden bg-canvas text-sm text-ink">
        <header className="relative z-40 h-14 shrink-0 border-b border-line glass-header">
          <div className="flex h-full items-center gap-2 pl-4 pr-3 sm:pl-[22px] sm:pr-5">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className={cn(HEADER_ICON_BTN, '-ml-1.5 lg:hidden')}
            >
              <Menu size={18} aria-hidden />
            </button>
            <TorioLogo className="block h-9 w-auto shrink-0 object-contain" />
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-primary-hover">
              Admin
            </span>
            <div className="flex-1" />
            <AccountMenu
              name={value.admin.name}
              email={value.admin.email}
              initials={initials}
              onLogout={() => void logout()}
            />
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1">
          <aside className="hidden w-[228px] shrink-0 lg:block">{nav}</aside>
          {open && (
            <div className="lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
              <div
                onClick={() => setOpen(false)}
                className="fixed inset-x-0 bottom-0 top-14 z-[55] glass-scrim"
              />
              <div className="fixed bottom-0 left-0 top-14 z-[60] animate-drawer-in shadow-popover">
                {nav}
              </div>
            </div>
          )}
          <main
            key={pathname}
            id="main"
            className="min-w-0 flex-1 animate-page-in overflow-y-auto overflow-x-hidden"
          >
            <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-5 sm:px-6">{children}</div>
          </main>
        </div>
        <Toaster />
      </div>
    </Ctx.Provider>
  );
}

/** Same capsule and menu as the customer app's account menu, scoped to the signed-in platform admin. */
function AccountMenu({
  name,
  email,
  initials,
  onLogout,
}: {
  name: string;
  email: string;
  initials: string;
  onLogout: () => void;
}) {
  const { registerEscape } = useAdminShell();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, open, () => setOpen(false));
  useEffect(
    () => (open ? registerEscape(() => setOpen(false)) : undefined),
    [open, registerEscape],
  );
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        title={name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 cursor-pointer items-center gap-2.5 rounded-[14px] border border-line bg-white py-1.5 pl-1.5 pr-3 shadow-[0_1px_2px_rgba(13,37,61,0.04)] transition-[background-color,border-color] duration-150 hover:border-line-input hover:bg-wash aria-expanded:border-line-input aria-expanded:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none max-sm:h-10 max-sm:rounded-full max-sm:p-0.5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white">
          {initials}
        </span>
        <span className="max-w-[160px] truncate text-[15px] font-semibold leading-none text-ink max-sm:hidden">
          {name}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden
          className={cn(
            'text-faint transition-transform duration-200 max-sm:hidden motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="glass-menu absolute right-0 top-full z-50 mt-2 w-[min(300px,calc(100vw-24px))] animate-panel-in rounded-2xl border border-line p-2 shadow-popover"
        >
          <div className="flex items-center gap-3 px-2 pb-2.5 pt-1.5">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-white"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-ink">{name}</div>
              <div className="truncate text-xs text-muted">{email}</div>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-2.5 text-left text-[13.5px] text-danger transition-colors duration-150 hover:bg-danger-soft focus-visible:bg-danger-soft focus-visible:outline-none motion-reduce:transition-none"
          >
            <LogOut size={16} aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
