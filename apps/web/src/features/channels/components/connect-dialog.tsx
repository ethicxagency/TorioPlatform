'use client';

import { Check, ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { useConnectWhatsApp, useMetaConfig, useMetaStart } from '../queries';
import type { ProviderInfo } from '../types';
import { ProviderMark } from './bits';
import { useWhatsAppSignup } from './meta-connect';

interface Props {
  providers: ProviderInfo[] | undefined;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onClose: () => void;
  /** Open the WhatsApp options directly, e.g. when reconnecting a number. */
  initialProvider?: string;
}

const FbMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z" />
  </svg>
);

/**
 * One entry point for Meta: "Continue with Facebook" discovers Messenger Pages, Instagram accounts and (when enabled)
 * existing WhatsApp numbers in a single authorization. WhatsApp also keeps Embedded Signup and a pasted-token fallback.
 */
export function ConnectDialog({
  providers,
  loading,
  error,
  onRetry,
  onClose,
  initialProvider,
}: Props) {
  const { workspaceId } = useWorkspace();
  const start = useMetaStart(workspaceId);
  const cfg = useMetaConfig(workspaceId, true);
  const connect = useConnectWhatsApp(workspaceId);
  const [wa, setWa] = useState({ displayName: '', phoneNumberId: '', accessToken: '' });
  const [manual, setManual] = useState(false);
  const [more, setMore] = useState(initialProvider === 'WHATSAPP');

  const metaProviders = providers?.filter((p) => p.method === 'oauth') ?? [];
  const metaReady = metaProviders.some((p) => p.state === 'available');
  const waInfo = providers?.find((p) => p.provider === 'WHATSAPP');
  const embeddedCfg =
    waInfo?.method === 'embedded_signup' && !manual && cfg.data?.appId && cfg.data.whatsappConfigId
      ? {
          appId: cfg.data.appId,
          graphVersion: cfg.data.graphVersion,
          configId: cfg.data.whatsappConfigId,
        }
      : null;
  const signup = useWhatsAppSignup(workspaceId, embeddedCfg);
  const waReady =
    wa.displayName.trim() &&
    /^\d{5,30}$/.test(wa.phoneNumberId.trim()) &&
    wa.accessToken.trim().length >= 20;

  return (
    <Modal
      title="Connect your channels"
      description="Bring WhatsApp, Instagram and Messenger into one inbox."
      onClose={onClose}
      className="sm:max-w-[560px]"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-14" />
        </div>
      ) : error ? (
        <div role="alert" className="text-center text-[13px]">
          <p className="text-danger">{error}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section
            aria-label="Continue with Facebook"
            className="rounded-xl border border-line p-4"
          >
            <p className="m-0 text-[13px] text-muted">
              Connect your Meta business accounts to Torio and manage WhatsApp, Instagram and
              Messenger conversations from one inbox.
            </p>
            <ul className="m-0 mt-3 flex list-none gap-2 p-0">
              {providers?.map((p) => (
                <li
                  key={p.provider}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-wash px-2.5 py-2 text-xs"
                >
                  <ProviderMark provider={p.provider} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {p.label.replace(' Business', '').replace(' Messaging', '')}
                    </span>
                    <span className="block text-faint">
                      {p.connectedCount > 0 ? `${p.connectedCount} connected` : 'Not connected'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {metaReady && cfg.data && (
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer font-medium text-ink">
                  What Facebook will ask for, and why
                </summary>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                  {cfg.data.permissions.map((p) => (
                    <li key={p.scope} className="flex items-start gap-2">
                      <Check size={13} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                      <span>
                        {p.reason} <code className="text-faint">{p.scope}</code>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mb-0 mt-2">
                  Your Facebook password is never shared with Torio, and you choose which accounts
                  to connect.
                </p>
              </details>
            )}
            <button
              type="button"
              disabled={!metaReady || start.isPending}
              onClick={() =>
                start.mutate(undefined, { onSuccess: (url) => window.location.assign(url) })
              }
              className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border-none bg-[#1877F2] text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-[#166FE5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1877F2]"
            >
              <FbMark />
              {start.isPending ? 'Opening Facebook…' : 'Continue with Facebook'}
            </button>
            {start.error && (
              <p role="alert" className="mb-0 mt-2 text-xs text-danger">
                {start.error.message}
              </p>
            )}
            {!metaReady && (
              <p
                role="status"
                className="mb-0 mt-3 flex items-start gap-2 rounded-lg bg-warning-soft p-2.5 text-xs text-[#7A4700]"
              >
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                {metaProviders[0]?.reason ?? 'Meta isn’t configured on this server.'} Nothing was
                connected.
              </p>
            )}
          </section>

          {waInfo && (
            <section aria-label="Other WhatsApp options" className="rounded-xl border border-line">
              <button
                type="button"
                aria-expanded={more}
                onClick={() => setMore(!more)}
                className="flex w-full cursor-pointer items-center justify-between rounded-xl border-none bg-transparent px-4 py-3 text-left text-[13px] font-medium text-ink"
              >
                Set up a new WhatsApp number or paste an access token
                <ChevronDown
                  size={15}
                  aria-hidden
                  className={cn(
                    'text-faint transition-transform duration-200',
                    more && 'rotate-180',
                  )}
                />
              </button>
              {more && (
                <div className="flex flex-col gap-2 border-t border-line-subtle px-4 pb-4 pt-3">
                  {waInfo.state !== 'available' ? (
                    <p role="status" className="m-0 text-xs text-muted">
                      {waInfo.reason} Nothing was connected.
                    </p>
                  ) : (
                    <>
                      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                        Display name
                        <Input
                          value={wa.displayName}
                          maxLength={60}
                          onChange={(e) => setWa({ ...wa, displayName: e.target.value })}
                        />
                      </label>
                      {embeddedCfg ? (
                        <>
                          <p className="m-0 text-xs text-muted">
                            Meta’s WhatsApp Embedded Signup lets you choose or create a business
                            portfolio, WhatsApp Business Account and phone number, and verify it.
                            Use this for numbers that aren’t registered yet.
                          </p>
                          {signup.error && (
                            <p role="alert" className="m-0 text-xs text-danger">
                              {signup.error}
                            </p>
                          )}
                          <Button
                            disabled={!wa.displayName.trim()}
                            loading={signup.busy}
                            onClick={() => void signup.start(wa.displayName.trim(), onClose)}
                          >
                            {signup.busy ? 'Waiting for Meta…' : 'Start WhatsApp setup'}
                          </Button>
                          <button
                            type="button"
                            onClick={() => setManual(true)}
                            className="cursor-pointer self-start rounded border-none bg-transparent p-0 text-xs font-medium text-primary hover:underline"
                          >
                            Use a Cloud API access token instead
                          </button>
                        </>
                      ) : (
                        <>
                          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                            Phone number ID (from Meta)
                            <Input
                              inputMode="numeric"
                              value={wa.phoneNumberId}
                              onChange={(e) => setWa({ ...wa, phoneNumberId: e.target.value })}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                            Access token
                            <Input
                              type="password"
                              autoComplete="off"
                              value={wa.accessToken}
                              onChange={(e) => setWa({ ...wa, accessToken: e.target.value })}
                            />
                          </label>
                          <p className="m-0 text-xs text-faint">
                            Torio checks the number with Meta before saving. The token is encrypted
                            and never shown again.
                          </p>
                          {connect.error && (
                            <p role="alert" className="m-0 text-xs text-danger">
                              {connect.error.message}
                            </p>
                          )}
                          <Button
                            disabled={!waReady || connect.isPending}
                            onClick={() => connect.mutate(wa, { onSuccess: onClose })}
                          >
                            {connect.isPending ? 'Verifying with Meta…' : 'Connect WhatsApp'}
                          </Button>
                          {waInfo.method === 'embedded_signup' && (
                            <button
                              type="button"
                              onClick={() => setManual(false)}
                              className="cursor-pointer self-start rounded border-none bg-transparent p-0 text-xs font-medium text-primary hover:underline"
                            >
                              Back to Embedded Signup
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
