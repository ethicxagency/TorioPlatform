'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_SIZES } from '@/lib/table-prefs';
import { Select } from './select';

const btn =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-line bg-white text-muted transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white motion-reduce:transition-none';

/** The table footer: the visible range and total on the left, page position and previous/next on the right. */
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  noun,
  onPageSize,
  extra,
  className,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  /** Optional plural noun after the total, e.g. "customers". */
  noun?: string;
  /** When given, shows a rows-per-page choice; the caller keeps it and returns to page 1. */
  onPageSize?: (size: number) => void;
  /** Extra controls on the left, e.g. the columns menu. */
  extra?: React.ReactNode;
  className?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex items-center justify-between gap-3 border-t border-line-subtle bg-[#FBFBFC] px-4 py-2.5 text-xs text-muted',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span aria-live="polite" className="tabular-nums">
          {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
          {noun ? ` ${noun}` : ''}
        </span>
        {extra && <span className="max-md:hidden">{extra}</span>}
      </div>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <span className="flex items-center gap-1.5 max-sm:hidden">
            Rows
            <Select
              aria-label="Rows per page"
              value={String(pageSize)}
              onChange={(v) => onPageSize(Number(v))}
              options={(PAGE_SIZES.includes(pageSize) ? PAGE_SIZES : [pageSize, ...PAGE_SIZES]).map(
                (n) => ({
                  value: String(n),
                  label: String(n),
                }),
              )}
              className="h-8 min-w-[64px] text-[12.5px]"
              panelMinWidth={72}
            />
          </span>
        )}
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={btn}
        >
          <ChevronLeft size={15} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={btn}
        >
          <ChevronRight size={15} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
