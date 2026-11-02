'use client';

import { Ban, Check, CircleHelp, Inbox as InboxIcon, Minus, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { fmtAgo } from '@/features/inbox/format';
import { useTeams } from '@/features/team/queries';
import { useMembers } from '@/features/inbox/queries';
import { useWorkspace } from '@/lib/workspace';
import { useChannelActivity, useChannelMutations } from '../queries';
import { STATUS_INFO, type Channel } from '../types';
import { Hint, ProviderMark, StatusPill } from './bits';

interface Props {
  channel: Channel;
  canManage: boolean;
  canAudit: boolean;
  onClose: () => void;
}
const heading = 'm-0 mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint';
const HEALTH = [
  ['Authorization', 'Whether the provider still allows Torio to act for this account.'],
  ['API connectivity', 'Whether Torio can reach the provider right now.'],
  ['Webhook', 'Whether the provider is delivering events to Torio.'],
  ['Sending messages', 'Whether replies can be handed to the provider.'],
  ['Receiving messages', 'Whether new customer messages arrive.'],
] as const;

export function ChannelDrawer({ channel: c, canManage, canAudit, onClose }: Props) {
  const { toast, registerEscape } = useShell();
  const { workspaceId: ws } = useWorkspace();
  const mut = useChannelMutations(ws);
  const members = useMembers(ws);
  const teams = useTeams(ws);
  const acts = useChannelActivity(ws, c.id, canAudit);
  const [name, setName] = useState(c.displayName);
  const [nameErr, setNameErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);

  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');
  const patch = (body: Parameters<typeof mut.update.mutate>[0]['body'], ok: string) =>
    mut.update.mutate({ id: c.id, body }, { onSuccess: () => toast(ok), onError: err });
  const saveName = () => {
    const v = name.trim();
    if (!v) return setNameErr('Display name is required.');
    setNameErr('');
    if (v !== c.displayName) patch({ displayName: v }, 'Channel renamed');
  };
  const disconnected = c.status === 'DISCONNECTED';
  const needsFix = c.status === 'NEEDS_ATTENTION' || c.status === 'EXPIRED';

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-[rgba(13,37,61,0.25)]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Channel: ${c.displayName}`}
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)] sm:w-[500px]"
      >
        <header className="flex items-start gap-3 border-b border-line-subtle px-5 py-4">
          <ProviderMark provider={c.provider} size={42} />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-base font-semibold">{c.displayName}</h2>
            <div className="truncate text-[13px] text-muted">
              {c.accountName ?? 'No account details'}
              {c.accountMask ? ` · ${c.accountMask}` : ''}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusPill status={c.status} />
              {c.isSample && (
                <span className="rounded-md bg-wash-2 px-2 py-0.5 text-[11.5px] text-faint">
                  Sample record
                </span>
              )}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close channel details"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/inbox?channel=${c.provider}`}>
                <InboxIcon size={13} />
                Open Inbox
              </Link>
            </Button>
            {(needsFix || disconnected) && (
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Reconnecting needs the provider connection, which isn’t built yet."
              >
                <RefreshCw size={13} />
                Reconnect
              </Button>
            )}
            {canManage && !disconnected && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto text-danger"
                onClick={() => setConfirm(true)}
              >
                <Ban size={13} />
                Disconnect
              </Button>
            )}
          </div>
          {(needsFix || disconnected) && (
            <p
              role="status"
              className="mb-4 mt-0 rounded-lg bg-[#FBFBFC] p-3 text-[13px] text-muted"
            >
              {STATUS_INFO[c.status].help} Reconnecting isn&apos;t available yet because provider
              connections aren&apos;t built.
            </p>
          )}
          {c.isSample && (
            <p
              role="status"
              className="mb-4 mt-0 rounded-lg bg-primary-tint p-3 text-[13px] text-muted"
            >
              This is a development sample. There is no live provider behind it, so nothing is sent
              or received through it.
            </p>
          )}

          <section aria-labelledby="ch-overview">
            <h3 id="ch-overview" className={heading}>
              Overview
            </h3>
            <dl className="m-0 grid grid-cols-[130px_1fr] gap-y-1.5 text-[13px]">
              <dt className="text-faint">Platform</dt>
              <dd className="m-0">{c.provider.charAt(0) + c.provider.slice(1).toLowerCase()}</dd>
              <dt className="text-faint">Connected</dt>
              <dd className="m-0">
                {c.connectedAt
                  ? new Date(c.connectedAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '—'}
              </dd>
              {c.disconnectedAt && (
                <>
                  <dt className="text-faint">Disconnected</dt>
                  <dd className="m-0">
                    {new Date(c.disconnectedAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </dd>
                </>
              )}
              <dt className="text-faint">Conversations</dt>
              <dd className="m-0">
                {c.conversationCount} total · {c.openConversations} open · {c.unreadConversations}{' '}
                unread
              </dd>
              <dt className="text-faint">Last conversation</dt>
              <dd className="m-0">
                {c.lastConversationAt ? `${fmtAgo(c.lastConversationAt)} ago` : '—'}
              </dd>
            </dl>
          </section>

          <section aria-labelledby="ch-health" className="mt-5">
            <h3 id="ch-health" className={heading}>
              Connection health
            </h3>
            <ul className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-[10px] border border-line p-0">
              {HEALTH.map(([k, tip]) => (
                <li key={k} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <Minus size={14} className="text-faint" aria-hidden />
                  <span className="flex-1">
                    {k} <Hint text={tip} />
                  </span>
                  <span className="text-xs text-muted">Not monitored yet</span>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-2 flex items-start gap-1.5 text-xs text-faint">
              <CircleHelp size={12} className="mt-0.5 shrink-0" />
              {c.lastHealthCheckAt
                ? `Last verified ${fmtAgo(c.lastHealthCheckAt)} ago.`
                : 'This connection has never been verified. Torio doesn’t treat a saved record as healthy.'}
            </p>
            {c.lastError && (
              <p
                role="alert"
                className="m-0 mt-2 rounded-lg bg-danger-soft p-2.5 text-[13px] text-[#8F2424]"
              >
                <b>Last error:</b> {c.lastError}
              </p>
            )}
          </section>

          <section aria-labelledby="ch-settings" className="mt-5">
            <h3 id="ch-settings" className={heading}>
              Settings
            </h3>
            <fieldset disabled={!canManage} className="m-0 flex flex-col gap-3 border-0 p-0">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ch-name" className="text-[13px] font-medium">
                  Display name
                </label>
                <div className="flex gap-2">
                  <input
                    id="ch-name"
                    value={name}
                    maxLength={80}
                    aria-invalid={!!nameErr}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()}
                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-line px-3 text-sm disabled:bg-[#FBFBFC]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.update.isPending || name.trim() === c.displayName}
                    onClick={saveName}
                  >
                    Save
                  </Button>
                </div>
                {nameErr && (
                  <span role="alert" className="text-xs text-danger">
                    {nameErr}
                  </span>
                )}
              </div>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                Default assignee
                <select
                  value={c.defaultAssignee?.id ?? ''}
                  onChange={(e) =>
                    patch({ defaultAssigneeId: e.target.value || null }, 'Default assignee updated')
                  }
                  className="h-10 rounded-[10px] border border-line bg-white px-2.5 text-sm font-normal disabled:bg-[#FBFBFC]"
                >
                  <option value="">No default</option>
                  {members.data?.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                Default team
                <select
                  value={c.defaultTeam?.id ?? ''}
                  onChange={(e) =>
                    patch({ defaultTeamId: e.target.value || null }, 'Default team updated')
                  }
                  className="h-10 rounded-[10px] border border-line bg-white px-2.5 text-sm font-normal disabled:bg-[#FBFBFC]"
                >
                  <option value="">No default</option>
                  {teams.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="m-0 text-xs text-faint">
                Defaults are stored now and will be applied to new conversations once messages
                arrive through this channel. Existing conversations aren&apos;t reassigned.
              </p>
            </fieldset>
            {!canManage && (
              <p className="m-0 mt-2 text-xs text-muted">
                Only admins and owners can change channel settings.
              </p>
            )}
          </section>

          <section aria-labelledby="ch-activity" className="mt-5">
            <h3 id="ch-activity" className={heading}>
              Recent activity
            </h3>
            {!canAudit ? (
              <p className="m-0 text-[13px] text-muted">
                Activity history is visible to admins and owners.
              </p>
            ) : acts.isPending ? (
              <Skeleton className="h-10" />
            ) : acts.isError ? (
              <p role="alert" className="m-0 text-[13px] text-danger">
                Couldn&apos;t load activity.
              </p>
            ) : acts.data.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">No recorded changes yet.</p>
            ) : (
              <ol className="m-0 list-none p-0">
                {acts.data.map((a) => (
                  <li key={a.id} className="border-l border-line-subtle pb-3 pl-3 last:pb-0">
                    <p className="m-0 flex items-start gap-1.5 text-[13px]">
                      <Check size={12} className="mt-1 shrink-0 text-faint" />
                      {a.description}
                    </p>
                    <div className="text-xs text-faint">
                      {a.actor ? `${a.actor.name} · ` : ''}
                      {new Date(a.createdAt).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
      {confirm && (
        <ConfirmDialog
          title={`Disconnect ${c.displayName}?`}
          body="Torio will stop sending and receiving messages on this channel. Your conversation history and customers are kept and stay in the Inbox. You can't reconnect from here until provider connections are built."
          confirmLabel="Disconnect"
          busy={mut.disconnect.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            mut.disconnect.mutate(c.id, {
              onSuccess: () => {
                toast('Channel disconnected. History kept.');
                setConfirm(false);
              },
              onError: (e) => {
                err(e);
                setConfirm(false);
              },
            })
          }
        />
      )}
    </>
  );
}
