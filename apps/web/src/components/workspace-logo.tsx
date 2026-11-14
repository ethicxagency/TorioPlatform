'use client';

import { useState } from 'react';
import { initialsOf } from '@/features/inbox/format';
import { cn } from '@/lib/utils';

/**
 * Where a workspace logo is drawn. Each context is a MAXIMUM box, not a fixed size: the logo keeps its own proportions
 * (object-fit: contain), is never stretched or cropped, and is requested at the smallest stored width that stays sharp at 2x.
 */
export const LOGO_CONTEXTS = {
  /** Invoice header: matches the PDF's 150 x 46 box. */
  invoice: { w: 150, h: 48, src: 360 },
  /** Document or customer-facing header. */
  document: { w: 180, h: 56, src: 360 },
  /** A small workspace header. */
  header: { w: 120, h: 40, src: 360 },
  /** The Brand Identity preview: larger, fills its container. */
  preview: { w: 320, h: 88, src: 720 },
  /** Dense UI such as menus and lists. */
  compact: { w: 72, h: 28, src: 160 },
} as const;
export type LogoContext = keyof typeof LOGO_CONTEXTS;

/** The stored picture at one of the standard widths. Other addresses (a local preview, an old URL) are used as they are. */
export function logoSrc(url: string, width: number): string {
  return /\/api\/v1\/images\/[0-9a-f-]{36}$/i.test(url) ? `${url}?w=${width}` : url;
}

/**
 * The one way the app draws a workspace logo. On a dark surface (`tone="dark"`) it uses the logo made for dark backgrounds when
 * the workspace has one, else the main logo as it is. With no logo, or one that fails to load, it shows the workspace's
 * initials, so there is never a broken image.
 */
export function WorkspaceLogo({
  name,
  logo,
  logoLight,
  context,
  tone = 'light',
  src,
  className,
  onLoadSize,
}: {
  name: string;
  logo: string | null | undefined;
  logoLight?: string | null;
  context: LogoContext;
  tone?: 'light' | 'dark';
  /** Overrides the saved logo, e.g. a file the person has chosen but not saved yet. */
  src?: string | null;
  className?: string;
  onLoadSize?: (width: number, height: number) => void;
}) {
  const c = LOGO_CONTEXTS[context];
  const chosen = src ?? (tone === 'dark' && logoLight ? logoLight : logo);
  const [failed, setFailed] = useState<string | null>(null);
  const live = chosen && failed !== chosen ? chosen : null;
  return live ? (
    // eslint-disable-next-line @next/next/no-img-element -- the logo comes from the API, or a chosen file previewed locally
    <img
      src={src ? live : logoSrc(live, c.src)}
      alt={`${name} logo`}
      style={{ maxWidth: c.w, maxHeight: c.h }}
      className={cn('block h-auto w-auto max-w-full object-contain', className)}
      onError={() => setFailed(live)}
      onLoad={(e) => onLoadSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
    />
  ) : (
    <span
      role="img"
      aria-label={`${name} logo`}
      style={{ height: Math.min(c.h, 44), minWidth: Math.min(c.h, 44) }}
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-2 text-base font-semibold',
        tone === 'dark' ? 'bg-white/10 text-white' : 'bg-primary-soft text-primary',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
