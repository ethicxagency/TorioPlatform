'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { GuardedLink } from '@/features/settings/components/bits';
import { SETTINGS } from '@/features/settings/nav';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { useShell } from './shell-context';

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Navigation while in Settings. It replaces the main sidebar's items (Shopify-admin style): Just Back, the title and
 * the permitted sections; the list uses the whole height and ends the sidebar. Which item is active comes only
 * from the URL, so refreshes, deep links and back/forward all land on the right one.
 */
export function SettingsSidebar() {
  const pathname = usePathname();
  const { can } = useWorkspace();
  const { lastAppPath, setMobileNav } = useShell();
  const items = SETTINGS.filter((s) => !s.needs || can(s.needs));

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <GuardedLink
          href={lastAppPath()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-muted no-underline transition-colors duration-150 hover:bg-wash hover:text-ink hover:no-underline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Back</span>
        </GuardedLink>
        <h2 className="m-0 font-card-title">Settings</h2>
      </div>

      <nav aria-label="Settings" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {items.map((s) => {
            const on = isActive(pathname, s.href);
            return (
              <li key={s.key}>
                <GuardedLink
                  href={s.href}
                  onNavigate={() => setMobileNav(false)}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-[14px] no-underline transition-colors duration-150 hover:no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    on
                      ? 'bg-primary-soft font-semibold text-primary-hover'
                      : 'font-medium text-[#3C4F68] hover:bg-wash hover:text-ink',
                  )}
                  current={on}
                >
                  <s.icon
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden
                    className={cn('shrink-0', on ? 'text-primary' : 'text-faint')}
                  />
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  {s.unavailable && (
                    <span className="rounded-[5px] bg-wash-2 px-1.5 py-px text-[10px] font-medium text-muted">
                      Soon
                    </span>
                  )}
                </GuardedLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
