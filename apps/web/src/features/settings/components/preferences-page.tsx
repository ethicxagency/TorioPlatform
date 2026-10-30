'use client';

import { LANDING_PAGES } from '@torio/contracts';
import { useMemo, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtDateTime } from '@/lib/datetime';
import { useProfile, useUpdateProfile } from '../queries';
import { Field, fieldErrors, inputCls, Notice, PageHeader, SaveBar, Section } from './bits';
import { useDirty } from './guard';

const LANDING_LABEL: Record<(typeof LANDING_PAGES)[number], string> = {
  dashboard: 'Dashboard',
  inbox: 'Inbox',
  leads: 'Leads',
  customers: 'Customers',
  orders: 'Orders',
};

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
      'timeZone',
    );
  } catch {
    return ['UTC'];
  }
}

export function PreferencesPage() {
  const { toast } = useShell();
  const q = useProfile();
  const save = useUpdateProfile();
  const p = q.data;
  const [tz, setTz] = useState('');
  const [landing, setLanding] = useState<(typeof LANDING_PAGES)[number]>('dashboard');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);
  const sig = p ? `${p.timeZone}|${p.landingPage}` : null;
  if (p && sig !== seeded) {
    setSeeded(sig);
    setTz(p.timeZone ?? '');
    setLanding(p.landingPage);
  }
  const list = useMemo(() => zones(), []);
  const dirty = !!p && (tz !== (p.timeZone ?? '') || landing !== p.landingPage);
  useDirty(dirty);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div>
      <PageHeader
        title="Preferences"
        description="Personal settings that only affect your own account."
      />
      {q.isPending && <Skeleton className="h-56 w-full" />}
      {q.isError && <Notice tone="error">Couldn&apos;t load your preferences.</Notice>}
      {p && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (save.isPending) return;
            save.mutate(
              { timeZone: tz, landingPage: landing },
              {
                onSuccess: () => {
                  setErr('');
                  setSaved(true);
                  toast('Preferences saved');
                },
                onError: (e) => setErr(Object.values(fieldErrors(e))[0] ?? e.message),
              },
            );
          }}
        >
          <Section title="Time zone" description="Used to show dates and times, such as on orders.">
            <Field
              label="Time zone"
              htmlFor="pref-tz"
              hint={`Preview: ${fmtDateTime(new Date().toISOString(), tz || undefined)}`}
            >
              <select
                id="pref-tz"
                value={tz}
                onChange={(e) => {
                  setTz(e.target.value);
                  setSaved(false);
                }}
                className={inputCls}
              >
                <option value="">Use my browser’s time zone ({browserZone})</option>
                {list.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
          </Section>
          <Section
            title="After I sign in"
            description="Where Torio takes you when you open the app."
          >
            <Field label="Start page" htmlFor="pref-landing">
              <select
                id="pref-landing"
                value={landing}
                onChange={(e) => {
                  setLanding(e.target.value as typeof landing);
                  setSaved(false);
                }}
                className={inputCls}
              >
                {LANDING_PAGES.map((l) => (
                  <option key={l} value={l}>
                    {LANDING_LABEL[l]}
                  </option>
                ))}
              </select>
            </Field>
          </Section>
          <p className="mb-4 mt-0 text-xs text-faint">
            Theme, language and density aren&apos;t configurable yet, so they aren&apos;t listed.
          </p>
          {err && (
            <div className="mb-3">
              <Notice tone="error">{err}</Notice>
            </div>
          )}
          <SaveBar
            dirty={dirty}
            busy={save.isPending}
            saved={saved}
            onCancel={() => {
              setTz(p.timeZone ?? '');
              setLanding(p.landingPage);
            }}
          />
        </form>
      )}
    </div>
  );
}
