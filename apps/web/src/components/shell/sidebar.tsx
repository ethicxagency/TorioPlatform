'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CH, NAV } from '@/features/dashboard/data';
import { cn } from '@/lib/utils';
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
  { label: 'All', dot: '#B7B9C0', href: '/inbox' },
  { label: 'WhatsApp', dot: CH.whatsapp.color, href: '/inbox?channel=WHATSAPP' },
  { label: 'Instagram', dot: CH.instagram.color, href: '/inbox?channel=INSTAGRAM' },
  { label: 'Facebook', dot: CH.facebook.color, href: '/inbox?channel=MESSENGER' },
];

export function Sidebar() {
  const {
    sidebarMode,
    expanded,
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
          className="fixed inset-x-0 bottom-0 top-14 z-[55] bg-[rgba(23,24,28,0.25)]"
        />
      )}
      <div className="relative shrink-0" style={{ width: sbPx }}>
        <nav
          aria-label="Main"
          onMouseEnter={() => setSidebarHover(true)}
          onMouseLeave={() => setSidebarHover(false)}
          className={cn(
            'z-[60] flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden border-r border-[rgba(229,231,235,0.75)] px-[11px] py-4 transition-[width] duration-200 ease-out backdrop-blur-[24px] backdrop-saturate-150',
            'bg-[linear-gradient(180deg,rgba(236,236,255,0.96)_0%,rgba(244,244,255,0.94)_45%,rgba(255,255,255,0.96)_100%)]',
            sidebarMode === 'full'
              ? 'relative h-full'
              : sidebarMode === 'rail'
                ? 'absolute left-0 top-0 h-full'
                : 'fixed left-0 top-14 h-[calc(100vh-56px)]',
            floating && 'shadow-[4px_0_20px_rgba(16,24,40,0.12)]',
          )}
          style={{ width: expanded ? 228 : 68 }}
        >
          {NAV.map((n) => {
            const href = HREFS[n.label];
            const active = href === '/' ? pathname === '/' : !!href && pathname.startsWith(href);
            const color = active ? '#4F50D1' : '#62656D';
            const cls = cn(
              'flex shrink-0 items-center gap-2.5 no-underline hover:bg-white/60 hover:no-underline',
              expanded
                ? 'h-9 justify-start rounded-lg px-2.5'
                : 'h-[46px] w-[46px] justify-center rounded-[11px]',
            );
            const style = {
              color,
              background: active ? 'rgba(240,240,255,0.95)' : undefined,
              fontWeight: active ? 600 : 500,
              fontSize: 14,
            };
            const inner = (
              <>
                <svg
                  width={expanded ? 16 : 20}
                  height={expanded ? 16 : 20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={color}
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d={n.icon} />
                </svg>
                {expanded && <span className="flex-1 whitespace-nowrap">{n.label}</span>}
              </>
            );
            return (
              <div key={n.label}>
                {href ? (
                  <Link
                    href={href}
                    title={n.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMobileNav(false)}
                    className={cls}
                    style={style}
                  >
                    {inner}
                  </Link>
                ) : (
                  <a
                    href="#"
                    title={n.label}
                    onClick={(e) => {
                      e.preventDefault();
                      toast(`${n.label} isn't available yet`);
                    }}
                    className={cls}
                    style={style}
                  >
                    {inner}
                  </a>
                )}
                {n.subs && expanded && (
                  <div className="flex flex-col gap-px pb-1 pl-[26px] pt-0.5">
                    {SUBS.map((sb) => {
                      const on =
                        active &&
                        (sb.href === '/inbox' ? !channel : sb.href.endsWith(channel ?? '\0'));
                      return (
                        <Link
                          key={sb.label}
                          href={sb.href}
                          onClick={() => setMobileNav(false)}
                          className={cn(
                            'flex h-[30px] items-center gap-2 rounded-[7px] px-2.5 text-[13px] no-underline hover:bg-white/60 hover:no-underline',
                            on ? 'bg-white/70 font-medium text-ink' : 'text-muted hover:text-muted',
                          )}
                        >
                          <span
                            className="h-[7px] w-[7px] rounded-full"
                            style={{ background: sb.dot }}
                          />
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
            <>
              <div className="my-2 h-px bg-line" />
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
                  stroke="#62656D"
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
            </>
          )}
        </nav>
      </div>
    </>
  );
}
