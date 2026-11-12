'use client';

import type { FeedPreview } from '@torio/contracts';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import {
  useCatalogConnect,
  useCatalogDisconnect,
  useCatalogList,
  useCatalogPreview,
  useCatalogSelect,
  useCatalogSource,
  useCatalogSync,
  type CatalogProvider,
} from '../queries';
import { fmtAgoIso } from './bits';

const LABEL = {
  meta: {
    brand: 'Meta',
    connect: 'Connect Meta',
    reconnect: 'Reconnect Meta',
    disconnect: 'Disconnect Meta',
    pick: 'Choose catalog',
    change: 'Change catalog',
    thing: 'catalog',
    dialog: 'Import from a Meta catalog',
    legend: 'Catalog',
    preview: 'Catalog preview',
    opening: 'Opening Meta…',
  },
  google: {
    brand: 'Google',
    connect: 'Connect Google',
    reconnect: 'Reconnect Google',
    disconnect: 'Disconnect Google',
    pick: 'Choose account',
    change: 'Change account',
    thing: 'account',
    dialog: 'Import from Google Merchant Center',
    legend: 'Merchant Center account',
    preview: 'Merchant Center preview',
    opening: 'Opening Google…',
  },
} as const;

const RETURN: Record<string, string> = {
  invalid_state: 'That sign-in link was not valid or had expired. Start the connection again.',
  no_refresh_token:
    'Google did not allow ongoing access. Remove Torio under your Google account’s third-party access, then connect again.',
  denied: 'Meta access was not granted, so nothing was connected.',
  missing_permissions:
    'Meta did not grant catalog access. Approve every permission on the Meta screen, or ask the Torio admin to check the Meta app’s access to catalog_management.',
  exchange_failed: 'Meta could not complete the connection. Try again in a moment.',
  not_configured: 'Meta catalog import is not set up on this server.',
};

/** Choose which catalog to import from, see what it contains, then start the sync. Products still go to review. */
function CatalogDialog({
  ws,
  provider,
  onClose,
  onStarted,
}: {
  ws: string;
  provider: CatalogProvider;
  onClose: () => void;
  onStarted: (jobId: string) => void;
}) {
  const L = LABEL[provider];
  const list = useCatalogList(ws, provider, true);
  const select = useCatalogSelect(ws, provider);
  const preview = useCatalogPreview(ws, provider);
  const sync = useCatalogSync(ws, provider);
  const [picked, setPicked] = useState('');
  const [pv, setPv] = useState<FeedPreview | null>(null);
  const [error, setError] = useState('');
  const choose = (id: string, name: string) => {
    setPicked(id);
    setPv(null);
    setError('');
    select.mutate(
      { catalogId: id, name },
      {
        onSuccess: () =>
          preview.mutate(undefined, { onSuccess: setPv, onError: (e) => setError(e.message) }),
        onError: (e) => setError(e.message),
      },
    );
  };
  return (
    <Modal
      title={L.dialog}
      onClose={onClose}
      className="max-w-[640px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={sync.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!pv || pv.valid === 0 || sync.isPending}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: (d) => onStarted(d.job.id),
                onError: (e) => setError(e.message),
              })
            }
          >
            {sync.isPending ? 'Starting…' : pv ? `Import ${pv.valid} products for review` : L.pick}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {list.isPending && <Skeleton className="h-24 w-full" />}
        {list.isError && (
          <p
            role="alert"
            className="m-0 flex items-start gap-1.5 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-[#8F2424]"
          >
            <CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0" /> {list.error.message}
          </p>
        )}
        {list.data && list.data.data.length === 0 && (
          <p className="m-0 rounded-xl bg-wash px-3 py-2.5 text-[13px] text-muted">
            Nothing to import was found for the connected {L.brand} account.
          </p>
        )}
        {list.data && list.data.data.length > 0 && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-[12.5px] font-semibold">{L.legend}</legend>
            {list.data.data.map((c) => (
              <label
                key={c.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-[13px]',
                  picked === c.id ? 'border-primary-line bg-primary-soft/40' : 'border-line',
                )}
              >
                <input
                  type="radio"
                  name="catalog"
                  checked={picked === c.id}
                  onChange={() => choose(c.id, c.name)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {[
                      c.businessName,
                      c.productCount !== null && `${c.productCount.toLocaleString()} products`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {(select.isPending || preview.isPending) && <Skeleton className="h-24 w-full" />}
        {error && (
          <p
            role="alert"
            className="m-0 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
          >
            {error}
          </p>
        )}
        {pv && (
          <div className="flex flex-col gap-2" role="region" aria-label={L.preview}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[12.5px]">
              {[
                ['Read', pv.totalItems],
                ['Valid', pv.valid],
                ['Duplicates', pv.duplicates],
                ['No price', pv.missingPrice],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-lg bg-wash px-3 py-2">
                  <div className="text-xs text-muted">{l}</div>
                  <div className="text-[16px] font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            {pv.issues.length > 0 && (
              <ul className="m-0 list-disc rounded-xl bg-warning-soft py-2 pl-7 pr-3 text-[12.5px] text-warning">
                {pv.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] text-muted">
              {pv.sample.map((s, i) => (
                <li key={i}>
                  <b className="text-ink">{s.data['name']}</b> ·{' '}
                  {[s.data['price'], s.data['currency']].filter(Boolean).join(' ') || 'no price'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * The Meta Catalog / Google Merchant Center source card. Its status is the real one from the server: switched off, not configured, connected, a
 * chosen catalog, or needing to reconnect. Connecting only ever goes through Meta's own authorization screen.
 */
export function CatalogSourceCard({
  ws,
  provider,
  returned,
  onStarted,
}: {
  ws: string;
  provider: CatalogProvider;
  /** The `meta_catalog` result Meta's redirect brought back, if any. */
  returned: string | null;
  onStarted: (jobId: string) => void;
}) {
  const L = LABEL[provider];
  const st = useCatalogSource(ws, provider);
  const connect = useCatalogConnect(ws, provider);
  const disconnect = useCatalogDisconnect(ws, provider);
  const sync = useCatalogSync(ws, provider);
  const [open, setOpen] = useState(returned === 'connected');
  const [error, setError] = useState('');
  const d = st.data;
  const reconnect = d?.status === 'ERROR';
  const note = returned && returned !== 'connected' ? (RETURN[returned] ?? null) : null;

  const go = () => {
    setError('');
    connect.mutate(undefined, {
      onSuccess: (r) => window.location.assign(r.url),
      onError: (e) => setError(e.message),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {st.isPending && <Skeleton className="h-10 w-full" />}
      {d && !d.available && (
        <p className="m-0 flex items-start gap-1.5 rounded-lg bg-wash px-2.5 py-2 text-xs text-muted">
          <CircleAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-faint" /> {d.reason}
        </p>
      )}
      {d?.available && !d.connected && (
        <Button size="sm" className="self-start" disabled={connect.isPending} onClick={go}>
          {connect.isPending ? L.opening : L.connect}
        </Button>
      )}
      {d?.available && d.connected && (
        <div className="rounded-lg border border-line-subtle px-2.5 py-2 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {d.catalog ? d.catalog.name : `Connected, no ${L.thing} chosen`}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                reconnect ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
              )}
            >
              {reconnect ? 'Needs attention' : 'Connected'}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-faint">
            {d.lastSyncedAt ? `Last synced ${fmtAgoIso(d.lastSyncedAt)}` : 'Not synced'} · Manual
            sync
          </div>
          {d.lastError && <div className="mt-0.5 text-xs text-danger">{d.lastError}</div>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {reconnect ? (
              <Button size="sm" onClick={go}>
                {L.reconnect}
              </Button>
            ) : (
              <>
                {d.catalog && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sync.isPending}
                    onClick={() =>
                      sync.mutate(undefined, {
                        onSuccess: (j) => onStarted(j.job.id),
                        onError: (e) => setError(e.message),
                      })
                    }
                  >
                    Sync now
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                  {d.catalog ? L.change : L.pick}
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              aria-label={L.disconnect}
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate(undefined, { onError: (e) => setError(e.message) })}
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}
      {d?.available && !d.connected && d.status === 'DISCONNECTED' && (
        <p className="m-0 text-xs text-faint">
          Disconnected. Products already imported stay in your Brain.
        </p>
      )}
      {note && (
        <p role="alert" className="m-0 rounded-lg bg-warning-soft px-2.5 py-2 text-xs text-warning">
          {note}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="m-0 rounded-lg bg-danger-soft px-2.5 py-2 text-xs text-[#8F2424]"
        >
          {error}
        </p>
      )}
      {open && (
        <CatalogDialog
          ws={ws}
          provider={provider}
          onClose={() => setOpen(false)}
          onStarted={(id) => {
            setOpen(false);
            onStarted(id);
          }}
        />
      )}
    </div>
  );
}
