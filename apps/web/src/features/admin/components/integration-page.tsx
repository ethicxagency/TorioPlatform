'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { CircleCheck, CircleX, Copy, Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldSelect } from '@/components/ui/field-select';
import { controlCls } from '@/components/ui/input';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { adminRequest } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminShell } from './admin-shell';
import { fmtDateTime, Loading, Notice, PageHead, Panel } from './common';
import { RecentEmails, TemplatePreview } from './email-panels';
import { MetaEventsPanel } from './meta-events-panel';

type View = ApiSchemas['IntegrationViewDto'];
type Result = ApiSchemas['IntegrationTestResultDto'];
type Val = string | boolean | null;
const BASE = '/integrations/platform';
const keyOf = (k: string) => ['admin', 'integrations', k] as const;

const STATUS: Record<View['status'], { label: string; cls: string; hint: string }> = {
  NOT_CONFIGURED: {
    label: 'Not configured',
    cls: 'bg-wash-2 text-muted',
    hint: 'Required settings are missing.',
  },
  UNVERIFIED: {
    label: 'Not verified',
    cls: 'bg-warning-soft text-warning',
    hint: 'Saved, but not tested with the provider (or changed since the last test).',
  },
  VERIFIED: {
    label: 'Verified',
    cls: 'bg-success-soft text-success',
    hint: 'The provider accepted exactly this configuration.',
  },
  FAILED: {
    label: 'Test failed',
    cls: 'bg-danger-soft text-danger',
    hint: 'The provider rejected the last test.',
  },
};

function SecretRow({ k, s, ready }: { k: string; s: View['secrets'][number]; ready: boolean }) {
  const qc = useQueryClient();
  const { toast } = useAdminShell();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState('');
  const done = (v: View, msg: string) => {
    qc.setQueryData(keyOf(k), v);
    void qc.invalidateQueries({ queryKey: ['admin', 'integrations'] });
    setEditing(false);
    setValue('');
    setError('');
    toast(msg);
  };
  const save = useMutation({
    mutationFn: () =>
      adminRequest<View>(`${BASE}/${k}/secrets/${s.key}`, { method: 'PUT', body: { value } }),
    onSuccess: (v) => done(v, `${s.label} saved`),
    onError: (e) => setError(e.message),
  });
  const clear = useMutation({
    mutationFn: () => adminRequest<View>(`${BASE}/${k}/secrets/${s.key}`, { method: 'DELETE' }),
    onSuccess: (v) => {
      setAsk(false);
      done(v, `${s.label} removed`);
    },
    onError: (e) => {
      setAsk(false);
      setError(e.message);
    },
  });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium">
          {s.label}{' '}
          {s.required && (
            <span aria-hidden className="text-danger">
              *
            </span>
          )}
        </span>
        {!editing && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
              <KeyRound size={13} aria-hidden />
              {s.set ? 'Saved (hidden)' : 'Not set'}
            </span>
            <Button size="sm" variant="outline" disabled={!ready} onClick={() => setEditing(true)}>
              {s.set ? 'Replace' : 'Add'}
            </Button>
            {s.set && (
              <Button size="sm" variant="ghost" onClick={() => setAsk(true)}>
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
      {s.hint && <p className="m-0 text-xs text-muted">{s.hint}</p>}
      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              aria-label={`New ${s.label}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={`${controlCls} pr-9`}
            />
            <button
              type="button"
              aria-label={show ? 'Hide value' : 'Show value'}
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent p-0 text-faint"
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <Button
            size="sm"
            loading={save.isPending}
            disabled={value.trim().length < 6}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setValue('');
              setError('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      {!ready && (
        <p className="m-0 text-xs text-danger">
          Secrets can’t be stored until CHANNEL_ENCRYPTION_KEY is set on the server.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-danger">
          {error}
        </p>
      )}
      {ask && (
        <ConfirmDialog
          title={`Remove ${s.label}?`}
          body="The saved value is deleted. The integration stops working until a new one is added."
          confirmLabel="Remove"
          busy={clear.isPending}
          onCancel={() => setAsk(false)}
          onConfirm={() => clear.mutate()}
        />
      )}
    </div>
  );
}

/**
 * One Super Admin page for a platform integration: what it does and needs, its settings, write-only secrets, a real
 * connection test, and the switch. "Verified" is shown only after the provider accepted exactly what is saved.
 */
export function IntegrationPage({ k }: { k: 'mailgun' | 'torio_meta_pixel' | 'sslcommerz' }) {
  const qc = useQueryClient();
  const { toast } = useAdminShell();
  const q = useQuery({ queryKey: keyOf(k), queryFn: () => adminRequest<View>(`${BASE}/${k}`) });
  const [edits, setEdits] = useState<Record<string, Val>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [mailTo, setMailTo] = useState('');
  const [liveAsk, setLiveAsk] = useState(false);
  const v = q.data;

  const apply = (n: View) => {
    qc.setQueryData(keyOf(k), n);
    void qc.invalidateQueries({ queryKey: ['admin', 'integrations'] });
  };
  const patch = v
    ? Object.fromEntries(
        Object.entries(edits).filter(([f, x]) => JSON.stringify(x) !== JSON.stringify(v.values[f])),
      )
    : {};
  const dirty = Object.keys(patch).length > 0;
  const goingLive = k === 'sslcommerz' && patch.environment === 'live';

  const save = useMutation({
    mutationFn: (confirmLive?: boolean) =>
      adminRequest<View>(`${BASE}/${k}/config`, {
        method: 'PUT',
        body: { values: patch, ...(confirmLive ? { confirmLive: true } : {}) },
      }),
    onSuccess: (n) => {
      apply(n);
      setEdits({});
      setError('');
      setResult(null);
      setLiveAsk(false);
      toast(`${n.name} saved`);
    },
    onError: (e) => {
      setLiveAsk(false);
      setError(e.message);
    },
  });
  const test = useMutation({
    mutationFn: () => adminRequest<Result>(`${BASE}/${k}/test`, { method: 'POST', body: {} }),
    onSuccess: (r) => {
      setResult(r);
      setError('');
      void qc.invalidateQueries({ queryKey: ['admin', 'integrations'] });
      void qc.invalidateQueries({ queryKey: keyOf(k) });
    },
    onError: (e) => setError(e.message),
  });
  const enable = useMutation({
    mutationFn: (enabled: boolean) =>
      adminRequest<View>(`${BASE}/${k}/enabled`, { method: 'PUT', body: { enabled } }),
    onSuccess: (n) => {
      apply(n);
      toast(n.enabled ? `${n.name} enabled` : `${n.name} disabled`);
    },
    onError: (e) => setError(e.message),
  });
  const extra = useMutation({
    mutationFn: () =>
      k === 'mailgun'
        ? adminRequest<Result>(`${BASE}/mailgun/test-email`, {
            method: 'POST',
            body: { to: mailTo },
          })
        : adminRequest<Result>(`${BASE}/torio_meta_pixel/test-event`, { method: 'POST', body: {} }),
    onSuccess: (r) => {
      setResult(r);
      setError('');
      void qc.invalidateQueries({ queryKey: keyOf(k) });
    },
    onError: (e) => setError(e.message),
  });

  if (q.isPending) return <Loading />;
  if (q.isError || !v)
    return <Notice tone="bad">{q.error?.message ?? 'Could not load this integration.'}</Notice>;
  const st = STATUS[v.status];
  const val = (f: string) => (f in edits ? edits[f] : v.values[f]);

  return (
    <div className={cn('flex flex-col gap-4', dirty && 'pb-20')}>
      <PageHead
        title={v.name}
        description={v.description}
        action={
          <span
            className={cn('rounded-md px-2 py-1 text-xs font-semibold', st.cls)}
            title={st.hint}
          >
            {st.label}
            {v.enabled ? ' · On' : ''}
          </span>
        }
      />
      {!v.encryptionReady && (
        <Notice tone="warn">
          CHANNEL_ENCRYPTION_KEY is not set on the server, so credentials cannot be stored yet.
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}

      <Panel title="What you need">
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-muted">
          {v.requirements.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
              {r}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Settings">
        <div className="grid gap-4 sm:grid-cols-2">
          {v.fields.map((f) =>
            f.kind === 'boolean' ? (
              <label key={f.key} className="flex items-start gap-2.5 text-[13px] sm:col-span-2">
                <input
                  type="checkbox"
                  checked={val(f.key) === true}
                  onChange={(e) => setEdits((s) => ({ ...s, [f.key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-[#5B5CE2]"
                />
                <span>
                  <span className="font-medium">{f.label}</span>
                  {f.hint && <span className="block text-xs text-muted">{f.hint}</span>}
                </span>
              </label>
            ) : (
              <label key={f.key} className="flex flex-col gap-1 text-[13px] font-medium">
                <span>
                  {f.label}{' '}
                  {f.required && (
                    <span aria-hidden className="text-danger">
                      *
                    </span>
                  )}
                </span>
                {f.kind === 'select' ? (
                  <FieldSelect
                    value={String(val(f.key) ?? '')}
                    onChange={(e) => setEdits((s) => ({ ...s, [f.key]: e.target.value }))}
                    className="h-9 w-full"
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </FieldSelect>
                ) : (
                  <input
                    value={String(val(f.key) ?? '')}
                    placeholder={f.placeholder ?? undefined}
                    autoComplete="off"
                    onChange={(e) => setEdits((s) => ({ ...s, [f.key]: e.target.value }))}
                    className={controlCls}
                  />
                )}
                {f.hint && <span className="text-xs font-normal text-muted">{f.hint}</span>}
              </label>
            ),
          )}
        </div>
        {goingLive && (
          <div className="mt-3">
            <Notice tone="warn">
              <ShieldAlert size={14} className="mr-1 inline" aria-hidden />
              Live mode processes real payments. You will be asked to confirm when you save.
            </Notice>
          </div>
        )}
      </Panel>

      <Panel title="Credentials">
        <div className="flex flex-col gap-4">
          {v.secrets.map((s) => (
            <SecretRow key={s.key} k={k} s={s} ready={v.encryptionReady} />
          ))}
          <p className="m-0 text-xs text-faint">
            Credentials are encrypted, can’t be read back, and are never shown again after saving.
          </p>
        </div>
      </Panel>

      {v.readOnly.length > 0 && (
        <Panel title="Addresses to give the provider">
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {v.readOnly.map((r) => (
              <li key={r.label} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="w-28 shrink-0 font-medium">{r.label}</span>
                <code className="min-w-0 flex-1 truncate rounded bg-wash px-2 py-1 text-xs">
                  {r.value}
                </code>
                <button
                  type="button"
                  aria-label={`Copy ${r.label}`}
                  onClick={() =>
                    void navigator.clipboard?.writeText(r.value).then(() => toast('Copied'))
                  }
                  className="cursor-pointer border-none bg-transparent p-0 text-faint hover:text-ink"
                >
                  <Copy size={14} />
                </button>
                {r.hint && <span className="basis-full text-xs text-muted">{r.hint}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Connection">
        <div className="flex flex-col gap-3">
          <dl className="m-0 grid gap-2 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-xs text-faint">Status</dt>
              <dd className="m-0 font-medium">{st.label}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Last tested</dt>
              <dd className="m-0 font-medium">
                {v.lastTestedAt ? fmtDateTime(v.lastTestedAt) : 'Never'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Last successful test</dt>
              <dd className="m-0 font-medium">
                {v.lastSuccessAt ? fmtDateTime(v.lastSuccessAt) : 'Never'}
              </dd>
            </div>
          </dl>
          {v.problems.length > 0 && (
            <p className="m-0 text-xs text-muted">Still needed: {v.problems.join(', ')}.</p>
          )}
          {v.lastError && <Notice tone="bad">{v.lastError}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              loading={test.isPending}
              disabled={!v.canTest || dirty}
              title={dirty ? 'Save your changes first' : undefined}
              onClick={() => test.mutate()}
            >
              Test connection
            </Button>
            <Button
              variant={v.enabled ? 'outline' : 'primary'}
              loading={enable.isPending}
              disabled={!v.enabled && !v.canEnable}
              title={
                !v.enabled && !v.canEnable ? 'Test the connection successfully first' : undefined
              }
              onClick={() => enable.mutate(!v.enabled)}
            >
              {v.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
          {result && (
            <div
              role="status"
              className={cn(
                'rounded-xl border px-3.5 py-3 text-[13px]',
                result.ok ? 'border-success/30 bg-success-soft' : 'border-danger/30 bg-danger-soft',
              )}
            >
              <p className="m-0 font-medium">{result.message}</p>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                {result.checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-2 text-xs">
                    {c.ok ? (
                      <CircleCheck
                        size={14}
                        aria-label="Passed"
                        className="mt-px shrink-0 text-success"
                      />
                    ) : (
                      <CircleX
                        size={14}
                        aria-label="Failed"
                        className="mt-px shrink-0 text-danger"
                      />
                    )}
                    <span>
                      {c.label}
                      {c.detail && <span className="text-muted"> — {c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      {(k === 'mailgun' || k === 'torio_meta_pixel') && (
        <Panel title={k === 'mailgun' ? 'Send a test email' : 'Send a test event'}>
          <div className="flex flex-col gap-2">
            <p className="m-0 text-xs text-muted">
              {k === 'mailgun'
                ? 'Mailgun accepting a message is not delivery. Delivery is confirmed only by Mailgun’s events.'
                : 'Sent with your test event code, so it shows in Events Manager → Test events and stays out of real data.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {k === 'mailgun' && (
                <input
                  type="email"
                  aria-label="Send the test email to"
                  placeholder="you@example.com"
                  value={mailTo}
                  onChange={(e) => setMailTo(e.target.value)}
                  className={`${controlCls} max-w-[320px]`}
                />
              )}
              <Button
                variant="outline"
                loading={extra.isPending}
                disabled={v.status !== 'VERIFIED' || (k === 'mailgun' && !mailTo.includes('@'))}
                title={v.status !== 'VERIFIED' ? 'Verify the connection first' : undefined}
                onClick={() => extra.mutate()}
              >
                {k === 'mailgun' ? 'Send test email' : 'Send test event'}
              </Button>
            </div>
            {Object.keys(v.extra).length > 0 && (
              <p className="m-0 text-xs text-faint">
                {k === 'mailgun' && v.extra.lastTestEmailAt
                  ? `Last test email ${v.extra.lastTestEmailAccepted ? 'accepted' : 'refused'} ${fmtDateTime(String(v.extra.lastTestEmailAt))}.`
                  : v.extra.lastTestEventAt
                    ? `Last test event ${v.extra.lastTestEventOk ? 'received' : 'not received'} ${fmtDateTime(String(v.extra.lastTestEventAt))}.`
                    : ''}
              </p>
            )}
          </div>
        </Panel>
      )}

      {k === 'torio_meta_pixel' && v.status !== 'NOT_CONFIGURED' && <MetaEventsPanel />}
      {k === 'mailgun' && v.status !== 'NOT_CONFIGURED' && (
        <>
          <RecentEmails />
          <TemplatePreview />
        </>
      )}

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
          <span className="mr-auto text-[13px] text-muted">Unsaved changes</span>
          <Button variant="ghost" onClick={() => setEdits({})}>
            Discard
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => (goingLive ? setLiveAsk(true) : save.mutate(false))}
          >
            Save changes
          </Button>
        </div>
      )}
      {liveAsk && (
        <ConfirmDialog
          title="Switch SSLCommerz to Live?"
          body="Live mode charges real money. Torio keeps the gateway off and unverified until you test the live credentials. Sandbox results do not carry over."
          confirmLabel="Switch to Live"
          busy={save.isPending}
          onCancel={() => setLiveAsk(false)}
          onConfirm={() => save.mutate(true)}
        />
      )}
    </div>
  );
}
