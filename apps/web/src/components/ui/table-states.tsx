import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const BOX = 'rounded-card border border-line bg-white px-6 py-14 text-center';

/** Error state for a list that failed to load: what failed, the server's message, and a retry. */
export function TableError({
  noun,
  message,
  onRetry,
}: {
  /** Plural noun, e.g. "customers". */
  noun: string;
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className={BOX}>
      <div className="text-sm font-semibold">Couldn&apos;t load {noun}</div>
      <div className="mb-3.5 mt-1 text-[13px] text-muted">{message}</div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Skeleton rows while a list loads. */
export function TableLoading({ noun, avatar = true }: { noun: string; avatar?: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-card border border-line bg-white"
      aria-busy="true"
      aria-label={`Loading ${noun}`}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-line-subtle px-4 py-3.5 last:border-0"
        >
          {avatar ? (
            <Skeleton className="h-8 w-8 rounded-full" />
          ) : (
            <Skeleton className="h-3.5 w-16" />
          )}
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3.5 w-1/5 bg-wash-2" />
          <Skeleton className="ml-auto h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state. With a search or filter active it says nothing matched and offers to clear them; otherwise it explains
 * what appears here, with the primary action only when the person may take it.
 */
export function TableEmpty({
  noun,
  filtered,
  hint,
  onClearFilters,
  action,
  maxWidth = 340,
}: {
  noun: string;
  filtered: boolean;
  /** Shown when nothing has been created yet. */
  hint: string;
  onClearFilters: () => void;
  /** The create action, or null when the person lacks permission. */
  action: { label: string; onClick: () => void } | null;
  maxWidth?: number;
}) {
  return (
    <div className={BOX}>
      <div className="text-[14.5px] font-semibold">
        {filtered ? `No ${noun} match your filters` : `No ${noun} yet`}
      </div>
      <div className="mx-auto mb-3.5 mt-1 text-[13px] text-muted" style={{ maxWidth }}>
        {filtered ? 'Try a different search or clear your filters.' : hint}
      </div>
      {filtered ? (
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : (
        action && (
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
