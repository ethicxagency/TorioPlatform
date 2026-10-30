'use client';

import { Plus } from 'lucide-react';
import { type Template } from '@torio/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useDebounced } from '@/features/leads/use-debounced';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { PAGE_SIZE } from '../constants';
import {
  useAutomationMutations,
  useAutomations,
  useAutomationSummary,
  useExecutions,
} from '../queries';
import {
  EMPTY_DIRECTORY,
  type AutomationItem,
  type DirectoryFilters,
  type ExecutionStatus,
} from '../types';
import { Directory } from './directory';
import { ExecutionDrawer, HistoryView } from './history';
import { AutomationKpis } from './kpi-cards';
import { NameDialog } from './name-dialog';
import { TemplateGallery } from './templates';

const TABS = [
  { key: 'all', label: 'All automations' },
  { key: 'active', label: 'Active' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'templates', label: 'Templates' },
  { key: 'history', label: 'Execution history' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function AutomationPage() {
  const { toast } = useShell();
  const router = useRouter();
  const { workspaceId: ws, can, isLoading, error: wsError } = useWorkspace();
  const canWrite = can('automation:write');
  const canActivate = can('automation:activate');
  const [tab, setTab] = useState<Tab>('all');
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_DIRECTORY);
  const q = useDebounced(filters.q, 300);
  const [page, setPage] = useState(1);
  const [runStatus, setRunStatus] = useState<ExecutionStatus | ''>('');
  const [runAutomation, setRunAutomation] = useState('');
  const [runPage, setRunPage] = useState(1);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<AutomationItem | null>(null);
  const [deleting, setDeleting] = useState<AutomationItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dirTab = tab === 'all' || tab === 'active' || tab === 'drafts';
  const status = tab === 'active' ? ['ACTIVE'] : tab === 'drafts' ? ['DRAFT'] : [];
  const list = useAutomations(ws, { ...filters, q }, status, page);
  const names = useAutomations(ws, EMPTY_DIRECTORY, [], 1);
  const summary = useAutomationSummary(ws);
  const runs = useExecutions(
    ws,
    { status: runStatus ? [runStatus] : [], automationId: runAutomation, page: runPage },
    tab === 'history',
  );
  const m = useAutomationMutations(ws);
  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');

  const patch = useCallback((p: Partial<DirectoryFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  }, []);
  const filtered = !!q || !!filters.trigger;
  const items = useMemo(() => list.data?.data ?? [], [list.data]);

  const toggle = (a: AutomationItem) => {
    setBusyId(a.id);
    const op = a.status === 'ACTIVE' ? m.deactivate : m.publish;
    op.mutate(a.id, {
      onSuccess: () => {
        toast(a.status === 'ACTIVE' ? 'Automation disabled' : 'Automation enabled');
        setBusyId(null);
      },
      onError: (e) => {
        toast(`${e.message}. Open the editor to fix it.`);
        setBusyId(null);
      },
    });
  };

  if (isLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (wsError || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('automation:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Automation in this workspace.
      </div>
    );

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-faint">
            Automation / <span className="text-muted">Workflows</span>
          </nav>
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.015em]">Automation</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Automate conversations, streamline repetitive tasks, and keep your team moving.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setTab('templates')}>
            Templates
          </Button>
          <Button
            disabled={!canWrite}
            title={canWrite ? undefined : 'You need permission to create automations'}
            onClick={() => setCreating(true)}
          >
            <Plus size={14} />
            Create Automation
          </Button>
        </div>
      </header>

      <AutomationKpis
        summary={summary.data}
        loading={summary.isPending}
        error={summary.isError && !summary.data}
        onRetry={() => summary.refetch()}
      />

      <div
        role="tablist"
        aria-label="Automation views"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={cn(
              '-mb-px h-9 shrink-0 cursor-pointer border-b-2 px-3 text-[13px]',
              tab === t.key
                ? 'border-primary font-semibold text-primary-hover'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {dirTab && (
        <Directory
          items={items}
          state={list.isPending ? 'loading' : list.isError && !list.data ? 'error' : 'ready'}
          errorMessage={list.error?.message}
          filters={filters}
          filtered={filtered}
          total={list.data?.meta.total ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          canWrite={canWrite}
          canActivate={canActivate}
          busyId={busyId}
          onFilters={patch}
          onPage={setPage}
          onToggle={toggle}
          onDuplicate={(a) =>
            m.duplicate.mutate(a.id, {
              onSuccess: (d) => {
                toast('Duplicated as a draft');
                router.push(`/automation/${d.id}`);
              },
              onError: err,
            })
          }
          onRename={setRenaming}
          onDelete={setDeleting}
          onHistory={(a) => {
            setRunAutomation(a.id);
            setRunPage(1);
            setTab('history');
          }}
          onRetry={() => list.refetch()}
          onCreate={() => setCreating(true)}
        />
      )}
      {tab === 'templates' && (
        <TemplateGallery
          canWrite={canWrite}
          onUse={async (t: Template) => {
            const d = await m.create.mutateAsync({
              name: t.name,
              description: t.description,
              templateKey: t.key,
            });
            toast('Draft created. Review it before activating.');
            router.push(`/automation/${d.id}`);
          }}
        />
      )}
      {tab === 'history' && (
        <HistoryView
          items={runs.data?.data ?? []}
          state={runs.isPending ? 'loading' : runs.isError && !runs.data ? 'error' : 'ready'}
          automations={names.data?.data ?? []}
          status={runStatus}
          automationId={runAutomation}
          page={runPage}
          total={runs.data?.meta.total ?? 0}
          pageSize={PAGE_SIZE}
          onStatus={(s) => {
            setRunStatus(s);
            setRunPage(1);
          }}
          onAutomation={(id) => {
            setRunAutomation(id);
            setRunPage(1);
          }}
          onPage={setRunPage}
          onOpen={setOpenRun}
          onRetry={() => runs.refetch()}
        />
      )}

      {openRun && (
        <ExecutionDrawer id={openRun} canRetry={canActivate} onClose={() => setOpenRun(null)} />
      )}
      {creating && (
        <NameDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            const d = await m.create.mutateAsync({
              name: v.name,
              trigger: v.trigger,
              description: '',
            });
            toast('Draft created');
            router.push(`/automation/${d.id}`);
          }}
        />
      )}
      {renaming && (
        <NameDialog
          mode="rename"
          initialName={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={async (v) => {
            await m.update.mutateAsync({ id: renaming.id, body: { name: v.name } });
            toast('Renamed');
            setRenaming(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          body="The automation, its versions and its run history are permanently deleted. This can’t be undone."
          confirmLabel="Delete"
          busy={m.remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            m.remove.mutate(deleting.id, {
              onSuccess: () => {
                toast('Automation deleted');
                setDeleting(null);
              },
              onError: (e) => {
                err(e);
                setDeleting(null);
              },
            })
          }
        />
      )}
    </div>
  );
}
