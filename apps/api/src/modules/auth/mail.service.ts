import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { isLive, loadStored, statusOf } from '../admin/integrations/state';
import { mailgunBase } from '../admin/integrations/provider-checks';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { renderMail, TORIO_BRAND, type Brand, type TemplateKey } from './mail-templates';

export type MailProvider = 'mailgun' | 'resend';
interface MailgunCreds {
  region: string;
  domain: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  apiKey: string;
  signingKey: string | null;
}
interface Resolved {
  provider: MailProvider | null;
  mailgun: MailgunCreds | null;
  at: number;
}
export interface SendOptions {
  /** The template (or a short label) recorded in the delivery log. */
  kind?: string;
  html?: string;
  workspaceId?: string;
  userId?: string;
  /** Use this provider even if it is not the active one (the Mailgun test email). */
  force?: MailProvider;
}

const CACHE_MS = 5_000;

/**
 * Torio's single email sender. It uses Mailgun when Super Admin has enabled it and the connection is verified, and otherwise
 * the Resend settings from the environment, so existing deployments keep working until Mailgun is switched on. Every message is
 * logged (never its body): the provider accepting it is recorded as ACCEPTED, and only the provider's delivery events move it
 * to DELIVERED. Without any provider nothing can be sent, and callers (and the sign-in page) say so rather than pretending.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly log = new Logger(MailService.name);
  fetch: typeof fetch = (...a) => fetch(...a);
  private cache: Resolved | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly c: AppConfig,
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
  ) {}

  async onModuleInit() {
    await this.refresh().catch(() => undefined);
  }

  private get resendReady() {
    return !!(this.c.RESEND_API_KEY && this.c.MAIL_FROM);
  }

  /** Mailgun's settings with the key decrypted, when it is verified (and, unless `anyState`, switched on). */
  private async loadMailgun(anyState = false): Promise<MailgunCreds | null> {
    try {
      const s = await loadStored(this.prisma, 'mailgun');
      const usable = anyState ? statusOf('mailgun', s) === 'VERIFIED' : isLive('mailgun', s);
      if (!usable || !this.crypto.configured || !s.secrets.apiKey) return null;
      const v = s.values;
      return {
        region: String(v.region ?? 'US'),
        domain: String(v.domain),
        fromName: String(v.fromName),
        fromEmail: String(v.fromEmail),
        replyTo: v.replyTo ? String(v.replyTo) : null,
        apiKey: this.crypto.decrypt(s.secrets.apiKey),
        signingKey: s.secrets.webhookSigningKey
          ? this.crypto.decrypt(s.secrets.webhookSigningKey)
          : null,
      };
    } catch {
      return null;
    }
  }

  /** Decides which provider is active. Cheap to call: it reads the database at most every few seconds. */
  async refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      const mailgun = await this.loadMailgun();
      this.cache = {
        mailgun,
        provider: mailgun ? 'mailgun' : this.resendReady ? 'resend' : null,
        at: Date.now(),
      };
    })().finally(() => {
      this.refreshing = null;
    });
    await this.refreshing;
  }

  private current(): Resolved {
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS)
      void this.refresh().catch(() => undefined);
    const mailgun = this.cache?.mailgun ?? null;
    // The Resend settings are read live from the environment; only Mailgun (a database read) is cached.
    return {
      mailgun,
      provider: mailgun ? 'mailgun' : this.resendReady ? 'resend' : null,
      at: this.cache?.at ?? 0,
    };
  }

  /** Whether any provider can send right now. */
  get configured() {
    return this.current().provider !== null;
  }
  get provider(): MailProvider | null {
    return this.current().provider;
  }

  /** The Mailgun webhook signing key, only while Mailgun is the active provider. */
  async webhookSigningKey(): Promise<string | null> {
    await this.refresh();
    return this.cache?.mailgun?.signingKey ?? null;
  }

  brand(name?: string, logoUrl?: string | null): Brand {
    return name ? { name, logoUrl: logoUrl ?? null } : TORIO_BRAND(this.c.WEB_URL);
  }

  /** Renders a template and sends it. Returns whether the provider accepted the message. */
  async sendTemplate(
    key: TemplateKey,
    to: string,
    vars: Record<string, string | undefined>,
    opts: Omit<SendOptions, 'html' | 'kind'> & { brand?: Brand } = {},
  ): Promise<boolean> {
    const r = renderMail(key, vars, opts.brand ?? this.brand());
    return this.send(to, r.subject, r.text, { ...opts, kind: key, html: r.html });
  }

  /** Returns whether the provider accepted the message (not that it was delivered). Never logs the body. */
  async send(to: string, subject: string, text: string, opts: SendOptions = {}): Promise<boolean> {
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS)
      await this.refresh().catch(() => undefined);
    const state = this.current();
    const provider = opts.force ?? state.provider;
    // The Mailgun test email goes out while Mailgun is verified but not yet switched on.
    if (provider === 'mailgun' && opts.force && !state.mailgun)
      state.mailgun = await this.loadMailgun(true);
    if (
      !provider ||
      (provider === 'mailgun' && !state.mailgun) ||
      (provider === 'resend' && !this.resendReady)
    )
      return false;
    const logId = randomUUID();
    const row = await this.prisma.client.emailDeliveryLog
      .create({
        data: {
          id: logId,
          provider,
          kind: opts.kind ?? 'message',
          toAddress: to.toLowerCase(),
          subject: subject.slice(0, 200),
          workspaceId: opts.workspaceId ?? null,
          userId: opts.userId ?? null,
        },
      })
      .catch(() => null); // a logging problem must never stop a security email
    const out =
      provider === 'mailgun'
        ? await this.viaMailgun(state.mailgun!, to, subject, text, opts.html, logId)
        : await this.viaResend(to, subject, text, opts.html);
    if (row)
      await this.prisma.client.emailDeliveryLog
        .update({
          where: { id: logId },
          data: out.ok
            ? {
                status: 'ACCEPTED',
                acceptedAt: new Date(),
                providerMessageId: out.messageId,
                attempts: out.attempts,
              }
            : { status: 'FAILED', error: out.error, attempts: out.attempts },
        })
        .catch(() => undefined);
    return out.ok;
  }

  private async attempt<T>(run: () => Promise<{ ok: boolean; retry: boolean; value: T }>) {
    // One quick retry for a network failure or a 5xx; anything else (a refusal) is final.
    let last = await run();
    let attempts = 1;
    if (!last.ok && last.retry) {
      await new Promise((r) => setTimeout(r, 400));
      last = await run();
      attempts = 2;
    }
    return { ...last, attempts };
  }

  private async viaMailgun(
    m: MailgunCreds,
    to: string,
    subject: string,
    text: string,
    html: string | undefined,
    logId: string,
  ) {
    const form = new URLSearchParams({
      from: `${m.fromName} <${m.fromEmail}>`,
      to,
      subject,
      text,
      'v:log_id': logId,
    });
    if (html) form.set('html', html);
    if (m.replyTo) form.set('h:Reply-To', m.replyTo);
    const r = await this.attempt(async () => {
      try {
        const res = await this.fetch(
          `${mailgunBase(m.region)}/v3/${encodeURIComponent(m.domain)}/messages`,
          {
            method: 'POST',
            headers: {
              authorization: `Basic ${Buffer.from(`api:${m.apiKey}`).toString('base64')}`,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: form,
            signal: AbortSignal.timeout(12_000),
          },
        );
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { id?: string };
          return {
            ok: true,
            retry: false,
            value: { id: body.id?.replace(/^<|>$/g, '') ?? null, error: null as string | null },
          };
        }
        this.log.warn(`Mailgun refused a message (HTTP ${res.status})`);
        return {
          ok: false,
          retry: res.status >= 500,
          value: { id: null, error: `Mailgun refused it (HTTP ${res.status})` },
        };
      } catch {
        this.log.warn('Mailgun unreachable');
        return {
          ok: false,
          retry: true,
          value: { id: null, error: 'Mailgun could not be reached' },
        };
      }
    });
    return { ok: r.ok, messageId: r.value.id, error: r.value.error, attempts: r.attempts };
  }

  private async viaResend(to: string, subject: string, text: string, html?: string) {
    const r = await this.attempt(async () => {
      try {
        const res = await this.fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.c.RESEND_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: this.c.MAIL_FROM,
            to,
            subject,
            text,
            ...(html ? { html } : {}),
          }),
        });
        if (!res.ok) this.log.warn(`Email provider rejected a message (HTTP ${res.status})`);
        return {
          ok: res.ok,
          retry: res.status >= 500,
          value: res.ok ? null : `The provider refused it (HTTP ${res.status})`,
        };
      } catch {
        this.log.warn('Email provider unreachable');
        return { ok: false, retry: true, value: 'The provider could not be reached' };
      }
    });
    return {
      ok: r.ok,
      messageId: null as string | null,
      error: r.ok ? null : r.value,
      attempts: r.attempts,
    };
  }
}
