'use client';

import {
  Brain,
  CornerDownLeft,
  LayoutDashboard,
  Inbox as InboxIcon,
  Package,
  Plug,
  Search,
  Settings,
  UserPlus,
  Users,
  UsersRound,
  Zap,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChannelIcon } from '@/components/channel-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_INFO } from '@/features/orders/constants';
import { formatMoney } from '@/features/orders/money';
import { useOrders } from '@/features/orders/queries';
import { EMPTY_ORDER_FILTERS } from '@/features/orders/types';
import { STAGE } from '@/features/leads/constants';
import { useLeads } from '@/features/leads/queries';
import { EMPTY_FILTERS } from '@/features/leads/types';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { CHANNELS } from '../constants';
import { initialsOf } from '../format';
import { useGlobalSearch } from '../queries';
import type { Provider } from '../types';
import { useDismiss } from '../use-dismiss';

const subscribeNever = () => () => undefined;

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

type Lead =
  { kind: 'avatar'; initials: string; provider?: Provider } | { kind: 'icon'; icon: LucideIcon };

interface Item {
  key: string;
  group: string;
  lead: Lead;
  title: string;
  sub: string;
  badge?: string;
  href: string;
}

/** Destinations the app really has; each is offered only to members who can open it. */
const DESTINATIONS: { label: string; href: string; icon: LucideIcon; needs?: string }[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Inbox', href: '/inbox', icon: InboxIcon },
  { label: 'Leads', href: '/leads', icon: UserPlus, needs: 'leads:read' },
  { label: 'Customers', href: '/customers', icon: Users, needs: 'customers:read' },
  { label: 'Orders', href: '/orders', icon: Package, needs: 'orders:read' },
  { label: 'Teams', href: '/team', icon: UsersRound, needs: 'members:read' },
  { label: 'Channels', href: '/channels', icon: Plug, needs: 'channels:read' },
  { label: 'Automation', href: '/automation', icon: Zap, needs: 'automation:read' },
  { label: 'Brain', href: '/brain', icon: Brain, needs: 'brain:read' },
  { label: 'Settings', href: '/settings', icon: Settings },
];

const GROUP_ORDER = ['Conversations', 'Customers', 'Leads', 'Orders', 'Quick navigation'];
const STATUS_LABEL = { OPEN: 'Open', SNOOZED: 'Snoozed', RESOLVED: 'Resolved' } as const;

interface Props {
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Compact (phone) mode: full-width field that grabs focus and offers a close button. */
  compact?: boolean;
  onClose?: () => void;
}

export function GlobalSearch({ inputRef, compact, onClose }: Props) {
  const router = useRouter();
  const { workspaceId, can } = useWorkspace();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  // The platform is only known in the browser, so the shortcut hint appears after hydration (null on the server).
  const mac = useSyncExternalStore(
    subscribeNever,
    () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent),
    () => null,
  );
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (compact) inputRef.current?.focus();
  }, [compact, inputRef]);
  useDismiss(wrap, open, () => setOpen(false));

  const term = debounced.trim();
  // Conversations and customers come from the search endpoint. Leads and orders reuse their own list endpoints
  // (which already take `q`), and only run for members who may read them, so nothing is fetched or shown otherwise.
  const search = useGlobalSearch(workspaceId, term);
  const leads = useLeads(term && can('leads:read') ? workspaceId : null, {
    filters: { ...EMPTY_FILTERS, q: term },
    sort: 'createdAt',
    dir: 'desc',
    page: 1,
    pageSize: 4,
  });
  const orders = useOrders(term && can('orders:read') ? workspaceId : null, {
    filters: { ...EMPTY_ORDER_FILTERS, q: term },
    sort: 'createdAt',
    dir: 'desc',
    page: 1,
    pageSize: 4,
  });

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (term) {
      for (const c of search.data?.conversations ?? [])
        out.push({
          key: `c-${c.id}`,
          group: 'Conversations',
          lead: { kind: 'avatar', initials: initialsOf(c.customerName), provider: c.provider },
          title: c.customerName,
          sub: `${CHANNELS[c.provider].label} · ${c.preview || 'No messages'}`,
          badge: STATUS_LABEL[c.status],
          href: `/inbox?conversation=${c.id}`,
        });
      for (const c of search.data?.customers ?? [])
        out.push({
          key: `u-${c.id}`,
          group: 'Customers',
          lead: { kind: 'avatar', initials: initialsOf(c.name) },
          title: c.name,
          sub: [c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details',
          href: can('customers:read') ? `/customers?customer=${c.id}` : '/inbox',
        });
      for (const l of leads.data?.data ?? [])
        out.push({
          key: `l-${l.id}`,
          group: 'Leads',
          lead: { kind: 'avatar', initials: initialsOf(l.name) },
          title: l.name,
          sub: [l.company, l.email].filter(Boolean).join(' · ') || 'No contact details',
          badge: STAGE[l.stage].label,
          href: `/leads?lead=${l.id}`,
        });
      for (const o of orders.data?.data ?? [])
        out.push({
          key: `o-${o.id}`,
          group: 'Orders',
          lead: { kind: 'icon', icon: Package },
          title: `#${o.number} · ${o.customer.name}`,
          sub: formatMoney(o.totalMinor, o.currency),
          badge: STATUS_INFO[o.status].label,
          href: '/orders',
        });
    }
    const needle = term.toLowerCase();
    for (const d of DESTINATIONS) {
      if (d.needs && !can(d.needs as Parameters<typeof can>[0])) continue;
      if (needle && !d.label.toLowerCase().includes(needle)) continue;
      out.push({
        key: `n-${d.href}`,
        group: 'Quick navigation',
        lead: { kind: 'icon', icon: d.icon },
        title: d.label,
        sub: `Go to ${d.label}`,
        href: d.href,
      });
    }
    return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [term, search.data, leads.data, orders.data, can]);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [sel, items.length]);

  const go = (it: Item) => {
    setOpen(false);
    setQ('');
    setDebounced('');
    inputRef.current?.blur();
    onClose?.();
    router.push(it.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setSel((s) => Math.min(s + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      const it = items[sel];
      if (it && open) {
        e.preventDefault();
        go(it);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      (e.target as HTMLElement).blur();
      onClose?.();
    }
  };

  const loading = !!term && (search.isPending || search.isFetching) && !search.data;
  const groups = GROUP_ORDER.filter((g) => items.some((i) => i.group === g));
  const noResults = !!term && !loading && !search.isError && items.length === 0;

  return (
    <div ref={wrap} className={cn('relative', compact ? 'w-full' : 'w-[clamp(240px,38vw,560px)]')}>
      <div
        className={cn(
          'flex h-10 items-center gap-2.5 rounded-xl border bg-wash px-3 transition-[background-color,border-color,box-shadow] duration-150 hover:border-line focus-within:border-primary focus-within:bg-white focus-within:ring-[3px] focus-within:ring-primary/15 motion-reduce:transition-none',
          open ? 'border-primary bg-white ring-[3px] ring-primary/15' : 'border-transparent',
        )}
      >
        <Search size={18} className="shrink-0 text-faint" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
          aria-label="Search"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setSel(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search conversations, customers, orders…"
          className="w-full min-w-0 border-none bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ('');
              setDebounced('');
              inputRef.current?.focus();
            }}
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-faint hover:bg-wash-2 hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
        {compact ? (
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="shrink-0 cursor-pointer text-[13px] font-medium text-primary"
          >
            Cancel
          </button>
        ) : (
          mac !== null && (
            <kbd className="flex h-6 shrink-0 items-center rounded-md border border-line bg-white px-1.5 font-sans text-[11.5px] font-medium text-muted shadow-[0_1px_0_rgba(0,55,112,0.06)]">
              {mac ? '⌘ K' : 'Ctrl K'}
            </kbd>
          )
        )}
      </div>

      {open && (
        <div
          id="global-search-results"
          className="absolute inset-x-0 top-[46px] z-50 flex max-h-[min(480px,calc(100vh-90px))] animate-panel-in flex-col overflow-hidden rounded-xl border border-line glass-menu shadow-popover motion-reduce:animate-none"
        >
          <div
            ref={list}
            role="listbox"
            aria-label="Search results"
            className="overflow-y-auto p-1.5"
          >
            {loading && (
              <div aria-label="Searching" className="flex flex-col gap-2 p-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-3 w-3/5 bg-wash-2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {term && search.isError && (
              <div role="alert" className="flex flex-col items-center gap-2 px-3 py-5 text-center">
                <span className="text-[13px] text-danger">Search couldn’t be completed.</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void search.refetch()}
                  className="cursor-pointer rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-wash"
                >
                  Try again
                </button>
              </div>
            )}
            {noResults && (
              <div className="px-3 py-6 text-center">
                <div className="text-[13.5px] font-medium text-ink">No results found</div>
                <div className="mt-0.5 text-xs text-muted">
                  Check the spelling or try a different search term.
                </div>
              </div>
            )}
            {!loading &&
              groups.map((g) => (
                <div key={g} role="group" aria-label={g}>
                  <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
                    {g}
                  </div>
                  {items
                    .filter((i) => i.group === g)
                    .map((it) => {
                      const idx = items.indexOf(it);
                      const on = idx === sel;
                      return (
                        <button
                          key={it.key}
                          role="option"
                          aria-selected={on}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            go(it);
                          }}
                          onMouseEnter={() => setSel(idx)}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-100 motion-reduce:transition-none',
                            on ? 'bg-primary-soft' : 'hover:bg-wash',
                          )}
                        >
                          <span className="relative h-8 w-8 shrink-0">
                            {it.lead.kind === 'avatar' ? (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-wash-2 text-[11px] font-semibold text-muted">
                                {it.lead.initials}
                              </span>
                            ) : (
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-wash-2 text-muted">
                                <it.lead.icon size={16} aria-hidden />
                              </span>
                            )}
                            {it.lead.kind === 'avatar' && it.lead.provider && (
                              <span className="absolute -bottom-0.5 -left-0.5 rounded-[5px] bg-white p-px">
                                <ChannelIcon channel={it.lead.provider} size={13} decorative />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-ink">
                              <Highlight text={it.title} q={term} />
                            </span>
                            <span className="block truncate text-xs text-muted">
                              <Highlight text={it.sub} q={term} />
                            </span>
                          </span>
                          {it.badge && (
                            <span className="shrink-0 rounded-full bg-wash-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                              {it.badge}
                            </span>
                          )}
                          {on && (
                            <CornerDownLeft size={14} aria-hidden className="shrink-0 text-faint" />
                          )}
                        </button>
                      );
                    })}
                </div>
              ))}
          </div>
          <div className="hidden items-center gap-3 border-t border-line-subtle bg-wash px-3 py-1.5 text-[11.5px] text-muted sm:flex">
            <span>↑↓ to navigate</span>
            <span>↵ to open</span>
            <span>esc to close</span>
          </div>
        </div>
      )}
    </div>
  );
}
