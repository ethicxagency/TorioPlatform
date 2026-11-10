'use client';

import { ArrowRight, LayoutTemplate, Plus, X } from 'lucide-react';
import { TEMPLATES, type Template } from '@torio/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useDebounced } from '@/features/leads/use-debounced';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { PAGE_SIZE } from '../constants';
import { useAutomationMutations, useAutomations, useExecutions } from '../queries';
import {
  EMPTY_DIRECTORY,
  type AutomationItem,
  type DirectoryFilters,
  type ExecutionStatus,
} from '../types';
import { Directory } from './directory';
import { ExecutionDrawer, HistoryView } from './history';
import { NameDialog } from './name-dialog';
import { LibraryModal, PreviewDialog, TemplateExplorer, TemplateCard } from './template-views';

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
  const [library, setLibrary] = useState(false);
  const [preview, setPreview] = useState<Template | null>(null);
  const [hideFeatured, setHideFeatured] = useState(() => {
    try {
      return localStorage.getItem('torio.automation.featured') === 'hidden';
    } catch {
      return false;
    }
  });
  const setFeatured = (hide: boolean) => {
    setHideFeatured(hide);
    try {
      localStorage.setItem('torio.automation.featured', hide ? 'hidden' : 'shown');
    } catch {
      /* preference only */
    }
  };
  const useTemplate = async (t: Template) => {
    const d = await m.create.mutateAsync({
      name: t.name,
      description: t.description,
      templateKey: t.key,
    });
    toast('Draft created. Review it before activating.');
    router.push(`/automation/${d.id}`);
  };
  const [renaming, setRenaming] = useState<AutomationItem | null>(null);
  const [deleting, setDeleting] = useState<AutomationItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dirTab = tab === 'all' || tab === 'active' || tab === 'drafts';
  const status = tab === 'active' ? ['ACTIVE'] : tab === 'drafts' ? ['DRAFT'] : [];
  const list = useAutomations(ws, { ...filters, q }, status, page);
  const names = useAutomations(ws, EMPTY_DIRECTORY, [], 1);
  const runs = useExecutions(
    ws,
    { status: runStatus ? [runStatus] : [], automationId: runAutomation, page: runPage },
    tab === 'history',
  );
  const m = useAutomationMutations(ws);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');

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
        toast.error(`${e.message}. Open the editor to fix it.`);
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
          <h1 className="m-0 font-page-title">Automation</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Automate conversations, streamline repetitive tasks, and keep your team moving.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLibrary(true)}>
            <LayoutTemplate size={14} />
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

      {dirTab && !hideFeatured && (
        <section aria-label="Featured templates" className="flex flex-col gap-3">
          <div className="-mb-1 flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLibrary(true)}>
              Browse all templates
              <ArrowRight size={13} aria-hidden />
            </Button>
            <button
              type="button"
              aria-label="Hide featured templates"
              title="Hide featured templates"
              onClick={() => setFeatured(true)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-faint transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            >
              <X size={14} />
            </button>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
            {TEMPLATES.slice(0, 4).map((t) => (
              <li key={t.key}>
                <TemplateCard t={t} onOpen={setPreview} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {dirTab && hideFeatured && (
        <button
          type="button"
          onClick={() => setFeatured(false)}
          className="-mb-2 self-start cursor-pointer rounded border-none bg-transparent p-0 text-[12.5px] text-muted hover:text-primary"
        >
          Show featured templates
        </button>
      )}

      <div
        role="tablist"
        aria-label="Automation views"
        onKeyDown={(e) => {
          const i = TABS.findIndex((t) => t.key === tab);
          const n =
            e.key === 'ArrowRight'
              ? i + 1
              : e.key === 'ArrowLeft'
                ? i - 1
                : e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? TABS.length - 1
                    : -1;
          if (n < 0) return;
          e.preventDefault();
          const next = TABS[(n + TABS.length) % TABS.length]!;
          setTab(next.key);
          setPage(1);
          requestAnimationFrame(() => document.getElementById(`auto-tab-${next.key}`)?.focus());
        }}
        className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-xl bg-wash-2 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            id={`auto-tab-${t.key}`}
            role="tab"
            type="button"
            tabIndex={tab === t.key ? 0 : -1}
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={cn(
              'h-8 shrink-0 cursor-pointer rounded-lg border-none px-3 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
              tab === t.key
                ? 'bg-white font-semibold text-primary shadow-[0_1px_2px_rgba(23,24,28,0.08)]'
                : 'bg-transparent text-muted hover:text-ink',
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
          onExplore={() => setLibrary(true)}
        />
      )}
      {tab === 'templates' && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] text-muted">
            Templates create a <b>draft</b>. Review every condition and message, then activate it
            yourself: nothing runs automatically. All of them use only Torio’s own data, so no
            integration is required.
          </p>
          <TemplateExplorer onOpen={setPreview} />
        </div>
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

      {library && <LibraryModal onClose={() => setLibrary(false)} onOpen={setPreview} />}
      {preview && (
        <PreviewDialog
          t={preview}
          canWrite={canWrite}
          backLabel={library ? 'Back to library' : 'Close'}
          onClose={() => setPreview(null)}
          onUse={useTemplate}
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
