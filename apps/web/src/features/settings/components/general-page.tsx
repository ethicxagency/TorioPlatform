'use client';

import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { initialsOf } from '@/features/inbox/format';
import { useWorkspace } from '@/lib/workspace';
import { useProfile, useUpdateProfile, useUpdateWorkspace } from '../queries';
import type { ProfileBody, WorkspaceBody } from '../queries';
import { Field, fieldErrors, inputCls, Notice, PageHeader, Section } from './bits';
import { CurrencySelect, TimeZoneSelect } from './regional';
import { useDirty } from './guard';

interface ProfileForm {
  name: string;
  phone: string;
  jobTitle: string;
}
interface WorkspaceForm {
  name: string;
  description: string;
  currency: string;
  email: string;
  tz: string;
}

/**
 * One page for My profile, Workspace and Preferences, with a single "Save changes" button.
 *
 * The three areas live behind two endpoints (the user's profile + preferences, and the workspace), which cannot be
 * saved in one transaction. Save validates everything first, then sends only what changed to each endpoint. A
 * section that saved is marked saved even if the other one failed, and the failed one keeps its edits.
 */
export function GeneralPage() {
  const { toast } = useShell();
  const profileQ = useProfile();
  const saveProfile = useUpdateProfile();
  const { workspace: w, workspaceId, role, can, isLoading: wsLoading } = useWorkspace();
  const saveWorkspace = useUpdateWorkspace(workspaceId);
  const canEdit = can('workspace:update');
  const p = profileQ.data;

  const [pf, setPf] = useState<ProfileForm>({
    name: '',
    phone: '',
    jobTitle: '',
  });
  const [wf, setWf] = useState<WorkspaceForm>({
    name: '',
    description: '',
    currency: '',
    email: '',
    tz: 'UTC',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pSeed, setPSeed] = useState<string | null>(null);
  const [wSeed, setWSeed] = useState<string | null>(null);

  // Seed each section once per server value (also after its own save) so one section never clobbers the other.
  const pSig = p ? [p.name, p.phone, p.jobTitle].join('|') : null;
  if (p && pSig !== pSeed) {
    setPSeed(pSig);
    setPf({
      name: p.name,
      phone: p.phone ?? '',
      jobTitle: p.jobTitle ?? '',
    });
  }
  const wSig = w
    ? [w.name, w.description, w.defaultCurrency, w.contactEmail, w.reportingTimeZone].join('|')
    : null;
  if (w && wSig !== wSeed) {
    setWSeed(wSig);
    setWf({
      name: w.name,
      description: w.description ?? '',
      currency: w.defaultCurrency ?? '',
      email: w.contactEmail ?? '',
      tz: w.reportingTimeZone,
    });
  }

  const profileDiff = useMemo<ProfileBody>(() => {
    if (!p) return {};
    const d: ProfileBody = {};
    if (pf.name !== p.name) d.name = pf.name.trim();
    if (pf.phone !== (p.phone ?? '')) d.phone = pf.phone.trim();
    if (pf.jobTitle !== (p.jobTitle ?? '')) d.jobTitle = pf.jobTitle.trim();
    return d;
  }, [p, pf]);
  const workspaceDiff = useMemo<WorkspaceBody>(() => {
    if (!w || !canEdit) return {};
    const d: WorkspaceBody = {};
    if (wf.name !== w.name) d.name = wf.name.trim();
    if (wf.description !== (w.description ?? '')) d.description = wf.description.trim();
    if (wf.currency !== (w.defaultCurrency ?? ''))
      d.defaultCurrency = wf.currency as WorkspaceBody['defaultCurrency'];
    if (wf.email !== (w.contactEmail ?? '')) d.contactEmail = wf.email.trim();
    if (wf.tz !== w.reportingTimeZone) d.reportingTimeZone = wf.tz;
    return d;
  }, [w, wf, canEdit]);
  const profileDirty = Object.keys(profileDiff).length > 0;
  const workspaceDirty = Object.keys(workspaceDiff).length > 0;
  const dirty = profileDirty || workspaceDirty;
  useDirty(dirty);

  const touch = () => {
    setSaved(false);
    setFormError('');
  };
  const setP = (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setPf((f) => ({ ...f, [k]: e.target.value }));
    setErrs((x) => ({ ...x, [k]: '' }));
    touch();
  };
  const setW =
    (k: keyof WorkspaceForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setWf((f) => ({ ...f, [k]: e.target.value }));
      setErrs((x) => ({ ...x, [`ws-${k}`]: '' }));
      touch();
    };

  const discard = () => {
    if (p)
      setPf({
        name: p.name,
        phone: p.phone ?? '',
        jobTitle: p.jobTitle ?? '',
      });
    if (w)
      setWf({
        name: w.name,
        description: w.description ?? '',
        currency: w.defaultCurrency ?? '',
        email: w.contactEmail ?? '',
        tz: w.reportingTimeZone,
      });
    setErrs({});
    setFormError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !dirty) return;
    // Validate everything before anything is sent, so a typo never causes a half-save.
    const v: Record<string, string> = {};
    if (profileDirty && !pf.name.trim()) v.name = 'Name is required';
    if (workspaceDirty && wf.name.trim().length < 2)
      v['ws-name'] = 'Business name needs at least 2 characters';
    if (Object.keys(v).length) return setErrs(v);

    setBusy(true);
    setErrs({});
    setFormError('');
    const done: string[] = [];
    const failed: string[] = [];
    const next: Record<string, string> = {};
    if (profileDirty) {
      try {
        await saveProfile.mutateAsync(profileDiff);
        done.push('Profile and preferences');
      } catch (err) {
        failed.push('Profile and preferences');
        const s = fieldErrors(err);
        Object.assign(next, s);
        next.form = (err as Error).message;
      }
    }
    if (workspaceDirty) {
      try {
        await saveWorkspace.mutateAsync(workspaceDiff);
        done.push('Business information');
      } catch (err) {
        failed.push('Business information');
        const s = fieldErrors(err);
        for (const [k, m] of Object.entries(s))
          next[`ws-${k === 'contactEmail' ? 'email' : k}`] = m;
        next.wsForm = (err as Error).message;
      }
    }
    setBusy(false);
    setErrs(next);
    if (failed.length) {
      setFormError(
        done.length
          ? `${done.join(' and ')} saved, but ${failed.join(' and ').toLowerCase()} could not be saved. Your edits there are kept.`
          : `${failed.join(' and ')} could not be saved. Your edits are kept.`,
      );
      if (done.length) toast.success(`${done.join(' and ')} saved successfully.`);
      toast.error('Unable to save all changes. Your edits are kept.');
    } else {
      setSaved(true);
      toast.success(
        profileDirty && workspaceDirty
          ? 'Changes saved successfully.'
          : workspaceDirty
            ? 'Business information updated successfully.'
            : 'Profile updated successfully.',
      );
    }
  };

  const loadingP = profileQ.isPending;
  return (
    <div>
      <PageHeader title="General" />
      <form onSubmit={submit} noValidate>
        <Section id="workspace" title="Business Information">
          {wsLoading && <Skeleton className="h-44 w-full" />}
          {w && (
            <>
              {!canEdit && (
                <Notice>
                  You can view these details. Owner or Admin permissions are required to change them
                  (you are {role?.toLowerCase()}).
                </Notice>
              )}
              <Field label="Business Name" htmlFor="ws-name" required error={errs['ws-name']}>
                <input
                  id="ws-name"
                  value={wf.name}
                  maxLength={80}
                  disabled={!canEdit}
                  aria-invalid={!!errs['ws-name']}
                  onChange={setW('name')}
                  className={`${inputCls} h-10 text-sm font-medium`}
                />
              </Field>
              <Field label="Contact email (optional)" htmlFor="ws-email" error={errs['ws-email']}>
                <input
                  id="ws-email"
                  type="email"
                  value={wf.email}
                  maxLength={254}
                  placeholder="hello@yourbusiness.com"
                  disabled={!canEdit}
                  aria-invalid={!!errs['ws-email']}
                  onChange={setW('email')}
                  className={inputCls}
                />
              </Field>
              <Field
                label="Description (optional)"
                htmlFor="ws-desc"
                error={errs['ws-description']}
              >
                <textarea
                  id="ws-desc"
                  rows={3}
                  value={wf.description}
                  maxLength={300}
                  placeholder="What your business does"
                  disabled={!canEdit}
                  onChange={setW('description')}
                  className={`${inputCls} h-auto resize-y p-2.5`}
                />
              </Field>
              {errs.wsForm && <Notice tone="error">{errs.wsForm}</Notice>}
            </>
          )}
        </Section>

        <Section id="regional" title="Regional & Financial">
          {wsLoading && <Skeleton className="h-20 w-full" />}
          {w && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Time Zone" htmlFor="ws-tz" error={errs['ws-reportingTimeZone']}>
                <TimeZoneSelect
                  id="ws-tz"
                  value={wf.tz}
                  disabled={!canEdit}
                  onChange={(tz) => {
                    setWf((f) => ({ ...f, tz }));
                    touch();
                  }}
                />
              </Field>
              <Field label="Currency" htmlFor="ws-cur" error={errs['ws-defaultCurrency']}>
                <CurrencySelect
                  id="ws-cur"
                  value={wf.currency}
                  disabled={!canEdit}
                  onChange={(currency) => {
                    setWf((f) => ({ ...f, currency }));
                    touch();
                  }}
                />
              </Field>
            </div>
          )}
        </Section>

        <Section id="personal" title="Your profile">
          {loadingP && <Skeleton className="h-40 w-full" />}
          {profileQ.isError && (
            <Notice tone="error">Couldn&apos;t load your profile. Please refresh the page.</Notice>
          )}
          {p && (
            <>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-white"
                >
                  {initialsOf(pf.name || p.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{pf.name || p.name}</div>
                  <div className="truncate text-xs text-muted">{p.email}</div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="pf-name" required error={errs.name}>
                  <input
                    id="pf-name"
                    value={pf.name}
                    maxLength={100}
                    placeholder="Your name"
                    aria-invalid={!!errs.name}
                    onChange={setP('name')}
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Email"
                  htmlFor="pf-email"
                  hint={p.emailVerified ? 'Verified' : 'Not verified'}
                >
                  <input id="pf-email" value={p.email} disabled className={inputCls} />
                </Field>
                <Field label="Phone (optional)" htmlFor="pf-phone" error={errs.phone}>
                  <input
                    id="pf-phone"
                    type="tel"
                    value={pf.phone}
                    maxLength={40}
                    placeholder="+880 1700 000000"
                    aria-invalid={!!errs.phone}
                    onChange={setP('phone')}
                    className={inputCls}
                  />
                </Field>
                <Field label="Job title (optional)" htmlFor="pf-job" error={errs.jobTitle}>
                  <input
                    id="pf-job"
                    value={pf.jobTitle}
                    maxLength={100}
                    placeholder="e.g. Head of Support"
                    aria-invalid={!!errs.jobTitle}
                    onChange={setP('jobTitle')}
                    className={inputCls}
                  />
                </Field>
              </div>
              {errs.form && <Notice tone="error">{errs.form}</Notice>}
            </>
          )}
        </Section>

        {formError && (
          <div className="mt-4">
            <Notice tone="error">{formError}</Notice>
          </div>
        )}
        <div className="sticky bottom-0 z-10 mt-4 flex items-center gap-2 border-t border-line-subtle bg-white/95 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[8px]">
          <Button type="submit" disabled={!dirty || busy}>
            {busy ? 'Saving…' : 'Save Changes'}
          </Button>
          <Button type="button" variant="outline" disabled={!dirty || busy} onClick={discard}>
            Discard Changes
          </Button>
          <span aria-live="polite" className="ml-1 text-xs text-muted">
            {saved && !dirty && (
              <span className="inline-flex items-center gap-1 text-success">
                <Check size={13} /> Saved
              </span>
            )}
            {dirty && !busy && 'Unsaved changes'}
          </span>
        </div>
      </form>
    </div>
  );
}
