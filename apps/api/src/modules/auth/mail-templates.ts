/**
 * Torio's email templates. Every template returns a subject, a plain-text body and a responsive HTML body, from the same
 * variables, so the two never disagree. Variables are HTML-escaped in the HTML version. Platform and security emails keep
 * Torio's identity; customer-facing ones (`workspace_notice`) carry the workspace's name and logo.
 */
export type TemplateKey =
  | 'verify_email'
  | 'password_reset'
  | 'password_code'
  | 'social_confirm'
  | 'account_deletion'
  | 'workspace_notice'
  | 'test';

export interface Brand {
  name: string;
  /** Absolute https address of a logo image, or null for the name only. */
  logoUrl: string | null;
}
export interface Rendered {
  subject: string;
  text: string;
  html: string;
}
type Vars = Record<string, string | undefined>;

export const TORIO_BRAND = (webUrl: string): Brand => ({
  name: 'Torio',
  logoUrl: `${webUrl.replace(/\/$/, '')}/torio-logo.png`,
});

const esc = (s: string | undefined) =>
  (s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
/** Only http(s) links may become a button: a variable can never inject another scheme. */
const safeUrl = (u: string | undefined) => (u && /^https?:\/\//i.test(u) ? u : null);

interface Spec {
  subject: string;
  heading: string;
  /** Paragraphs before the button, then after. */
  before: string[];
  button?: { label: string; url: string | undefined };
  code?: string;
  after: string[];
  /** Which identity the email carries. */
  scope: 'platform' | 'workspace';
}

const specs: Record<TemplateKey, (v: Vars) => Spec> = {
  verify_email: (v) => ({
    subject: 'Verify your email for Torio',
    heading: 'Verify your email',
    before: [
      `Hi ${v.name ?? 'there'},`,
      'Confirm this email address to finish setting up your Torio account.',
    ],
    button: { label: 'Verify email', url: v.link },
    after: [
      "The link works once and expires in 24 hours. If you didn't create an account, ignore this message.",
    ],
    scope: 'platform',
  }),
  password_reset: (v) => ({
    subject: 'Reset your Torio password',
    heading: 'Reset your password',
    before: ['We received a request to reset your Torio password.'],
    button: { label: 'Choose a new password', url: v.link },
    after: [
      "The link works once and expires in 1 hour. If you didn't ask for this, ignore this message; your password hasn't changed.",
    ],
    scope: 'platform',
  }),
  password_code: (v) => ({
    subject: 'Your Torio code',
    heading: 'Your code',
    before: [`Hi ${v.name ?? 'there'},`, 'Use this code to set a password for your Torio account.'],
    code: v.code,
    after: [
      "It works once and expires in 10 minutes. If you didn't ask for this, you can ignore this message; nothing changes without the code.",
    ],
    scope: 'platform',
  }),
  social_confirm: (v) => ({
    subject: 'Confirm your email to finish signing in to Torio',
    heading: 'Confirm your email',
    before: ['Confirm this email address to finish signing in to Torio.'],
    button: { label: 'Confirm and continue', url: v.link },
    after: [
      "The link works once and expires in 30 minutes. If this wasn't you, ignore this message.",
    ],
    scope: 'platform',
  }),
  account_deletion: (v) => ({
    subject: 'Confirm your Torio account deletion request',
    heading: 'Confirm account deletion',
    before: [
      `Hi ${v.name ?? 'there'},`,
      'We received a request to permanently delete your Torio account. To confirm it was you, use the button below.',
    ],
    button: { label: 'Confirm deletion request', url: v.link },
    after: [
      "The link works once and expires in 24 hours. If you didn't ask for this, ignore this message: nothing will be deleted.",
    ],
    scope: 'platform',
  }),
  workspace_notice: (v) => ({
    subject: v.subject ?? 'A message from your store',
    heading: v.title ?? 'A message from your store',
    before: (v.body ?? '').split(/\n{2,}/).filter(Boolean),
    button: v.ctaUrl ? { label: v.ctaLabel ?? 'Open', url: v.ctaUrl } : undefined,
    after: [],
    scope: 'workspace',
  }),
  test: () => ({
    subject: 'Torio email test',
    heading: 'Email is working',
    before: [
      'This is a test email from your Torio Super Admin.',
      'If you received it, sending through your configured provider works.',
    ],
    after: [],
    scope: 'platform',
  }),
};

export function renderMail(key: TemplateKey, vars: Vars, brand: Brand): Rendered {
  const s = specs[key](vars);
  const url = safeUrl(s.button?.url);
  const text = [
    ...s.before,
    ...(s.code ? [s.code] : []),
    ...(s.button && url ? [`${s.button.label}: ${url}`] : []),
    ...s.after,
    s.scope === 'workspace' ? brand.name : 'Torio',
  ].join('\n\n');
  const p = (t: string) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#17181c">${esc(t)}</p>`;
  const mark =
    brand.logoUrl && safeUrl(brand.logoUrl)
      ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" style="display:block;max-width:150px;max-height:48px;height:auto;width:auto;border:0" />`
      : `<span style="font-size:18px;font-weight:700;color:#17181c">${esc(brand.name)}</span>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
<tr><td style="padding:24px 28px 8px">${mark}</td></tr>
<tr><td style="padding:8px 28px 4px"><h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#17181c">${esc(s.heading)}</h1>
${s.before.map(p).join('')}
${s.code ? `<p style="margin:0 0 18px;font-size:28px;letter-spacing:6px;font-weight:700;color:#4f50d1;font-family:ui-monospace,Menlo,monospace">${esc(s.code)}</p>` : ''}
${s.button && url ? `<p style="margin:0 0 18px"><a href="${esc(url)}" style="display:inline-block;background:#5b5ce2;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${esc(s.button.label)}</a></p><p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#62656d;word-break:break-all">${esc(url)}</p>` : ''}
${s.after.map((t) => p(t)).join('')}</td></tr>
<tr><td style="padding:8px 28px 24px;font-size:12px;color:#62656d;border-top:1px solid #f0f1f3">${s.scope === 'workspace' ? esc(brand.name) : 'Sent by Torio'}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: s.subject, text, html };
}

export const SAMPLE_VARS: Record<TemplateKey, Vars> = {
  verify_email: { name: 'Alex', link: 'https://app.example.com/verify-email?token=sample' },
  password_reset: { link: 'https://app.example.com/reset-password?token=sample' },
  password_code: { name: 'Alex', code: '482913' },
  social_confirm: { link: 'https://app.example.com/auth/complete?token=sample' },
  account_deletion: { name: 'Alex', link: 'https://app.example.com/delete-account?token=sample' },
  workspace_notice: {
    subject: 'Your order is on its way',
    title: 'Your order is on its way',
    body: 'Hi Alex,\n\nYour order #1042 has shipped. You can track it with the button below.',
    ctaLabel: 'Track order',
    ctaUrl: 'https://example.com/track/1042',
  },
  test: {},
};
export const TEMPLATE_KEYS = Object.keys(SAMPLE_VARS) as TemplateKey[];
