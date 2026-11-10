import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';

/**
 * Transactional email through the Resend HTTP API. Without RESEND_API_KEY and MAIL_FROM nothing can be sent, and
 * callers (and the sign-in page) say so rather than pretending an email went out.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  fetch: typeof fetch = (...a) => fetch(...a);

  constructor(@Inject(APP_CONFIG) private readonly c: AppConfig) {}

  get configured() {
    return !!(this.c.RESEND_API_KEY && this.c.MAIL_FROM);
  }

  /** Returns whether the provider accepted the message. Never logs the body (it contains one-time links). */
  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.configured) return false;
    try {
      const r = await this.fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.c.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from: this.c.MAIL_FROM, to, subject, text }),
      });
      if (!r.ok) this.log.warn(`Email provider rejected a message (HTTP ${r.status})`);
      return r.ok;
    } catch {
      this.log.warn('Email provider unreachable');
      return false;
    }
  }
}
