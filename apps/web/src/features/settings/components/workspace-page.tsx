'use client';

import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Skeleton } from '@/components/ui/skeleton';
import { CURRENCIES } from '@/features/orders/constants';
import { useWorkspace } from '@/lib/workspace';
import { useUpdateWorkspace } from '../queries';
import { Field, fieldErrors, inputCls, Notice, PageHeader, SaveBar, Section } from './bits';
import { useDirty } from './guard';

export function WorkspacePage() {
  const { toast } = useShell();
  const { workspace: w, workspaceId, role, can, isLoading } = useWorkspace();
  const save = useUpdateWorkspace(workspaceId);
  const canEdit = can('workspace:update');
  const [f, setF] = useState({ name: '', description: '', currency: '', email: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);
  const sig = w ? [w.name, w.description, w.defaultCurrency, w.contactEmail].join('|') : null;
  if (w && sig !== seeded) {
    setSeeded(sig);
    setF({
      name: w.name,
      description: w.description ?? '',
      currency: w.defaultCurrency ?? '',
      email: w.contactEmail ?? '',
    });
  }
  const dirty =
    !!w &&
    (f.name !== w.name ||
      f.description !== (w.description ?? '') ||
      f.currency !== (w.defaultCurrency ?? '') ||
      f.email !== (w.contactEmail ?? ''));
  useDirty(dirty);
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setF((x) => ({ ...x, [k]: e.target.value }));
      setSaved(false);
      setErrs((x) => ({ ...x, [k]: '' }));
    };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (save.isPending || !canEdit) return;
    if (f.name.trim().length < 2)
      return setErrs({ name: 'Workspace name needs at least 2 characters' });
    save.mutate(
      {
        name: f.name.trim(),
        description: f.description.trim(),
        defaultCurrency: f.currency as '' | (typeof CURRENCIES)[number],
        contactEmail: f.email.trim(),
      },
      {
        onSuccess: () => {
          setErrs({});
          setSaved(true);
          toast('Workspace saved');
        },
        onError: (e) => {
          const s = fieldErrors(e);
          setErrs({ form: e.message, ...s, ...(s.contactEmail && { email: s.contactEmail }) });
        },
      },
    );
  };

  return (
    <div>
      <PageHeader title="Workspace" description="Details shared by everyone in this workspace." />
      {isLoading && <Skeleton className="h-64 w-full" />}
      {w && (
        <form onSubmit={submit} noValidate>
          {!canEdit && (
            <div className="mb-4">
              <Notice>
                You can view these details. Only an Owner or Admin can change them (you are{' '}
                {role?.toLowerCase()}).
              </Notice>
            </div>
          )}
          <Section title="General">
            <div className="grid gap-4">
              <Field label="Workspace name" htmlFor="ws-name" required error={errs.name}>
                <input
                  id="ws-name"
                  value={f.name}
                  maxLength={80}
                  disabled={!canEdit}
                  aria-invalid={!!errs.name}
                  onChange={set('name')}
                  className={inputCls}
                />
              </Field>
              <Field label="Description" htmlFor="ws-desc" error={errs.description}>
                <textarea
                  id="ws-desc"
                  rows={3}
                  value={f.description}
                  maxLength={300}
                  disabled={!canEdit}
                  onChange={set('description')}
                  className="rounded-lg border border-line bg-white p-2.5 text-[13px] disabled:bg-wash disabled:text-muted"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Default currency"
                  htmlFor="ws-cur"
                  hint="Pre-selected when creating orders."
                  error={errs.defaultCurrency}
                >
                  <select
                    id="ws-cur"
                    value={f.currency}
                    disabled={!canEdit}
                    onChange={set('currency')}
                    className={inputCls}
                  >
                    <option value="">No default (USD)</option>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Contact email" htmlFor="ws-email" error={errs.email}>
                  <input
                    id="ws-email"
                    type="email"
                    value={f.email}
                    maxLength={254}
                    disabled={!canEdit}
                    aria-invalid={!!errs.email}
                    onChange={set('email')}
                    className={inputCls}
                  />
                </Field>
              </div>
              {errs.form && <Notice tone="error">{errs.form}</Notice>}
            </div>
          </Section>
          {canEdit && (
            <SaveBar
              dirty={dirty}
              busy={save.isPending}
              saved={saved}
              onCancel={() => {
                setF({
                  name: w.name,
                  description: w.description ?? '',
                  currency: w.defaultCurrency ?? '',
                  email: w.contactEmail ?? '',
                });
                setErrs({});
              }}
            />
          )}
          <Section title="Workspace identity">
            <dl className="m-0 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-faint">Slug</dt>
              <dd className="m-0 font-mono text-[12.5px]">{w.slug}</dd>
              <dt className="text-faint">Created</dt>
              <dd className="m-0">
                {new Date(w.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
              </dd>
              <dt className="text-faint">Your role</dt>
              <dd className="m-0">{role}</dd>
            </dl>
            <p className="mb-0 mt-3 text-xs text-faint">
              The slug is fixed. A workspace logo isn&apos;t supported yet because there is no file
              storage.
            </p>
          </Section>
        </form>
      )}
    </div>
  );
}
