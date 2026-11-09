'use client';

import { LANDING_PAGES, currencyDef, DEFAULT_CURRENCY } from '@torio/contracts';
import { Building2, Check, SlidersHorizontal, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchSelect } from '@/features/inbox/components/search-select';
import { initialsOf } from '@/features/inbox/format';
import { CURRENCIES } from '@/features/orders/constants';
import { fmtDateTime } from '@/lib/datetime';
import { useWorkspace } from '@/lib/workspace';
import { useProfile, useUpdateProfile, useUpdateWorkspace } from '../queries';
import type { ProfileBody, WorkspaceBody } from '../queries';
import { Field, fieldErrors, inputCls, Notice, PageHeader, Section } from './bits';
import { useDirty } from './guard';

const LANDING_LABEL: Record<(typeof LANDING_PAGES)[number], string> = {
  dashboard: 'Dashboard',
  inbox: 'Inbox',
  leads: 'Leads',
  customers: 'Customers',
  orders: 'Orders',
};

function zoneList(): string[] {
  try {
    const z = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
      'timeZone',
    );
    return z.includes('UTC') ? z : ['UTC', ...z];
  } catch {
    return ['UTC'];
  }
}
const zoneLabel = (z: string) => z.replace(/_/g, ' ');

interface ProfileForm {
  name: string;
  phone: string;
  jobTitle: string;
  timeZone: string;
  landingPage: (typeof LANDING_PAGES)[number];
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
    timeZone: '',
    landingPage: 'dashboard',
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
  const pSig = p ? [p.name, p.phone, p.jobTitle, p.timeZone, p.landingPage].join('|') : null;
  if (p && pSig !== pSeed) {
    setPSeed(pSig);
    setPf({
      name: p.name,
      phone: p.phone ?? '',
      jobTitle: p.jobTitle ?? '',
      timeZone: p.timeZone ?? '',
      landingPage: p.landingPage,
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
    if (pf.timeZone !== (p.timeZone ?? '')) d.timeZone = pf.timeZone;
    if (pf.landingPage !== p.landingPage) d.landingPage = pf.landingPage;
    return d;
  }, [p, pf]);
  const workspaceDiff = useMemo<WorkspaceBody>(() => {
    if (!w || !canEdit) return {};
    const d: WorkspaceBody = {};
    if (wf.name !== w.name) d.name = wf.name.trim();
    if (wf.description !== (w.description ?? '')) d.description = wf.description.trim();
    if (wf.currency !== (w.defaultCurrency ?? ''))
      d.defaultCurrency = wf.currency as '' | (typeof CURRENCIES)[number];
    if (wf.email !== (w.contactEmail ?? '')) d.contactEmail = wf.email.trim();
    if (wf.tz !== w.reportingTimeZone) d.reportingTimeZone = wf.tz;
    return d;
  }, [w, wf, canEdit]);
  const profileDirty = Object.keys(profileDiff).length > 0;
  const workspaceDirty = Object.keys(workspaceDiff).length > 0;
  const dirty = profileDirty || workspaceDirty;
  useDirty(dirty);

  const zones = useMemo(() => zoneList(), []);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const touch = () => {
    setSaved(false);
    setFormError('');
  };
  const setP =
    (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
        timeZone: p.timeZone ?? '',
        landingPage: p.landingPage,
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
      v['ws-name'] = 'Workspace name needs at least 2 characters';
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
        done.push('Workspace');
      } catch (err) {
        failed.push('Workspace');
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
      if (done.length) toast(`${done.join(' and ')} saved`);
    } else {
      setSaved(true);
      toast('Changes saved');
    }
  };

  const loadingP = profileQ.isPending;
  const timeZoneOptions = zones.map((z) => ({ value: z, label: zoneLabel(z) }));
  const currencies = [
    ...CURRENCIES,
    // keep a previously saved currency visible instead of silently changing it
    ...(wf.currency && !(CURRENCIES as readonly string[]).includes(wf.currency)
      ? [wf.currency]
      : []),
  ].map((c) => ({ value: c, label: `${c} — ${currencyDef(c)?.name ?? c}` }));
  const wsTzOptions = zones.includes(wf.tz)
    ? timeZoneOptions
    : [{ value: wf.tz, label: zoneLabel(wf.tz) }, ...timeZoneOptions];

  return (
    <div>
      <PageHeader
        title="General"
        description="Manage your personal information, workspace details, and preferences."
      />
      <form onSubmit={submit} noValidate>
        <Section
          id="personal"
          icon={<UserRound size={16} />}
          title="Personal information"
          description="How you appear to your teammates in Torio."
        >
          {loadingP && <Skeleton className="h-40 w-full" />}
          {profileQ.isError && (
            <Notice tone="error">Couldn&apos;t load your profile. Please refresh the page.</Notice>
          )}
          {p && (
            <>
              <div className="mb-4 flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-white"
                >
                  {initialsOf(pf.name || p.name)}
                </span>
                <p className="m-0 text-xs text-faint">
                  Profile photos aren&apos;t supported yet, so your initials are shown.
                </p>
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
                  hint={
                    p.emailVerified
                      ? 'Verified. Email can’t be changed here yet.'
                      : 'Not verified. Email can’t be changed here yet.'
                  }
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
              {errs.form && (
                <div className="mt-4">
                  <Notice tone="error">{errs.form}</Notice>
                </div>
              )}
            </>
          )}
        </Section>

        <Section
          id="workspace"
          icon={<Building2 size={16} />}
          title="Business & workspace information"
          description="Details shared by everyone in this workspace."
        >
          {wsLoading && <Skeleton className="h-56 w-full" />}
          {w && (
            <>
              {!canEdit && (
                <div className="mb-4">
                  <Notice>
                    You can view these details. Workspace administrator permissions (Owner or Admin)
                    are required to change them (you are {role?.toLowerCase()}).
                  </Notice>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workspace name" htmlFor="ws-name" required error={errs['ws-name']}>
                  <input
                    id="ws-name"
                    value={wf.name}
                    maxLength={80}
                    disabled={!canEdit}
                    aria-invalid={!!errs['ws-name']}
                    onChange={setW('name')}
                    className={inputCls}
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
                <div className="sm:col-span-2">
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
                </div>
                <Field
                  label="Default currency"
                  htmlFor="ws-cur"
                  hint="Pre-selected when creating orders."
                  error={errs['ws-defaultCurrency']}
                >
                  <SearchSelect
                    id="ws-cur"
                    label="Default currency"
                    hideLabel
                    anyLabel={`No default (${DEFAULT_CURRENCY})`}
                    searchPlaceholder="Search currencies"
                    emptyText="No currencies available."
                    disabled={!canEdit}
                    options={currencies}
                    value={wf.currency}
                    onChange={(currency) => {
                      setWf((f) => ({ ...f, currency }));
                      touch();
                    }}
                  />
                </Field>
                <Field
                  label="Reporting time zone"
                  htmlFor="ws-tz"
                  hint="Decides where each day starts and ends in dashboard analytics."
                  error={errs['ws-reportingTimeZone']}
                >
                  <SearchSelect
                    id="ws-tz"
                    label="Reporting time zone"
                    hideLabel
                    searchPlaceholder="Search time zones"
                    emptyText="No time zones available."
                    disabled={!canEdit}
                    options={wsTzOptions}
                    value={wf.tz}
                    onChange={(tz) => {
                      setWf((f) => ({ ...f, tz }));
                      touch();
                    }}
                  />
                </Field>
              </div>
              {errs.wsForm && (
                <div className="mt-4">
                  <Notice tone="error">{errs.wsForm}</Notice>
                </div>
              )}
              <dl className="m-0 mt-5 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 border-t border-line-subtle pt-4 text-[13px]">
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
                The slug is fixed. A workspace logo, address and website aren&apos;t supported yet.
              </p>
            </>
          )}
        </Section>

        <Section
          id="preferences"
          icon={<SlidersHorizontal size={16} />}
          title="Preferences"
          description="Personal settings that only affect your own account."
        >
          {loadingP && <Skeleton className="h-28 w-full" />}
          {p && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Your time zone"
                  htmlFor="pref-tz"
                  hint={`Preview: ${fmtDateTime(new Date().toISOString(), pf.timeZone || undefined)}`}
                  error={errs.timeZone}
                >
                  <SearchSelect
                    id="pref-tz"
                    label="Your time zone"
                    hideLabel
                    anyLabel={`Use my browser’s time zone (${browserZone})`}
                    searchPlaceholder="Search time zones"
                    emptyText="No time zones available."
                    options={timeZoneOptions}
                    value={pf.timeZone}
                    onChange={(timeZone) => {
                      setPf((f) => ({ ...f, timeZone }));
                      touch();
                    }}
                  />
                </Field>
                <Field
                  label="Start page"
                  htmlFor="pref-landing"
                  hint="Where Torio takes you when you open the app."
                >
                  <select
                    id="pref-landing"
                    value={pf.landingPage}
                    onChange={setP('landingPage')}
                    className={inputCls}
                  >
                    {LANDING_PAGES.map((l) => (
                      <option key={l} value={l}>
                        {LANDING_LABEL[l]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="mb-0 mt-4 text-xs text-faint">
                Theme, language and date formats aren&apos;t configurable yet, so they aren&apos;t
                listed. Notifications have their own page.
              </p>
            </>
          )}
        </Section>

        {formError && (
          <div className="mb-3">
            <Notice tone="error">{formError}</Notice>
          </div>
        )}
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-line-subtle bg-white/95 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[8px] sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <Button type="submit" disabled={!dirty || busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
          <Button type="button" variant="outline" disabled={!dirty || busy} onClick={discard}>
            Discard
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
