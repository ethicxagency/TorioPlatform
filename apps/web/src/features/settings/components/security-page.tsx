'use client';

import { passwordSchema } from '@torio/contracts';
import { Laptop } from 'lucide-react';
import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { fmtAgo } from '@/features/inbox/format';
import { useChangePassword, useSessionMutations, useSessions, type SessionInfo } from '../queries';
import { Field, fieldErrors, inputCls, Notice, PageHeader, Section } from './bits';
import { useDirty } from './guard';

const EMPTY = { current: '', next: '', confirm: '' };

function PasswordForm() {
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
  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');
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

export function SecurityPage() {
  return (
    <div>
      <PageHeader
        title="Security"
        description="Protect your account and see where you’re signed in."
      />
      <Section title="Password" description="Use a password you don’t use anywhere else.">
        <PasswordForm />
      </Section>
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
