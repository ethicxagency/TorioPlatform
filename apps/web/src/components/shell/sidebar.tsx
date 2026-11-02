'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChannelIcon } from '@/components/channel-icon';
import { NAV } from '@/features/dashboard/data';
import { cn } from '@/lib/utils';
import { NAV_ICON, NAV_PANEL_CLASS, NavItem } from './nav-item';
import { useShell } from './shell-context';

const HREFS: Record<string, string> = {
  Dashboard: '/',
  Inbox: '/inbox',
  Leads: '/leads',
  Customers: '/customers',
  Orders: '/orders',
  Team: '/team',
  Channels: '/channels',
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
  const sbPx = sidebarMode === 'full' ? 228 : sidebarMode === 'rail' ? 68 : 0;
  const floating = sidebarMode !== 'full' && expanded;

  return (
    <>
      {mobile && mobileNav && (
        <div
          onClick={() => setMobileNav(false)}
          className="fixed inset-x-0 bottom-0 top-14 z-[55] bg-[rgba(13,37,61,0.25)]"
        />
      )}
      <div
        className="relative shrink-0 transition-[width] duration-[280ms] ease-in-out motion-reduce:transition-none"
        style={{ width: sbPx }}
      >
        <nav
          aria-label="Main"
          onMouseEnter={() => setSidebarHover(true)}
          onMouseLeave={() => setSidebarHover(false)}
          className={cn(
            NAV_PANEL_CLASS,
            'z-[60] overflow-y-auto overflow-x-hidden border-r border-line transition-[width] duration-[280ms] ease-in-out motion-reduce:transition-none',
            sidebarMode === 'full'
              ? 'relative h-full'
              : sidebarMode === 'rail'
                ? 'absolute left-0 top-0 h-full'
                : 'fixed left-0 top-14 h-[calc(100vh-56px)]',
            floating && 'shadow-[4px_0_20px_rgba(0,55,112,0.12)]',
          )}
          style={{ width: expanded ? 228 : 68 }}
        >
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
                  icon={(color) => (
                    <svg
                      width={NAV_ICON.size}
                      height={NAV_ICON.size}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={color}
                      strokeWidth={NAV_ICON.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={n.icon} />
                    </svg>
                  )}
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
                            'flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] no-underline transition-colors duration-150 hover:bg-[rgba(13,37,61,0.045)] hover:no-underline motion-reduce:transition-none',
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
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#5A6A82"
                  strokeWidth="1.7"
                  style={{
                    transform: userCollapsed ? 'rotate(180deg)' : 'none',
                    transition: 'transform .18s',
                  }}
                >
                  <rect x="3" y="4" width="18" height="16" rx="4" />
                  <path d="M9.5 4v16M6.5 10l-1.5 2 1.5 2" />
                </svg>
              </button>
            </div>
          )}
        </nav>
      </div>
    </>
  );
}
