'use client';

import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useSwitchStore, useWorkspace } from '@/lib/workspace';
import { HeaderPopover, usePopoverClose } from './header-popover';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

/** A store's logo, or its initials when it has none (or the image fails to load). */
export function StoreAvatar({
  name,
  logo,
  className,
}: {
  name: string;
  logo?: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-primary-soft text-[12px] font-semibold text-primary-hover',
        className,
      )}
    >
      {logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

function Panel() {
  const close = usePopoverClose();
  const router = useRouter();
  const { stores, workspaceId } = useWorkspace();
  const switchStore = useSwitchStore();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? stores.filter((s) => `${s.name} ${s.slug}`.toLowerCase().includes(t)) : stores;
  }, [stores, q]);

  const pick = async (id: string) => {
    if (id === workspaceId) return close();
    try {
      await switchStore.mutateAsync(id);
      close();
      // A sensible landing in the newly selected store; nothing of the previous store stays on screen.
      router.push('/');
    } catch {
      toast.error('Could not switch stores. Try again.');
    }
  };

  return (
    <div className="flex flex-col">
      {
        <label className="m-2 mb-1 flex h-9 items-center gap-2 rounded-[var(--radius-input)] bg-wash px-2.5">
          <Search size={14} aria-hidden className="shrink-0 text-faint" />
          <input
            autoFocus
            aria-label="Search stores"
            placeholder="Search stores"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
          />
        </label>
      }
      <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
        Your stores
      </div>
      <ul
        role="listbox"
        aria-label="Stores"
        className="m-0 max-h-[300px] list-none overflow-y-auto p-1.5 pt-0"
      >
        {shown.map((s) => {
          const on = s.id === workspaceId;
          return (
            <li key={s.id} role="option" aria-selected={on}>
              <button
                type="button"
                disabled={switchStore.isPending}
                onClick={() => void pick(s.id)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border-none bg-transparent px-2 py-2 text-left transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-none disabled:opacity-60 motion-reduce:transition-none',
                  on && 'bg-primary-tint hover:bg-primary-tint',
                )}
              >
                <StoreAvatar name={s.name} logo={s.logo} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {s.name}
                  </span>
                  <span className="block truncate text-xs text-muted">{s.slug}</span>
                </span>
                {on && (
                  <Check size={16} aria-label="Active store" className="shrink-0 text-primary" />
                )}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="px-2 py-4 text-center text-[13px] text-muted">No stores match.</li>
        )}
      </ul>
      <div className="border-t border-line-subtle p-1.5">
        <button
          type="button"
          onClick={() => {
            close();
            router.push('/onboarding?new=1');
          }}
          className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border-none bg-transparent px-2 text-left text-[13.5px] font-medium text-primary transition-colors duration-150 hover:bg-primary-tint focus-visible:bg-primary-tint focus-visible:outline-none motion-reduce:transition-none"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-dashed border-primary-line">
            <Plus size={15} aria-hidden />
          </span>
          Add New Store
        </button>
      </div>
    </div>
  );
}

/** Global store switcher: the active store, and every store the person belongs to. Switching never signs out. */
export function StoreSwitcher({ compact }: { compact?: boolean }) {
  const { workspace } = useWorkspace();
  if (!workspace) return null;
  return (
    <HeaderPopover
      label="Switch store"
      tooltip={workspace.name}
      role="dialog"
      panelClassName="!left-0 !right-auto w-[min(320px,calc(100vw-24px))] p-0"
      triggerClassName="h-10 w-auto gap-2 rounded-[12px] border border-line bg-white py-1 pl-1.5 pr-2 hover:border-line-input hover:bg-wash aria-expanded:border-line-input aria-expanded:bg-wash"
      trigger={() => (
        <>
          <StoreAvatar name={workspace.name} logo={workspace.logo} />
          {!compact && (
            <span className="max-w-[140px] truncate text-[13.5px] font-semibold text-ink lg:max-w-[200px]">
              {workspace.name}
            </span>
          )}
          <ChevronsUpDown size={14} aria-hidden className="shrink-0 text-faint" />
        </>
      )}
    >
      <Panel />
    </HeaderPopover>
  );
}

/** Header action: opens store setup for another store under the same account. */
export function AddStoreButton({ compact }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push('/onboarding?new=1')}
      aria-label="Add Store"
      title="Add Store"
      className={cn(
        'inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border-none bg-primary text-[13.5px] font-semibold text-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] transition-colors duration-150 hover:bg-primary-hover active:bg-primary-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
        compact ? 'w-9' : 'px-3.5',
      )}
    >
      <Plus size={16} aria-hidden />
      {!compact && 'Add Store'}
    </button>
  );
}
