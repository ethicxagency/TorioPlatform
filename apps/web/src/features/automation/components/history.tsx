'use client';

import { X } from 'lucide-react';
import { triggerOf } from '@torio/contracts';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { fmtAgo } from '@/features/inbox/format';
import { useTimeZone } from '@/features/settings/queries';
import { fmtDateTime } from '@/lib/datetime';
import { useWorkspace } from '@/lib/workspace';
import { EXEC_INFO } from '../constants';
import { useAutomationMutations, useExecution } from '../queries';
import type { AutomationItem, ExecutionItem, ExecutionStatus } from '../types';
import { ExecBadge, fmtDuration } from './bits';

interface Props {
  items: ExecutionItem[];
  state: 'loading' | 'error' | 'ready';
  automations: AutomationItem[];
  status: ExecutionStatus | '';
  automationId: string;
  page: number;
  total: number;
  pageSize: number;
  onStatus: (s: ExecutionStatus | '') => void;
  onAutomation: (id: string) => void;
  onPage: (p: number) => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
}

export function HistoryView(p: Props) {
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by automation"
          value={p.automationId}
          onChange={(e) => p.onAutomation(e.target.value)}
          className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px]"
        >
          <option value="">All automations</option>
          {p.automations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by run status"
          value={p.status}
          onChange={(e) => p.onStatus(e.target.value as ExecutionStatus | '')}
          className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px]"
        >
          <option value="">Any status</option>
          {(Object.keys(EXEC_INFO) as ExecutionStatus[]).map((s) => (
            <option key={s} value={s}>
              {EXEC_INFO[s].label}
            </option>
          ))}
        </select>
      </div>
      <p className="m-0 text-xs text-faint">
        Production runs only. Tests are simulations and are listed on each automation&apos;s editor.
      </p>
      {p.state === 'error' && (
        <div
          role="alert"
          className="rounded-card border border-line bg-white px-6 py-10 text-center text-[13px]"
        >
          Couldn&apos;t load run history.{' '}
          <Button size="sm" variant="outline" onClick={p.onRetry}>
            Try again
          </Button>
        </div>
      )}
      {p.state === 'loading' && <Skeleton className="h-40 w-full" />}
      {p.state === 'ready' && p.items.length === 0 && (
        <div className="rounded-card border border-line bg-white px-6 py-12 text-center text-[13px] text-muted">
          No runs yet. Runs appear here when an active automation&apos;s trigger happens.
        </div>
      )}
      {p.state === 'ready' && p.items.length > 0 && (
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <ul className="m-0 list-none p-0">
            {p.items.map((e) => (
              <li key={e.id} className="border-b border-line-subtle last:border-0">
                <button
                  type="button"
                  onClick={() => p.onOpen(e.id)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-[#F7F7F9]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      {e.automationName}
                    </span>
                    <span className="block truncate text-xs text-faint">
                      {triggerOf(e.triggerType)?.label ?? e.triggerType} · v{e.version} ·{' '}
                      {fmtAgo(e.createdAt)} · {e.completedSteps}/{e.stepCount} steps ·{' '}
                      {fmtDuration(e.durationMs)}
                    </span>
                    {e.error && (
                      <span className="block truncate text-xs text-danger">{e.error}</span>
                    )}
                  </span>
                  <ExecBadge status={e.status} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line-subtle bg-[#FBFBFC] px-4 py-2.5 text-xs text-muted">
            <span aria-live="polite">{p.total} runs</span>
            <span className="flex items-center gap-2">
              Page {p.page} of {pages}
              <Button
                size="sm"
                variant="outline"
                disabled={p.page <= 1}
                onClick={() => p.onPage(p.page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={p.page >= pages}
                onClick={() => p.onPage(p.page + 1)}
              >
                Next
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const STEP_TONE = {
  ok: 'bg-success',
  simulated: 'bg-info',
  failed: 'bg-danger',
  skipped: 'bg-faint',
  waiting: 'bg-warning',
} as const;

export function ExecutionDrawer({
  id,
  canRetry,
  onClose,
}: {
  id: string;
  canRetry: boolean;
  onClose: () => void;
}) {
  const { toast, registerEscape } = useShell();
  const { workspaceId: ws } = useWorkspace();
  const tz = useTimeZone();
  const q = useExecution(ws, id);
  const m = useAutomationMutations(ws);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);
  const e = q.data;
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-[rgba(23,24,28,0.25)]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Run details"
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(16,24,40,0.16)] sm:w-[520px]"
      >
        <header className="flex items-start gap-3 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-base font-semibold">{e?.automationName ?? 'Run'}</h2>
            {e && (
              <div className="mt-1.5 flex items-center gap-2">
                <ExecBadge status={e.status} />
                {e.isTest && (
                  <span className="rounded bg-wash-2 px-1.5 py-0.5 text-[11px] text-faint">
                    Test
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close run details"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">
          {q.isPending && <Skeleton className="h-40 w-full" />}
          {q.isError && <div role="alert">Couldn&apos;t load this run.</div>}
          {e && (
            <>
              {e.error && (
                <div
                  role="alert"
                  className="mb-4 rounded-xl bg-danger-soft px-3 py-2.5 text-[#8F2424]"
                >
                  {e.error}
                </div>
              )}
              <dl className="m-0 mb-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-faint">Run ID</dt>
                <dd className="m-0 font-mono text-xs">{e.id}</dd>
                <dt className="text-faint">Trigger</dt>
                <dd className="m-0">{triggerOf(e.triggerType)?.label ?? e.triggerType}</dd>
                <dt className="text-faint">Version</dt>
                <dd className="m-0">{e.isTest ? 'Draft (test)' : `v${e.version}`}</dd>
                <dt className="text-faint">Started</dt>
                <dd className="m-0">{e.startedAt ? fmtDateTime(e.startedAt, tz) : '—'}</dd>
                <dt className="text-faint">Finished</dt>
                <dd className="m-0">{e.finishedAt ? fmtDateTime(e.finishedAt, tz) : '—'}</dd>
                <dt className="text-faint">Duration</dt>
                <dd className="m-0">{fmtDuration(e.durationMs)}</dd>
                <dt className="text-faint">Attempts</dt>
                <dd className="m-0">{e.attempts}</dd>
              </dl>
              {canRetry && e.status === 'FAILED' && !e.isTest && (
                <Button
                  size="sm"
                  className="mb-4"
                  disabled={m.retry.isPending}
                  onClick={() =>
                    m.retry.mutate(e.id, {
                      onSuccess: () => toast('Run queued to retry from the failed step'),
                      onError: (err) => toast(err.message),
                    })
                  }
                >
                  Retry from the failed step
                </Button>
              )}
              <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
                Timeline
              </h3>
              <ol className="m-0 list-none border-l border-line p-0 pl-4">
                {e.steps.map((s, i) => (
                  <li key={i} className="relative pb-3">
                    <span
                      aria-hidden
                      className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${STEP_TONE[s.status]}`}
                    />
                    <div className="font-medium">
                      {s.type} <span className="text-xs font-normal text-faint">· {s.status}</span>
                    </div>
                    <div className="text-muted">{s.message}</div>
                    <div className="text-xs text-faint">{fmtDateTime(s.at, tz)}</div>
                  </li>
                ))}
                {e.steps.length === 0 && <li className="text-muted">No steps ran.</li>}
              </ol>
              <h3 className="m-0 mb-2 mt-2 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
                Event data
              </h3>
              <pre className="m-0 overflow-x-auto rounded-xl bg-wash p-3 text-xs">
                {JSON.stringify(e.context, null, 2)}
              </pre>
              <p className="mb-0 mt-2 text-xs text-faint">
                Contact details, message text and credentials are never stored with a run.
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
