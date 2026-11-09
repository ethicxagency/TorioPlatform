'use client';

import { Check, Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/lib/workspace';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
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
  /** Preselect a platform, e.g. when reconnecting a channel. */
  initialProvider?: string;
}

/**
 * Provider picker + prerequisites. A provider is only startable when the API reports `available`. Today none are,
 * so the flow explains what a connection will need and never pretends to connect.
 */
export function ConnectDialog({
  providers,
  loading,
  error,
  onRetry,
  onClose,
  initialProvider,
}: Props) {
  const [sel, setSel] = useState<string>(initialProvider ?? '');
  const chosen = providers?.find((p) => p.provider === sel);
  const { workspaceId } = useWorkspace();
  const connect = useConnectWhatsApp(workspaceId);
  const start = useMetaStart(workspaceId);
  const metaCfg = useMetaConfig(workspaceId, true);
  const [manual, setManual] = useState(false);
  const embedded =
    chosen?.provider === 'WHATSAPP' &&
    chosen.method === 'embedded_signup' &&
    !manual &&
    metaCfg.data?.appId &&
    metaCfg.data.whatsappConfigId
      ? {
          appId: metaCfg.data.appId,
          graphVersion: metaCfg.data.graphVersion,
          configId: metaCfg.data.whatsappConfigId,
        }
      : null;
  const signup = useWhatsAppSignup(workspaceId, embedded);
  const oauth = chosen?.state === 'available' && chosen.method === 'oauth';
  const [wa, setWa] = useState({ displayName: '', phoneNumberId: '', accessToken: '' });
  const isWa = chosen?.provider === 'WHATSAPP' && chosen.state === 'available' && !embedded;
  const waReady =
    wa.displayName.trim() &&
    /^\d{5,30}$/.test(wa.phoneNumberId.trim()) &&
    wa.accessToken.trim().length >= 20;
  return (
    <Modal
      title="Connect a channel"
      description="Choose the messaging platform you want to bring into Torio."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {oauth ? (
            <Button
              loading={start.isPending}
              onClick={() =>
                start.mutate(chosen!.provider as 'MESSENGER' | 'INSTAGRAM', {
                  onSuccess: (url) => window.location.assign(url),
                })
              }
            >
              {start.isPending ? 'Opening Meta…' : 'Continue with Meta'}
            </Button>
          ) : embedded ? (
            <Button
              disabled={!wa.displayName.trim()}
              loading={signup.busy}
              onClick={() => void signup.start(wa.displayName.trim(), onClose)}
            >
              {signup.busy ? 'Waiting for Meta…' : 'Continue with Meta'}
            </Button>
          ) : (
            <Button
              disabled={
                !chosen || chosen.state !== 'available' || !isWa || !waReady || connect.isPending
              }
              title={chosen?.state === 'unavailable' ? chosen.reason : undefined}
              onClick={() => connect.mutate(wa, { onSuccess: onClose })}
            >
              {connect.isPending ? 'Verifying with Meta…' : `Connect ${chosen?.label ?? 'channel'}`}
            </Button>
          )}
        </>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
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
          <div role="radiogroup" aria-label="Platform" className="flex flex-col gap-2">
            {providers?.map((p) => (
              <button
                key={p.provider}
                type="button"
                role="radio"
                aria-checked={sel === p.provider}
                onClick={() => setSel(p.provider)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left',
                  sel === p.provider
                    ? 'border-primary bg-primary-soft/60'
                    : 'border-line hover:bg-wash',
                )}
              >
                <ProviderMark provider={p.provider} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-xs text-muted">
                    {p.connectedCount > 0
                      ? `${p.connectedCount} already connected`
                      : 'Not connected'}
                  </span>
                </span>
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[11.5px] font-medium',
                    p.state === 'available'
                      ? 'bg-success-soft text-success'
                      : 'bg-wash-2 text-muted',
                  )}
                >
                  {p.state === 'available' ? 'Available' : 'Unavailable'}
                </span>
              </button>
            ))}
          </div>
          {chosen && (
            <div className="rounded-xl border border-line bg-[#FBFBFC] p-3.5 text-[13px]">
              <div className="mb-1.5 font-semibold">What {chosen.label} needs</div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {chosen.requirements.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-muted">
                    <Check size={13} className="mt-0.5 shrink-0 text-faint" />
                    {r}
                  </li>
                ))}
              </ul>
              {isWa && (
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Display name
                    <Input
                      value={wa.displayName}
                      maxLength={60}
                      onChange={(e) => setWa({ ...wa, displayName: e.target.value })}
                    />
                  </label>
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
                    Torio checks the number with Meta before saving. The token is encrypted and
                    never shown again.
                  </p>
                  {connect.error && (
                    <p role="alert" className="m-0 text-xs text-danger">
                      {connect.error.message}
                    </p>
                  )}
                </div>
              )}
              {oauth && (
                <div className="mt-3 flex flex-col gap-1.5 text-xs text-muted">
                  <p className="m-0">
                    You&apos;ll sign in with Facebook and choose{' '}
                    {chosen.provider === 'INSTAGRAM' ? 'an Instagram account' : 'a Page'}. Torio
                    asks only for permission to{' '}
                    {chosen.provider === 'INSTAGRAM'
                      ? 'read the account list, '
                      : 'list your Pages, '}
                    receive messages and reply to them. Your Meta password is never shared with
                    Torio.
                  </p>
                  {start.error && (
                    <p role="alert" className="m-0 text-danger">
                      {start.error.message}
                    </p>
                  )}
                </div>
              )}
              {chosen.provider === 'WHATSAPP' && chosen.method === 'embedded_signup' && (
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Display name
                    <Input
                      value={wa.displayName}
                      maxLength={60}
                      onChange={(e) => setWa({ ...wa, displayName: e.target.value })}
                    />
                  </label>
                  {!manual ? (
                    <>
                      <p className="m-0 text-xs text-muted">
                        Meta&apos;s Embedded Signup lets you choose or create your business
                        portfolio, WhatsApp Business Account and phone number, then verify the
                        number.
                      </p>
                      {signup.error && (
                        <p role="alert" className="m-0 text-xs text-danger">
                          {signup.error}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setManual(true)}
                        className="cursor-pointer self-start rounded border-none bg-transparent p-0 text-xs font-medium text-primary hover:underline"
                      >
                        Use a Cloud API access token instead
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setManual(false)}
                      className="cursor-pointer self-start rounded border-none bg-transparent p-0 text-xs font-medium text-primary hover:underline"
                    >
                      Back to Embedded Signup
                    </button>
                  )}
                </div>
              )}
              {chosen.state === 'unavailable' && (
                <p
                  role="status"
                  className="m-0 mt-3 flex items-start gap-2 rounded-lg bg-warning-soft p-2.5 text-xs text-[#7A4700]"
                >
                  <Info size={13} className="mt-0.5 shrink-0" />
                  {chosen.reason} Nothing was connected.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
