'use client';

import Link from 'next/link';
import {
  Brain,
  Inbox,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  Settings,
  UserRoundPlus,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChannelIcon } from '@/components/channel-icon';
import { NAV } from '@/features/dashboard/data';
import { cn } from '@/lib/utils';
import { NAV_ICON, NAV_PANEL_CLASS, NavItem } from './nav-item';
import { SettingsSidebar } from './settings-sidebar';
import { useShell } from './shell-context';

const NAV_ICONS: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Inbox,
  Leads: UserRoundPlus,
  Customers: UsersRound,
  Orders: Package,
  Automation: Workflow,
  Brain,
  Settings,
};

const HREFS: Record<string, string> = {
  Dashboard: '/',
  Inbox: '/inbox',
  Leads: '/leads',
  Customers: '/customers',
  Orders: '/orders',
  Brain: '/brain',
  Settings: '/settings',
  Automation: '/automation',
};
const SUBS = [
  { label: 'All', channel: null, href: '/inbox' },
  { label: 'WhatsApp', channel: 'WHATSAPP', href: '/inbox?channel=WHATSAPP' },
  { label: 'Instagram', channel: 'INSTAGRAM', href: '/inbox?channel=INSTAGRAM' },
  { label: 'Facebook', channel: 'MESSENGER', href: '/inbox?channel=MESSENGER' },
] as const;

export function Sidebar() {
  const {
    vw,
    sidebarMode,
    expanded,
    settingsMode,
    mobileNav,
    mobile,
    wide,
    userCollapsed,
    setSidebarHover,
    setMobileNav,
    toggleSidebar,
    toast,
  } = useShell();
  const pathname = usePathname();
  const channel = useSearchParams().get('channel');
  if (sidebarMode === 'none' && !mobileNav) return null;
  // Settings brings its own <nav>, so the container is a plain element there (no nested landmarks).
  const Panel = settingsMode ? 'div' : 'nav';
  const fullPx = settingsMode ? (vw >= 1024 ? 268 : 232) : 228;
  const sbPx = sidebarMode === 'full' ? fullPx : sidebarMode === 'rail' ? 68 : 0;
  const floating = sidebarMode !== 'full' && expanded;

  return (
    <>
      {mobile && mobileNav && (
        <div
          onClick={() => setMobileNav(false)}
          className="fixed inset-x-0 bottom-0 top-14 z-[55] glass-scrim"
        />
      )}
      <div
        className="relative shrink-0 transition-[width] duration-[220ms] ease-[var(--ease-standard)] motion-reduce:transition-none"
        style={{ width: sbPx }}
      >
        <Panel
          aria-label={settingsMode ? undefined : 'Main'}
          onMouseEnter={() => setSidebarHover(true)}
          onMouseLeave={() => setSidebarHover(false)}
          className={cn(
            settingsMode ? 'flex flex-col bg-white' : NAV_PANEL_CLASS,
            'z-[60] overflow-y-auto overflow-x-hidden border-r border-line transition-[width] duration-[220ms] ease-[var(--ease-standard)] motion-reduce:transition-none',
            sidebarMode === 'full'
              ? 'relative h-full'
              : sidebarMode === 'rail'
                ? 'absolute left-0 top-0 h-full'
                : 'fixed left-0 top-14 h-[calc(100vh-56px)]',
            floating && 'shadow-[4px_0_20px_rgba(0,55,112,0.12)]',
          )}
          style={{ width: expanded ? (settingsMode ? fullPx : 228) : 68 }}
        >
          {settingsMode ? (
            <SettingsSidebar />
          ) : (
            <>
              {NAV.map((n) => {
                const href = HREFS[n.label];
                const active =
                  href === '/'
                    ? pathname === '/'
                    : href === '/settings'
                      ? settingsMode
                      : !!href && pathname.startsWith(href);
                return (
                  <div key={n.label}>
                    <NavItem
                      label={n.label}
                      active={active}
                      expanded={expanded}
                      href={href}
                      onClick={() => {
                        if (href) setMobileNav(false);
                        else toast(`${n.label} isn't available yet`);
                      }}
                      icon={(color) => {
                        const I = NAV_ICONS[n.label];
                        return I ? (
                          <I
                            size={NAV_ICON.size}
                            strokeWidth={NAV_ICON.strokeWidth}
                            color={color}
                            aria-hidden
                          />
                        ) : null;
                      }}
                    />
                    {n.subs && expanded && (
                      // Indented under the Inbox icon with a guide line, so channel shortcuts read as children of Inbox.
                      <div className="mb-1 ml-[23px] mt-0.5 flex animate-panel-in flex-col gap-0.5 border-l border-line pl-[14px] motion-reduce:animate-none">
                        {SUBS.map((sb) => {
                          const on =
                            active &&
                            (sb.href === '/inbox' ? !channel : sb.href.endsWith(channel ?? '\0'));
                          return (
                            <Link
                              key={sb.label}
                              href={sb.href}
                              onClick={() => setMobileNav(false)}
                              aria-current={on ? 'page' : undefined}
                              className={cn(
                                'flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] no-underline transition-colors duration-150 hover:glass-scrim hover:no-underline motion-reduce:transition-none',
                                on
                                  ? 'bg-[rgba(91,92,226,0.09)] font-semibold text-primary-hover hover:text-primary-hover'
                                  : 'font-medium text-[#3C4F68] hover:text-ink',
                              )}
                            >
                              {sb.channel ? (
                                <ChannelIcon channel={sb.channel} size={16} decorative />
                              ) : (
                                <span className="flex w-4 justify-center">
                                  <span className="h-[7px] w-[7px] rounded-full bg-[#9A9DA6]" />
                                </span>
                              )}
                              {sb.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex-1" />
              {wide && (
                // Pinned footer: stays visible below the scrolling items and never covers them.
                <div className="sticky -bottom-3 -mx-[11px] -mb-3 mt-2 border-t border-line bg-[#FAFAFC] px-[11px] pb-3 pt-2">
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label="Toggle sidebar"
                    className="ml-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-[rgba(240,240,255,0.9)]"
                  >
                    <PanelLeftClose
                      size={17}
                      strokeWidth={1.75}
                      aria-hidden
                      className="text-muted transition-transform duration-200 motion-reduce:transition-none"
                      style={{ transform: userCollapsed ? 'rotate(180deg)' : 'none' }}
                    />
                  </button>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
