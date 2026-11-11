'use client';

import { Check, ChevronRight, LogOut, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { clearStoredDrafts } from '@/features/inbox/use-drafts';
import { useProfile } from '@/features/settings/queries';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useSwitchStore, useWorkspace } from '@/lib/workspace';
import { usePopoverClose } from './header-popover';
import { StoreAvatar } from './store-switcher';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

/** The person's own picture (provider avatar) or their initials. Never a store logo. */
export function UserAvatar({
  image,
  name,
  className,
}: {
  image: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-white',
        className,
      )}
    >
      {image && failed !== image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(image)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

const ROW =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border-none bg-transparent px-2 py-1.5 text-left transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-none disabled:opacity-60 motion-reduce:transition-none';

/**
 * The header dropdown is about stores: the active store, the other stores, Add Store, then the person's own account row and
 * Sign out. Settings and Billing keep their normal navigation; they are not repeated here.
 */
export function AccountPanel() {
  const close = usePopoverClose();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const profile = useProfile().data;
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
      router.push('/');
    } catch {
      toast.error('Could not switch stores. Try again.');
    }
  };

  const name = profile?.name ?? user?.name ?? '';
  const email = profile?.email ?? user?.email ?? '';

  return (
    <div className="flex flex-col">
      {stores.length > 4 && (
        <label className="m-2 mb-0 flex h-9 items-center gap-2 rounded-[var(--radius-input)] bg-wash px-2.5">
          <Search size={14} aria-hidden className="shrink-0 text-faint" />
          <input
            aria-label="Search stores"
            placeholder="Search stores"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
          />
        </label>
      )}
      <ul
        role="listbox"
        aria-label="Stores"
        className="m-0 max-h-[260px] list-none overflow-y-auto p-1.5"
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
                  ROW,
                  'min-h-[48px]',
                  on && 'border border-primary-line bg-primary-tint hover:bg-primary-tint',
                )}
              >
                <StoreAvatar name={s.name} logo={s.logo} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {s.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {on ? 'Current workspace' : s.slug}
                  </span>
                </span>
                {on && (
                  <Check size={16} aria-label="Active store" className="shrink-0 text-primary" />
                )}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="px-2 py-3 text-center text-[13px] text-muted">No stores match.</li>
        )}
      </ul>

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={() => {
            close();
            router.push('/onboarding?new=1');
          }}
          className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border-none bg-primary text-[13.5px] font-semibold text-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] transition-colors duration-150 hover:bg-primary-hover active:bg-primary-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          <Plus size={16} aria-hidden />
          Add Store
        </button>
      </div>

      <div className="border-t border-line-subtle p-1.5">
        <button
          type="button"
          aria-label="Profile & Account"
          onClick={() => {
            close();
            router.push('/settings/general');
          }}
          className={cn(ROW, 'min-h-[52px]')}
        >
          <UserAvatar image={profile?.image} name={name} className="h-9 w-9 text-[13px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-ink">{name}</span>
            <span className="block truncate text-xs text-muted">{email}</span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted">
            <span className="max-sm:hidden">Profile &amp; Account</span>
            <ChevronRight size={14} aria-hidden className="text-faint" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            clearStoredDrafts();
            void signOut();
          }}
          className={cn(
            ROW,
            'h-10 text-[13.5px] font-medium text-danger hover:bg-danger-soft focus-visible:bg-danger-soft',
          )}
        >
          <LogOut size={16} aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}
