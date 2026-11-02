'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Layout for every Settings route. Navigation is the overview's card grid (plus the main sidebar's Settings item);
 * there is no second sidebar. The overview gets room for three columns; detail pages a readable form width.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const overview = usePathname() === '/settings';
  return (
    <div
      className={cn(
        'mx-auto px-4 pb-12 pt-6 sm:px-6 sm:pt-8 lg:px-10',
        overview ? 'max-w-[1200px]' : 'max-w-[840px]',
      )}
    >
      {children}
    </div>
  );
}
