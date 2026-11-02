'use client';

import { useId } from 'react';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_PATHS } from './brand-paths';

/** Every spelling of a channel used in the app: API providers and the dashboard's lower-case keys. */
export type ChannelKind = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'FACEBOOK';
export type ChannelInput = ChannelKind | 'whatsapp' | 'instagram' | 'messenger' | 'facebook';
export type ChannelIconVariant = 'color' | 'tile' | 'mono';

interface Brand {
  label: string;
  path: string;
  /** Official brand colour (solid). */
  color: string;
  /** Official gradient stops, when the brand uses one. */
  gradient?: {
    from: string;
    stops: [number, string][];
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

const BRANDS: Record<ChannelKind, Brand> = {
  WHATSAPP: { label: 'WhatsApp', path: BRAND_PATHS.whatsapp, color: '#25D366' },
  FACEBOOK: { label: 'Facebook', path: BRAND_PATHS.facebook, color: '#0866FF' },
  MESSENGER: {
    label: 'Messenger',
    path: BRAND_PATHS.messenger,
    color: '#0099FF',
    gradient: {
      from: '#0099FF',
      stops: [
        [0, '#0099FF'],
        [0.6, '#A033FF'],
        [0.9, '#FF5280'],
        [1, '#FF7061'],
      ],
      x1: 0,
      y1: 24,
      x2: 24,
      y2: 0,
    },
  },
  INSTAGRAM: {
    label: 'Instagram',
    path: BRAND_PATHS.instagram,
    color: '#E4405F',
    gradient: {
      from: '#FEDA75',
      stops: [
        [0, '#FEDA75'],
        [0.25, '#FA7E1E'],
        [0.5, '#D62976'],
        [0.75, '#962FBF'],
        [1, '#4F5BD5'],
      ],
      x1: 2,
      y1: 22,
      x2: 22,
      y2: 2,
    },
  },
};

export const channelKind = (c: string): ChannelKind | null => {
  const k = c.toUpperCase();
  return k in BRANDS ? (k as ChannelKind) : null;
};
export const channelLabel = (c: string) => {
  const k = channelKind(c);
  return k ? BRANDS[k].label : c;
};
/** The brand's solid colour, for bars, dots and charts that can't draw a logo. */
export const channelColor = (c: string) => {
  const k = channelKind(c);
  return k ? BRANDS[k].color : '#66778E';
};

interface Props {
  channel: ChannelInput | (string & {});
  size?: number;
  /**
   * `color`: brand-coloured logo (gradient for Instagram/Messenger). `tile`: white logo on a brand-coloured rounded
   * square (cards, headers). `mono`: single-colour logo that follows the text colour.
   */
  variant?: ChannelIconVariant;
  className?: string;
  /** Decorative when the channel name is already written next to it. */
  decorative?: boolean;
}

/** The one place a messaging channel becomes an icon. Unknown channels get a neutral fallback, never a wrong logo. */
export function ChannelIcon({
  channel,
  size = 20,
  variant = 'color',
  className,
  decorative = false,
}: Props) {
  const gid = useId().replace(/:/g, '');
  const kind = channelKind(channel);
  const label = kind ? BRANDS[kind].label : channel || 'Channel';
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };

  if (!kind)
    return (
      <span
        {...a11y}
        title={decorative ? undefined : label}
        className={cn('inline-flex shrink-0 items-center justify-center text-faint', className)}
        style={{ width: size, height: size }}
      >
        <MessageCircle size={size * 0.85} aria-hidden />
      </span>
    );

  const b = BRANDS[kind];
  const g = b.gradient;
  const fillFor = (onTile: boolean) =>
    onTile ? '#fff' : variant === 'mono' ? 'currentColor' : g ? `url(#${gid})` : b.color;
  const defs = g && (
    <defs>
      <linearGradient
        id={gid}
        gradientUnits="userSpaceOnUse"
        x1={g.x1}
        y1={g.y1}
        x2={g.x2}
        y2={g.y2}
      >
        {g.stops.map(([o, c]) => (
          <stop key={o} offset={o} stopColor={c} />
        ))}
      </linearGradient>
    </defs>
  );

  if (variant === 'tile') {
    const inner = size * 0.6;
    return (
      <span
        {...a11y}
        title={decorative ? undefined : label}
        className={cn('inline-flex shrink-0 items-center justify-center', className)}
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          // Gradient tiles use the logo's own gradient as the background; the glyph is white on top.
          background: g
            ? `linear-gradient(45deg, ${g.stops.map(([o, c]) => `${c} ${o * 100}%`).join(', ')})`
            : b.color,
        }}
      >
        <svg width={inner} height={inner} viewBox="0 0 24 24" aria-hidden>
          <path d={b.path} fill={fillFor(true)} />
        </svg>
      </span>
    );
  }

  return (
    <svg
      {...a11y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn('shrink-0', className)}
    >
      {!decorative && <title>{label}</title>}
      {defs}
      <path d={b.path} fill={fillFor(false)} />
    </svg>
  );
}
