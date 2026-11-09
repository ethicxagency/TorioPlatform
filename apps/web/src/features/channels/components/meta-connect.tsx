'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import { useEmbeddedSignup, useMetaSelect, useMetaSession } from '../queries';
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

/** After Meta redirects back: choose which Page or Instagram account to connect. Names only; the server holds the tokens. */
export function MetaSessionDialog({
  workspaceId,
  sessionId,
  onClose,
  onConnected,
}: {
  workspaceId: string;
  sessionId: string;
  onClose: () => void;
  onConnected: (name: string) => void;
}) {
  const q = useMetaSession(workspaceId, sessionId);
  const select = useMetaSelect(workspaceId);
  const [sel, setSel] = useState('');
  const s = q.data;
  const label = s?.provider === 'INSTAGRAM' ? 'Instagram account' : 'Facebook Page';
  return (
    <Modal
      title={`Choose a ${s ? label : 'account'}`}
      description="Torio will receive this account’s messages and reply from it."
      onClose={select.isPending ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={select.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!sel || select.isPending || !s}
            loading={select.isPending}
            onClick={() =>
              select.mutate(
                { sessionId, candidateId: sel },
                { onSuccess: (c) => onConnected(c.accountName ?? c.displayName) },
              )
            }
          >
            {select.isPending ? 'Connecting…' : 'Connect'}
          </Button>
        </>
      }
    >
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
        <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
          {s!.candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={sel === c.id}
              disabled={c.taken}
              onClick={() => setSel(c.id)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60',
                sel === c.id
                  ? 'border-primary bg-primary-soft/60'
                  : 'border-line enabled:hover:bg-wash',
                !c.taken && 'cursor-pointer',
              )}
            >
              <ProviderMark provider={s!.provider} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                {(c.detail || c.taken) && (
                  <span className="block truncate text-xs text-muted">
                    {c.taken ? 'Already connected to a workspace' : c.detail}
                  </span>
                )}
              </span>
            </button>
          ))}
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
