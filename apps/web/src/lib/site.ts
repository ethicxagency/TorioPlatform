/**
 * Public-site facts, in one place. Anything not verified is a clearly marked placeholder that renders as a visible
 * "to be completed" note until the real value is supplied through the environment.
 */
export const SITE = {
  name: 'Torio',
  url: 'https://torio.nextupglobal.net',
  tagline: 'Every Conversation. One Intelligent Platform.',
  description:
    'Torio brings WhatsApp, Instagram and Facebook Messenger conversations into one team inbox, with customers, leads, orders and automation in the same workspace.',
  company: 'Nextup Global Ltd',
  /** Date the privacy policy text was last changed. It is a draft until legal review. */
  policyUpdated: '2026-11-11',
  policyUpdatedLabel: 'November 11, 2026',
} as const;

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** Values the company must supply before publication. `null` = not provided yet. */
export const LEGAL = {
  contactEmail: env(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
  privacyEmail: env(process.env.NEXT_PUBLIC_PRIVACY_EMAIL),
  companyAddress: env(process.env.NEXT_PUBLIC_COMPANY_ADDRESS),
  retention: env(process.env.NEXT_PUBLIC_RETENTION_SUMMARY),
} as const;

export const absoluteUrl = (path = '/') => new URL(path, SITE.url).toString();
