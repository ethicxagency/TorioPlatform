'use client';

import { Check, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The shared AI look (tokens and animations live in globals.css under "AI visual identity"). Every AI element in the product
 * uses these, so they are recognisable at a glance and ordinary buttons stay as they are.
 */

/** The sparkle, with the AI gradient on its strokes. `tone="white"` for use on a gradient background. */
export function AIIcon({
  size = 15,
  tone = 'gradient',
  spin = false,
  className,
}: {
  size?: number;
  tone?: 'gradient' | 'white';
  /** Slowly turns while an AI operation is actually running. */
  spin?: boolean;
  className?: string;
}) {
  const id = useId();
  const stroke = tone === 'white' ? '#fff' : `url(#${id})`;
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('ai-icon-hover shrink-0', spin && 'ai-icon-spin', className)}
    >
      {tone === 'gradient' && (
        <defs>
          <linearGradient id={id} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#5b5ce2" />
            <stop offset="0.55" stopColor="#8b4fe8" />
            <stop offset="1" stopColor="#c04fd8" />
          </linearGradient>
        </defs>
      )}
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  );
}

/** "Thinking…", "Generating…", "Analyzing…": shown only while the work is really running. */
export function AIProcessingIndicator({
  label = 'Thinking…',
  bar = false,
  className,
}: {
  label?: string;
  /** Adds a thin gradient progress bar under the text. */
  bar?: boolean;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex flex-col gap-1.5', className)}
    >
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--ai-ink)]">
        <AIIcon size={14} spin />
        {label}
      </span>
      {bar && <span aria-hidden className="ai-bar w-full min-w-[120px]" />}
    </span>
  );
}

/** A small pill that marks AI-generated content or an AI-powered feature. */
export function AIBadge({
  children = 'AI',
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('ai-badge px-2 py-0.5 text-[11px] leading-4', className)}>
      <AIIcon size={11} />
      {children}
    </span>
  );
}

/** Wraps content in a gradient hairline border. Use sparingly, on a single element, never on whole pages. */
export function AIGradientBorder({
  children,
  animated = false,
  className,
}: {
  children: React.ReactNode;
  animated?: boolean;
  className?: string;
}) {
  return (
    <div data-animated={animated} className={cn('ai-gradient-border rounded-xl', className)}>
      {children}
    </div>
  );
}

type Variant = 'primary' | 'secondary';

/**
 * The button for AI actions. `primary` (animated gradient, white text) for main actions like AI Assist and Generate;
 * `secondary` (light gradient, gradient border and icon) for smaller actions in forms, menus and toolbars.
 * `loading` and `success` come from the caller's real state: a loading button shows the processing indicator and is not
 * clickable; a success button shows a brief completed state. A disabled button loses all animation.
 */
export function AIButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Thinking…',
  success = false,
  successLabel = 'Done',
  icon,
  hideLabelOnSmall = false,
  className,
  children,
  disabled,
  ref,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  loadingLabel?: string;
  success?: boolean;
  successLabel?: string;
  /** Replaces the sparkle. */
  icon?: React.ReactNode;
  /** Keeps only the icon on narrow screens (the accessible name stays). */
  hideLabelOnSmall?: boolean;
  children?: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const state = disabled ? 'disabled' : loading ? 'loading' : success ? 'success' : 'idle';
  const tone = variant === 'primary' ? 'white' : 'gradient';
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-state={state}
      className={cn(
        'ai-btn',
        variant === 'primary' ? 'ai-btn-primary' : 'ai-btn-secondary',
        success && !loading && 'ai-btn-success',
        size === 'sm'
          ? 'h-8 rounded-lg px-2.5 text-[12.5px]'
          : 'h-9 rounded-[10px] px-3.5 text-[13.5px]',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <AIIcon size={14} tone={tone} spin />
          <span className={cn(hideLabelOnSmall && 'max-sm:sr-only')}>{loadingLabel}</span>
        </>
      ) : success ? (
        <>
          <Check size={14} aria-hidden />
          <span className={cn(hideLabelOnSmall && 'max-sm:sr-only')}>{successLabel}</span>
        </>
      ) : (
        <>
          {icon ?? <AIIcon size={size === 'sm' ? 14 : 15} tone={tone} />}
          <span className={cn(hideLabelOnSmall && 'max-sm:sr-only')}>{children}</span>
        </>
      )}
    </button>
  );
}

/** The AI sparkle shaped like a Lucide icon, for places that take an icon component (tabs, menus). */
export const AISparkle = (({
  size = 15,
  className,
}: {
  size?: number | string;
  className?: string;
}) => <AIIcon size={Number(size)} className={className} />) as unknown as LucideIcon;
