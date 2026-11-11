'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

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
