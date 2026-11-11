'use client';

import {
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Store,
  KeyRound,
  Hourglass,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { useAuth } from '@/lib/auth';
import { LEGAL } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import {
  downloadMyData,
  usePrivacyRequests,
  useProfile,
  useRequestDeletion,
  type PrivacyRequest,
} from '../queries';
import { fmtDate } from '@/lib/datetime';

function Tile({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <Icon size={17} />
    </span>
  );
}

const Card = ({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    aria-label={label}
    className={cn('rounded-[14px] border border-line bg-white p-4 sm:p-5', className)}
  >
    {children}
  </section>
);

type ExportState =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'ready'; at: Date }
  | { kind: 'failed'; message: string };

const STATUS_BADGE: Record<ExportState['kind'], { label: string; bg: string; fg: string }> = {
  idle: { label: 'Not requested', bg: '#F1F2F5', fg: '#62656D' },
  preparing: { label: 'Preparing', bg: '#FFF5E4', fg: '#92560A' },
  ready: { label: 'Ready', bg: '#EAF8EF', fg: '#166534' },
  failed: { label: 'Failed', bg: '#FDEBEB', fg: '#991B1B' },
};

const REQUEST_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  VERIFIED: { label: 'Verified · awaiting review', bg: '#EDF3FF', fg: '#1E4FB8' },
  PROCESSING: { label: 'Processing', bg: '#FFF5E4', fg: '#92560A' },
  COMPLETED: { label: 'Completed', bg: '#EAF8EF', fg: '#166534' },
  REJECTED: { label: 'Declined', bg: '#FDEBEB', fg: '#991B1B' },
  PENDING_VERIFICATION: { label: 'Awaiting confirmation', bg: '#F1F2F5', fg: '#62656D' },
};
const Badge = ({ s }: { s: { label: string; bg: string; fg: string } }) => (
  <span
    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium"
    style={{ backgroundColor: s.bg, color: s.fg }}
  >
    {s.label}
  </span>
);

/**
 * Data & privacy: what Torio holds about the account, a personal data export, the privacy controls that really exist, an
 * account-deletion request, and the person's own request history. Controls that are not built are shown as unavailable,
 * never as a switch that does nothing, and nothing here makes a compliance claim.
 */
export function PrivacyPage() {
  const { toast } = useShell();
  const { user } = useAuth();
  const profile = useProfile().data;
  const { stores } = useWorkspace();
  const requests = usePrivacyRequests();
  const [exp, setExp] = useState<ExportState>({ kind: 'idle' });
  const [deleting, setDeleting] = useState(false);

  const runExport = async () => {
    if (exp.kind === 'preparing') return;
    setExp({ kind: 'preparing' });
    try {
      await downloadMyData();
      setExp({ kind: 'ready', at: new Date() });
      toast('Your data was downloaded');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not export your data';
      setExp({ kind: 'failed', message });
      toast.error(message);
    }
  };

  const list = requests.data ?? [];
  const active = list.find((r) => r.status === 'VERIFIED' || r.status === 'PROCESSING');
  const methods = [
    'Password',
    ...(profile?.providers ?? []).map((p) => (p === 'GOOGLE' ? 'Google' : 'Facebook')),
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3.5">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-primary-line bg-primary-soft text-primary"
        >
          <ShieldCheck size={22} />
        </span>
        <div>
          <h1 className="m-0 font-page-title">Data &amp; Privacy</h1>
          <p className="m-0 text-[13.5px] text-muted">Your data. Your privacy. Your control.</p>
        </div>
      </header>

      {/* data overview */}
      <Card label="Your data">
        <h2 className="m-0 mb-3 text-[15px] font-semibold">What Torio holds</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-line-subtle p-3.5">
            <div className="flex items-center gap-2.5">
              <Tile icon={UserRound} color="#5B5CE2" />
              <div className="text-[13.5px] font-semibold">Your account</div>
            </div>
            <ul className="m-0 mt-2.5 flex list-none flex-col gap-1.5 p-0 text-[13px] text-muted">
              <li className="flex items-center gap-2">
                <UserRound size={13} aria-hidden className="shrink-0 text-faint" />
                Profile: {profile?.name ?? user?.name ?? '—'},{' '}
                {profile?.email ?? user?.email ?? '—'}
              </li>
              <li className="flex items-center gap-2">
                <KeyRound size={13} aria-hidden className="shrink-0 text-faint" />
                Sign-in: {methods.join(', ')}
              </li>
              <li className="flex items-center gap-2">
                <Store size={13} aria-hidden className="shrink-0 text-faint" />
                {stores.length} store{stores.length === 1 ? '' : 's'} you belong to, and your role
                in each
              </li>
            </ul>
            <p className="m-0 mt-2.5 text-xs text-faint">
              Personal. This is what your export contains.
            </p>
          </div>
          <div className="rounded-xl border border-line-subtle p-3.5">
            <div className="flex items-center gap-2.5">
              <Tile icon={Store} color="#2B8FD9" />
              <div className="text-[13.5px] font-semibold">Store data</div>
            </div>
            <p className="m-0 mt-2.5 text-[13px] text-muted">
              Customers, conversations, orders, channels and settings belong to each store and its
              owner. They aren&apos;t part of your personal export, and one store&apos;s data is
              never shown in another.
            </p>
          </div>
        </div>
      </Card>

      {/* export */}
      <Card label="Download your data">
        <div className="flex flex-wrap items-start gap-3">
          <Tile icon={Download} color="#16A34A" />
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold">Download your data</h2>
              <Badge s={STATUS_BADGE[exp.kind]} />
            </div>
            <p className="m-0 mt-1 text-[13px] text-muted">
              Export a copy of your personal account information in JSON format.
            </p>
            <p className="m-0 mt-1 text-xs text-faint">
              Includes your profile, your stores and roles, and your signed-in devices. Never
              includes passwords, sign-in tokens, or other people&apos;s data.
            </p>
            {exp.kind === 'ready' && (
              <p
                role="status"
                className="m-0 mt-2 flex items-center gap-1.5 text-xs text-[#166534]"
              >
                <Check size={13} aria-hidden /> Saved to your device at{' '}
                {exp.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}. The
                file isn&apos;t kept on our servers.
              </p>
            )}
            {exp.kind === 'failed' && (
              <p role="alert" className="m-0 mt-2 flex items-center gap-1.5 text-xs text-danger">
                <CircleAlert size={13} aria-hidden /> {exp.message}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            disabled={exp.kind === 'preparing'}
            onClick={() => void runExport()}
          >
            {exp.kind === 'preparing' ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden /> Preparing…
              </>
            ) : (
              <>
                <Download size={14} aria-hidden />
                {exp.kind === 'ready'
                  ? 'Download again'
                  : exp.kind === 'failed'
                    ? 'Try again'
                    : 'Request data export'}
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* controls */}
      <Card label="Privacy controls">
        <h2 className="m-0 mb-1 text-[15px] font-semibold">Privacy controls</h2>
        <ul className="m-0 list-none divide-y divide-line-subtle p-0">
          <li className="flex flex-wrap items-center gap-3 py-3.5">
            <Tile icon={FileText} color="#5B5CE2" />
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-[13.5px] font-semibold">Privacy policy</div>
              <div className="text-[12.5px] text-muted">
                How Torio collects and uses personal data.
              </div>
            </div>
            <Link
              href="/privacy-policy"
              target="_blank"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
            >
              View policy <ChevronRight size={14} aria-hidden />
            </Link>
          </li>
          <li className="flex flex-wrap items-center gap-3 py-3.5">
            <Tile icon={SlidersHorizontal} color="#7C4DE8" />
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-[13.5px] font-semibold">Consent preferences</div>
              <div className="text-[12.5px] text-muted">Marketing and analytics choices.</div>
            </div>
            <span className="rounded-full bg-wash-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">
              Not available yet
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-3 py-3.5">
            <Tile icon={Hourglass} color="#D97706" />
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-[13.5px] font-semibold">Data retention</div>
              <div className="text-[12.5px] text-muted">
                {LEGAL.retention ?? 'No retention periods have been published yet.'}
              </div>
            </div>
            {!LEGAL.retention && (
              <span className="rounded-full bg-wash-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">
                Not configured
              </span>
            )}
          </li>
          <li className="flex flex-wrap items-center gap-3 py-3.5">
            <Tile icon={Trash2} color="#DC2626" />
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-[13.5px] font-semibold">Delete your account</div>
              <div className="text-[12.5px] text-muted">
                {active
                  ? `A request is already in progress (${REQUEST_STATUS[active.status]?.label.toLowerCase()}).`
                  : 'Request permanent deletion. A Torio administrator reviews it first.'}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-danger"
              disabled={!!active || requests.isPending}
              onClick={() => setDeleting(true)}
            >
              Request deletion
            </Button>
          </li>
        </ul>
      </Card>

      {/* request history */}
      <Card label="Privacy requests">
        <h2 className="m-0 mb-3 text-[15px] font-semibold">Your privacy requests</h2>
        {requests.isPending && <Skeleton className="h-16 w-full" />}
        {requests.isError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
          >
            Couldn&apos;t load your requests.
            <Button size="sm" variant="outline" onClick={() => void requests.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {requests.data && list.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-wash px-3.5 py-3 text-[13px] text-muted">
            <Clock size={15} aria-hidden className="shrink-0" />
            No privacy requests yet. Requests you make here appear in this list.
          </div>
        )}
        {list.length > 0 && <RequestTable rows={list} />}
      </Card>

      {deleting && (
        <DeleteDialog
          email={profile?.email ?? user?.email ?? ''}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

function RequestTable({ rows }: { rows: PrivacyRequest[] }) {
  const fmt = (iso: string | null) => (iso ? fmtDate(iso) : '—');
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-subtle text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint">
            {['Request', 'Reference', 'Created', 'Status', 'Completed'].map((h) => (
              <th key={h} scope="col" className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reference} className="border-b border-line-subtle align-top last:border-0">
              <td className="px-2 py-3 font-medium text-ink">Account deletion</td>
              <td className="px-2 py-3 text-xs tabular-nums text-muted">{r.reference}</td>
              <td className="whitespace-nowrap px-2 py-3 text-muted">{fmt(r.createdAt)}</td>
              <td className="px-2 py-3">
                <Badge s={REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING_VERIFICATION!} />
                {r.status === 'REJECTED' && r.rejectionReason && (
                  <p className="m-0 mt-1 max-w-[320px] text-xs text-muted">
                    {String(r.rejectionReason)}
                  </p>
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-3 text-muted">
                {fmt(r.processedAt ? String(r.processedAt) : null)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeleteDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const m = useRequestDeletion();
  const [via, setVia] = useState<'password' | 'email'>('password');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { sent: boolean; reference: string | null }>(null);
  const ready = understood && (via === 'email' || password.length > 0) && !m.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setError('');
    m.mutate(
      { ...(via === 'password' && { password }), reason: reason.trim() || undefined },
      {
        onSuccess: (r) =>
          setDone({
            sent: !!r.verificationSent,
            reference: r.reference ? String(r.reference) : null,
          }),
        onError: (er) => setError(er.message),
      },
    );
  };

  return (
    <Modal
      title="Request account deletion"
      onClose={onClose}
      className="max-w-[540px]"
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={m.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="delete-request-form"
              variant="destructive"
              disabled={!ready}
            >
              {m.isPending ? 'Submitting…' : 'Request deletion'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div role="status" className="flex flex-col gap-2 text-[13.5px]">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Check size={16} aria-hidden className="text-[#16A34A]" />
            {done.sent ? 'Check your email' : 'Request submitted'}
          </div>
          {done.sent ? (
            <p className="m-0 text-muted">
              We sent a confirmation link to {email}. The request only starts once you open it.
            </p>
          ) : (
            <p className="m-0 text-muted">
              Reference <b className="text-ink">{done.reference}</b>. A Torio administrator will
              review it, and you&apos;ll be emailed when it&apos;s done. You can follow it in your
              request list.
            </p>
          )}
        </div>
      ) : (
        <form id="delete-request-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-ink">What happens</div>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted">
              <li>You are signed out everywhere and can no longer sign in.</li>
              <li>
                You are removed from every store and team, and your name, email, phone and job title
                are replaced.
              </li>
              <li>
                Stores where you are the only member lose their connected channels. Their records
                are not erased by this request.
              </li>
              <li>
                If you own a store other people still use, the request is declined until you
                transfer ownership or remove them.
              </li>
              <li>
                An administrator reviews the request before anything changes. This cannot be undone.
              </li>
            </ul>
          </div>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-[12.5px] font-semibold text-ink">Confirm it is you</legend>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="via"
                checked={via === 'password'}
                onChange={() => setVia('password')}
              />
              Enter my password
            </label>
            {via === 'password' && (
              <input
                type="password"
                autoComplete="current-password"
                aria-label="Password"
                placeholder="Your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className={controlCls}
              />
            )}
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="via"
                checked={via === 'email'}
                onChange={() => setVia('email')}
              />
              Email me a confirmation link (for accounts without a password)
            </label>
          </fieldset>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Reason (optional)
            <textarea
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={cn(controlCls, 'h-auto resize-y p-2 font-normal')}
            />
          </label>
          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5"
            />
            I understand this is permanent and can&apos;t be undone.
          </label>
          {error && (
            <p
              role="alert"
              className="m-0 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
