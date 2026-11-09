'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { adminRequest } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminShell } from './admin-shell';
import { fmtDateTime, Loading, Notice, PageHead, Panel, Pager } from './common';

type Config = ApiSchemas['MetaAdminConfigDto'];
type Values = Config['values'];
type Preview = ApiSchemas['MetaPreviewResultDto'];
type TestResult = ApiSchemas['MetaTestResultDto'];
type Diagnostics = ApiSchemas['MetaDiagnosticsDto'];
type Security = ApiSchemas['MetaSecurityStatusDto'];
type Activity = ApiSchemas['MetaActivityListDto'];

const BASE = '/integrations/meta';
const TABS = [
  ['overview', 'Overview'],
  ['app', 'App Configuration'],
  ['oauth', 'OAuth & Redirect URLs'],
  ['webhooks', 'Webhook Configuration'],
  ['security', 'Security & Encryption'],
  ['products', 'Permissions & Products'],
  ['diagnostics', 'Connection Diagnostics'],
  ['activity', 'Activity Logs'],
] as const;
type Tab = (typeof TABS)[number][0];

const STATUS: Record<Config['status'], { label: string; cls: string }> = {
  CONFIGURED: { label: 'Configured', cls: 'bg-success-soft text-success' },
  INCOMPLETE: { label: 'Incomplete', cls: 'bg-warning-soft text-warning' },
  INVALID: { label: 'Invalid', cls: 'bg-danger-soft text-danger' },
  NEEDS_ATTENTION: { label: 'Needs attention', cls: 'bg-warning-soft text-warning' },
};
const SOURCE: Record<string, string> = {
  database: 'Saved here',
  environment: 'From server environment',
  default: 'Default',
  unset: 'Not set',
};

const useCfg = () =>
  useQuery({
    queryKey: ['admin', 'meta', 'config'],
    queryFn: () => adminRequest<Config>(`${BASE}/config`),
  });

function Field({
  label,
  hint,
  error,
  source,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  source?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] font-medium">
      <span className="flex items-center justify-between gap-2">
        {label}
        {source && <span className="text-[11px] font-normal text-faint">{SOURCE[source]}</span>}
      </span>
      {children}
      {error ? (
        <span role="alert" className="text-xs font-normal text-danger">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs font-normal text-muted">{hint}</span>
      )}
    </label>
  );
}

function CopyRow({ label, value, note }: { label: string; value: string | null; note?: string }) {
  const { toast } = useAdminShell();
  return (
    <div className="flex flex-col gap-1 text-[12.5px]">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-wash px-2.5 py-2 text-[12px]">
          {value ?? 'Not configured'}
        </code>
        <Button
          size="sm"
          variant="outline"
          disabled={!value}
          aria-label={`Copy ${label}`}
          onClick={() =>
            void navigator.clipboard?.writeText(value!).then(
              () => toast('Copied'),
              () => toast('Couldn’t copy'),
            )
          }
        >
          <Copy size={13} aria-hidden />
          Copy
        </Button>
      </div>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

function ResultCard({ r }: { r: TestResult }) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-xl border p-3 text-[13px]',
        r.ok ? 'border-[#BFE5CB] bg-success-soft' : 'border-[#F4C7C7] bg-danger-soft',
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        {r.ok ? (
          <Check size={14} className="text-success" aria-hidden />
        ) : (
          <X size={14} className="text-danger" aria-hidden />
        )}
        {r.ok ? 'Passed' : 'Failed'}
        <span className="ml-auto text-xs font-normal text-muted">
          {r.httpStatus ? `HTTP ${r.httpStatus}` : ''}
          {r.metaCode ? ` · Meta code ${r.metaCode}` : ''} · {fmtDateTime(r.checkedAt)}
        </span>
      </div>
      <p className="m-0 mt-1">{r.message}</p>
      {r.resolution && <p className="m-0 mt-1 text-muted">→ {r.resolution}</p>}
      {r.details.length > 0 && (
        <dl className="m-0 mt-2 grid grid-cols-[170px_1fr] gap-x-3 gap-y-1 text-xs">
          {r.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted">{d.label}</dt>
              <dd className="m-0 break-all">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function TestButtons({
  which,
}: {
  which: ('credentials' | 'oauth' | 'webhook' | 'connectivity')[];
}) {
  const LABEL = {
    credentials: 'Test Meta App Credentials',
    oauth: 'Test OAuth Configuration',
    webhook: 'Test Webhook Verification',
    connectivity: 'Check Meta API Connectivity',
  } as const;
  const qc = useQueryClient();
  const [results, setResults] = useState<Partial<Record<string, TestResult>>>({});
  const run = useMutation({
    mutationFn: (k: string) => adminRequest<TestResult>(`${BASE}/test/${k}`, { method: 'POST' }),
    onSuccess: (r, k) => {
      setResults((p) => ({ ...p, [k]: r }));
      void qc.invalidateQueries({ queryKey: ['admin', 'meta', 'activity'] });
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {which.map((k) => (
          <Button
            key={k}
            variant="outline"
            size="sm"
            loading={run.isPending && run.variables === k}
            disabled={run.isPending}
            onClick={() => run.mutate(k)}
          >
            {LABEL[k]}
          </Button>
        ))}
      </div>
      {run.error && <Notice tone="bad">{run.error.message}</Notice>}
      {which.map((k) => results[k] && <ResultCard key={k} r={results[k]!} />)}
    </div>
  );
}

/** A secret is write-only: it's shown as masked, and replacing it types into a field that can be shown or hidden. */
function SecretField({
  label,
  state,
  path,
  clearable,
  generator,
  warning,
}: {
  label: string;
  state: { configured: boolean; source: string };
  path: 'app-secret' | 'webhook-verify-token';
  clearable?: boolean;
  generator?: boolean;
  warning: string;
}) {
  const qc = useQueryClient();
  const { toast } = useAdminShell();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [ask, setAsk] = useState<'replace' | 'clear' | 'generate' | null>(null);
  const [generated, setGenerated] = useState('');
  const [error, setError] = useState('');
  const done = () => {
    setEditing(false);
    setValue('');
    setAsk(null);
    setError('');
    void qc.invalidateQueries({ queryKey: ['admin', 'meta'] });
  };
  const fail = (e: Error) => {
    setError(e.message);
    setAsk(null);
  };
  const replace = useMutation({
    mutationFn: () =>
      adminRequest(`${BASE}/secrets/${path}`, { method: 'PUT', body: { value, confirm: true } }),
    onSuccess: () => {
      toast(`${label} replaced`);
      done();
    },
    onError: fail,
  });
  const clear = useMutation({
    mutationFn: () =>
      adminRequest(`${BASE}/secrets/${path}`, { method: 'DELETE', body: { confirm: true } }),
    onSuccess: () => {
      toast(`${label} cleared`);
      done();
    },
    onError: fail,
  });
  const gen = useMutation({
    mutationFn: () =>
      adminRequest<{ token: string }>(`${BASE}/secrets/webhook-verify-token/generate`, {
        method: 'POST',
        body: { confirm: true },
      }),
    onSuccess: (r) => {
      setGenerated(r.token);
      done();
    },
    onError: fail,
  });
  return (
    <div className="flex flex-col gap-2 text-[12.5px]">
      <div className="flex items-center justify-between gap-2 font-medium">
        {label}
        <span className="text-[11px] font-normal text-faint">{SOURCE[state.source]}</span>
      </div>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-[160px] flex-1 rounded-lg bg-wash px-2.5 py-2 tracking-[0.2em] text-muted">
            {state.configured ? '••••••••••••••••' : 'Not set'}
          </code>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {state.configured ? 'Replace' : 'Set'}
          </Button>
          {generator && (
            <Button size="sm" variant="outline" onClick={() => setAsk('generate')}>
              <RefreshCw size={13} aria-hidden />
              Generate new
            </Button>
          )}
          {clearable && state.configured && state.source === 'database' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => setAsk('clear')}
            >
              Clear
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            aria-label={`New ${label}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={cn(controlCls, 'min-w-[200px] flex-1 font-mono')}
          />
          <Button
            size="sm"
            variant="outline"
            aria-label={show ? 'Hide value' : 'Show value'}
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
          </Button>
          <Button
            size="sm"
            disabled={value.trim().length < 8}
            onClick={() => (state.configured ? setAsk('replace') : replace.mutate())}
            loading={replace.isPending}
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
      {generated && (
        <Notice tone="warn">
          New token (shown once, copy it now and enter it in Meta’s webhook settings):{' '}
          <code className="break-all font-semibold">{generated}</code>{' '}
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 font-semibold text-primary underline"
            onClick={() => {
              void navigator.clipboard?.writeText(generated);
              toast('Copied');
            }}
          >
            Copy
          </button>{' '}
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 underline"
            onClick={() => setGenerated('')}
          >
            Hide
          </button>
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {ask && (
        <ConfirmDialog
          title={
            ask === 'clear'
              ? `Clear ${label}?`
              : ask === 'generate'
                ? 'Generate a new verify token?'
                : `Replace ${label}?`
          }
          body={warning}
          confirmLabel={ask === 'clear' ? 'Clear it' : ask === 'generate' ? 'Generate' : 'Replace'}
          destructive={ask === 'clear'}
          busy={replace.isPending || clear.isPending || gen.isPending}
          onCancel={() => setAsk(null)}
          onConfirm={() =>
            ask === 'clear' ? clear.mutate() : ask === 'generate' ? gen.mutate() : replace.mutate()
          }
        />
      )}
    </div>
  );
}

function ListEditor({
  label,
  items,
  onChange,
  placeholder,
  primary,
  onPrimary,
  hint,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  primary?: string | null;
  onPrimary?: (v: string) => void;
  hint?: string;
}) {
  const [add, setAdd] = useState('');
  return (
    <div className="flex flex-col gap-2 text-[12.5px]">
      <span className="font-medium">{label}</span>
      {items.length === 0 && <span className="text-xs text-muted">None added.</span>}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              aria-label={`${label} ${i + 1}`}
              value={it}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className={cn(controlCls, 'min-w-0 flex-1')}
            />
            {onPrimary && (
              <Button
                size="sm"
                variant={primary === it ? 'primary' : 'outline'}
                onClick={() => onPrimary(it)}
                aria-pressed={primary === it}
              >
                {primary === it ? 'Primary' : 'Set primary'}
              </Button>
            )}
            <button
              type="button"
              aria-label={`Remove ${it || `entry ${i + 1}`}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted hover:bg-wash hover:text-danger"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          aria-label={`Add to ${label}`}
          value={add}
          placeholder={placeholder}
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && add.trim()) {
              e.preventDefault();
              onChange([...items, add.trim()]);
              setAdd('');
            }
          }}
          className={cn(controlCls, 'min-w-0 flex-1')}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!add.trim()}
          onClick={() => {
            onChange([...items, add.trim()]);
            setAdd('');
          }}
        >
          <Plus size={13} aria-hidden />
          Add
        </Button>
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

const Toggle = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex cursor-pointer items-start gap-3 text-[13px]">
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 h-4 w-4 accent-[#5B5CE2]"
    />
    <span>
      <span className="font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </span>
  </label>
);

const DOCS = [
  ['Create a Meta app', 'https://developers.facebook.com/docs/development/create-an-app'],
  [
    'Facebook Login for Business',
    'https://developers.facebook.com/docs/facebook-login/facebook-login-for-business',
  ],
  [
    'Messenger Platform webhooks',
    'https://developers.facebook.com/docs/messenger-platform/webhooks',
  ],
  [
    'Instagram messaging',
    'https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started',
  ],
  [
    'WhatsApp Embedded Signup',
    'https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview',
  ],
  [
    'App Review & access levels',
    'https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review',
  ],
  ['Graph API changelog', 'https://developers.facebook.com/docs/graph-api/changelog'],
];

export function MetaDeveloperPage() {
  const cfg = useCfg();
  const { toast } = useAdminShell();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [edits, setEdits] = useState<Partial<Values>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Preview | null>(null);
  const [leave, setLeave] = useState<Tab | null>(null);
  const [formError, setFormError] = useState('');

  const server = cfg.data?.values ?? null;
  // The form is the saved values plus the user's edits; nothing is copied into state, so a refetch can't clobber edits.
  const draft = useMemo<Values | null>(
    () => (server ? { ...server, ...edits } : null),
    [server, edits],
  );
  const patch = useMemo(() => {
    if (!server || !draft) return {};
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(draft) as (keyof Values)[]) {
      const a = draft[k];
      const b = server[k];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      out[k] = typeof a === 'string' && a.trim() === '' ? null : a;
    }
    return out;
  }, [server, draft]);
  const dirty = Object.keys(patch).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const preview = useMutation({
    mutationFn: () =>
      adminRequest<Preview>(`${BASE}/config/preview`, { method: 'POST', body: { patch } }),
    onSuccess: (p) => {
      const e: Record<string, string> = {};
      p.errors.forEach((x) => (e[x.field] = x.message));
      setErrors(e);
      setFormError('');
      if (p.errors.length) return;
      if (p.requiresConfirmation || p.impacts.length) setConfirm(p);
      else save.mutate(false);
    },
    onError: (e) => setFormError(e.message),
  });
  const save = useMutation({
    mutationFn: (confirmed: boolean) =>
      adminRequest<Config>(`${BASE}/config`, {
        method: 'PUT',
        body: { patch, confirm: confirmed },
      }),
    onSuccess: (c) => {
      qc.setQueryData(['admin', 'meta', 'config'], c);
      setEdits({});
      setConfirm(null);
      setErrors({});
      toast('Configuration saved');
      void qc.invalidateQueries({ queryKey: ['admin', 'meta'] });
    },
    onError: (e) => {
      setConfirm(null);
      setFormError(e.message);
    },
  });

  if (cfg.isPending || !draft) return <Loading />;
  if (cfg.isError) return <Notice tone="bad">{cfg.error.message}</Notice>;
  const c = cfg.data;
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setEdits((e) => ({ ...e, [k]: v }));
  const text = (k: keyof Values) => (draft[k] as string | null) ?? '';
  const go = (t: Tab) => (dirty ? setLeave(t) : setTab(t));
  const err = (k: string) =>
    errors[k] ??
    c.problems.find(
      (p) =>
        p.field === k &&
        p.severity === 'error' &&
        server &&
        JSON.stringify(server) === JSON.stringify(draft),
    )?.message;
  const st = STATUS[c.status];
  const configTab = tab === 'app' || tab === 'oauth' || tab === 'webhooks' || tab === 'products';

  return (
    <div className={cn(dirty && 'pb-20')}>
      <PageHead
        title="Meta Developer"
        description="Meta app credentials, redirect URLs, webhooks and diagnostics for every Torio channel."
        action={
          <span className={cn('rounded-md px-2 py-1 text-xs font-semibold', st.cls)}>
            {st.label}
          </span>
        }
      />
      <div
        role="tablist"
        aria-label="Meta Developer sections"
        className="mb-4 flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-wash-2 p-1"
      >
        {TABS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => go(k)}
            className={cn(
              'h-8 shrink-0 cursor-pointer rounded-lg border-none px-3 text-[13px]',
              tab === k
                ? 'bg-white font-semibold text-primary shadow-[0_1px_2px_rgba(23,24,28,0.08)]'
                : 'bg-transparent text-muted hover:text-ink',
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {tab === 'overview' && (
          <>
            {c.problems.length > 0 && (
              <Panel title="Needs your attention">
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                  {c.problems.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle
                        size={14}
                        className={cn(
                          'mt-0.5 shrink-0',
                          p.severity === 'error' ? 'text-danger' : 'text-warning',
                        )}
                        aria-hidden
                      />
                      {p.message}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            <Panel title="Summary">
              <dl className="m-0 grid grid-cols-[170px_1fr] gap-x-3 gap-y-2 text-[13px]">
                <dt className="text-muted">App name</dt>
                <dd className="m-0">{c.values.appName ?? '—'}</dd>
                <dt className="text-muted">App ID</dt>
                <dd className="m-0">{c.values.appId ?? '—'}</dd>
                <dt className="text-muted">API version</dt>
                <dd className="m-0">{c.values.apiVersion}</dd>
                <dt className="text-muted">App mode</dt>
                <dd className="m-0">{c.values.appMode ?? '—'}</dd>
                <dt className="text-muted">App Secret</dt>
                <dd className="m-0">
                  {c.secrets.appSecret.configured ? 'Configured (hidden)' : 'Not set'}
                </dd>
                <dt className="text-muted">Verify token</dt>
                <dd className="m-0">
                  {c.secrets.webhookVerifyToken.configured ? 'Configured (hidden)' : 'Not set'}
                </dd>
                <dt className="text-muted">Last updated</dt>
                <dd className="m-0">
                  {c.updatedAt
                    ? `${fmtDateTime(c.updatedAt)} by ${c.updatedBy}`
                    : 'Never saved here (using server environment)'}
                </dd>
              </dl>
            </Panel>
            <Panel title="Quick checks">
              <TestButtons which={['credentials', 'connectivity']} />
            </Panel>
            <Panel title="Deployment-level settings">
              <p className="m-0 mb-2 text-[12.5px] text-muted">
                These are needed before the database can be read, so they live in the server’s
                environment and need a redeploy to change.
              </p>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                {c.deploymentLevel.map((d) => (
                  <li key={d.name} className="flex items-start gap-2">
                    {d.configured ? (
                      <Check size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
                    ) : (
                      <Minus size={14} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                    )}
                    <span>
                      <code>{d.name}</code> <span className="text-muted">· {d.purpose}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Official Meta documentation">
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px]">
                {DOCS.map(([l, u]) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noopener noreferrer" className="text-primary">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}

        {tab === 'app' && (
          <>
            <Panel title="Meta app">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Meta App Name" source={c.sources.appName} error={err('appName')}>
                  <input
                    value={text('appName')}
                    onChange={(e) => set('appName', e.target.value)}
                    className={controlCls}
                  />
                </Field>
                <Field
                  label="Meta App ID"
                  hint="The numeric id from Meta → App settings → Basic."
                  source={c.sources.appId}
                  error={err('appId')}
                >
                  <input
                    inputMode="numeric"
                    value={text('appId')}
                    onChange={(e) => set('appId', e.target.value)}
                    className={controlCls}
                  />
                </Field>
                <Field
                  label="Graph API version"
                  hint="e.g. v27.0. Applies to every Meta call immediately."
                  source={c.sources.apiVersion}
                  error={err('apiVersion')}
                >
                  <input
                    value={text('apiVersion')}
                    onChange={(e) => set('apiVersion', e.target.value)}
                    className={controlCls}
                  />
                </Field>
                <Field
                  label="Business Portfolio ID"
                  source={c.sources.businessId}
                  error={err('businessId')}
                >
                  <input
                    inputMode="numeric"
                    value={text('businessId')}
                    onChange={(e) => set('businessId', e.target.value)}
                    className={controlCls}
                  />
                </Field>
                <Field
                  label="App mode"
                  hint="Mirror the mode shown in Meta’s dashboard."
                  source={c.sources.appMode}
                >
                  <select
                    value={(draft.appMode as string) ?? ''}
                    onChange={(e) => set('appMode', (e.target.value || null) as Values['appMode'])}
                    className={controlCls}
                  >
                    <option value="">Not set</option>
                    <option value="DEVELOPMENT">Development</option>
                    <option value="LIVE">Live</option>
                  </select>
                </Field>
                <Field label="App domain" source={c.sources.appDomain} error={err('appDomain')}>
                  <input
                    value={text('appDomain')}
                    placeholder="app.example.com"
                    onChange={(e) => set('appDomain', e.target.value)}
                    className={controlCls}
                  />
                </Field>
                <Field label="Website URL" source={c.sources.websiteUrl} error={err('websiteUrl')}>
                  <input
                    value={text('websiteUrl')}
                    placeholder="https://app.example.com"
                    onChange={(e) => set('websiteUrl', e.target.value)}
                    className={controlCls}
                  />
                </Field>
              </div>
            </Panel>
            <Panel title="App Secret">
              <SecretField
                label="Meta App Secret"
                state={c.secrets.appSecret}
                path="app-secret"
                clearable
                warning="Webhook signatures and login-code exchanges use this secret. Replacing it with a different app's secret stops inbound messages and may require reconnecting channels. The old value is not recoverable."
              />
              <p className="m-0 mt-2 text-xs text-muted">
                The secret is encrypted on the server and never shown again after saving.
              </p>
            </Panel>
            <Panel title="Test">
              <TestButtons which={['credentials', 'connectivity']} />
            </Panel>
          </>
        )}

        {tab === 'oauth' && (
          <>
            <Panel title="Redirect URLs">
              <div className="flex flex-col gap-4">
                <ListEditor
                  label="Allowed OAuth redirect URIs"
                  items={draft.allowedRedirectUris}
                  onChange={(v) => set('allowedRedirectUris', v)}
                  placeholder={
                    c.derived.redirectUriToRegister ??
                    'https://your-api-host/api/v1/channels/meta/callback'
                  }
                  primary={draft.oauthRedirectUri}
                  onPrimary={(v) => set('oauthRedirectUri', v)}
                  hint={`Every URI must end with ${c.derived.callbackPath}, the route the API serves for Meta’s callback.`}
                />
                <Field
                  label="OAuth redirect URI (primary)"
                  source={c.sources.oauthRedirectUri}
                  error={err('oauthRedirectUri')}
                  hint="Used for the Facebook login and the code exchange."
                >
                  <input
                    value={text('oauthRedirectUri')}
                    onChange={(e) => set('oauthRedirectUri', e.target.value)}
                    className={controlCls}
                  />
                </Field>
                <CopyRow
                  label="Register this exact URI in Meta → Facebook Login → Valid OAuth Redirect URIs"
                  value={draft.oauthRedirectUri || c.derived.redirectUriToRegister}
                  note="Torio can’t read this list from Meta, so confirm it there."
                />
                <CopyRow label="Callback route served by the API" value={c.derived.callbackPath} />
              </div>
            </Panel>
            <Panel title="Security & destinations">
              <div className="flex flex-col gap-4">
                <Field
                  label="Login link expires after (minutes)"
                  hint="1–60. Shorter is safer."
                  source={c.sources.oauthStateTtlMinutes}
                >
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={draft.oauthStateTtlMinutes}
                    onChange={(e) => set('oauthStateTtlMinutes', Number(e.target.value))}
                    className={cn(controlCls, 'max-w-[140px]')}
                  />
                </Field>
                <ListEditor
                  label="Trusted application domains"
                  items={draft.allowedDomains}
                  onChange={(v) => set('allowedDomains', v)}
                  placeholder="app.example.com"
                  hint="Users are only ever redirected after login to a host listed here (or the web app’s own host): no arbitrary redirect URLs."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Post-authentication success URL"
                    hint="Blank = the web app's Channels page."
                    source={c.sources.successUrl}
                    error={err('successUrl')}
                  >
                    <input
                      value={text('successUrl')}
                      onChange={(e) => set('successUrl', e.target.value)}
                      className={controlCls}
                    />
                  </Field>
                  <Field
                    label="Post-authentication failure URL"
                    hint="Blank = the web app's Channels page."
                    source={c.sources.failureUrl}
                    error={err('failureUrl')}
                  >
                    <input
                      value={text('failureUrl')}
                      onChange={(e) => set('failureUrl', e.target.value)}
                      className={controlCls}
                    />
                  </Field>
                </div>
              </div>
            </Panel>
            <Panel title="Test">
              <TestButtons which={['oauth']} />
            </Panel>
          </>
        )}

        {tab === 'webhooks' && (
          <>
            <Panel title="Callback">
              <div className="flex flex-col gap-4">
                <Toggle
                  label="Webhooks enabled"
                  hint="When off, Torio rejects Meta’s verification and stops receiving customer messages."
                  checked={draft.webhookEnabled}
                  onChange={(v) => set('webhookEnabled', v)}
                />
                <Field
                  label="Webhook base URL"
                  hint="Public address of the API, e.g. https://app.example.com. Blank = the web app’s address."
                  source={c.sources.webhookBaseUrl}
                  error={err('webhookBaseUrl')}
                >
                  <input
                    value={text('webhookBaseUrl')}
                    onChange={(e) => set('webhookBaseUrl', e.target.value)}
                    className={controlCls}
                  />
                </Field>
                <CopyRow
                  label="Messenger & Instagram callback URL"
                  value={c.derived.metaWebhookUrl}
                  note="Meta → Messenger / Instagram → Webhooks → Callback URL."
                />
                <CopyRow
                  label="WhatsApp callback URL"
                  value={c.derived.whatsappWebhookUrl}
                  note="Meta → WhatsApp → Configuration → Callback URL."
                />
                <SecretField
                  label="Webhook verify token"
                  state={c.secrets.webhookVerifyToken}
                  path="webhook-verify-token"
                  generator
                  clearable
                  warning="Enter the same token in Meta’s webhook settings, or Meta can’t re-verify your callback URL. Existing subscriptions keep delivering until Meta re-verifies."
                />
              </div>
            </Panel>
            <Panel title="Event subscriptions">
              <div className="flex flex-col gap-3">
                <Toggle
                  label="Messenger: messages, postbacks, delivery and read receipts"
                  checked={draft.messengerEnabled}
                  onChange={(v) => set('messengerEnabled', v)}
                />
                <Toggle
                  label="Instagram Messaging: messages, postbacks, seen"
                  checked={draft.instagramEnabled}
                  onChange={(v) => set('instagramEnabled', v)}
                />
                <Toggle
                  label="WhatsApp: messages and message status"
                  checked={draft.whatsappEnabled}
                  onChange={(v) => set('whatsappEnabled', v)}
                />
                <p className="m-0 text-xs text-muted">
                  A product that is switched off is hidden from the connect screen and its inbound
                  events are ignored. The fields themselves are subscribed per Page/WABA when a
                  channel is connected.
                </p>
              </div>
            </Panel>
            <Panel title="Test">
              <TestButtons which={['webhook']} />
            </Panel>
            <WebhookHealth />
          </>
        )}

        {tab === 'security' && <SecurityTab />}

        {tab === 'products' && (
          <>
            <ProductsTab />
            <Panel title="WhatsApp options">
              <div className="flex flex-col gap-4">
                <Field
                  label="Embedded Signup configuration ID"
                  hint="From Facebook Login for Business → Configurations (Embedded Signup variation). Blank = pasted-token connection only."
                  source={c.sources.whatsappConfigId}
                >
                  <input
                    value={text('whatsappConfigId')}
                    onChange={(e) => set('whatsappConfigId', e.target.value)}
                    className={controlCls}
                  />
                </Field>
                <Toggle
                  label="List existing WhatsApp numbers in the Facebook login"
                  hint="Adds business_management, whatsapp_business_management and whatsapp_business_messaging to the login. Only enable once Meta has approved them for production."
                  checked={draft.discoverWhatsapp}
                  onChange={(v) => set('discoverWhatsapp', v)}
                />
              </div>
            </Panel>
          </>
        )}

        {tab === 'diagnostics' && <DiagnosticsTab />}
        {tab === 'activity' && <ActivityTab />}
      </div>

      {dirty && configTab && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-[228px]"
        >
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3">
            <span className="flex-1 text-[13px]">
              <span
                aria-hidden
                className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#9AA0AB]"
              />
              Unsaved changes ({Object.keys(patch).length})
            </span>
            {formError && (
              <span role="alert" className="text-xs text-danger">
                {formError}
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setEdits({});
                setErrors({});
                setFormError('');
              }}
            >
              Discard
            </Button>
            <Button loading={preview.isPending || save.isPending} onClick={() => preview.mutate()}>
              Save changes
            </Button>
          </div>
        </div>
      )}
      {dirty && !configTab && (
        <p role="status" className="mt-3 text-xs text-muted">
          You have unsaved changes in the configuration tabs.
        </p>
      )}

      {confirm && (
        <ConfirmDialog
          title="Review these changes"
          body={`${confirm.changes.map((x) => `${x.field}: ${x.before} → ${x.after}`).join('\n')}\n\n${confirm.impacts.map((i) => `• ${i.message}`).join('\n') || 'No impact on connected channels.'}`}
          confirmLabel={confirm.requiresConfirmation ? 'Save anyway' : 'Save'}
          destructive={false}
          busy={save.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => save.mutate(true)}
        />
      )}
      {leave && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You have changes that haven't been saved. If you leave this section they stay in the form until you reload, but they are not applied."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onCancel={() => setLeave(null)}
          onConfirm={() => {
            setEdits({});
            setTab(leave);
            setLeave(null);
          }}
        />
      )}
    </div>
  );
}

function WebhookHealth() {
  const d = useQuery({
    queryKey: ['admin', 'meta', 'diagnostics'],
    queryFn: () => adminRequest<Diagnostics>(`${BASE}/diagnostics`),
  });
  if (d.isPending) return <Loading />;
  if (d.isError) return <Notice tone="bad">{d.error.message}</Notice>;
  const w = d.data.webhook;
  return (
    <Panel title="Webhook health">
      <dl className="m-0 grid grid-cols-[190px_1fr] gap-x-3 gap-y-2 text-[13px]">
        <dt className="text-muted">Last verified by Meta</dt>
        <dd className="m-0">{w.lastVerifiedAt ? fmtDateTime(w.lastVerifiedAt) : 'Not yet'}</dd>
        <dt className="text-muted">Last event received</dt>
        <dd className="m-0">{w.lastReceivedAt ? fmtDateTime(w.lastReceivedAt) : 'None yet'}</dd>
        <dt className="text-muted">Last 24 hours</dt>
        <dd className="m-0">
          {w.processed24h} processed · {w.failed24h} failed · {w.pending} waiting
        </dd>
      </dl>
      {w.recentErrors.length > 0 && (
        <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-xs text-danger">
          {w.recentErrors.map((e, i) => (
            <li key={i}>
              {fmtDateTime(e.at)} · {e.provider}: {e.error}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ProductsTab() {
  const d = useQuery({
    queryKey: ['admin', 'meta', 'diagnostics'],
    queryFn: () => adminRequest<Diagnostics>(`${BASE}/diagnostics`),
  });
  if (d.isPending) return <Loading />;
  if (d.isError) return <Notice tone="bad">{d.error.message}</Notice>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {d.data.products.map((p) => (
        <Panel key={p.key} title={p.label}>
          <dl className="m-0 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-muted">State</dt>
            <dd className="m-0">{p.enabled ? 'Enabled in Torio' : 'Disabled in Torio'}</dd>
            <dt className="text-muted">Channels</dt>
            <dd className="m-0">
              {p.connectedChannels} connected{p.attention ? ` · ${p.attention} need attention` : ''}
            </dd>
            <dt className="text-muted">App Review</dt>
            <dd className="m-0">
              Unknown: Meta doesn’t expose approval through its API; check it in the app dashboard.
            </dd>
          </dl>
          <div className="mt-2 text-xs text-muted">Permissions Torio requests:</div>
          <ul className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0">
            {p.requiredPermissions.map((x) => (
              <li key={x}>
                <code className="rounded bg-wash px-1.5 py-0.5 text-[11px]">{x}</code>
              </li>
            ))}
          </ul>
          {p.warnings.map((w) => (
            <p key={w} className="m-0 mt-2 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
              {w}
            </p>
          ))}
        </Panel>
      ))}
    </div>
  );
}

function DiagnosticsTab() {
  const d = useQuery({
    queryKey: ['admin', 'meta', 'diagnostics'],
    queryFn: () => adminRequest<Diagnostics>(`${BASE}/diagnostics`),
  });
  const icon = {
    ok: <Check size={14} className="text-success" aria-hidden />,
    warning: <AlertTriangle size={14} className="text-warning" aria-hidden />,
    fail: <X size={14} className="text-danger" aria-hidden />,
    unknown: <Minus size={14} className="text-faint" aria-hidden />,
  } as const;
  return (
    <>
      <Panel
        title="Checks"
        action={
          <Button
            size="sm"
            variant="outline"
            loading={d.isFetching}
            onClick={() => void d.refetch()}
          >
            <RefreshCw size={13} aria-hidden />
            Refresh diagnostics
          </Button>
        }
      >
        {d.isPending ? (
          <Loading />
        ) : d.isError ? (
          <Notice tone="bad">{d.error.message}</Notice>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line-subtle p-0">
            {d.data.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3 py-2.5 text-[13px]">
                <span className="mt-0.5">{icon[c.status]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.label}</span>
                  <span className="block text-xs text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Run live tests">
        <TestButtons which={['credentials', 'oauth', 'webhook', 'connectivity']} />
      </Panel>
      <WebhookHealth />
    </>
  );
}

function SecurityTab() {
  const q = useQuery({
    queryKey: ['admin', 'meta', 'security'],
    queryFn: () => adminRequest<Security>(`${BASE}/security`),
  });
  const qc = useQueryClient();
  const { toast } = useAdminShell();
  const [ask, setAsk] = useState(false);
  const run = useMutation({
    mutationFn: () =>
      adminRequest<ApiSchemas['MetaReencryptResultDto']>(`${BASE}/security/reencrypt`, {
        method: 'POST',
      }),
    onSuccess: (r) => {
      toast(
        `Re-encrypted ${r.reencrypted} secret(s)${r.failed ? `, ${r.failed} couldn’t be read` : ''}`,
      );
      setAsk(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'meta'] });
    },
    onError: () => setAsk(false),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Notice tone="bad">{q.error.message}</Notice>;
  const s = q.data;
  return (
    <>
      <Panel title="Encryption">
        <dl className="m-0 grid grid-cols-[210px_1fr] gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-muted">Algorithm</dt>
          <dd className="m-0">{s.algorithm}</dd>
          <dt className="text-muted">Master key</dt>
          <dd className="m-0">
            {s.masterKeyConfigured
              ? 'Configured (deployment secret, never shown)'
              : 'Not configured'}
          </dd>
          <dt className="text-muted">Previous key (rotation)</dt>
          <dd className="m-0">{s.previousKeyConfigured ? 'Present' : 'None'}</dd>
          <dt className="text-muted">Secrets sealed with</dt>
          <dd className="m-0">
            current key {s.secretsSealedWith.current} · previous key {s.secretsSealedWith.previous}{' '}
            · unreadable {s.secretsSealedWith.unreadable}
          </dd>
          <dt className="text-muted">Last completed rotation</dt>
          <dd className="m-0">
            {s.lastKeyRotationAt ? fmtDateTime(s.lastKeyRotationAt) : 'Never'}
          </dd>
        </dl>
        {s.secretsSealedWith.unreadable > 0 && (
          <div className="mt-3">
            <Notice tone="warn">
              {s.secretsSealedWith.unreadable} stored secret(s) can’t be read with either key. They
              are left untouched; the affected channels need to be reconnected.
            </Notice>
          </div>
        )}
      </Panel>
      <Panel title="Rotate the master key">
        <ol className="m-0 mb-3 list-decimal pl-5 text-[13px] text-muted">
          <li>
            In the server environment set the <b>new</b> key as <code>CHANNEL_ENCRYPTION_KEY</code>{' '}
            and keep the old one as <code>CHANNEL_ENCRYPTION_KEY_PREVIOUS</code>, then redeploy.
            Existing connections keep working: both keys can decrypt.
          </li>
          <li>
            Run <b>Re-encrypt</b> below. Every stored secret is re-sealed with the new key;
            unreadable ones are left alone.
          </li>
          <li>
            When no secret is sealed with the previous key, remove{' '}
            <code>CHANNEL_ENCRYPTION_KEY_PREVIOUS</code>. Keep an offline backup of the old key
            until then.
          </li>
        </ol>
        <Button
          disabled={!s.masterKeyConfigured || !s.previousKeyConfigured || !s.rotationPending}
          loading={run.isPending}
          onClick={() => setAsk(true)}
        >
          Re-encrypt stored secrets{s.rotationPending ? ` (${s.secretsSealedWith.previous})` : ''}
        </Button>
        {!s.rotationPending && (
          <p className="m-0 mt-2 text-xs text-muted">
            Nothing is sealed with a previous key, so there is nothing to re-encrypt.
          </p>
        )}
        {run.error && (
          <div className="mt-2">
            <Notice tone="bad">{run.error.message}</Notice>
          </div>
        )}
      </Panel>
      <Panel title="Notes">
        <ul className="m-0 list-disc pl-5 text-[13px] text-muted">
          {s.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Panel>
      {ask && (
        <ConfirmDialog
          title="Re-encrypt stored secrets?"
          body="Every channel token and Meta secret sealed with the previous key is re-sealed with the current key. Connected channels keep working. This can't be undone, so make sure the previous key is backed up."
          confirmLabel="Re-encrypt"
          destructive={false}
          busy={run.isPending}
          onCancel={() => setAsk(false)}
          onConfirm={() => run.mutate()}
        />
      )}
    </>
  );
}

function ActivityTab() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'meta', 'activity', page, action],
    queryFn: () =>
      adminRequest<Activity>(`${BASE}/activity`, {
        query: { page, pageSize: 15, action: action || undefined },
      }),
  });
  return (
    <Panel
      title="Configuration history"
      action={
        <select
          aria-label="Filter activity"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className={cn(controlCls, 'h-8')}
        >
          <option value="">All activity</option>
          <option value="meta.config">Configuration</option>
          <option value="meta.secret">Secrets</option>
          <option value="meta.test">Tests</option>
          <option value="meta.security">Security</option>
        </select>
      }
    >
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Notice tone="bad">{q.error.message}</Notice>
      ) : q.data.data.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">No activity yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line-subtle p-0">
          {q.data.data.map((r) => {
            const m = r.metadata as {
              status?: string;
              fields?: string[];
              secret?: string;
              category?: string;
            } | null;
            return (
              <li key={r.id} className="py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-xs">{r.action}</code>
                  <span
                    className={cn(
                      'rounded px-1.5 text-[11px] font-medium',
                      m?.status === 'failed'
                        ? 'bg-danger-soft text-danger'
                        : 'bg-success-soft text-success',
                    )}
                  >
                    {m?.status ?? 'recorded'}
                  </span>
                  <span className="ml-auto text-xs text-muted">{fmtDateTime(r.createdAt)}</span>
                </div>
                <div className="text-xs text-muted">
                  {r.adminEmail}
                  {r.ipAddress ? ` · ${r.ipAddress}` : ''}
                  {m?.fields?.length ? ` · changed: ${m.fields.join(', ')}` : ''}
                  {m?.secret ? ` · ${m.secret}` : ''}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager
        meta={
          q.data
            ? {
                page: q.data.meta.page,
                total: q.data.meta.total,
                totalPages: Math.max(1, Math.ceil(q.data.meta.total / q.data.meta.pageSize)),
              }
            : undefined
        }
        onPage={setPage}
      />
    </Panel>
  );
}
