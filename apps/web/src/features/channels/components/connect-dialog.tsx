'use client';

import { Check, Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import type { ProviderInfo } from '../types';
import { ProviderMark } from './bits';

interface Props {
  providers: ProviderInfo[] | undefined;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Provider picker + prerequisites. A provider is only startable when the API reports `available`. Today none are,
 * so the flow explains what a connection will need and never pretends to connect.
 */
export function ConnectDialog({ providers, loading, error, onRetry, onClose }: Props) {
  const [sel, setSel] = useState<string>('');
  const chosen = providers?.find((p) => p.provider === sel);
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
          <Button
            disabled={!chosen || chosen.state !== 'available'}
            title={chosen?.state === 'unavailable' ? chosen.reason : undefined}
          >
            Continue to {chosen?.label ?? 'provider'}
          </Button>
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
