import type { IntegrationKey } from '@torio/contracts';

export interface FieldDef {
  key: string;
  label: string;
  kind: 'text' | 'email' | 'select' | 'boolean';
  required: boolean;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** A fixed set of accepted values, checked on save. */
  pattern?: RegExp;
  patternMessage?: string;
  /** Changing it changes what the provider is asked, so a previous successful test no longer applies. */
  default?: string | boolean;
}
export interface SecretDef {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
}
export interface IntegrationDef {
  key: IntegrationKey;
  name: string;
  category: 'Email' | 'Marketing & Analytics' | 'Payments';
  description: string;
  requirements: string[];
  fields: FieldDef[];
  secrets: SecretDef[];
}

export const INTEGRATIONS: Record<IntegrationKey, IntegrationDef> = {
  mailgun: {
    key: 'mailgun',
    name: 'Mailgun',
    category: 'Email',
    description:
      'Centralized email delivery for Torio: verification, password reset, invitations, order and billing emails. Super Admin controls the provider; workspaces never see these credentials.',
    requirements: [
      'A Mailgun account with a verified sending domain',
      'A private API key (not the public validation key)',
      'The HTTP webhook signing key, from Mailgun → Webhooks',
    ],
    fields: [
      {
        key: 'region',
        label: 'API region',
        kind: 'select',
        required: true,
        default: 'US',
        options: [
          { value: 'US', label: 'United States (api.mailgun.net)' },
          { value: 'EU', label: 'Europe (api.eu.mailgun.net)' },
        ],
      },
      {
        key: 'domain',
        label: 'Sending domain',
        kind: 'text',
        required: true,
        placeholder: 'mg.example.com',
        pattern: /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i,
        patternMessage: 'Enter a domain such as mg.example.com',
      },
      { key: 'fromName', label: 'From name', kind: 'text', required: true, placeholder: 'Torio' },
      {
        key: 'fromEmail',
        label: 'From email',
        kind: 'email',
        required: true,
        hint: 'Must belong to the sending domain.',
      },
      { key: 'replyTo', label: 'Reply-To email', kind: 'email', required: false },
    ],
    secrets: [
      { key: 'apiKey', label: 'API key', required: true },
      {
        key: 'webhookSigningKey',
        label: 'Webhook signing key',
        required: false,
        hint: 'Used to verify delivery events from Mailgun. Delivery tracking stays off until it is saved.',
      },
    ],
  },
  torio_meta_pixel: {
    key: 'torio_meta_pixel',
    name: 'Torio Meta Pixel',
    category: 'Marketing & Analytics',
    description:
      'Tracks visitors and conversions on Torio’s own marketing website with a Meta Pixel and the Conversions API. Completely separate from any workspace’s own Pixel.',
    requirements: [
      'A Meta Pixel (dataset) owned by Torio',
      'A Conversions API access token for that Pixel',
      'A test event code from Events Manager, to try events safely',
    ],
    fields: [
      {
        key: 'pixelId',
        label: 'Meta Pixel ID',
        kind: 'text',
        required: true,
        placeholder: '1234567890',
        pattern: /^\d{8,20}$/,
        patternMessage: 'A Pixel ID is 8 to 20 digits',
      },
      {
        key: 'testEventCode',
        label: 'Test event code',
        kind: 'text',
        required: false,
        placeholder: 'TEST12345',
        pattern: /^[A-Za-z0-9_-]{3,40}$/,
        patternMessage: 'Use letters and digits only',
      },
      {
        key: 'browserTracking',
        label: 'Browser tracking',
        kind: 'boolean',
        required: false,
        hint: 'Loads the Pixel on Torio’s public marketing pages only.',
        default: false,
      },
      {
        key: 'serverTracking',
        label: 'Server-side tracking',
        kind: 'boolean',
        required: false,
        hint: 'Sends verified events through the Conversions API.',
        default: false,
      },
    ],
    secrets: [{ key: 'accessToken', label: 'Conversions API access token', required: true }],
  },
  sslcommerz: {
    key: 'sslcommerz',
    name: 'SSLCommerz',
    category: 'Payments',
    description:
      'Platform payment gateway for Torio subscriptions and invoices. A plan is only activated after Torio validates the payment with SSLCommerz on the server.',
    requirements: [
      'An SSLCommerz store (a sandbox store for testing)',
      'The store ID and store password',
      'Live mode only after sandbox payments have been tested',
    ],
    fields: [
      {
        key: 'environment',
        label: 'Environment',
        kind: 'select',
        required: true,
        default: 'sandbox',
        options: [
          { value: 'sandbox', label: 'Sandbox (test payments)' },
          { value: 'live', label: 'Live (real payments)' },
        ],
      },
      {
        key: 'storeId',
        label: 'Store ID',
        kind: 'text',
        required: true,
        pattern: /^[A-Za-z0-9_.@-]{3,60}$/,
        patternMessage: 'A store ID has letters, digits and . _ @ - only',
      },
      {
        key: 'currencies',
        label: 'Supported currencies',
        kind: 'text',
        required: true,
        default: 'BDT',
        hint: 'Comma separated ISO codes the store accepts, e.g. BDT,USD.',
        pattern: /^[A-Z]{3}(,\s*[A-Z]{3})*$/,
        patternMessage: 'Use three-letter codes such as BDT,USD',
      },
    ],
    secrets: [{ key: 'storePassword', label: 'Store password', required: true }],
  },
};
