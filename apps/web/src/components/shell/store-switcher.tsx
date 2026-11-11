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

/** Soft tint pairs for stores without a logo, chosen from the name so a store keeps its colour everywhere. */
const TONES: [string, string][] = [
  ['#F0F0FF', '#4F50D1'],
  ['#EAF4FD', '#1E6BB0'],
  ['#E6F7F3', '#0F766E'],
  ['#F5F0FF', '#6D28D9'],
  ['#FFF5E4', '#92560A'],
  ['#FDEEF2', '#B4234B'],
];
const toneOf = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
};

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
  const [bg, fg] = toneOf(name);
  return (
    <span
      aria-hidden
      style={!logo || broken ? { backgroundColor: bg, color: fg } : undefined}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[12px] font-semibold',
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
