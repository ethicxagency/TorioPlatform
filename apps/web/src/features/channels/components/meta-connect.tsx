'use client';

import { AlertTriangle, Check, CheckCircle2, Loader2, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import { useEmbeddedSignup, useMetaCancel, useMetaSelect, useMetaSession } from '../queries';
import { ProviderMark } from './bits';

/** What each `meta_error` the server redirects back with means, and what to do about it. */
export const META_ERRORS: Record<string, string> = {
  denied: 'Authorization was cancelled, so nothing was connected.',
  invalid_state:
    'That authorization link was invalid or expired. Start the connection again from this page.',
  missing_permissions:
    'Some permissions were declined. Torio needs every requested permission to receive and reply to messages. Try again and approve them all.',
  no_accounts:
    'No eligible account was found. Messenger needs a Facebook Page you administer; Instagram needs a professional account linked to one of your Pages.',
  exchange_failed:
    'Meta didn’t accept the authorization. Try again, and contact support if it keeps failing.',
  unavailable: 'Meta is temporarily unavailable or rate-limiting. Try again in a few minutes.',
  not_configured: 'Meta isn’t configured on this server yet.',
};

export function MetaErrorBanner({ code, onDismiss }: { code: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-card border border-[#F5D9A0] bg-[#FFFBEB] px-3.5 py-3 text-[13px] text-[#7A4700]"
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span className="flex-1">{META_ERRORS[code] ?? 'The Meta connection didn’t complete.'}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="cursor-pointer rounded border-none bg-transparent p-0 text-[12.5px] font-medium text-inherit underline"
      >
        Dismiss
      </button>
    </div>
  );
}

type SessionCandidate = NonNullable<
  ReturnType<typeof useMetaSession>['data']
>['candidates'][number];
type Result = NonNullable<ReturnType<typeof useMetaSelect>['data']>[number];

const PRODUCT_TITLE = {
  MESSENGER: 'Facebook Messenger',
  INSTAGRAM: 'Instagram Messaging',
  WHATSAPP: 'WhatsApp Business',
} as const;
const PRODUCT_SHORT = {
  MESSENGER: 'Messenger',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
} as const;
const PRODUCT_ORDER = ['MESSENGER', 'INSTAGRAM', 'WHATSAPP'] as const;

const STEP_LABELS = ['Authorized with Facebook', 'Choose channels', 'Connecting', 'Done'];

/** Real progress through the journey, derived from actual state (nothing here is a timer). */
function Steps({ step }: { step: 0 | 1 | 2 | 3 }) {
  return (
    <div className="mb-4">
      {/* Phones: one compact line and a bar, so nothing overflows. */}
      <div className="sm:hidden" role="group" aria-label="Progress">
        <p className="m-0 text-xs font-medium text-ink">
          Step {step + 1} of {STEP_LABELS.length}
          <span className="font-normal text-muted"> · {STEP_LABELS[step]}</span>
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {STEP_LABELS.map((l, i) => (
            <span
              key={l}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-200',
                i <= step ? 'bg-primary' : 'bg-line',
              )}
            />
          ))}
        </div>
      </div>
      <ol className="m-0 hidden list-none items-center p-0 text-xs sm:flex" aria-label="Progress">
        {STEP_LABELS.map((l, i) => (
          <li
            key={l}
            aria-current={i === step ? 'step' : undefined}
            className={cn('flex items-center', i < STEP_LABELS.length - 1 && 'flex-1')}
          >
            <span
              className={cn(
                'flex items-center gap-2 whitespace-nowrap',
                i < step ? 'text-success' : i === step ? 'font-semibold text-ink' : 'text-faint',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold transition-colors duration-200',
                  i < step
                    ? 'bg-success text-white'
                    : i === step
                      ? 'bg-primary text-white'
                      : 'border border-line bg-white text-faint',
                )}
              >
                {i < step ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              {l}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'mx-3 h-px min-w-3 flex-1 transition-colors duration-200',
                  i < step ? 'bg-success' : 'bg-line',
                )}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Avatar({ c }: { c: SessionCandidate }) {
  // Public profile pictures from Meta's CDN; fall back to the channel mark when there is none.
  return c.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote profile image, size fixed by CSS
    <img
      src={c.imageUrl}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line-subtle"
    />
  ) : (
    <ProviderMark provider={c.provider} />
  );
}

type StatusFilter = 'ALL' | 'AVAILABLE' | 'CONNECTED' | 'UNAVAILABLE';
const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: 'All',
  AVAILABLE: 'Available',
  CONNECTED: 'Already connected',
  UNAVAILABLE: 'Unavailable',
};
/** Show the search box once the list is long enough that scanning stops being quicker. */
const SEARCH_FROM = 6;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-8 cursor-pointer items-center rounded-full border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        active
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-line bg-white text-muted hover:border-primary-line hover:bg-wash',
      )}
    >
      {children}
    </button>
  );
}

/**
 * After Facebook redirects back: everything the user can connect, grouped by product, to pick from. Connecting runs
 * per asset, so a failure shows its own reason and can be retried while the rest stay connected.
 */
export function MetaSessionDialog({
  workspaceId,
  sessionId,
  onClose,
  onDone,
}: {
  workspaceId: string;
  sessionId: string;
  onClose: () => void;
  /** Called with the connected accounts' names when the user leaves after connecting. */
  onDone: (names: string[]) => void;
}) {
  const q = useMetaSession(workspaceId, sessionId);
  const select = useMetaSelect(workspaceId);
  const cancel = useMetaCancel(workspaceId);
  // Nothing is pre-selected: the person chooses every asset on purpose.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, Result>>({});
  const [term, setTerm] = useState('');
  const [platform, setPlatform] = useState<'ALL' | (typeof PRODUCT_ORDER)[number]>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const allBox = useRef<HTMLInputElement>(null);
  const s = q.data;
  const all = s?.candidates ?? [];
  const selectable = (c: SessionCandidate) =>
    c.eligible && !c.taken && results[c.key]?.status !== 'CONNECTED';
  const stateOf = (c: SessionCandidate): Exclude<StatusFilter, 'ALL'> =>
    results[c.key]?.status === 'CONNECTED' || c.taken
      ? 'CONNECTED'
      : c.eligible
        ? 'AVAILABLE'
        : 'UNAVAILABLE';
  const eligible = all.filter(selectable);
  const connected = Object.values(results).filter((r) => r.status === 'CONNECTED');
  const ran = Object.keys(results).length > 0;
  const step = select.isPending ? 2 : ran && !eligible.some((c) => !results[c.key]) ? 3 : 1;

  const needle = term.trim().toLowerCase();
  const visible = all.filter(
    (c) =>
      (platform === 'ALL' || c.provider === platform) &&
      (status === 'ALL' || stateOf(c) === status) &&
      (!needle ||
        c.name.toLowerCase().includes(needle) ||
        c.key.toLowerCase().includes(needle) ||
        (c.detail ?? '').toLowerCase().includes(needle)),
  );
  const visibleEligible = visible.filter(selectable);
  // The selection is the whole set, not just what the filters currently show.
  const selectedHere = visibleEligible.filter((c) => sel.has(c.key)).length;
  const filtering = platform !== 'ALL' || status !== 'ALL' || needle !== '';
  const platforms = PRODUCT_ORDER.filter((p) => all.some((c) => c.provider === p));
  const showStatus = all.some((c) => stateOf(c) !== 'AVAILABLE');

  useEffect(() => {
    if (allBox.current)
      allBox.current.indeterminate = selectedHere > 0 && selectedHere < visibleEligible.length;
  }, [selectedHere, visibleEligible.length]);

  const toggle = (k: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleAll = () =>
    setSel((p) => {
      const n = new Set(p);
      const every = visibleEligible.length > 0 && visibleEligible.every((c) => n.has(c.key));
      for (const c of visibleEligible) {
        if (every) n.delete(c.key);
        else n.add(c.key);
      }
      return n;
    });
  const connect = () => {
    if (select.isPending || !sel.size) return;
    select.mutate(
      { sessionId, candidateKeys: [...sel] },
      {
        onSuccess: (rs) => {
          setResults((p) => ({ ...p, ...Object.fromEntries(rs.map((r) => [r.key, r])) }));
          setSel(new Set(rs.filter((r) => r.status !== 'CONNECTED').map((r) => r.key)));
        },
      },
    );
  };
  const close = () => {
    if (connected.length) onDone(connected.map((r) => r.name));
    else {
      cancel.mutate(sessionId); // discard the parked tokens now instead of waiting for expiry
      onClose();
    }
  };
  const failed = Object.values(results).filter((r) => r.status !== 'CONNECTED');
  const allDone = ran && connected.length > 0 && !failed.some((r) => sel.has(r.key));
  const selectedNames = all.filter((c) => sel.has(c.key)).map((c) => c.name);
  const total = eligible.length;

  return (
    <Modal
      title={allDone && step === 3 ? 'Your channels are connected' : 'Choose what to connect'}
      description="Select the Facebook Pages and messaging channels you want to connect to Torio."
      onClose={select.isPending ? () => undefined : close}
      className="sm:max-w-[680px]"
      footer={
        <>
          <p
            className="m-0 mr-auto min-w-0 basis-full text-xs text-muted sm:basis-auto"
            aria-live="polite"
          >
            <span className="block text-[13px] font-medium text-ink">
              {select.isPending
                ? `Connecting ${sel.size} channel${sel.size === 1 ? '' : 's'}…`
                : `${sel.size} channel${sel.size === 1 ? '' : 's'} selected`}
            </span>
            {select.isPending
              ? 'Keep this window open until Meta confirms.'
              : ran && failed.length
                ? 'Connected channels stay connected. Retry only the ones that failed.'
                : 'You can disconnect any channel later from Channels.'}
          </p>
          <Button variant="outline" disabled={select.isPending} onClick={close}>
            {connected.length ? 'Go to Channels' : 'Cancel'}
          </Button>
          {connected.length > 0 && (
            <Button variant="outline" asChild>
              <a href="/inbox">Open Inbox</a>
            </Button>
          )}
          <Button
            disabled={!sel.size || select.isPending || !s}
            loading={select.isPending}
            onClick={connect}
          >
            {select.isPending
              ? 'Connecting…'
              : ran && sel.size
                ? `Retry ${sel.size}`
                : sel.size
                  ? `Connect ${sel.size} selected`
                  : 'Connect selected'}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Steps step={q.isPending ? 0 : step} />
      </div>
      {q.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : q.isError ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {q.error.message}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {s!.missingPermissions.length > 0 && (
            <p
              role="status"
              className="m-0 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-[#7A4700]"
            >
              Permissions for {s!.missingPermissions.map((p) => PRODUCT_TITLE[p]).join(', ')}{' '}
              weren’t granted, so those accounts aren’t listed. Start again and approve them to
              include them.
            </p>
          )}
          {select.isPending && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-primary-line bg-primary-tint px-3.5 py-3 text-[13px]"
            >
              <Loader2
                size={16}
                aria-hidden
                className="mt-0.5 shrink-0 animate-spin text-primary"
              />
              <span>
                <span className="block font-medium text-ink">
                  Connecting {selectedNames.slice(0, 3).join(', ')}
                  {selectedNames.length > 3 ? ` and ${selectedNames.length - 3} more` : ''}
                </span>
                <span className="text-muted">
                  Torio is verifying access with Meta and subscribing to messages. Each channel
                  shows its own result when this finishes.
                </span>
              </span>
            </div>
          )}
          {!select.isPending && connected.length > 0 && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-[#BFE5CC] bg-[#F1FAF4] px-3.5 py-3 text-[13px]"
            >
              <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0 text-success" />
              <span>
                <span className="block font-medium text-ink">
                  {connected.length} channel{connected.length === 1 ? '' : 's'} connected
                  {failed.length ? `, ${failed.length} failed` : ''}
                </span>
                <span className="text-muted">
                  {connected.map((r) => r.name).join(', ')}
                  {failed.length ? '. Retry the failed ones below; the rest stay connected.' : ''}
                </span>
              </span>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {(all.length >= SEARCH_FROM || filtering) && (
              <div className="relative">
                <Search
                  size={15}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search by name or ID"
                  aria-label="Search channels by name or ID"
                  className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none transition-colors duration-150 placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
            {(platforms.length > 1 || showStatus) && (
              <div className="flex flex-wrap items-center gap-2">
                {platforms.length > 1 && (
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Filter by platform"
                  >
                    <Chip active={platform === 'ALL'} onClick={() => setPlatform('ALL')}>
                      All platforms
                    </Chip>
                    {platforms.map((p) => (
                      <Chip key={p} active={platform === p} onClick={() => setPlatform(p)}>
                        {PRODUCT_SHORT[p]}
                      </Chip>
                    ))}
                  </div>
                )}
                {showStatus && (
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Filter by status"
                  >
                    {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => (
                      <Chip key={k} active={status === k} onClick={() => setStatus(k)}>
                        {STATUS_LABEL[k]}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-wash px-3 py-2">
              <label
                className={cn(
                  'flex min-h-8 items-center gap-2 text-[13px] font-medium',
                  visibleEligible.length ? 'cursor-pointer text-ink' : 'text-faint',
                )}
              >
                <input
                  ref={allBox}
                  type="checkbox"
                  checked={visibleEligible.length > 0 && selectedHere === visibleEligible.length}
                  disabled={!visibleEligible.length || select.isPending}
                  onChange={toggleAll}
                  className="h-4 w-4 shrink-0 accent-[#5B5CE2]"
                />
                {filtering ? 'Select all shown' : 'Select all eligible'} ({visibleEligible.length})
              </label>
              <span className="ml-auto text-xs text-muted" aria-live="polite">
                {sel.size} of {total} selected
              </span>
              <button
                type="button"
                onClick={() => setSel(new Set())}
                disabled={!sel.size || select.isPending}
                className="min-h-8 cursor-pointer rounded border-none bg-transparent p-0 text-xs font-medium text-primary hover:underline disabled:cursor-default disabled:text-faint disabled:no-underline"
              >
                Clear selection
              </button>
            </div>
          </div>

          {visible.length === 0 && (
            <p className="m-0 rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
              No channels match.{' '}
              <button
                type="button"
                onClick={() => {
                  setTerm('');
                  setPlatform('ALL');
                  setStatus('ALL');
                }}
                className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary hover:underline"
              >
                Clear filters
              </button>
            </p>
          )}
          {PRODUCT_ORDER.map((prod) => {
            const rows = visible.filter((c) => c.provider === prod);
            if (!rows.length) return null;
            return (
              <section key={prod} aria-label={PRODUCT_TITLE[prod]}>
                <h3 className="m-0 mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">
                  {PRODUCT_TITLE[prod]}
                  <span className="rounded-full bg-wash px-1.5 py-px text-[11px] font-medium normal-case tracking-normal text-muted">
                    {rows.length}
                  </span>
                </h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {rows.map((c) => {
                    const r = results[c.key];
                    const can = selectable(c);
                    const on = sel.has(c.key);
                    const note = r
                      ? r.status === 'CONNECTED'
                        ? '' // the Connected pill says it
                        : (r.message ?? 'Couldn’t connect')
                      : c.taken
                        ? 'Already connected to a workspace'
                        : !c.eligible
                          ? c.reason
                          : c.detail;
                    const bad = Boolean(r && r.status !== 'CONNECTED');
                    return (
                      <li key={c.key}>
                        <label
                          className={cn(
                            'flex items-center gap-3 rounded-xl border p-3 transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
                            can ? 'cursor-pointer' : 'cursor-default bg-wash/60',
                            on
                              ? 'border-primary bg-primary-soft/60'
                              : can
                                ? 'border-line bg-white hover:border-primary-line hover:bg-primary-tint'
                                : 'border-line-subtle',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!can || select.isPending}
                            onChange={() => toggle(c.key)}
                            aria-label={`${c.name} (${PRODUCT_TITLE[c.provider]})`}
                            className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#5B5CE2] disabled:cursor-default"
                          />
                          <Avatar c={c} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c.name}</span>
                            {note && (
                              <span
                                role={bad ? 'alert' : undefined}
                                className={cn(
                                  'block text-xs',
                                  r?.status === 'CONNECTED'
                                    ? 'text-success'
                                    : bad || (!c.eligible && !c.taken)
                                      ? 'text-[#8F2424]'
                                      : 'text-muted',
                                )}
                              >
                                {note}
                              </span>
                            )}
                          </span>
                          {select.isPending && on ? (
                            <span className="flex shrink-0 items-center gap-1.5 text-xs text-primary">
                              <Loader2 size={13} aria-hidden className="animate-spin" />
                              Connecting
                            </span>
                          ) : r?.status === 'CONNECTED' ? (
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#E8F6EE] px-2 py-0.5 text-xs font-medium text-success">
                              <Check size={12} aria-hidden /> Connected
                            </span>
                          ) : c.taken ? (
                            <span className="shrink-0 rounded-full bg-wash px-2 py-0.5 text-xs font-medium text-muted">
                              Already connected
                            </span>
                          ) : on ? (
                            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
                              Selected
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {select.error && (
        <p
          role="alert"
          className="mb-0 mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
        >
          {select.error.message} Nothing was marked connected; you can try again.
        </p>
      )}
    </Modal>
  );
}

/* ---------- WhatsApp Embedded Signup (Facebook JS SDK) ---------- */

interface FbSdk {
  init: (o: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
  login: (
    cb: (r: { authResponse?: { code?: string } }) => void,
    o: Record<string, unknown>,
  ) => void;
}
declare global {
  interface Window {
    FB?: FbSdk;
  }
}

function loadSdk(appId: string, version: string) {
  return new Promise<FbSdk>((resolve, reject) => {
    const ready = () => {
      window.FB!.init({ appId, version, cookie: true, xfbml: false });
      resolve(window.FB!);
    };
    if (window.FB) return ready();
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.com/en_US/sdk.js';
    s.async = true;
    s.onload = ready;
    s.onerror = () =>
      reject(new Error('Couldn’t load the Facebook SDK. Check your network or ad blocker.'));
    document.body.appendChild(s);
  });
}

/**
 * Starts Meta's official Embedded Signup. The browser only ever receives a one-time `code` and the account ids; the
 * server exchanges the code for a token and validates everything with Meta before saving.
 */
export function useWhatsAppSignup(
  workspaceId: string | null,
  cfg: { appId: string; graphVersion: string; configId: string } | null,
) {
  const finish = useEmbeddedSignup(workspaceId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // What Meta's popup reported: the finished assets, or why it ended without them.
  const outcome = useRef<{
    phoneNumberId?: string;
    wabaId?: string;
    event?: string;
    message?: string;
  }>({});
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      let host = '';
      try {
        host = new URL(e.origin).hostname;
      } catch {
        return;
      }
      if (!host.endsWith('facebook.com')) return;
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type !== 'WA_EMBEDDED_SIGNUP') return;
        outcome.current = {
          event: d.event,
          phoneNumberId: d.data?.phone_number_id,
          wabaId: d.data?.waba_id,
          message: d.data?.error_message,
        };
      } catch {
        /* not ours */
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const start = async (displayName: string, onDone: () => void) => {
    if (!cfg) return;
    setError('');
    setBusy(true);
    outcome.current = {};
    try {
      const fb = await loadSdk(cfg.appId, cfg.graphVersion);
      fb.login(
        (r) => {
          const code = r.authResponse?.code;
          // The completion event can land just after the login callback. The code lives only ~30 seconds, so wait briefly, then exchange at once.
          setTimeout(() => {
            const o = outcome.current;
            const fail = (m: string) => {
              setError(m);
              setBusy(false);
            };
            if (o.event === 'ERROR')
              return fail(
                `Meta reported a problem${o.message ? `: ${o.message}` : ''}. Nothing was connected.`,
              );
            if (o.event === 'CANCEL' || (!code && !o.event))
              return fail('WhatsApp setup was cancelled. Nothing was connected.');
            if (o.event && o.event !== 'FINISH')
              return fail(
                'This setup finished without a phone number, so there is nothing to connect yet. Add a number in Meta and try again.',
              );
            if (!code)
              return fail(
                'Meta closed the window before giving Torio access. Start again and click Finish.',
              );
            if (!o.phoneNumberId || !o.wabaId)
              return fail('Meta didn’t report the WhatsApp account. Nothing was connected.');
            finish.mutate(
              { code, phoneNumberId: o.phoneNumberId, wabaId: o.wabaId, displayName },
              {
                onSuccess: onDone,
                onError: (e) => setError(e.message),
                onSettled: () => setBusy(false),
              },
            );
          }, 600);
        },
        {
          config_id: cfg.configId,
          response_type: 'code',
          override_default_response_type: true,
          // Cloud API Embedded Signup takes only `setup` (documented by Meta).
          extras: { setup: {} },
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start WhatsApp setup.');
      setBusy(false);
    }
  };
  return { start, busy, error };
}
