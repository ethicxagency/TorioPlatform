'use client';

import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  FormAlert,
  inputCls,
  PasswordField,
  SubmitButton,
  TextField,
} from '@/features/auth/auth-ui';
import { cn } from '@/lib/utils';

type Status = 'PENDING_VERIFICATION' | 'VERIFIED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
const STATUS_TEXT: Record<Status, string> = {
  PENDING_VERIFICATION: 'Waiting for email confirmation',
  VERIFIED: 'Confirmed: waiting to be processed',
  PROCESSING: 'Being processed',
  COMPLETED: 'Completed',
  REJECTED: 'Could not be completed',
};

const msg = (e: unknown, fallback: string) =>
  (e as { error?: { message?: string } } | undefined)?.error?.message ?? fallback;

/** A request that really exists on the server, shown with its reference and current status. */
function RequestCard({
  reference,
  status,
  reason,
}: {
  reference: string;
  status: Status;
  reason?: string | null;
}) {
  return (
    <div role="status" className="rounded-2xl border border-line bg-wash p-5">
      <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <CheckCircle2 size={18} className="text-success" aria-hidden /> Request received
      </div>
      <dl className="m-0 mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-[14.5px]">
        <dt className="text-muted">Reference</dt>
        <dd className="m-0 font-mono text-[14px] font-medium">{reference}</dd>
        <dt className="text-muted">Status</dt>
        <dd className="m-0 font-medium">{STATUS_TEXT[status]}</dd>
        {reason && (
          <>
            <dt className="text-muted">Reason</dt>
            <dd className="m-0">{reason}</dd>
          </>
        )}
      </dl>
      <p className="m-0 mt-3 text-[13.5px] text-muted">
        Keep this reference to check the status of your request below.
      </p>
    </div>
  );
}

function StatusLookup() {
  const [ref, setRef] = useState('');
  const [found, setFound] = useState<{
    reference: string;
    status: Status;
    rejectionReason: string | null;
  } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const look = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setFound(null);
    try {
      const r = await api.GET('/api/v1/account-deletion/requests/{reference}', {
        params: { path: { reference: ref.trim() } },
      });
      if (r.data) setFound(r.data as never);
      else
        setErr(
          r.response.status === 404
            ? 'No request with that reference.'
            : 'Couldn’t check right now. Try again shortly.',
        );
    } catch {
      setErr('Couldn’t reach Torio. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="status-h" className="mt-12 border-t border-line pt-8">
      <h2 id="status-h" className="m-0 text-[20px] font-semibold">
        Check a request
      </h2>
      <form onSubmit={look} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          aria-label="Request reference"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="TDR-XXXXX-XXXXX-XXXXX-XXXXX"
          className={cn(inputCls, 'font-mono sm:flex-1')}
        />
        <button
          type="submit"
          disabled={busy || ref.trim().length < 8}
          className="h-12 cursor-pointer rounded-[var(--radius-input)] border border-line-input bg-white px-5 text-[14.5px] font-semibold text-ink hover:bg-wash disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Check status'}
        </button>
      </form>
      {err && (
        <div className="mt-3">
          <FormAlert>{err}</FormAlert>
        </div>
      )}
      {found && (
        <div className="mt-4">
          <RequestCard
            reference={found.reference}
            status={found.status}
            reason={found.rejectionReason}
          />
        </div>
      )}
    </section>
  );
}

function Verify({ token }: { token: string }) {
  const [state, setState] = useState<'working' | 'ok' | 'bad' | 'error'>('working');
  const [res, setRes] = useState<{ reference: string; status: Status } | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true; // the link is single use: a strict-mode double run must not burn it
    api
      .POST('/api/v1/account-deletion/verify', { body: { token } })
      .then((r) => {
        if (r.data) {
          setRes(r.data as never);
          setState('ok');
        } else setState(r.response.status === 400 ? 'bad' : 'error');
      })
      .catch(() => setState('error'));
  }, [token]);
  if (state === 'working')
    return (
      <p role="status" className="flex items-center gap-2 text-muted">
        <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />{' '}
        Confirming your request…
      </p>
    );
  if (state === 'ok' && res) return <RequestCard reference={res.reference} status={res.status} />;
  return (
    <FormAlert>
      {state === 'bad'
        ? 'This confirmation link is invalid, has expired, or was already used. Submit a new request below.'
        : 'Couldn’t confirm right now. Check your connection and open the link again.'}
    </FormAlert>
  );
}

export function DeleteAccount() {
  const token = useSearchParams().get('token');
  const { user, status: auth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ reference: string; status: Status } | { sent: string } | null>(
    null,
  );
  const signedIn = auth === 'authed' && !!user;
  const [byEmail, setByEmail] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!confirm) return setError('Please confirm that you understand deletion is permanent.');
    setBusy(true);
    try {
      if (signedIn && !byEmail) {
        if (!password) {
          setBusy(false);
          return setError('Enter your password to confirm it is you.');
        }
        const r = await api.POST('/api/v1/account-deletion/requests/me', {
          body: { password, reason: reason || undefined, confirm: true },
        });
        if (r.data?.reference && r.data.status)
          setDone({ reference: String(r.data.reference), status: r.data.status as Status });
        else
          setError(
            r.response.status === 401
              ? 'That password is not correct.'
              : msg(r.error, 'The request could not be created. Try again shortly.'),
          );
      } else if (signedIn) {
        const r = await api.POST('/api/v1/account-deletion/requests/me', {
          body: { reason: reason || undefined, confirm: true },
        });
        if (r.data?.verificationSent) setDone({ sent: user!.email });
        else if (r.data?.reference && r.data.status)
          setDone({ reference: String(r.data.reference), status: r.data.status as Status });
        else setError(msg(r.error, 'The request could not be created. Try again shortly.'));
      } else {
        const r = await api.POST('/api/v1/account-deletion/requests', {
          body: { email, reason: reason || undefined, confirm: true },
        });
        if (r.response.ok) setDone({ sent: email });
        else
          setError(
            r.response.status === 429
              ? 'Too many requests. Wait a minute and try again.'
              : msg(r.error, 'The request could not be sent. Try again shortly.'),
          );
      }
    } catch {
      setError('Couldn’t reach Torio. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="m-0 text-[36px] font-bold leading-tight tracking-[-0.025em] sm:text-[44px]">
        Delete Your Torio Account
      </h1>
      <p className="m-0 mt-4 text-[17px] leading-relaxed text-muted">
        You can request permanent deletion of your Torio account and associated personal
        information. Please review the information below before submitting your request.
      </p>
      <ul className="m-0 mt-6 flex list-disc flex-col gap-2 pl-6 text-[15.5px] leading-relaxed text-ink-secondary">
        <li>Account deletion removes access to the Torio customer account.</li>
        <li>
          Associated personal information will be deleted or anonymized according to the applicable
          retention policy.
        </li>
        <li>
          Some records may need to be retained where required by law, for security, fraud prevention
          or legitimate business obligations.
        </li>
        <li>
          Connected channel access and third-party permissions may need to be revoked separately.
        </li>
        <li>
          Account deletion is different from temporarily deactivating an account: it cannot be
          undone.
        </li>
        <li>
          If you own a workspace that other people still use, transfer ownership first: the request
          cannot be completed until then.
        </li>
      </ul>
      <p className="m-0 mt-4 text-[14.5px] text-muted">
        See our{' '}
        <Link href="/privacy-policy" className="text-primary">
          Privacy Policy
        </Link>{' '}
        for how information is handled.
      </p>

      <div className="mt-10">
        {token ? (
          <Verify token={token} />
        ) : done ? (
          'reference' in done ? (
            <RequestCard reference={done.reference} status={done.status} />
          ) : (
            <div
              role="status"
              className="rounded-2xl border border-line bg-wash p-5 text-[15px] leading-relaxed"
            >
              <b>Check your email.</b> If an account exists for {done.sent}, we’ve sent a link to
              confirm the request. Nothing is deleted until you open it, and it expires in 24 hours.
              Your request reference will be shown when you confirm.
            </div>
          )
        ) : (
          <form
            onSubmit={submit}
            noValidate
            className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6"
          >
            <h2 className="m-0 flex items-center gap-2 text-[20px] font-semibold">
              <ShieldAlert size={19} className="text-danger" aria-hidden /> Request account deletion
            </h2>
            {error && <FormAlert>{error}</FormAlert>}
            {signedIn && !byEmail ? (
              <>
                <p className="m-0 text-[14.5px] text-muted">
                  Signed in as <b className="text-ink">{user!.email}</b>. Enter your password to
                  confirm it is you.
                </p>
                <PasswordField
                  label="Password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setByEmail(true)}
                  className="w-fit cursor-pointer border-none bg-transparent p-0 text-[13.5px] font-medium text-primary underline"
                >
                  Use an email link instead (for accounts without a password)
                </button>
              </>
            ) : (
              <TextField
                label="Registered email address"
                type="email"
                autoComplete="email"
                value={signedIn ? user!.email : email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={signedIn}
                hint="We’ll email a confirmation link to this address. Nothing is deleted until the account owner opens it."
              />
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="del-reason" className="text-[13.5px] font-semibold text-ink">
                Reason for deletion <span className="font-normal text-faint">(optional)</span>
              </label>
              <textarea
                id="del-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={cn(inputCls, 'h-auto resize-y py-3')}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-[14.5px] leading-snug text-ink-secondary">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--color-primary)]"
              />
              I understand that deleting my account is permanent and cannot be undone.
            </label>
            <SubmitButton
              busy={busy}
              busyText="Sending request…"
              className="bg-danger hover:bg-[#A82828] active:bg-[#8F2424]"
            >
              Request Account Deletion
            </SubmitButton>
          </form>
        )}
      </div>
      <StatusLookup />
    </div>
  );
}
