'use client';

import {
  Bell,
  BellOff,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  LogOut,
  Search,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GlobalSearch } from '@/features/inbox/components/global-search';
import { clearStoredDrafts } from '@/features/inbox/use-drafts';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { HEADER_ICON_BTN, HeaderPopover, usePopoverClose } from './header-popover';
import { useShell } from './shell-context';
import { TorioLogo } from './torio-logo';

const MENU_ITEM =
  'flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border-none bg-transparent px-2.5 text-left text-[13.5px] font-medium text-ink transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-none motion-reduce:transition-none';

function MenuAction({
  icon: Icon,
  label,
  onSelect,
  danger,
  chevron,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  /** Sign out: restrained red text with a faint red hover. */
  danger?: boolean;
  /** Marks a navigation item. */
  chevron?: boolean;
}) {
  const close = usePopoverClose();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        close();
        onSelect();
      }}
      className={cn(
        MENU_ITEM,
        danger && 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft',
      )}
    >
      <Icon size={16} aria-hidden className={danger ? 'text-danger' : 'text-muted'} />
      <span className="flex-1 truncate">{label}</span>
      {chevron && <ChevronRight size={14} aria-hidden className="shrink-0 text-faint" />}
    </button>
  );
}

export function TopBar() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { workspace, role, can } = useWorkspace();
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const { mobile, setMobileNav, mobileNav, toast } = useShell();
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (inputRef.current) inputRef.current.focus();
        else setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // No help centre or support channel exists yet, so Help says so instead of linking somewhere invented.
  const stub = () => toast("This action isn't available yet");
  const workspaceName = workspace?.name ?? '';

  return (
    <header className="relative z-40 h-14 shrink-0 border-b border-line glass-header">
      {mobile && searchOpen && (
        <div className="absolute inset-0 z-[2] flex items-center bg-white px-3">
          <GlobalSearch inputRef={inputRef} compact onClose={() => setSearchOpen(false)} />
        </div>
      )}
      <div className="relative z-[1] flex h-full items-center gap-2 pl-4 pr-3 sm:pl-[22px] sm:pr-5">
        {mobile && (
          <button
            type="button"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Open navigation"
            className={cn(HEADER_ICON_BTN, '-ml-1.5')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        )}
        <TorioLogo className="block h-9 w-auto shrink-0 object-contain" />
        <div className="flex-1" />
        {!mobile && <GlobalSearch inputRef={inputRef} />}
        <div className="flex-1" />
        {mobile && (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            title="Search"
            className={HEADER_ICON_BTN}
          >
            <Search size={18} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={stub}
          aria-label="Help & Support"
          title="Help & Support"
          className={cn(HEADER_ICON_BTN, 'max-[380px]:hidden')}
        >
          <CircleHelp size={18} aria-hidden />
        </button>

        <HeaderPopover
          label="Notifications"
          role="dialog"
          panelClassName="w-[min(360px,calc(100vw-24px))]"
          trigger={() => <Bell size={18} aria-hidden />}
        >
          {
            <>
              <div className="border-b border-line-subtle px-4 py-3 text-sm font-semibold text-ink">
                Notifications
              </div>
              {/* Torio has no notification feed yet (see Settings > Notifications), so there is nothing to list
                  and no unread dot is shown. */}
              <div className="flex flex-col items-center px-6 py-9 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-wash-2 text-muted">
                  <BellOff size={18} aria-hidden />
                </span>
                <div className="text-[13.5px] font-semibold text-ink">No notifications</div>
                <div className="mt-1 max-w-[240px] text-xs text-muted">
                  Torio doesn&apos;t send notifications yet. New activity will show up here once it
                  does.
                </div>
              </div>
            </>
          }
        </HeaderPopover>

        <HeaderPopover
          label="Account menu"
          tooltip={user?.name ?? 'Account'}
          role="menu"
          panelClassName="max-h-[min(560px,calc(100vh-72px))] w-[min(340px,calc(100vw-24px))] overflow-y-auto rounded-2xl p-2"
          triggerClassName="h-12 w-auto gap-2.5 rounded-[14px] border border-line bg-white py-1.5 pl-1.5 pr-3 shadow-[0_1px_2px_rgba(13,37,61,0.04)] transition-[background-color,border-color] duration-150 hover:border-line-input hover:bg-wash aria-expanded:border-line-input aria-expanded:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none max-md:pr-2.5 max-sm:h-10 max-sm:rounded-full max-sm:p-0.5"
          trigger={(open) => (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white max-sm:h-9 max-sm:w-9">
                {initials}
              </span>
              {!mobile && (
                <>
                  <span className="max-w-[120px] truncate text-[15px] font-semibold leading-none text-ink lg:max-w-[200px]">
                    {workspaceName || user?.name}
                  </span>
                  <ChevronDown
                    size={15}
                    strokeWidth={2}
                    aria-hidden
                    className={cn(
                      'text-faint transition-transform duration-200 motion-reduce:transition-none',
                      open && 'rotate-180',
                    )}
                  />
                </>
              )}
            </>
          )}
        >
          {
            <>
              <div className="flex items-center gap-3 px-2 pb-2.5 pt-1.5">
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-white"
                >
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-ink">
                      {user?.name}
                    </span>
                    {role && (
                      <span className="shrink-0 rounded-full bg-primary-soft px-2 py-px text-[10.5px] font-semibold capitalize text-primary-hover">
                        {role.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted">{user?.email}</div>
                </div>
              </div>
              {workspace && (
                <div className="mb-1.5 flex items-center gap-3 rounded-xl border border-primary-line bg-primary-tint px-2.5 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-primary shadow-[0_0_0_1px_rgba(0,55,112,0.06)]">
                    <Building2 size={16} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {workspace.name}
                    </span>
                    <span className="block text-xs text-muted">Current workspace</span>
                  </span>
                  <Check size={16} aria-hidden className="shrink-0 text-primary" />
                </div>
              )}
              <div className="mt-2 px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
                Account
              </div>
              <MenuAction
                icon={UserRound}
                label="My profile"
                chevron
                onSelect={() => router.push('/settings/general#personal')}
              />
              <MenuAction
                icon={Building2}
                label="Workspace settings"
                chevron
                onSelect={() => router.push('/settings/general#workspace')}
              />
              {can('billing:read') && (
                <MenuAction
                  icon={CreditCard}
                  label="Billing & subscription"
                  chevron
                  onSelect={() => router.push('/billing')}
                />
              )}
              <div className="my-1.5 h-px bg-line-subtle" />
              <MenuAction
                icon={LogOut}
                label="Sign out"
                danger
                onSelect={() => {
                  clearStoredDrafts();
                  void signOut();
                }}
              />
            </>
          }
        </HeaderPopover>
      </div>
    </header>
  );
}
