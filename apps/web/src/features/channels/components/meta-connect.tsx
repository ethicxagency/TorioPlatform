'use client';

import { AlertTriangle, Check } from 'lucide-react';
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
const PRODUCT_ORDER = ['MESSENGER', 'INSTAGRAM', 'WHATSAPP'] as const;

/** Real progress through the journey, derived from actual state (nothing here is a timer). */
function Steps({ step }: { step: 0 | 1 | 2 | 3 }) {
  const labels = ['Authorized with Facebook', 'Choose channels', 'Connecting', 'Done'];
  return (
    <ol
      className="m-0 mb-4 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs"
      aria-label="Progress"
    >
      {labels.map((l, i) => (
        <li
          key={l}
          aria-current={i === step ? 'step' : undefined}
          className={cn(
            'flex items-center gap-1.5',
            i < step ? 'text-success' : i === step ? 'font-semibold text-ink' : 'text-faint',
          )}
        >
          {i < step ? (
            <Check size={12} aria-hidden />
          ) : (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          )}
          {l}
        </li>
      ))}
    </ol>
  );
}

function Avatar({ c }: { c: SessionCandidate }) {
  // Public profile pictures from Meta's CDN; fall back to the channel mark when there is none.
  return c.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote profile image, size fixed by CSS
    <img
      src={c.imageUrl}
      alt=""
      width={36}
      height={36}
      className="h-9 w-9 shrink-0 rounded-full object-cover"
    />
  ) : (
    <ProviderMark provider={c.provider} />
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
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, Result>>({});
  const s = q.data;
  const selectable = (c: SessionCandidate) =>
    c.eligible && !c.taken && results[c.key]?.status !== 'CONNECTED';
  const eligible = (s?.candidates ?? []).filter(selectable);
  const connected = Object.values(results).filter((r) => r.status === 'CONNECTED');
  const ran = Object.keys(results).length > 0;
  const step = select.isPending ? 2 : ran && !eligible.some((c) => !results[c.key]) ? 3 : 1;
  const toggle = (k: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const connect = () =>
    select.mutate(
      { sessionId, candidateKeys: [...sel] },
      {
        onSuccess: (rs) => {
          setResults((p) => ({ ...p, ...Object.fromEntries(rs.map((r) => [r.key, r])) }));
          setSel(new Set(rs.filter((r) => r.status !== 'CONNECTED').map((r) => r.key)));
        },
      },
    );
  const close = () => {
    if (connected.length) onDone(connected.map((r) => r.name));
    else {
      cancel.mutate(sessionId); // discard the parked tokens now instead of waiting for expiry
      onClose();
    }
  };
  const allDone =
    ran &&
    connected.length > 0 &&
    !Object.values(results).some((r) => r.status !== 'CONNECTED' && sel.has(r.key));

  return (
    <Modal
      title={allDone && step === 3 ? 'Your channels are connected' : 'Choose what to connect'}
      description="Torio only lists what your Facebook login can access."
      onClose={select.isPending ? () => undefined : close}
      className="sm:max-w-[640px]"
      footer={
        <>
          <Button variant="outline" disabled={select.isPending} onClick={close}>
            {connected.length ? 'Done' : 'Cancel'}
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
                : `Connect ${sel.size || ''}`.trim()}
          </Button>
        </>
      }
    >
      <Steps step={q.isPending ? 0 : step} />
      {q.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
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
          {eligible.length > 1 && (
            <button
              type="button"
              onClick={() => setSel(new Set(eligible.map((c) => c.key)))}
              className="-mb-2 cursor-pointer self-start rounded border-none bg-transparent p-0 text-[12.5px] font-medium text-primary hover:underline"
            >
              Select all eligible ({eligible.length})
            </button>
          )}
          {PRODUCT_ORDER.map((prod) => {
            const rows = s!.candidates.filter((c) => c.provider === prod);
            if (!rows.length) return null;
            return (
              <section key={prod} aria-label={PRODUCT_TITLE[prod]}>
                <h3 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">
                  {PRODUCT_TITLE[prod]}
                </h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {rows.map((c) => {
                    const r = results[c.key];
                    const can = selectable(c);
                    const note = r
                      ? r.status === 'CONNECTED'
                        ? 'Connected'
                        : (r.message ?? 'Couldn’t connect')
                      : c.taken
                        ? 'Already connected to a workspace'
                        : !c.eligible
                          ? c.reason
                          : c.detail;
                    return (
                      <li key={c.key}>
                        <label
                          className={cn(
                            'flex items-center gap-3 rounded-xl border p-3',
                            can ? 'cursor-pointer' : 'opacity-90',
                            sel.has(c.key) ? 'border-primary bg-primary-soft/60' : 'border-line',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={sel.has(c.key)}
                            disabled={!can || select.isPending}
                            onChange={() => toggle(c.key)}
                            aria-label={`${c.name} (${PRODUCT_TITLE[c.provider]})`}
                            className="h-4 w-4 shrink-0 accent-[#5B5CE2]"
                          />
                          <Avatar c={c} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c.name}</span>
                            {note && (
                              <span
                                role={r && r.status !== 'CONNECTED' ? 'alert' : undefined}
                                className={cn(
                                  'block text-xs',
                                  r?.status === 'CONNECTED'
                                    ? 'text-success'
                                    : r || (!c.eligible && !c.taken)
                                      ? 'text-[#8F2424]'
                                      : 'text-muted',
                                )}
                              >
                                {note}
                              </span>
                            )}
                          </span>
                          {r?.status === 'CONNECTED' && (
                            <Check size={16} aria-hidden className="shrink-0 text-success" />
                          )}
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
          {select.error.message}
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
