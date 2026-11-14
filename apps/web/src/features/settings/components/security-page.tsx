'use client';

import { passwordSchema, setPasswordSchema } from '@torio/contracts';
import { Check, KeyRound, Laptop } from 'lucide-react';
import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { FacebookF, GoogleG } from '@/features/auth/social-buttons';
import { fmtAgo } from '@/features/inbox/format';
import { Modal } from '@/features/leads/components/modal';
import {
  useChangePassword,
  useProfile,
  useRequestPasswordCode,
  useSessionMutations,
  useSessions,
  useSetPassword,
  type Profile,
  type SessionInfo,
} from '../queries';
import { Field, fieldErrors, inputCls, Notice, PageHeader, Section } from './bits';
import { useDirty } from './guard';

const EMPTY = { current: '', next: '', confirm: '' };

function PasswordForm({ onDone }: { onDone?: () => void }) {
  const { toast } = useShell();
  const change = useChangePassword();
  const [f, setF] = useState(EMPTY);
  const [errs, setErrs] = useState<Record<string, string>>({});
  useDirty(!!(f.current || f.next || f.confirm));
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setErrs((x) => ({ ...x, [k]: '' }));
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (change.isPending) return;
    const next: Record<string, string> = {};
    if (!f.current) next.current = 'Enter your current password';
    const pw = passwordSchema.safeParse(f.next);
    if (!pw.success) next.next = pw.error.issues[0]!.message;
    else if (f.next === f.current) next.next = 'Choose a password different from the current one';
    if (f.confirm !== f.next) next.confirm = 'The passwords don’t match';
    setErrs(next);
    if (Object.keys(next).length) return;
    change.mutate(
      { currentPassword: f.current, newPassword: f.next },
      {
        onSuccess: (r) => {
          setF(EMPTY);
          onDone?.();
          toast(
            r.revoked
              ? `Password changed. ${r.revoked} other device${r.revoked === 1 ? ' was' : 's were'} signed out.`
              : 'Password changed',
          );
        },
        onError: (e) => {
          const server = fieldErrors(e);
          setErrs(
            /current password/i.test(e.message)
              ? { current: e.message }
              : { form: e.message, ...(server.newPassword && { next: server.newPassword }) },
          );
        },
      },
    );
  };
  return (
    <form onSubmit={submit} noValidate className="grid max-w-[420px] gap-4">
      <Field label="Current password" htmlFor="pw-cur" required error={errs.current}>
        <input
          id="pw-cur"
          type="password"
          autoComplete="current-password"
          value={f.current}
          aria-invalid={!!errs.current}
          onChange={set('current')}
          className={inputCls}
        />
      </Field>
      <Field
        label="New password"
        htmlFor="pw-new"
        required
        error={errs.next}
        hint="At least 10 characters with an uppercase letter, a lowercase letter and a digit."
      >
        <input
          id="pw-new"
          type="password"
          autoComplete="new-password"
          value={f.next}
          aria-invalid={!!errs.next}
          onChange={set('next')}
          className={inputCls}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="pw-confirm" required error={errs.confirm}>
        <input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          value={f.confirm}
          aria-invalid={!!errs.confirm}
          onChange={set('confirm')}
          className={inputCls}
        />
      </Field>
      {errs.form && <Notice tone="error">{errs.form}</Notice>}
      <div>
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </Button>
      </div>
      <p className="m-0 text-xs text-faint">
        Changing your password signs you out of your other devices. This device stays signed in.
      </p>
    </form>
  );
}

function Sessions() {
  const { toast } = useShell();
  const q = useSessions();
  const m = useSessionMutations();
  const [confirm, setConfirm] = useState<SessionInfo | 'all' | null>(null);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
  const others = (q.data ?? []).filter((s) => !s.current).length;
  return (
    <>
      {q.isPending && <Skeleton className="h-24 w-full" />}
      {q.isError && <Notice tone="error">Couldn&apos;t load your devices.</Notice>}
      {q.data && (
        <ul className="m-0 list-none divide-y divide-line-subtle rounded-xl border border-line p-0">
          {q.data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
              <Laptop size={16} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  {s.device}
                  {s.current && (
                    <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] text-success">
                      This device
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-faint">
                  Last active {fmtAgo(s.lastActiveAt)}
                  {s.ipAddress ? ` · IP ${s.ipAddress}` : ''}
                </span>
              </span>
              {!s.current && (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Sign out ${s.device}`}
                  onClick={() => setConfirm(s)}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {others > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 text-danger"
          onClick={() => setConfirm('all')}
        >
          Sign out all other devices
        </Button>
      )}
      <p className="mb-0 mt-3 text-xs text-faint">
        A signed-out device loses access within about 15 minutes, when its current access expires.
        Locations aren&apos;t shown because they can&apos;t be determined reliably.
      </p>
      {confirm && (
        <ConfirmDialog
          title={confirm === 'all' ? 'Sign out all other devices?' : `Sign out ${confirm.device}?`}
          body="Anyone using it will have to sign in again."
          confirmLabel="Sign out"
          busy={m.revoke.isPending || m.revokeOthers.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const done = {
              onSuccess: () => {
                toast('Signed out');
                setConfirm(null);
              },
              onError: (e: Error) => {
                err(e);
                setConfirm(null);
              },
            };
            if (confirm === 'all') m.revokeOthers.mutate(undefined, done);
            else m.revoke.mutate(confirm.id, done);
          }}
        />
      )}
    </>
  );
}

const fmtDay = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

/** First password for an account that signs in with Google or Facebook: an emailed code proves the email, then the password is saved. */
function SetPasswordDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const { toast } = useShell();
  const code = useRequestPasswordCode();
  const set = useSetPassword();
  const [sent, setSent] = useState(false);
  const [f, setF] = useState({ code: '', next: '', confirm: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setErrs((x) => ({ ...x, [k]: '', form: '' }));
  };
  const send = () =>
    code.mutate(undefined, {
      onSuccess: () => {
        setSent(true);
        setErrs({});
      },
      onError: (e) => setErrs({ form: e.message }),
    });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (set.isPending) return;
    const r = setPasswordSchema.safeParse({
      code: f.code.trim(),
      newPassword: f.next,
      confirmPassword: f.confirm,
    });
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const i of r.error.issues)
        next[
          { code: 'code', newPassword: 'next', confirmPassword: 'confirm' }[String(i.path[0])] ??
            'form'
        ] ??= i.message;
      return setErrs(next);
    }
    set.mutate(r.data, {
      onSuccess: () => {
        toast('Password set. You can now sign in with your email and password.');
        onClose();
      },
      onError: (e) =>
        setErrs(/code|expired/i.test(e.message) ? { code: e.message } : { form: e.message }),
    });
  };
  return (
    <Modal
      title="Set a password"
      description="Add a password so you can also sign in with your email. Your Google or Facebook sign-in keeps working."
      onClose={set.isPending ? () => undefined : onClose}
    >
      {!sent ? (
        <div className="flex flex-col gap-3 text-[13.5px]">
          <p className="m-0 text-muted">
            To make sure it is you, we will email a 6-digit code to{' '}
            <b className="text-ink">{email}</b>.
          </p>
          {errs.form && <Notice tone="error">{errs.form}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={code.isPending} onClick={send}>
              Send code
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4">
          <p role="status" className="m-0 text-[13px] text-muted">
            We sent a code to <b className="text-ink">{email}</b>. It works for 10 minutes.{' '}
            <button
              type="button"
              onClick={send}
              disabled={code.isPending}
              className="cursor-pointer border-none bg-transparent p-0 text-primary underline disabled:opacity-50"
            >
              Send a new code
            </button>
          </p>
          <Field label="6-digit code" htmlFor="sp-code" required error={errs.code}>
            <input
              id="sp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={f.code}
              aria-invalid={!!errs.code}
              onChange={upd('code')}
              className={inputCls}
            />
          </Field>
          <Field label="New password" htmlFor="sp-new" required error={errs.next}>
            <input
              id="sp-new"
              type="password"
              autoComplete="new-password"
              value={f.next}
              aria-invalid={!!errs.next}
              onChange={upd('next')}
              className={inputCls}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="sp-confirm" required error={errs.confirm}>
            <input
              id="sp-confirm"
              type="password"
              autoComplete="new-password"
              value={f.confirm}
              aria-invalid={!!errs.confirm}
              onChange={upd('confirm')}
              className={inputCls}
            />
          </Field>
          {errs.form && <Notice tone="error">{errs.form}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={set.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={set.isPending}>
              Set password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MethodRow({
  icon,
  name,
  connected,
  statusLabel,
  detail,
  action,
}: {
  icon: React.ReactNode;
  name: string;
  connected: boolean;
  statusLabel: string;
  detail: string | null;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-line-subtle bg-wash"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-ink">{name}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${connected ? 'bg-success-soft text-success' : 'bg-wash-2 text-muted'}`}
          >
            {connected && <Check size={11} strokeWidth={3} aria-hidden />}
            {statusLabel}
          </span>
        </div>
        {detail && <div className="mt-0.5 truncate text-xs text-muted">{detail}</div>}
      </div>
      {action}
    </li>
  );
}

/**
 * How this account can sign in, from what the server really holds: a provider is "Connected" only when its identity exists, and
 * the password is "Set" only when the person chose one.
 */
function SignInMethods({ profile }: { profile: Profile }) {
  const [dialog, setDialog] = useState<'set' | 'change' | null>(null);
  const google = profile.identities.find((i) => i.provider === 'GOOGLE');
  const facebook = profile.identities.find((i) => i.provider === 'FACEBOOK');
  const provider = (id: typeof google, name: string, icon: React.ReactNode) => (
    <MethodRow
      icon={icon}
      name={name}
      connected={!!id}
      statusLabel={id ? 'Connected' : 'Not connected'}
      detail={
        id
          ? [id.email, fmtDay(id.connectedAt) && `connected ${fmtDay(id.connectedAt)}`]
              .filter(Boolean)
              .join(' · ')
          : `Sign in with ${name} using ${profile.email} to connect it.`
      }
    />
  );
  return (
    <>
      <ul aria-label="Sign-in methods" className="m-0 flex list-none flex-col gap-2.5 p-0">
        <MethodRow
          icon={<KeyRound size={18} className="text-primary" />}
          name="Email & password"
          connected={profile.hasPassword}
          statusLabel={profile.hasPassword ? 'Set' : 'Password not set'}
          detail={
            profile.hasPassword
              ? [
                  profile.email,
                  fmtDay(profile.passwordSetAt) && `set ${fmtDay(profile.passwordSetAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : `Add one to also sign in with ${profile.email}.`
          }
          action={
            <Button
              size="sm"
              variant={profile.hasPassword ? 'outline' : 'primary'}
              onClick={() => setDialog(profile.hasPassword ? 'change' : 'set')}
            >
              {profile.hasPassword ? 'Change password' : 'Set password'}
            </Button>
          }
        />
        {provider(google, 'Google', <GoogleG />)}
        {provider(facebook, 'Facebook', <FacebookF />)}
      </ul>
      {!profile.hasPassword && profile.providers.length === 0 && (
        <Notice tone="error">This account has no way to sign in. Set a password.</Notice>
      )}
      {dialog === 'set' && (
        <SetPasswordDialog email={profile.email} onClose={() => setDialog(null)} />
      )}
      {dialog === 'change' && (
        <Modal
          title="Change password"
          description="Other devices are signed out. Your Google and Facebook sign-ins are not affected."
          onClose={() => setDialog(null)}
        >
          <PasswordForm onDone={() => setDialog(null)} />
        </Modal>
      )}
    </>
  );
}

function SignInSection() {
  const q = useProfile();
  return (
    <Section id="sign-in" title="Sign-in methods" description="How you can sign in to Torio.">
      {q.isPending && <Skeleton className="h-40 w-full" />}
      {q.isError && (
        <Notice tone="error">Couldn’t load your sign-in methods. Please refresh the page.</Notice>
      )}
      {q.data && <SignInMethods profile={q.data} />}
    </Section>
  );
}

export function SecurityPage() {
  return (
    <div>
      <PageHeader
        title="Security"
        description="Protect your account and see where you’re signed in."
      />
      <SignInSection />
      <Section
        title="Signed-in devices"
        description="Browsers and apps currently signed in to your account."
      >
        <Sessions />
      </Section>
      <Section title="Two-factor authentication">
        <Notice>
          Not available. Torio signs you in with a password only, so there is nothing to enable or
          show here yet.
        </Notice>
      </Section>
      <Section title="Sign-in history">
        <Notice>
          Not available. Torio doesn&apos;t keep a viewable record of sign-in attempts, so none is
          shown rather than inventing one.
        </Notice>
      </Section>
    </div>
  );
}
