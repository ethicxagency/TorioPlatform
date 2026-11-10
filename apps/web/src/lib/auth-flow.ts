import { env } from './env';

/** Same-site relative paths only: a crafted `next` can never send a customer to another site or the admin area. */
export function safeNext(value: string | null | undefined): string {
  if (!value || value.length > 300) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) return '/';
  if (
    /^\/(admin|login|signup|auth|forgot-password|reset-password|verify-email)(\/|\?|$)/.test(value)
  )
    return '/';
  return value;
}

export const oauthStartUrl = (provider: 'google' | 'facebook', next: string) =>
  `${env.NEXT_PUBLIC_API_URL}/api/v1/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(safeNext(next))}`;

/** For the browser-redirect endpoints the typed client doesn't describe. Sends cookies; never throws on HTTP errors. */
export async function authPost(path: string, body: unknown) {
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return { ok: res.ok, status: res.status, message: json?.error?.message, json };
}

/** Why a social sign-in ended on the error page, in words a customer can act on. */
export const SOCIAL_ERRORS: Record<string, { title: string; text: string }> = {
  cancelled: {
    title: 'Sign-in cancelled',
    text: 'You closed the provider’s window before finishing. Nothing was changed.',
  },
  invalid_state: {
    title: 'That sign-in link expired',
    text: 'For your security a sign-in must finish in the same browser it started in, within ten minutes. Please start again.',
  },
  provider_not_configured: {
    title: 'This sign-in method isn’t set up',
    text: 'The provider’s credentials haven’t been added to this Torio deployment yet. Use email and password, or ask the administrator to finish setup.',
  },
  provider_error: {
    title: 'The provider couldn’t sign you in',
    text: 'Google or Facebook returned an error. Please try again in a moment.',
  },
  invalid_token: {
    title: 'We couldn’t verify that sign-in',
    text: 'The provider’s response didn’t pass our security checks, so nothing was done. Please try again.',
  },
  email_unverified: {
    title: 'Your email isn’t verified',
    text: 'Verify the email on your provider account, then try again.',
  },
  account_exists: {
    title: 'An account with this email already exists',
    text: 'To protect your account we don’t link a social login to an email that hasn’t been verified. Sign in with your email and password instead.',
  },
  registration_closed: {
    title: 'Sign-ups are closed',
    text: 'New accounts can’t be created right now.',
  },
  account_disabled: {
    title: 'This account is disabled',
    text: 'Contact your workspace administrator for help.',
  },
  mail_not_configured: {
    title: 'We can’t confirm your email yet',
    text: 'This sign-in needs a confirmation email, but email delivery isn’t set up for this Torio deployment.',
  },
};
