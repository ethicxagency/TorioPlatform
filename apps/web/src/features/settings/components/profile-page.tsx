'use client';

import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Skeleton } from '@/components/ui/skeleton';
import { initialsOf } from '@/features/inbox/format';
import { useProfile, useUpdateProfile } from '../queries';
import { Field, fieldErrors, inputCls, Notice, PageHeader, SaveBar, Section } from './bits';
import { useDirty } from './guard';

export function ProfilePage() {
  const { toast } = useShell();
  const q = useProfile();
  const save = useUpdateProfile();
  const p = q.data;
  const [form, setForm] = useState({ name: '', phone: '', jobTitle: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);
  // Seed the form once per server value (also after a successful save), without clobbering edits.
  const sig = p ? `${p.name}|${p.phone}|${p.jobTitle}` : null;
  if (p && sig !== seeded) {
    setSeeded(sig);
    setForm({ name: p.name, phone: p.phone ?? '', jobTitle: p.jobTitle ?? '' });
  }

  const dirty =
    !!p &&
    (form.name !== p.name ||
      form.phone !== (p.phone ?? '') ||
      form.jobTitle !== (p.jobTitle ?? ''));
  useDirty(dirty);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
    setErrs((x) => ({ ...x, [k]: '' }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (save.isPending) return;
    if (!form.name.trim()) return setErrs({ name: 'Name is required' });
    save.mutate(
      { name: form.name.trim(), phone: form.phone.trim(), jobTitle: form.jobTitle.trim() },
      {
        onSuccess: () => {
          setErrs({});
          setSaved(true);
          toast('Profile saved');
        },
        onError: (e) => setErrs({ form: e.message, ...fieldErrors(e) }),
      },
    );
  };

  return (
    <div>
      <PageHeader title="My profile" description="How you appear to your teammates in Torio." />
      {q.isPending && <Skeleton className="h-64 w-full" />}
      {q.isError && (
        <Notice tone="error">Couldn&apos;t load your profile. Please refresh the page.</Notice>
      )}
      {p && (
        <form onSubmit={submit} noValidate>
          <Section title="Profile information">
            <div className="mb-4 flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-white"
              >
                {initialsOf(form.name || p.name)}
              </span>
              <p className="m-0 text-xs text-faint">
                Profile photos aren&apos;t supported yet, so your initials are shown.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="pf-name" required error={errs.name}>
                <input
                  id="pf-name"
                  value={form.name}
                  maxLength={100}
                  aria-invalid={!!errs.name}
                  aria-describedby={errs.name ? 'pf-name-err' : undefined}
                  onChange={set('name')}
                  className={inputCls}
                />
              </Field>
              <Field
                label="Email"
                htmlFor="pf-email"
                hint={
                  p.emailVerified
                    ? 'Verified. Email can’t be changed here yet.'
                    : 'Not verified. Email can’t be changed here yet.'
                }
              >
                <input id="pf-email" value={p.email} disabled className={inputCls} />
              </Field>
              <Field label="Phone" htmlFor="pf-phone" error={errs.phone}>
                <input
                  id="pf-phone"
                  type="tel"
                  value={form.phone}
                  maxLength={40}
                  aria-invalid={!!errs.phone}
                  onChange={set('phone')}
                  className={inputCls}
                />
              </Field>
              <Field label="Job title" htmlFor="pf-job" error={errs.jobTitle}>
                <input
                  id="pf-job"
                  value={form.jobTitle}
                  maxLength={100}
                  aria-invalid={!!errs.jobTitle}
                  onChange={set('jobTitle')}
                  className={inputCls}
                />
              </Field>
            </div>
            {errs.form && (
              <div className="mt-4">
                <Notice tone="error">{errs.form}</Notice>
              </div>
            )}
          </Section>
          <p className="mb-4 mt-0 text-xs text-faint">
            Your role and workspace access are managed by workspace admins, not from your profile.
          </p>
          <SaveBar
            dirty={dirty}
            busy={save.isPending}
            saved={saved}
            onCancel={() => {
              setForm({ name: p.name, phone: p.phone ?? '', jobTitle: p.jobTitle ?? '' });
              setErrs({});
            }}
          />
        </form>
      )}
    </div>
  );
}
