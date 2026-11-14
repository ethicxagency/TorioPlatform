'use client';

import { Inbox, Plug } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChannelIcon, type ChannelKind } from '@/components/channel-icon';
import { StatusPill } from '@/features/channels/components/bits';
import { ConnectDialog } from '@/features/channels/components/connect-dialog';
import { useProviders } from '@/features/channels/queries';
import type { Channel, Provider } from '@/features/channels/types';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';

const ORDER: Provider[] = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER'];
const COPY: Record<Provider, string> = {
  WHATSAPP: 'Answer customers on the WhatsApp number you already use for your business.',
  INSTAGRAM: 'Reply to direct messages sent to your Instagram professional account.',
  MESSENGER: 'Handle the messages people send to your Facebook Page.',
};

/** The network picture: the three channels flowing into one inbox. Decorative; the text carries the meaning. */
function Network() {
  const nodes: { kind: ChannelKind; x: number }[] = [
    { kind: 'WHATSAPP', x: 40 },
    { kind: 'INSTAGRAM', x: 150 },
    { kind: 'MESSENGER', x: 260 },
  ];
  return (
    <div aria-hidden className="relative mx-auto h-[132px] w-[300px] max-w-full">
      <svg viewBox="0 0 300 132" className="absolute inset-0 h-full w-full" fill="none">
        {nodes.map((n) => (
          <path
            key={n.kind}
            d={`M${n.x} 46 C ${n.x} 84, 150 70, 150 94`}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 4"
            className="text-line-input"
          />
        ))}
      </svg>
      {nodes.map((n) => (
        <span
          key={n.kind}
          style={{ left: n.x - 22 }}
          className="absolute top-0 flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white"
        >
          <ChannelIcon channel={n.kind} size={24} decorative />
        </span>
      ))}
      <span className="absolute bottom-0 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-[13px] bg-primary text-white">
        <Inbox size={20} aria-hidden />
      </span>
    </div>
  );
}

/**
 * The Inbox's first-run state for a workspace with no live messaging channel. "Live" means a persisted channel that is
 * CONNECTED and not a sample record; starting an OAuth flow creates nothing, so it never counts. Channels that exist but
 * need attention are listed with their real status. Every connect action opens the existing connect dialog.
 */
export function ChannelOnboarding({
  channels,
  canManage,
}: {
  /** Every channel of the workspace, as stored. */
  channels: Channel[];
  canManage: boolean;
}) {
  const { workspaceId } = useWorkspace();
  const [connect, setConnect] = useState<Provider | 'any' | null>(null);
  const providers = useProviders(workspaceId, true);
  const needsFix = channels.filter((c) => c.status !== 'CONNECTED' && !c.isSample);
  const problem = needsFix.length > 0;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10 @container">
      <div className="flex w-full max-w-[520px] flex-col items-center text-center">
        <Network />
        <h2 className="m-0 mt-6 text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {problem
            ? 'Reconnect a channel to receive messages'
            : 'Bring all your conversations into one inbox'}
        </h2>
        <p className="m-0 mt-2 max-w-[440px] text-[13.5px] leading-[1.55] text-muted">
          {problem
            ? 'A channel is saved but it is not connected, so customer messages cannot reach Torio. Reconnect it, or connect another one.'
            : 'Connect your messaging channels to start receiving customer messages, managing leads, and communicating with your customers from one place.'}
        </p>
        <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Button
            onClick={() => setConnect('any')}
            disabled={!canManage}
            title={canManage ? undefined : 'Only admins and owners can connect channels'}
          >
            <Plug size={16} aria-hidden /> Connect a channel
          </Button>
          <Button variant="outline" asChild>
            <Link href="/channels">Open Channels settings</Link>
          </Button>
        </div>
        <p className="m-0 mt-3 text-xs text-faint">
          {canManage
            ? 'Connect WhatsApp, Instagram, and Facebook Messenger to get started.'
            : 'Ask a workspace owner or admin to connect WhatsApp, Instagram or Facebook Messenger.'}
        </p>

        <ul
          className="m-0 mt-6 flex w-full list-none flex-col gap-2 p-0 text-left"
          aria-label="Channels"
        >
          {ORDER.map((p) => {
            const info = providers.data?.find((x) => x.provider === p);
            const mine = channels.filter((c) => c.provider === p && !c.isSample);
            const broken = mine.find((c) => c.status !== 'CONNECTED');
            const unavailable = info?.state === 'unavailable';
            return (
              <li
                key={p}
                className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-3 transition-colors duration-150 hover:border-line-input motion-reduce:transition-none"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-wash">
                  <ChannelIcon channel={p} size={22} decorative />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[13.5px] font-semibold text-ink">
                      {info?.label ??
                        (p === 'WHATSAPP'
                          ? 'WhatsApp Business'
                          : p === 'INSTAGRAM'
                            ? 'Instagram Messaging'
                            : 'Facebook Messenger')}
                    </span>
                    {broken ? (
                      <StatusPill status={broken.status} />
                    ) : (
                      <span className={cn('text-xs', unavailable ? 'text-warning' : 'text-faint')}>
                        {unavailable ? 'Unavailable' : 'Not connected'}
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-0.5 text-xs leading-[1.45] text-muted">
                    {unavailable && info ? info.reason : COPY[p]}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canManage || unavailable}
                  title={
                    !canManage
                      ? 'Only admins and owners can connect channels'
                      : unavailable
                        ? info?.reason
                        : undefined
                  }
                  aria-label={`${broken ? 'Reconnect' : 'Connect'} ${p === 'WHATSAPP' ? 'WhatsApp' : p === 'INSTAGRAM' ? 'Instagram' : 'Messenger'}`}
                  onClick={() => setConnect(p)}
                >
                  {broken ? 'Reconnect' : 'Connect'}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
      {connect && (
        <ConnectDialog
          providers={providers.data}
          loading={providers.isPending}
          error={providers.error?.message}
          onRetry={() => providers.refetch()}
          initialProvider={connect === 'any' ? undefined : connect}
          onClose={() => setConnect(null)}
        />
      )}
    </div>
  );
}
