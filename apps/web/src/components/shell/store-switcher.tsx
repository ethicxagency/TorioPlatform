'use client';

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
        'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-primary-soft text-[12px] font-semibold text-primary-hover',
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
