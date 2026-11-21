import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';

/**
 * Tells the public website that pricing changed, so it refreshes at once instead of waiting for its short cache to
 * expire. Best effort and never blocking: if the secret is not configured or the site is unreachable, the site simply
 * picks the change up when its cache expires (about a minute). Sends only the shared secret; no plan data.
 */
@Injectable()
export class WebRevalidateService {
  private readonly log = new Logger(WebRevalidateService.name);
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  plans(): void {
    const secret = this.config.REVALIDATE_SECRET;
    if (!secret) return;
    void fetch(new URL('/revalidate/plans', this.config.WEB_URL), {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret },
      signal: AbortSignal.timeout(4000),
    }).catch((e: unknown) => this.log.warn(`Public pricing refresh not delivered: ${String(e)}`));
  }
}
