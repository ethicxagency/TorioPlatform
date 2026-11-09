import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Torio's card system. Every card is a white surface with a 1px neutral border and the shared card radius
 * (--radius-card, 12px), no shadow. Variants differ only in what they hold and whether they respond to the pointer:
 *  - Card / CardHeader / CardFooter: standard content and information cards (static, never look clickable).
 *  - MetricCard: a label and a dominant number, with optional supporting text.
 *  - ActionCard: the only card that hovers, focuses and navigates.
 */
export const CARD = 'rounded-card border border-line bg-white';
export const CARD_PAD = 'p-4 sm:p-5';

export function Card({
  className,
  padded = true,
  as: Tag = 'div',
  ...props
}: React.HTMLAttributes<HTMLElement> & { padded?: boolean; as?: 'div' | 'section' }) {
  return <Tag className={cn(CARD, padded && CARD_PAD, className)} {...props} />;
}

/** Title on the left, an optional icon tile before it and a contextual action on the right. */
export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
  as: Heading = 'h2',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      {icon && (
        <span
          aria-hidden
          className="mt-px flex h-5 w-5 shrink-0 items-center justify-center text-muted [&_svg]:size-[18px]"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Heading className="m-0 font-card-title text-ink">{title}</Heading>
        {description && <p className="m-0 mt-0.5 text-[12.5px] text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Divider plus right-aligned actions; render it only where a card has a real footer action. */
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-4 flex items-center justify-end gap-2 border-t border-line-subtle pt-3',
        className,
      )}
      {...props}
    />
  );
}

export function MetricCard({
  label,
  value,
  sub,
  icon,
  loading,
  muted,
  valueClassName,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Optional supporting line. Leave it out rather than writing filler. */
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  /** An unavailable metric: shown as a muted dash instead of a number. */
  muted?: boolean;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        CARD,
        'flex min-h-[88px] min-w-0 flex-col justify-center px-4 py-3.5',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-muted">
          {label}
        </div>
        {icon && (
          <span aria-hidden className="shrink-0 text-faint">
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <div
          className={cn(
            'mt-1.5 truncate font-metric text-[28px] leading-tight tabular-nums',
            muted ? 'font-semibold text-faint' : 'text-ink',
            valueClassName,
          )}
          title={typeof value === 'string' ? value : undefined}
        >
          {value ?? '—'}
        </div>
      )}
      {sub && !loading && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** A navigable card: icon, title, short description. Hover and focus states live here and nowhere else. */
export function ActionCard({
  href,
  icon,
  title,
  description,
  badge,
  trailing,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        CARD,
        'group flex h-full items-start gap-3.5 px-[18px] py-4 no-underline transition-colors duration-150 hover:border-line-input hover:bg-wash hover:no-underline active:bg-wash-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-card-title text-ink">{title}</span>
          {badge}
        </span>
        {description && (
          <span className="mt-1 block text-[13px] leading-[1.5] text-muted">{description}</span>
        )}
      </span>
      {trailing}
    </Link>
  );
}
