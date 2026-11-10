'use client';

import { ArrowLeft, Search, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { GuardedLink } from '@/features/settings/components/bits';
import { SETTINGS } from '@/features/settings/nav';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { useShell } from './shell-context';

/** Up to two initials from the words of a name, ignoring punctuation ("UrbanNest (demo)" is UD). */
const workspaceInitials = (name: string) =>
  (name.match(/[\p{L}\p{N}]+/gu) ?? [name])
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Navigation while in Settings. It replaces the main sidebar's items (Shopify-admin style): Back, search, the
 * workspace and the permitted sections; the list uses the rest of the height and ends the sidebar. Which item is active comes only
 * from the URL, so refreshes, deep links and back/forward all land on the right one.
 */
export function SettingsSidebar() {
  const pathname = usePathname();
  const { can, workspace } = useWorkspace();
  const { lastAppPath, setMobileNav } = useShell();
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const allowed = SETTINGS.filter((s) => !s.needs || can(s.needs));
  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return allowed;
    return allowed.filter((s) =>
      [s.title, s.description, ...s.keywords].join(' ').toLowerCase().includes(term),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, workspace?.role]);

  const secondary = workspace?.contactEmail || workspace?.slug;

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

      <div className="px-3 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
          <Search size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-faint" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search settings"
            placeholder="Search settings"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (q) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQ('');
                } else searchRef.current?.blur();
              }
            }}
            className="min-w-0 flex-1 border-none bg-transparent text-[13.5px]"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQ('');
                searchRef.current?.focus();
              }}
              className="cursor-pointer text-faint hover:text-ink"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </label>
      </div>

      {workspace && (
        <div className="mx-3 mb-2 flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-primary-soft text-[12px] font-semibold text-primary-hover"
          >
            {workspaceInitials(workspace.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink">{workspace.name}</div>
            {secondary && <div className="truncate text-xs text-muted">{secondary}</div>}
          </div>
        </div>
      )}

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
        {items.length === 0 && (
          <p role="status" className="m-0 px-2.5 py-3 text-[13px] text-muted">
            No settings match “{q.trim()}”.
          </p>
        )}
      </nav>
    </div>
  );
}
