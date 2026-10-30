import { cn } from '@/lib/utils';
import { STATUSES } from '../constants';
import type { CustomerStatus } from '../types';

export function CustomerStatusBadge({
  status,
  className,
}: {
  status: CustomerStatus;
  className?: string;
}) {
  const s = STATUSES.find((x) => x.key === status)!;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ background: s.bg, color: s.color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
