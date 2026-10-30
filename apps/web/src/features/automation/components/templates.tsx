'use client';

import { describeStep, TEMPLATES, triggerOf, type Template } from '@torio/contracts';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';

export function TemplateGallery({
  canWrite,
  onUse,
}: {
  canWrite: boolean;
  onUse: (t: Template) => Promise<unknown>;
}) {
  const [open, setOpen] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <p className="m-0 mb-3 text-[13px] text-muted">
        Templates create a <b>draft</b>. Review every condition and message, then activate it
        yourself: nothing runs automatically. All of them use only Torio’s own data, so no
        integration is required.
      </p>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              onClick={() => {
                setError('');
                setOpen(t);
              }}
              className="flex h-full w-full cursor-pointer flex-col rounded-card border border-line bg-white p-4 text-left hover:border-[#D4D6F5] hover:bg-[#FBFBFF]"
            >
              <span className="text-[14px] font-semibold">{t.name}</span>
              <span className="mt-1 text-[12.5px] text-muted">{t.description}</span>
              <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs text-faint">
                <span>When: {triggerOf(t.definition.trigger.type)?.label}</span>
                <span>{t.definition.steps.length} steps</span>
                <span>{t.complexity}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <Modal
          title={open.name}
          description={open.description}
          onClose={busy ? () => undefined : () => setOpen(null)}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setOpen(null)}>
                Close
              </Button>
              <Button
                disabled={busy || !canWrite}
                title={canWrite ? undefined : 'You need permission to create automations'}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await onUse(open);
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
          <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
            <li className="rounded-xl bg-primary-soft px-3 py-2">
              <span className="text-xs text-muted">Trigger</span>
              <div className="font-medium">{triggerOf(open.definition.trigger.type)?.label}</div>
            </li>
            {open.definition.steps.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
              >
                <ArrowRight size={13} className="text-faint" aria-hidden />
                {describeStep(s)}
                {s.type === 'action' && s.config.text && (
                  <span className="truncate text-xs text-muted">“{s.config.text}”</span>
                )}
              </li>
            ))}
          </ol>
          <dl className="m-0 mt-4 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-faint">Integrations</dt>
            <dd className="m-0">None required</dd>
            <dt className="text-faint">Channels</dt>
            <dd className="m-0">
              Any. It uses Torio records only; no messages are sent to customers.
            </dd>
            <dt className="text-faint">Before activating</dt>
            <dd className="m-0">
              {open.setup.length ? open.setup.join('; ') : 'Review the conditions and text'}
            </dd>
          </dl>
          {error && (
            <div
              role="alert"
              className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
            >
              {error}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
