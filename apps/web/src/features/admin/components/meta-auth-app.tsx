'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { adminRequest } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminShell } from './admin-shell';
import { fmtDateTime, Loading, Notice, PageHead, Panel } from './common';
import { AUTH_BASE, CopyRow, Field, ListEditor, SecretField } from './meta-developer';

type Config = ApiSchemas['MetaAuthConfigDto'];
type Values = Config['values'];
type TestResult = ApiSchemas['MetaAuthTestResultDto'];

export const AUTH_STATUS: Record<Config['status'], { label: string; cls: string }> = {
  CONFIGURED: { label: 'Configured', cls: 'bg-success-soft text-success' },
  INCOMPLETE: { label: 'Incomplete', cls: 'bg-warning-soft text-warning' },
  INVALID: { label: 'Error', cls: 'bg-danger-soft text-danger' },
};

export const useAuthCfg = () =>
  useQuery({
    queryKey: ['admin', 'meta', 'auth', 'config'],
    queryFn: () => adminRequest<Config>(`${AUTH_BASE}/config`),
  });

const hostOf = (u: string | null) => {
  try {
    return u ? new URL(u).hostname : '…';
  } catch {
    return '…';
  }
};

/**
 * Customer Authentication app ("Torio Auth"): the Meta app behind "Continue with Facebook" for customers. Saved,
 * tested and diagnosed on its own; nothing here touches the Business Messaging app (Messenger, Instagram, WhatsApp).
 */
export function CustomerAuthApp() {
  const cfg = useAuthCfg();
  const { toast } = useAdminShell();
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Partial<Values>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const server = cfg.data?.values ?? null;
  const draft = useMemo<Values | null>(
    () => (server ? { ...server, ...edits } : null),
    [server, edits],
  );
  const patch = useMemo(() => {
    if (!server || !draft) return {};
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(draft) as (keyof Values)[]) {
      if (JSON.stringify(draft[k]) === JSON.stringify(server[k])) continue;
      const v = draft[k];
      out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
    }
    return out;
  }, [server, draft]);
  const dirty = Object.keys(patch).length > 0;

  const save = useMutation({
    mutationFn: () =>
      adminRequest<Config>(`${AUTH_BASE}/config`, { method: 'PUT', body: { patch } }),
    onSuccess: (c) => {
      qc.setQueryData(['admin', 'meta', 'auth', 'config'], c);
      setEdits({});
      setError('');
      toast('Customer authentication app saved');
    },
    onError: (e) => setError(e.message),
  });
  const test = useMutation({
    mutationFn: () => adminRequest<TestResult>(`${AUTH_BASE}/test`, { method: 'POST', body: {} }),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['admin', 'meta', 'auth', 'config'] });
    },
    onError: (e) => setError(e.message),
  });

  if (cfg.isPending || !draft) return <Loading />;
  if (cfg.isError) return <Notice tone="bad">{cfg.error.message}</Notice>;
  const c = cfg.data;
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setEdits((e) => ({ ...e, [k]: v }));
  const text = (k: keyof Values) => (draft[k] as string | null) ?? '';
  const problems = c.problems.filter((p) => p.severity === 'error').map((p) => p.message);
  const st = AUTH_STATUS[c.status];
  const ok = c.status === 'CONFIGURED';

  return (
    <div className={cn(dirty && 'pb-20')}>
      <PageHead
        title="Customer Authentication app"
        description="Torio Auth: the Meta app behind “Continue with Facebook” on the customer sign-in and sign-up pages. Separate from the Business Messaging app."
        action={
          <span className={cn('rounded-md px-2 py-1 text-xs font-semibold', st.cls)}>
            {st.label}
          </span>
        }
      />
      {error && (
        <div className="mb-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Panel title="App">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="App Name" source={c.sources.appName}>
              <input
                value={text('appName')}
                placeholder="Torio Auth"
                onChange={(e) => set('appName', e.target.value)}
                className={controlCls}
              />
            </Field>
            <Field
              label="Meta App ID"
              source={c.sources.appId}
              hint={
                c.values.appId === c.derived.suggestedAppId
                  ? 'Torio Auth’s App ID.'
                  : `Torio Auth is normally ${c.derived.suggestedAppId}.`
              }
            >
              <input
                value={text('appId')}
                inputMode="numeric"
                onChange={(e) => set('appId', e.target.value)}
                className={controlCls}
              />
            </Field>
            <Field label="Graph API Version" source={c.sources.apiVersion}>
              <input
                value={text('apiVersion')}
                placeholder="v27.0"
                onChange={(e) => set('apiVersion', e.target.value)}
                className={controlCls}
              />
            </Field>
            <Field label="App Mode" source={c.sources.appMode}>
              <select
                value={draft.appMode ?? ''}
                onChange={(e) => set('appMode', (e.target.value || null) as Values['appMode'])}
                className={controlCls}
              >
                <option value="">Not set</option>
                <option value="DEVELOPMENT">Development</option>
                <option value="LIVE">Live</option>
              </select>
            </Field>
            <Field label="App Domain" source={c.sources.appDomain}>
              <input
                value={text('appDomain')}
                placeholder="torio.example.com"
                onChange={(e) => set('appDomain', e.target.value)}
                className={controlCls}
              />
            </Field>
            <Field label="Website URL" source={c.sources.websiteUrl}>
              <input
                value={text('websiteUrl')}
                placeholder="https://torio.example.com"
                onChange={(e) => set('websiteUrl', e.target.value)}
                className={controlCls}
              />
            </Field>
          </div>
        </Panel>
        <Panel title="App Secret">
          <SecretField
            base={AUTH_BASE}
            label="Torio Auth App Secret"
            state={c.secrets.appSecret}
            path="app-secret"
            clearable
            warning="Customer Facebook sign-in uses this secret. It must be the secret of the Torio Auth app, not Torio Platform’s. The old value is not recoverable."
          />
          <p className="m-0 mt-2 text-xs text-muted">
            {c.credentialsFrom === 'database'
              ? 'Customer sign-in is running on the App ID and secret saved here.'
              : c.credentialsFrom === 'environment'
                ? 'Customer sign-in is still running on the server environment’s App ID and secret (the previous setup). Save the Torio Auth secret here to switch; clearing it later falls back to the environment.'
                : 'No App Secret yet: Continue with Facebook is hidden from customers until one is saved.'}{' '}
            It is encrypted on the server and never shown again.
          </p>
        </Panel>
        <Panel title="Callback URLs">
          <div className="flex flex-col gap-4">
            <CopyRow
              label="Customer Facebook Login callback URL (register this in Meta)"
              value={c.derived.registerInMeta}
              note={`Route served by the API: ${c.derived.callbackPath}`}
            />
            <Field
              label="Callback URL override"
              source={c.sources.customerAuthRedirectUri}
              hint="Leave blank to use the API address (API_URL) plus the route above. Must be exactly that route on an https, trusted host."
            >
              <input
                value={text('customerAuthRedirectUri')}
                onChange={(e) => set('customerAuthRedirectUri', e.target.value)}
                className={controlCls}
              />
            </Field>
            <ListEditor
              label="Allowed OAuth redirect URIs"
              items={draft.customerAuthAllowedRedirectUris}
              onChange={(v) => set('customerAuthAllowedRedirectUris', v)}
              placeholder={c.derived.registerInMeta ?? `https://your-host${c.derived.callbackPath}`}
              hint={`Exact HTTPS URLs only, each ending ${c.derived.callbackPath}. Anything else is rejected.`}
            />
          </div>
        </Panel>
        <Panel title="Check">
          <div className="flex flex-col gap-3 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-semibold',
                  ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
                )}
              >
                {ok ? 'Server configuration OK' : 'Needs fixing'}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => test.mutate()}
                loading={test.isPending}
                disabled={dirty}
              >
                Test credentials with Meta
              </Button>
              {dirty && <span className="text-xs text-muted">Save first, then test.</span>}
            </div>
            {problems.length > 0 && (
              <ul
                role="alert"
                className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs text-danger"
              >
                {problems.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
            {result && (
              <div
                role="status"
                className={cn(
                  'rounded-lg p-3 text-xs',
                  result.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-[#8F2424]',
                )}
              >
                <b>{result.message}</b>
                {result.resolution && <div className="mt-1">{result.resolution}</div>}
                {result.details.map((d) => (
                  <div key={d.label}>
                    {d.label}: {d.value}
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-1 sm:grid-cols-[210px_1fr]">
              <span className="text-muted">App ID configured</span>
              <span>{c.values.appId ? 'Yes' : 'No'}</span>
              <span className="text-muted">App Secret configured</span>
              <span>{c.secrets.appSecret.configured ? 'Yes' : 'No'}</span>
              <span className="text-muted">Callback matches the route</span>
              <span className={c.derived.matchesRoute ? 'text-success' : 'text-danger'}>
                {c.derived.matchesRoute ? 'Yes' : 'No'}
              </span>
              <span className="text-muted">Permissions requested</span>
              <span>
                {c.derived.scopes.map((s) => (
                  <code key={s} className="mr-1.5">
                    {s}
                  </code>
                ))}
              </span>
              <span className="text-muted">Last successful Facebook login</span>
              <span>{c.lastLoginAt ? fmtDateTime(c.lastLoginAt) : 'None yet'}</span>
              <span className="text-muted">Last credentials test</span>
              <span>
                {c.lastTestAt
                  ? `${fmtDateTime(c.lastTestAt)} (${c.lastTestOk ? 'passed' : 'failed'})`
                  : 'Never run'}
              </span>
            </div>
            <div>
              <b>Set these in the Meta Developer Dashboard</b> (app{' '}
              <code>{c.values.appId ?? '…'}</code>). Torio can’t read them from Meta, so confirm
              them there. Saving a URL here does not register it with Meta.
              <ol className="m-0 mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-muted">
                <li>
                  Add the <b>Facebook Login</b> product; under Facebook Login → Settings turn on{' '}
                  <b>Client OAuth Login</b> and <b>Web OAuth Login</b>.
                </li>
                <li>
                  Under <b>Use cases</b> →{' '}
                  <i>Authenticate and request data from users with Facebook Login</i> → Customize,
                  add <b>email</b> and <b>public_profile</b>. (“Invalid Scopes: email” means this is
                  missing.)
                </li>
                <li>
                  Add exactly{' '}
                  <code className="break-all">
                    {c.derived.registerInMeta ?? '(fix the problems above first)'}
                  </code>{' '}
                  to <b>Valid OAuth Redirect URIs</b>.
                </li>
                <li>
                  In App settings → Basic add <code>{hostOf(c.derived.registerInMeta)}</code> to{' '}
                  <b>App Domains</b>; keep <b>Enforce HTTPS</b> on.
                </li>
                <li>
                  Use a <b>Live</b> app, or add testers; in Development mode other people are
                  blocked. Standard access to <code>public_profile</code> and <code>email</code>{' '}
                  needs no App Review.
                </li>
              </ol>
            </div>
          </div>
        </Panel>
      </div>
      {dirty && (
        <section
          aria-label="Unsaved changes"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 px-4 py-3 backdrop-blur"
        >
          <div className="mx-auto flex max-w-[1180px] items-center gap-2">
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Save Customer Authentication app
            </Button>
            <Button variant="outline" onClick={() => setEdits({})}>
              Discard
            </Button>
            <span className="text-xs text-muted">
              Unsaved changes. This does not affect the Business Messaging app.
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
