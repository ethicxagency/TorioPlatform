'use client';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced } from '@/features/leads/use-debounced';
import { fmtDateTime } from '@/lib/datetime';
import { useWorkspace } from '@/lib/workspace';
import { useAudit, useTimeZone } from '../queries';
import { Notice, PageHeader } from './bits';

export function AuditPage() {
  const { workspaceId: ws, can, isLoading } = useWorkspace();
  const tz = useTimeZone();
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const allowed = can('audit:read');
  const list = useAudit(allowed ? ws : null, { page, q });
  const meta = list.data?.meta;

  if (!isLoading && !allowed)
    return (
      <div>
        <PageHeader title="Audit log" description="Who changed what in this workspace." />
        <Notice>Only Owners and Admins can view the audit log.</Notice>
      </div>
    );
  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Security-relevant changes in this workspace, newest first."
      />
      <label className="mb-3 flex h-9 max-w-[340px] items-center gap-2 rounded-[10px] border border-line bg-white px-2.5">
        <Search size={15} className="text-faint" aria-hidden />
        <input
          type="search"
          aria-label="Filter by action"
          placeholder="Filter by action, e.g. order"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
        />
      </label>
      {list.isPending && <Skeleton className="h-48 w-full" />}
      {list.isError && !list.data && (
        <Notice tone="error">Couldn&apos;t load the audit log.</Notice>
      )}
      {list.data && (
        <div className="overflow-hidden rounded-card border border-line bg-white">
          {list.data.data.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-muted">
              {q ? 'No entries match that filter.' : 'Nothing has been recorded yet.'}
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {list.data.data.map((e) => (
                <li
                  key={e.id}
                  className="border-b border-line-subtle px-4 py-2.5 text-[13px] last:border-0"
                >
                  <div>{e.description}</div>
                  <div className="text-xs text-faint">
                    {e.actor?.name ?? 'System'} · <code>{e.action}</code> ·{' '}
                    {fmtDateTime(e.createdAt, tz)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-line-subtle bg-[#FBFBFC] px-4 py-2.5 text-xs text-muted">
            <span aria-live="polite">{meta?.total ?? 0} entries</span>
            <span className="flex items-center gap-1.5">
              Page {meta?.page ?? 1} of {meta?.totalPages ?? 1}
              <button
                type="button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={page >= (meta?.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
