'use client';

import { describeStep, TEMPLATES, triggerOf, type Template } from '@torio/contracts';
import { ArrowRight, Clock, CornerDownRight, Filter, Play, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import {
  actionCount,
  actionSummary,
  categoryOf,
  CATEGORIES,
  matchesTemplate,
  triggerLabel,
  type CategoryKey,
} from '../template-meta';

export function TemplateCard({
  t,
  onOpen,
  labeled,
}: {
  t: Template;
  onOpen: (t: Template) => void;
  labeled?: boolean;
}) {
  const cat = categoryOf(t);
  const Icon = cat.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(t)}
      className="group flex h-full min-h-[236px] w-full cursor-pointer flex-col rounded-card border border-line bg-white p-4 text-left transition-[border-color,box-shadow] duration-150 hover:border-[#D4D6F5] hover:shadow-[0_1px_6px_rgba(23,24,28,0.05)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
    >
      <span className="flex items-center gap-2 text-[12px] text-muted">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
        >
          <Icon size={14} />
        </span>
        {cat.label}
      </span>
      <span className="mt-3 text-[15px] font-semibold leading-[1.3] text-ink">{t.name}</span>
      <span className="mt-1 line-clamp-3 text-[12.5px] leading-[1.5] text-muted">
        {t.description}
      </span>
      <span className="mt-auto flex flex-col gap-1.5 pt-3 text-[12px]">
        <span className="flex items-center gap-2 rounded-lg bg-wash px-2 py-1.5 text-ink">
          <Play size={11} aria-hidden className="shrink-0 text-primary" />
          {labeled ? (
            <span className="w-[52px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">
              Trigger
            </span>
          ) : (
            <span className="sr-only">When: </span>
          )}
          <span className="truncate">{triggerLabel(t)}</span>
        </span>
        <span className="flex items-center gap-2 rounded-lg bg-wash px-2 py-1.5 text-muted">
          <CornerDownRight size={11} aria-hidden className="shrink-0 text-faint" />
          {labeled ? (
            <span className="w-[52px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">
              Action
            </span>
          ) : (
            <span className="sr-only">Then: </span>
          )}
          <span className="truncate">
            {actionSummary(t) || `${t.definition.steps.length} steps`}
          </span>
        </span>
      </span>
      <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary">
        Preview template
        <ArrowRight
          size={13}
          aria-hidden
          className="transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </span>
    </button>
  );
}

/** Search + category control + count + grid with honest empty states. Shared by the Templates tab and the library modal. */
export function TemplateExplorer({
  onOpen,
  sticky,
}: {
  onOpen: (t: Template) => void;
  /** Keep search and categories pinned while the grid scrolls (inside a scrolling dialog). */
  sticky?: boolean;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoryKey | 'all'>('all');
  const shown = TEMPLATES.filter(
    (t) => (cat === 'all' || categoryOf(t).key === cat) && (!q.trim() || matchesTemplate(t, q)),
  );
  const seg = (active: boolean) =>
    cn(
      'h-8 shrink-0 cursor-pointer rounded-lg border-none px-3 text-[12.5px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none',
      active
        ? 'bg-white font-semibold text-primary shadow-[0_1px_2px_rgba(23,24,28,0.08)]'
        : 'bg-transparent text-muted hover:text-ink',
    );
  const filtered = !!q.trim() || cat !== 'all';
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'flex flex-col gap-3',
          sticky &&
            'sticky -top-4 z-[1] -mx-5 -mt-4 border-b border-line-subtle bg-white px-5 pb-3 pt-4',
        )}
      >
        <label className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-white px-3 transition-colors focus-within:border-primary">
          <Search size={15} className="text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search templates"
            placeholder="Find an automation for your workflow..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] outline-none"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ('')}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-faint hover:bg-wash"
            >
              <X size={13} />
            </button>
          )}
        </label>
        <div
          role="group"
          aria-label="Template categories"
          className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-xl bg-wash-2 p-1"
        >
          <button
            type="button"
            aria-pressed={cat === 'all'}
            onClick={() => setCat('all')}
            className={seg(cat === 'all')}
          >
            All templates
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={cat === c.key}
              onClick={() => setCat(c.key)}
              className={seg(cat === c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="m-0 font-section-title">Explore templates</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted">
            Ready-to-use workflows for your team.
          </p>
        </div>
        <span aria-live="polite" className="shrink-0 text-xs tabular-nums text-faint">
          {shown.length} {shown.length === 1 ? 'template' : 'templates'}
        </span>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-6 py-10 text-center">
          <span
            aria-hidden
            className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-wash text-faint"
          >
            <Search size={16} />
          </span>
          <div className="text-[14px] font-semibold">
            {q.trim() ? 'No templates match your search' : 'No templates in this category yet'}
          </div>
          <div className="mx-auto mt-1 max-w-[380px] text-[13px] text-muted">
            {q.trim()
              ? 'Try another word, or clear the search to see everything.'
              : 'Torio only lists templates it can really run today. Try another category.'}
          </div>
          {filtered && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setQ('');
                setCat('all');
              }}
            >
              Show all templates
            </Button>
          )}
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <li key={t.key}>
              <TemplateCard t={t} onOpen={onOpen} labeled />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FlowStep({
  icon,
  kind,
  tone,
  last,
  children,
}: {
  icon: React.ReactNode;
  kind: string;
  tone?: 'primary';
  last: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {!last && <span aria-hidden className="absolute bottom-0 left-[13px] top-7 w-px bg-line" />}
      <span
        aria-hidden
        className={cn(
          'z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          tone === 'primary'
            ? 'bg-primary-soft text-primary'
            : 'border border-line bg-white text-muted',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{kind}</div>
        {children}
      </div>
    </li>
  );
}

export function PreviewDialog({
  t,
  canWrite,
  backLabel,
  onClose,
  onUse,
}: {
  t: Template;
  canWrite: boolean;
  backLabel: string;
  onClose: () => void;
  onUse: (t: Template) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cat = categoryOf(t);
  return (
    <Modal
      title={t.name}
      description={`${cat.label} · ${t.complexity}`}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {backLabel}
          </Button>
          <Button
            disabled={busy || !canWrite}
            title={canWrite ? undefined : 'You need permission to create automations'}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onUse(t);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not create the draft');
                setBusy(false);
              }
            }}
          >
            {busy ? 'Creating…' : 'Create draft'}
          </Button>
        </>
      }
    >
      <p className="m-0 mb-4 text-[13px] text-muted">{t.description}</p>
      <h3 className="m-0 mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-faint">
        What it does
      </h3>
      <ol className="m-0 flex list-none flex-col p-0 text-[13px]">
        <FlowStep
          icon={<Play size={13} />}
          kind="Trigger"
          tone="primary"
          last={!t.definition.steps.length}
        >
          <div className="font-medium text-ink">{triggerLabel(t)}</div>
          {triggerOf(t.definition.trigger.type)?.description && (
            <div className="text-xs text-muted">
              {triggerOf(t.definition.trigger.type)!.description}
            </div>
          )}
        </FlowStep>
        {t.definition.steps.map((s, i) => (
          <FlowStep
            key={s.id}
            icon={
              s.type === 'condition' ? (
                <Filter size={13} />
              ) : s.type === 'wait' ? (
                <Clock size={13} />
              ) : (
                <CornerDownRight size={13} />
              )
            }
            kind={s.type === 'condition' ? 'Condition' : s.type === 'wait' ? 'Wait' : 'Action'}
            last={i === t.definition.steps.length - 1}
          >
            <div className="text-ink">{describeStep(s)}</div>
            {s.type === 'action' && s.config.text && (
              <div className="truncate text-xs text-muted">“{s.config.text}”</div>
            )}
          </FlowStep>
        ))}
      </ol>
      <h3 className="mb-2 mt-5 text-[11.5px] font-semibold uppercase tracking-wide text-faint">
        Requirements
      </h3>
      <dl className="m-0 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-faint">Actions</dt>
        <dd className="m-0">{actionCount(t)}</dd>
        <dt className="text-faint">Integrations</dt>
        <dd className="m-0">None required</dd>
        <dt className="text-faint">Channels</dt>
        <dd className="m-0">Any. It uses Torio records only; no messages are sent to customers.</dd>
        <dt className="text-faint">Before activating</dt>
        <dd className="m-0">
          {t.setup.length ? t.setup.join('; ') : 'Review the conditions and text'}
        </dd>
      </dl>
      <p className="mb-0 mt-3 text-xs text-faint">
        This creates a draft. Nothing runs until you review and activate it.
      </p>
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
        >
          {error}
        </div>
      )}
    </Modal>
  );
}

export function LibraryModal({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (t: Template) => void;
}) {
  return (
    <Modal
      title="Automation Library"
      description="Discover ready-to-use workflows to automate your business."
      onClose={onClose}
      className="sm:h-[min(780px,90vh)] sm:max-w-[1240px] max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none"
    >
      <TemplateExplorer onOpen={onOpen} sticky />
    </Modal>
  );
}
