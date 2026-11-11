'use client';

import { Bell, BellOff, ChevronDown, CircleHelp, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GlobalSearch } from '@/features/inbox/components/global-search';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { HEADER_ICON_BTN, HeaderPopover } from './header-popover';
import { AccountPanel } from './account-panel';
import { AddStoreButton, StoreAvatar } from './store-switcher';
import { useShell } from './shell-context';
import { TorioLogo } from './torio-logo';

export function TopBar() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
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
        <AddStoreButton compact={mobile} />
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
          label="Store menu"
          tooltip={workspaceName || 'Stores'}
          role="dialog"
          panelClassName="max-h-[min(560px,calc(100vh-72px))] w-[min(340px,calc(100vw-24px))] overflow-y-auto rounded-2xl p-0"
          triggerClassName="h-12 w-auto gap-2.5 rounded-[14px] border border-line bg-white py-1.5 pl-1.5 pr-3 shadow-[0_1px_2px_rgba(13,37,61,0.04)] transition-[background-color,border-color] duration-150 hover:border-line-input hover:bg-wash aria-expanded:border-line-input aria-expanded:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none max-md:pr-2.5 max-sm:h-10 max-sm:rounded-full max-sm:p-0.5"
          trigger={(open) => (
            <>
              {/* The header avatar is the ACTIVE STORE's: its logo, else its initials. The person's own picture is in the menu. */}
              <StoreAvatar
                name={workspaceName || 'Torio'}
                logo={workspace?.logo}
                className="h-9 w-9 rounded-full text-[13px]"
              />
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
          <AccountPanel />
        </HeaderPopover>
      </div>
    </header>
  );
}
