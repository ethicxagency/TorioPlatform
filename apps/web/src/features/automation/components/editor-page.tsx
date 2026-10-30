'use client';

import { ArrowLeft, FlaskConical, Plus } from 'lucide-react';
import {
  actionOf,
  describeStep,
  triggerOf,
  validateDefinition,
  type Definition,
  type Issue,
  type Step,
} from '@torio/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useMembers } from '@/features/inbox/queries';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { useAutomation, useAutomationMutations } from '../queries';
import { StatusBadge } from './bits';
import { ConfigPanel } from './config-panel';
import { Flow, LibraryList, type NewStep } from './flow';
import { TestDialog } from './test-dialog';

let n = 0;
const sid = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;

function blankStep(s: NewStep, trigger: string): Step {
  if (s.kind === 'wait') return { id: sid(), type: 'wait', minutes: 60 };
  if (s.kind === 'condition') {
    const f = triggerOf(trigger)?.fields[0];
    return {
      id: sid(),
      type: 'condition',
      conditions: [
        {
          field: f?.key ?? '',
          op:
            f?.kind === 'tags'
              ? 'contains'
              : f?.kind === 'flag'
                ? 'is_set'
                : f?.kind === 'number'
                  ? 'gt'
                  : 'equals',
          value: '',
        },
      ],
    };
  }
  return {
    id: sid(),
    type: 'action',
    action: s.action as Extract<Step, { type: 'action' }>['action'],
    config: {},
  };
}

type Save = 'saved' | 'dirty' | 'saving' | 'failed';

export function EditorPage({ id }: { id: string }) {
  const { toast } = useShell();
  const router = useRouter();
  const { workspaceId: ws, can, isLoading } = useWorkspace();
  const canWrite = can('automation:write');
  const canActivate = can('automation:activate');
  const q = useAutomation(ws, id);
  const m = useAutomationMutations(ws);
  const members = useMembers(ws);
  const [def, setDef] = useState<Definition | null>(null);
  const [name, setName] = useState('');
  const [revision, setRevision] = useState(0);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [save, setSave] = useState<Save>('saved');
  const [selected, setSelected] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState<'activate' | 'deactivate' | 'leave' | null>(null);
  const [error, setError] = useState('');
  const a = q.data;

  // Load the server draft once per fetched revision, without clobbering unsaved edits.
  const sig = a ? `${a.id}:${a.draftRevision}` : null;
  if (a && sig !== loadedFor && save !== 'dirty' && save !== 'saving') {
    setLoadedFor(sig);
    setDef(a.definition);
    setName(a.name);
    setRevision(a.draftRevision);
    setServerIssues(a.issues);
  }

  const dirty = save === 'dirty' || save === 'failed';
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const localIssues = useMemo(() => (def ? validateDefinition(def) : []), [def]);
  // Local checks run as you type; server checks (e.g. assignee membership) come from the last save.
  const issues = useMemo(() => {
    const seen = new Set(localIssues.map((i) => `${i.stepId}|${i.message}`));
    return [
      ...localIssues,
      ...serverIssues.filter(
        (i) =>
          !seen.has(`${i.stepId}|${i.message}`) &&
          (!i.stepId || def?.steps.some((s) => s.id === i.stepId)),
      ),
    ];
  }, [localIssues, serverIssues, def]);

  const edit = (next: Definition) => {
    setDef(next);
    setSave('dirty');
    setError('');
  };
  const memberOpts = (members.data ?? []).map((x) => ({ id: x.userId, name: x.name }));
  const readOnly = !canWrite;

  const persist = async (): Promise<boolean> => {
    if (!def || !a) return false;
    setSave('saving');
    setError('');
    try {
      const r = await m.update.mutateAsync({
        id,
        body: { name: name.trim() || a.name, definition: def, baseRevision: revision },
      });
      setRevision(r.draftRevision);
      setLoadedFor(`${r.id}:${r.draftRevision}`);
      setServerIssues(r.issues);
      setSave('saved');
      return true;
    } catch (e) {
      setSave('failed');
      setError(e instanceof Error ? e.message : 'Could not save');
      return false;
    }
  };

  const activate = async () => {
    if (dirty && !(await persist())) return setConfirm(null);
    m.publish.mutate(id, {
      onSuccess: (r) => {
        setServerIssues(r.issues);
        toast(
          a?.status === 'ACTIVE'
            ? `Published version ${r.publishedVersion}`
            : 'Automation activated',
        );
        setConfirm(null);
      },
      onError: (e) => {
        setError(e.message);
        setConfirm(null);
      },
    });
  };

  const selectIssue = (i: Issue) => setSelected(i.stepId ?? 'trigger');

  if (isLoading || q.isPending)
    return (
      <div className="mx-auto max-w-[1440px] p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="mt-4 h-96 w-full" />
      </div>
    );
  if (q.isError || !a || !def)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        {q.error?.message ?? 'Couldn’t load this automation.'}{' '}
        <Link href="/automation" className="text-primary">
          Back to Automation
        </Link>
      </div>
    );

  const trig = triggerOf(def.trigger.type);
  const statusText: Record<Save, string> = {
    saved: 'All changes saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    failed: 'Save failed. Your edits are kept',
  };
  const actions = def.steps.filter((s) => s.type === 'action');

  const panel = selected && (
    <ConfigPanel
      def={def}
      selected={selected}
      issues={issues}
      members={memberOpts}
      readOnly={readOnly}
      onClose={() => setSelected(null)}
      onTrigger={(t) => edit({ ...def, trigger: { type: t } })}
      onChange={(s) => edit({ ...def, steps: def.steps.map((x) => (x.id === s.id ? s : x)) })}
    />
  );

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 pb-8 pt-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label="Back to Automation"
          onClick={() => (dirty ? setConfirm('leave') : router.push('/automation'))}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-white hover:bg-wash"
        >
          <ArrowLeft size={15} />
        </button>
        <label className="min-w-[180px] flex-1">
          <span className="sr-only">Automation name</span>
          <input
            value={name}
            maxLength={120}
            disabled={readOnly}
            onChange={(e) => {
              setName(e.target.value);
              setSave('dirty');
            }}
            className="h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-lg font-semibold hover:border-line focus:border-line"
          />
        </label>
        <StatusBadge status={a.status} />
        {a.hasUnpublishedChanges && (
          <span className="text-xs text-warning">Unpublished changes</span>
        )}
        <span
          aria-live="polite"
          className={cn('text-xs', save === 'failed' ? 'text-danger' : 'text-muted')}
        >
          {statusText[save]}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={readOnly} onClick={() => setTesting(true)}>
            <FlaskConical size={14} />
            Test workflow
          </Button>
          <Button
            variant="outline"
            disabled={readOnly || save === 'saving' || save === 'saved'}
            onClick={() => void persist()}
          >
            Save draft
          </Button>
          {a.status === 'ACTIVE' ? (
            <>
              <Button
                variant="outline"
                disabled={!canActivate || (!a.hasUnpublishedChanges && !dirty)}
                title={
                  canActivate
                    ? 'Publishes your draft as a new version'
                    : 'You need permission to publish'
                }
                onClick={() => setConfirm('activate')}
              >
                Publish changes
              </Button>
              <Button
                variant="outline"
                className="text-danger"
                disabled={!canActivate}
                onClick={() => setConfirm('deactivate')}
              >
                Deactivate
              </Button>
            </>
          ) : (
            <Button
              disabled={!canActivate}
              title={canActivate ? undefined : 'You need permission to activate automations'}
              onClick={() => setConfirm('activate')}
            >
              Activate
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-[#8F2424]"
        >
          {error}
        </div>
      )}
      {readOnly && (
        <div className="rounded-xl bg-wash px-3 py-2.5 text-[12.5px] text-muted">
          You can view this automation. Editing needs Owner or Admin access.
        </div>
      )}
      {a.status === 'ACTIVE' && (
        <div className="rounded-xl bg-wash px-3 py-2.5 text-[12.5px] text-muted">
          Live version {a.publishedVersion} keeps running while you edit. Your changes become active
          only when you publish them.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)_340px]">
        <aside aria-label="Step library" className="lg:block">
          <button
            type="button"
            aria-expanded={libraryOpen}
            onClick={() => setLibraryOpen((v) => !v)}
            className="mb-2 flex h-9 w-full cursor-pointer items-center justify-between rounded-lg border border-line bg-white px-3 text-[13px] font-medium lg:hidden"
          >
            <span className="flex items-center gap-2">
              <Plus size={14} /> Add a step
            </span>
          </button>
          <div
            className={cn(
              'rounded-card border border-line bg-white p-3',
              libraryOpen ? 'block' : 'hidden',
              'lg:block',
            )}
          >
            <LibraryList
              trigger={def.trigger.type}
              disabled={readOnly}
              onAdd={(s) => {
                const step = blankStep(s, def.trigger.type);
                edit({ ...def, steps: [...def.steps, step] });
                setSelected(step.id);
                setLibraryOpen(false);
              }}
            />
          </div>
        </aside>

        <main
          className="min-w-0 rounded-card border border-line bg-[#FBFBFC] p-4"
          aria-label="Workflow canvas"
        >
          <Flow
            def={def}
            issues={issues}
            selected={selected}
            readOnly={readOnly}
            onSelect={setSelected}
            onInsert={(at, s) => {
              const step = blankStep(s, def.trigger.type);
              const steps = [...def.steps];
              steps.splice(at, 0, step);
              edit({ ...def, steps });
              setSelected(step.id);
            }}
            onMove={(i, dir) => {
              const steps = [...def.steps];
              [steps[i], steps[i + dir]] = [steps[i + dir]!, steps[i]!];
              edit({ ...def, steps });
            }}
            onDuplicate={(i) => {
              const copy = { ...structuredClone(def.steps[i]!), id: sid() };
              const steps = [...def.steps];
              steps.splice(i + 1, 0, copy);
              edit({ ...def, steps });
              setSelected(copy.id);
            }}
            onDelete={(i) => {
              edit({ ...def, steps: def.steps.filter((_, k) => k !== i) });
              setSelected(null);
            }}
          />
          <section aria-label="Validation" className="mt-5 border-t border-line-subtle pt-3">
            {issues.length === 0 ? (
              <p className="m-0 text-[12.5px] text-success">
                No problems found. This workflow can be activated.
              </p>
            ) : (
              <>
                <h2 className="m-0 mb-1.5 text-[12.5px] font-semibold text-danger">
                  {issues.length} problem{issues.length === 1 ? '' : 's'} to fix before activating
                </h2>
                <ul className="m-0 list-none p-0">
                  {issues.map((i, k) => (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => selectIssue(i)}
                        className="w-full cursor-pointer rounded-lg px-2 py-1 text-left text-[12.5px] text-[#8F2424] hover:bg-danger-soft"
                      >
                        {i.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </main>

        <div className="hidden lg:block">
          <div className="sticky top-4 min-h-[200px] rounded-card border border-line bg-white">
            {panel || (
              <p className="m-0 p-4 text-[13px] text-muted">
                Select the trigger or a step to edit its settings.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Phones and tablets: settings open as a full-screen sheet. */}
      {selected && (
        <div
          className="fixed inset-0 z-[80] bg-white lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Step settings"
        >
          {panel}
        </div>
      )}

      {testing && (
        <TestDialog
          def={def}
          onClose={() => setTesting(false)}
          onRun={async (sample) => {
            if (dirty && !(await persist()))
              throw new Error('Save failed. Fix the error and try again.');
            return m.test.mutateAsync({ id, sample });
          }}
        />
      )}
      {confirm === 'activate' && (
        <ConfirmDialog
          title={a.status === 'ACTIVE' ? 'Publish these changes?' : 'Activate this automation?'}
          body={`Whenever “${trig?.label}” happens it will run ${def.steps.length} step${def.steps.length === 1 ? '' : 's'}: ${def.steps.map(describeStep).join(' → ')}. It acts on real records (${[...new Set(actions.map((s) => (s.type === 'action' ? (actionOf(s.action)?.label ?? '') : '')))].join('; ')}). No messages are sent to customers.${dirty ? ' Your unsaved edits will be saved first.' : ''}`}
          confirmLabel={a.status === 'ACTIVE' ? 'Publish' : 'Activate'}
          busy={m.publish.isPending || save === 'saving'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void activate()}
        />
      )}
      {confirm === 'deactivate' && (
        <ConfirmDialog
          title="Deactivate this automation?"
          body="New events stop starting runs. Runs that are waiting or queued are cancelled; a step that is executing right now finishes. Run history is kept."
          confirmLabel="Deactivate"
          busy={m.deactivate.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            m.deactivate.mutate(id, {
              onSuccess: () => {
                toast('Automation deactivated');
                setConfirm(null);
              },
              onError: (e) => {
                setError(e.message);
                setConfirm(null);
              },
            })
          }
        />
      )}
      {confirm === 'leave' && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You have edits that haven’t been saved. If you leave they will be lost."
          confirmLabel="Discard changes"
          onCancel={() => setConfirm(null)}
          onConfirm={() => router.push('/automation')}
        />
      )}
    </div>
  );
}
