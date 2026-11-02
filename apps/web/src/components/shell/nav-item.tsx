'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The single definition of how a navigation row looks and behaves. The main sidebar and the Settings sub-sidebar both
 * render through this, so row height, icon box, type, active/hover colours and radius can only change in one place.
 */
/** Idle text is a shade darker than `muted` so labels stay readable on the panel (WCAG AA). */
export const NAV_COLORS = { active: '#4F50D1', idle: '#3C4F68' } as const;

/** Surface shared by both navigation panels (background, padding, rhythm). */
export const NAV_PANEL_CLASS = 'flex flex-col gap-0.5 px-[11px] py-3 bg-[#FAFAFC]';

interface Props {
  label: string;
  active: boolean;
  /** Draws the icon; receives the row colour so active/idle stay in sync with the label. */
  icon: (color: string) => React.ReactNode;
  /** When false (icon rail) the label fades out but stays in the DOM for assistive tech. */
  expanded?: boolean;
  href?: string;
  title?: string;
  badge?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const ROW =
  'flex h-10 shrink-0 items-center overflow-hidden rounded-[10px] no-underline transition-colors duration-150 hover:bg-[rgba(13,37,61,0.045)] hover:no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

export function NavItem({
  label,
  active,
  icon,
  expanded = true,
  href,
  title,
  badge,
  onClick,
}: Props) {
  const color = active ? NAV_COLORS.active : NAV_COLORS.idle;
  const style = {
    color,
    background: active ? 'rgba(91,92,226,0.09)' : undefined,
    fontWeight: active ? 600 : 500,
    fontSize: 14.5,
  };
  const inner = (
    <>
      <span className="flex w-[46px] shrink-0 items-center justify-center">{icon(color)}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate whitespace-nowrap pr-2.5 transition-opacity motion-reduce:transition-none',
          expanded ? 'opacity-100 delay-100 duration-150' : 'opacity-0 duration-100',
        )}
      >
        {label}
      </span>
      {badge && expanded && (
        <span className="mr-2.5 rounded bg-white/70 px-1.5 text-[10.5px] font-medium text-faint">
          {badge}
        </span>
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      title={title ?? label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={ROW}
      style={style}
    >
      {inner}
    </Link>
  ) : (
    <a
      href="#"
      title={title ?? label}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      className={ROW}
      style={style}
    >
      {inner}
    </a>
  );
}

/** Stroke settings every navigation icon uses (main sidebar glyphs and Settings glyphs alike). */
export const NAV_ICON = { size: 19, strokeWidth: 1.8 } as const;
