'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { useState } from 'react';
import { FieldSelect } from '@/components/ui/field-select';
import { adminRequest } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { fmtDateTime, Loading, Notice, Panel } from './common';

type Deliveries = ApiSchemas['EmailDeliveryListDto'];
type Preview = ApiSchemas['EmailPreviewDto'];
type Templates = ApiSchemas['EmailTemplateListDto'];
const BASE = '/integrations/platform/mailgun';

const TONE: Record<string, string> = {
  DELIVERED: 'bg-success-soft text-success',
  OPENED: 'bg-success-soft text-success',
  CLICKED: 'bg-success-soft text-success',
  ACCEPTED: 'bg-wash-2 text-muted',
  QUEUED: 'bg-wash-2 text-muted',
  TEMP_FAILED: 'bg-warning-soft text-warning',
  FAILED: 'bg-danger-soft text-danger',
  COMPLAINED: 'bg-danger-soft text-danger',
  UNSUBSCRIBED: 'bg-warning-soft text-warning',
};
const LABEL: Record<string, string> = {
  ACCEPTED: 'Accepted (not yet delivered)',
  TEMP_FAILED: 'Retrying',
  FAILED: 'Failed',
};

/** What the provider reported for recent emails: accepted is not delivered, and only Mailgun's events say which. */
export function RecentEmails() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'integrations', 'mailgun', 'deliveries', status, page],
    queryFn: () =>
      adminRequest<Deliveries>(`${BASE}/deliveries`, {
        query: { page, pageSize: 10, ...(status ? { status } : {}) },
      }),
  });
  const d = q.data;
  return (
    <Panel title="Recent emails">
      {q.isPending && <Loading />}
      {q.isError && <Notice tone="bad">{q.error.message}</Notice>}
      {d && (
        <div className="flex flex-col gap-3">
          {!d.summary.webhookReady && (
            <Notice tone="warn">
              Delivery tracking is off: save the webhook signing key and add the webhook URL in
              Mailgun. Until then emails only reach “Accepted”, which does not mean delivered.
            </Notice>
          )}
          <dl className="m-0 grid gap-2 text-[13px] sm:grid-cols-4">
            <div>
              <dt className="text-xs text-faint">Sending through</dt>
              <dd className="m-0 font-medium">
                {d.summary.activeProvider ?? 'Nothing configured'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Last delivery reported</dt>
              <dd className="m-0 font-medium">
                {d.summary.lastDeliveredAt ? fmtDateTime(d.summary.lastDeliveredAt) : 'None yet'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Last 24 hours</dt>
              <dd className="m-0 font-medium">
                {Object.entries(d.summary.last24h)
                  .map(([k, n]) => `${n} ${(LABEL[k] ?? k).toLowerCase()}`)
                  .join(' · ') || 'No emails'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Last failure</dt>
              <dd className="m-0 font-medium">
                {d.summary.lastFailure
                  ? `${fmtDateTime(d.summary.lastFailure.at)}${d.summary.lastFailure.error ? ` — ${d.summary.lastFailure.error}` : ''}`
                  : 'None'}
              </dd>
            </div>
          </dl>
          <label className="flex w-fit items-center gap-2 text-xs text-muted">
            Show
            <FieldSelect
              aria-label="Filter emails by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 w-[200px]"
            >
              <option value="">All emails</option>
              {[
                'ACCEPTED',
                'DELIVERED',
                'OPENED',
                'CLICKED',
                'TEMP_FAILED',
                'FAILED',
                'COMPLAINED',
                'UNSUBSCRIBED',
              ].map((s) => (
                <option key={s} value={s}>
                  {LABEL[s] ?? s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')}
                </option>
              ))}
            </FieldSelect>
          </label>
          {d.data.length === 0 ? (
            <p className="m-0 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
              No emails yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <caption className="sr-only">Recent emails</caption>
                <thead className="bg-[#FBFBFC] text-left text-xs text-faint">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">To</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((e) => (
                    <tr key={e.id} className="border-t border-line-subtle">
                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                        {fmtDateTime(e.createdAt)}
                      </td>
                      <td className="px-3 py-2">{e.to}</td>
                      <td className="px-3 py-2">
                        <span className="block">{e.kind.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-faint">via {e.provider}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-xs font-medium',
                            TONE[e.status],
                          )}
                        >
                          {LABEL[e.status] ??
                            e.status.charAt(0) + e.status.slice(1).toLowerCase().replace('_', ' ')}
                        </span>
                        {e.error && (
                          <span className="mt-0.5 block text-xs text-danger">{e.error}</span>
                        )}
                        {e.lastEvent && (
                          <span className="block text-xs text-faint">
                            {e.lastEvent}
                            {e.lastEventAt ? ` · ${fmtDateTime(e.lastEventAt)}` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.meta.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary disabled:cursor-not-allowed disabled:text-faint"
              >
                Previous
              </button>
              <span>
                Page {d.meta.page} of {d.meta.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= d.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary disabled:cursor-not-allowed disabled:text-faint"
              >
                Next
              </button>
            </div>
          )}
          <p className="m-0 text-xs text-faint">
            Message bodies are never stored: they can contain one-time links. A failed email is sent
            again when the person repeats the action that triggered it (for example “Resend
            verification email”).
          </p>
        </div>
      )}
    </Panel>
  );
}

/** The email templates with sample data, exactly as they are rendered for sending. */
export function TemplatePreview() {
  const list = useQuery({
    queryKey: ['admin', 'integrations', 'mailgun', 'templates'],
    queryFn: () => adminRequest<Templates>(`${BASE}/templates`),
  });
  const [key, setKey] = useState('verify_email');
  const [mode, setMode] = useState<'html' | 'text'>('html');
  const p = useQuery({
    queryKey: ['admin', 'integrations', 'mailgun', 'preview', key],
    queryFn: () => adminRequest<Preview>(`${BASE}/templates/${key}`),
  });
  return (
    <Panel title="Email templates">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FieldSelect
            aria-label="Template"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-9 w-[240px]"
          >
            {(list.data?.data ?? [{ key: 'verify_email', subject: '' }]).map((t) => (
              <option key={t.key} value={t.key}>
                {t.key.replace(/_/g, ' ')}
              </option>
            ))}
          </FieldSelect>
          <div role="group" aria-label="Preview format" className="flex gap-1">
            {(['html', 'text'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'h-8 cursor-pointer rounded-full border px-3 text-xs font-medium',
                  mode === m
                    ? 'border-primary bg-primary-soft text-primary-hover'
                    : 'border-line bg-white text-muted',
                )}
              >
                {m === 'html' ? 'HTML' : 'Plain text'}
              </button>
            ))}
          </div>
        </div>
        {p.isPending && <Loading />}
        {p.data && (
          <>
            <p className="m-0 text-[13px]">
              <span className="text-xs text-faint">Subject </span>
              <span className="font-medium">{p.data.subject}</span>
            </p>
            {mode === 'html' ? (
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={p.data.html}
                className="h-[460px] w-full rounded-xl border border-line bg-white"
              />
            ) : (
              <pre className="m-0 max-h-[460px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-wash p-3 text-xs">
                {p.data.text}
              </pre>
            )}
          </>
        )}
        <p className="m-0 text-xs text-faint">
          Sample data. Platform and security emails carry Torio’s identity; customer-facing emails
          carry the store’s name and logo.
        </p>
      </div>
    </Panel>
  );
}
