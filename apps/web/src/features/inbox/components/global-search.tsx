'use client';

import { Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { CHANNELS } from '../constants';
import { initialsOf } from '../format';
import { useGlobalSearch } from '../queries';

/** Highlights the matching part of a result without rendering HTML. */
function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-primary-soft text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

interface Item {
  key: string;
  group: string;
  initials: string;
  title: string;
  sub: string;
  href: string;
}

export function GlobalSearch({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const router = useRouter();
  const { toast } = useShell();
  const { workspaceId } = useWorkspace();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const blur = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => () => clearTimeout(blur.current), []);

  const search = useGlobalSearch(workspaceId, debounced);
  const items = useMemo<Item[]>(() => {
    if (!search.data) return [];
    return [
      ...search.data.conversations.map((c) => ({
        key: `c-${c.id}`,
        group: 'Conversations',
        initials: initialsOf(c.customerName),
        title: c.customerName,
        sub: `${CHANNELS[c.provider].label} · ${c.preview || 'No messages'}`,
        href: '/inbox',
      })),
      ...search.data.customers.map((c) => ({
        key: `u-${c.id}`,
        group: 'Customers',
        initials: initialsOf(c.name),
        title: c.name,
        sub: [c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details',
        href: '/inbox',
      })),
    ];
  }, [search.data]);

  const go = (it: Item) => {
    setOpen(false);
    setQ('');
    router.push(it.href);
    if (it.group === 'Customers') toast('Customer pages are coming soon — showing the Inbox');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      const it = items[sel];
      if (it) {
        e.preventDefault();
        go(it);
        (e.target as HTMLElement).blur();
      }
    } else if (e.key === 'Escape') {
      (e.target as HTMLElement).blur();
      setOpen(false);
    }
  };

  const term = debounced.trim();
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <div className="relative w-[clamp(240px,38vw,560px)]">
      <div className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-white/70 px-3">
        <Search size={16} className="shrink-0 text-faint" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-label="Search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setSel(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blur.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search conversations, customers…"
          className="w-full border-none bg-transparent text-sm text-ink"
        />
        {search.isFetching && (
          <Loader2 size={14} className="shrink-0 animate-spin text-faint" aria-label="Searching" />
        )}
        <kbd className="shrink-0 rounded-[5px] border border-line bg-wash px-1.5 py-0.5 font-mono text-[11.5px] text-faint">
          ⌘K
        </kbd>
      </div>
      {open && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute inset-x-0 top-[46px] z-50 max-h-[420px] animate-panel-in overflow-y-auto rounded-xl border border-line bg-white/95 p-1.5 shadow-popover backdrop-blur-[20px]"
        >
          {!term && (
            <div className="px-3 py-4 text-center text-[13px] text-muted">
              Type to search conversations and customers.
            </div>
          )}
          {term && search.isError && (
            <div role="alert" className="px-3 py-4 text-center text-[13px] text-danger">
              Search failed. Try again.
            </div>
          )}
          {term && !search.isError && !search.isFetching && items.length === 0 && (
            <div className="px-3 py-4 text-center text-[13px] text-muted">
              No matches for “{term}”.
            </div>
          )}
          {term && search.isPending && search.fetchStatus !== 'idle' && (
            <div className="px-3 py-4 text-center text-[13px] text-muted">Searching…</div>
          )}
          {groups.map((g) => (
            <div key={g}>
              <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
                {g}
              </div>
              {items
                .filter((i) => i.group === g)
                .map((it) => {
                  const idx = items.indexOf(it);
                  return (
                    <button
                      key={it.key}
                      role="option"
                      aria-selected={idx === sel}
                      type="button"
                      onMouseDown={() => go(it)}
                      onMouseEnter={() => setSel(idx)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left',
                        idx === sel ? 'bg-[#F1F1FF]' : 'hover:bg-wash',
                      )}
                    >
                      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-line-subtle text-[11px] font-semibold text-muted">
                        {it.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">
                          <Highlight text={it.title} q={term} />
                        </span>
                        <span className="block truncate text-xs text-faint">
                          <Highlight text={it.sub} q={term} />
                        </span>
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
          {term && (
            <div className="px-3 pb-1 pt-2 text-[11.5px] text-faint">
              Orders aren&apos;t searchable yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
