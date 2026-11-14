'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { CircleCheck, CircleX, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { ApiRequestError } from '@/features/leads/queries';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/datetime';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { useTimeZone } from '../queries';
import { Notice, PageHeader, Section } from './bits';

type Pixel = ApiSchemas['WorkspacePixelDto'];
type Result = ApiSchemas['WorkspacePixelTestResultDto'];
type Events = ApiSchemas['WorkspacePixelEventListDto'];
const P = '/api/v1/workspaces/{workspaceId}/integrations/meta-pixel';
const err = (e: unknown, m: string, s?: number) =>
  new ApiRequestError((e as { error?: { message?: string } })?.error?.message ?? m, [], s);

const STATUS: Record<Pixel['status'], { label: string; cls: string }> = {
  NOT_CONFIGURED: { label: 'Not connected', cls: 'bg-wash-2 text-muted' },
  UNVERIFIED: { label: 'Not verified', cls: 'bg-warning-soft text-warning' },
  VERIFIED: { label: 'Verified', cls: 'bg-success-soft text-success' },
  FAILED: { label: 'Test failed', cls: 'bg-danger-soft text-danger' },
};
const EVENT: Record<string, { label: string; cls: string }> = {
  SENT: { label: 'Sent', cls: 'bg-success-soft text-success' },
  PENDING: { label: 'Sending', cls: 'bg-wash-2 text-muted' },
  FAILED: { label: 'Retrying', cls: 'bg-warning-soft text-warning' },
  DEAD: { label: 'Failed', cls: 'bg-danger-soft text-danger' },
};

function usePixel(ws: string | null) {
  return useQuery({
    queryKey: ['integrations', ws, 'meta-pixel'] as const,
    enabled: !!ws,
    queryFn: async () => {
      const { data, error, response } = await api.GET(P, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw err(error, 'Could not load the integration', response.status);
      return data;
    },
  });
}
function useEvents(ws: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['integrations', ws, 'meta-pixel', 'events'] as const,
    enabled: !!ws && enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET(`${P}/events`, {
        params: { path: { workspaceId: ws! }, query: { page: 1, pageSize: 10 } },
      });
      if (!data) throw err(error, 'Could not load events', response.status);
      return data as Events;
    },
  });
}

/** Settings → Integrations → Meta Pixel: this workspace's own Pixel and Conversions API. Torio's own marketing Pixel is separate. */
export function IntegrationsPage() {
  const { workspaceId: ws, can, isLoading } = useWorkspace();
  const tz = useTimeZone();
  const qc = useQueryClient();
  const allowed = can('workspace:update');
  const q = usePixel(allowed ? ws : null);
  const v = q.data;
  const events = useEvents(ws, allowed && !!v && v.status !== 'NOT_CONFIGURED');
  const [pixelId, setPixelId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [capi, setCapi] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [editToken, setEditToken] = useState(false);
  const [show, setShow] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['integrations', ws, 'meta-pixel'] });
  const ok = (m: string) => (d: Pixel) => {
    qc.setQueryData(['integrations', ws, 'meta-pixel'], d);
    void qc.invalidateQueries({ queryKey: ['integrations', ws, 'meta-pixel', 'events'] });
    setError('');
    toast(m);
  };
  const bad = (e: Error) => setError(e.message);
  const call = async <T,>(
    f: () => Promise<{ data?: T; error?: unknown; response: Response }>,
    m: string,
  ): Promise<T> => {
    const r = await f();
    if (!r.data) throw err(r.error, m, r.response.status);
    return r.data;
  };
  const params = { params: { path: { workspaceId: ws! } } };

  const dirty = pixelId !== null || code !== null || capi !== null;
  const save = useMutation({
    mutationFn: () =>
      call(
        () =>
          api.PUT(P, {
            ...params,
            body: {
              ...(pixelId !== null && { pixelId: pixelId.trim() || null }),
              ...(code !== null && { testEventCode: code.trim() || null }),
              ...(capi !== null && { conversionsApi: capi }),
            },
          }),
        'Could not save',
      ),
    onSuccess: (d) => {
      setPixelId(null);
      setCode(null);
      setCapi(null);
      setResult(null);
      ok('Meta Pixel saved')(d);
    },
    onError: bad,
  });
  const saveToken = useMutation({
    mutationFn: () =>
      call(
        () => api.PUT(`${P}/token`, { ...params, body: { value: token } }),
        'Could not save the token',
      ),
    onSuccess: (d) => {
      setToken('');
      setEditToken(false);
      setResult(null);
      ok('Access token saved')(d);
    },
    onError: bad,
  });
  const test = useMutation({
    mutationFn: () =>
      call(() => api.POST(`${P}/test`, { ...params }), 'Could not test the connection'),
    onSuccess: (r) => {
      setResult(r as Result);
      setError('');
      void refresh();
    },
    onError: bad,
  });
  const testEvent = useMutation({
    mutationFn: () =>
      call(() => api.POST(`${P}/test-event`, { ...params }), 'Could not send the test event'),
    onSuccess: (r) => {
      setResult(r as Result);
      setError('');
      void refresh();
    },
    onError: bad,
  });
  const enable = useMutation({
    mutationFn: (enabled: boolean) =>
      call(
        () => api.PUT(`${P}/enabled`, { ...params, body: { enabled } }),
        'Could not change this',
      ),
    onSuccess: (d) => ok(d.enabled ? 'Meta Pixel turned on' : 'Meta Pixel turned off')(d),
    onError: bad,
  });
  const disconnect = useMutation({
    mutationFn: () => call(() => api.DELETE(P, { ...params }), 'Could not disconnect'),
    onSuccess: (d) => {
      setAsk(false);
      setResult(null);
      ok('Meta Pixel disconnected')(d);
    },
    onError: (e) => {
      setAsk(false);
      bad(e);
    },
  });
  const retry = useMutation({
    mutationFn: () => call(() => api.POST(`${P}/events/retry`, { ...params }), 'Could not retry'),
    onSuccess: (r) => {
      toast(
        r.retried ? `Retried ${r.retried} event${r.retried === 1 ? '' : 's'}` : 'Nothing to retry',
      );
      void qc.invalidateQueries({ queryKey: ['integrations', ws, 'meta-pixel', 'events'] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!allowed)
    return (
      <div>
        <PageHeader title="Integrations" description="Connect your own tools to this workspace." />
        <Notice>Only Owners and Admins can manage integrations.</Notice>
      </div>
    );
  const st = v ? STATUS[v.status] : null;
  const failed =
    (events.data?.summary.counts.FAILED ?? 0) + (events.data?.summary.counts.DEAD ?? 0);

  return (
    <div className={cn('flex flex-col gap-2', dirty && 'pb-16')}>
      <PageHeader
        title="Integrations"
        description="Connect your own tools to this workspace. Settings here belong to this workspace only."
      />
      {q.isPending && <Skeleton className="h-64 w-full" />}
      {q.isError && <Notice tone="error">{q.error.message}</Notice>}
      {v && st && (
        <>
          <Section
            title="Meta Pixel"
            description="Send your paid orders to your own Meta Pixel through the Conversions API."
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-md px-2 py-1 text-xs font-semibold', st.cls)}>
                  {st.label}
                  {v.enabled ? ' · On' : ''}
                </span>
                <span className="text-xs text-muted">
                  {v.lastSuccessAt
                    ? `Last verified ${fmtDateTime(v.lastSuccessAt, tz)}`
                    : 'Never verified'}
                </span>
              </div>
              {!v.encryptionReady && (
                <Notice tone="warn">
                  Secrets can’t be stored on this deployment yet, so the access token can’t be
                  saved.
                </Notice>
              )}
              {error && <Notice tone="error">{error}</Notice>}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[13px] font-medium">
                  Meta Pixel ID
                  <input
                    value={pixelId ?? v.pixelId ?? ''}
                    inputMode="numeric"
                    placeholder="1234567890"
                    onChange={(e) => setPixelId(e.target.value)}
                    className={controlCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium">
                  Test event code
                  <input
                    value={code ?? v.testEventCode ?? ''}
                    placeholder="TEST12345"
                    onChange={(e) => setCode(e.target.value)}
                    className={controlCls}
                  />
                  <span className="text-xs font-normal text-muted">
                    From Events Manager → Test events. Used only for the test event below.
                  </span>
                </label>
              </div>
              <label className="flex items-start gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={capi ?? v.conversionsApi}
                  onChange={(e) => setCapi(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-[#5B5CE2]"
                />
                <span>
                  <span className="font-medium">Send purchases through the Conversions API</span>
                  <span className="block text-xs text-muted">
                    A Purchase is sent once for each order that is fully paid. Unpaid, part-paid and
                    cancelled orders are never sent.
                  </span>
                </span>
              </label>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">Conversions API access token</span>
                  {!editToken && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                        <KeyRound size={13} aria-hidden />{' '}
                        {v.hasToken ? 'Saved (hidden)' : 'Not set'}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!v.encryptionReady}
                        onClick={() => setEditToken(true)}
                      >
                        {v.hasToken ? 'Replace' : 'Add'}
                      </Button>
                    </div>
                  )}
                </div>
                {editToken && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[240px] flex-1">
                      <input
                        type={show ? 'text' : 'password'}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="New access token"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className={`${controlCls} pr-9`}
                      />
                      <button
                        type="button"
                        aria-label={show ? 'Hide value' : 'Show value'}
                        onClick={() => setShow((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent p-0 text-faint"
                      >
                        {show ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      loading={saveToken.isPending}
                      disabled={token.trim().length < 6}
                      onClick={() => saveToken.mutate()}
                    >
                      Save token
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditToken(false);
                        setToken('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                <p className="m-0 text-xs text-faint">
                  Encrypted, never shown again after saving, and never visible to other workspaces
                  or Torio’s own tracking.
                </p>
              </div>
              {v.problems.length > 0 && (
                <p className="m-0 text-xs text-muted">Still needed: {v.problems.join(', ')}.</p>
              )}
              {v.lastError && <Notice tone="error">{v.lastError}</Notice>}
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
                  variant="outline"
                  loading={testEvent.isPending}
                  disabled={v.status !== 'VERIFIED' || !v.testEventCode}
                  title={
                    v.status !== 'VERIFIED'
                      ? 'Verify the connection first'
                      : !v.testEventCode
                        ? 'Add a test event code first'
                        : undefined
                  }
                  onClick={() => testEvent.mutate()}
                >
                  Send test event
                </Button>
                <Button
                  variant={v.enabled ? 'outline' : 'primary'}
                  loading={enable.isPending}
                  disabled={!v.enabled && !v.canEnable}
                  title={
                    !v.enabled && !v.canEnable
                      ? 'Test the connection successfully first'
                      : undefined
                  }
                  onClick={() => enable.mutate(!v.enabled)}
                >
                  {v.enabled ? 'Turn off' : 'Turn on'}
                </Button>
                {(v.hasToken || v.pixelId) && (
                  <Button variant="ghost" onClick={() => setAsk(true)}>
                    Disconnect
                  </Button>
                )}
              </div>
              {result && (
                <div
                  role="status"
                  className={cn(
                    'rounded-xl border px-3.5 py-3 text-[13px]',
                    result.ok
                      ? 'border-success/30 bg-success-soft'
                      : 'border-danger/30 bg-danger-soft',
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
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="m-0 text-xs text-faint">
                Only hashed customer email, phone and id are sent, with the order’s value, currency
                and number. Browser tracking is not offered because Torio doesn’t host
                customer-facing pages for your store yet. Refunds are not sent as events.
              </p>
            </div>
          </Section>

          {v.status !== 'NOT_CONFIGURED' && (
            <Section
              title="Recent events"
              description="What was sent to your Pixel, and what failed."
            >
              {events.isPending && <Skeleton className="h-24 w-full" />}
              {events.data && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {events.data.summary.lastSentAt
                        ? `Last event accepted ${fmtDateTime(events.data.summary.lastSentAt, tz)}`
                        : 'No event accepted yet'}{' '}
                      · Conversions API {events.data.summary.serverTrackingOn ? 'on' : 'off'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={retry.isPending}
                      disabled={failed === 0}
                      onClick={() => retry.mutate()}
                    >
                      Retry failed
                    </Button>
                  </div>
                  {events.data.data.length === 0 ? (
                    <p className="m-0 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
                      No events yet. A Purchase appears here when an order is fully paid.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-line">
                      <table className="w-full min-w-[560px] border-collapse text-[13px]">
                        <caption className="sr-only">Recent events</caption>
                        <thead className="bg-[#FBFBFC] text-left text-xs text-faint">
                          <tr>
                            <th className="px-3 py-2 font-medium">Event</th>
                            <th className="px-3 py-2 font-medium">Order</th>
                            <th className="px-3 py-2 font-medium">When</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.data.data.map((e) => {
                            const s = EVENT[e.status] ?? {
                              label: e.status,
                              cls: 'bg-wash-2 text-muted',
                            };
                            return (
                              <tr key={e.id} className="border-t border-line-subtle">
                                <td className="px-3 py-2">
                                  <span className="block font-medium">{e.eventName}</span>
                                  <span className="text-xs text-faint">Server</span>
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                  {e.reference ? `#${e.reference}` : '—'}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-muted">
                                  {fmtDateTime(e.eventTime, tz)}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={cn(
                                      'rounded-md px-1.5 py-0.5 text-xs font-medium',
                                      s.cls,
                                    )}
                                  >
                                    {s.label}
                                  </span>
                                  {e.attempts > 1 && (
                                    <span className="ml-1 text-xs text-faint">
                                      {e.attempts} attempts
                                    </span>
                                  )}
                                  {e.lastError && (
                                    <span className="mt-0.5 block text-xs text-danger">
                                      {e.lastError}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}
        </>
      )}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
          <span className="mr-auto text-[13px] text-muted">Unsaved changes</span>
          <Button
            variant="ghost"
            onClick={() => {
              setPixelId(null);
              setCode(null);
              setCapi(null);
            }}
          >
            Discard
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </div>
      )}
      {ask && (
        <ConfirmDialog
          title="Disconnect Meta Pixel?"
          body="The access token is deleted and no more events are sent. Past events stay in your Meta account."
          confirmLabel="Disconnect"
          busy={disconnect.isPending}
          onCancel={() => setAsk(false)}
          onConfirm={() => disconnect.mutate()}
        />
      )}
    </div>
  );
}
