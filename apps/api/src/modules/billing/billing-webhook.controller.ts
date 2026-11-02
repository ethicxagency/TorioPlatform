import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators';
import { BillingWebhookService } from './billing-webhook.service';
import { BILLING_PROVIDER, type BillingProvider } from './provider/billing-provider';

/** Provider callbacks. Public (no JWT) but every request must carry a valid signature over the raw body. */
@ApiExcludeController()
@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly webhooks: BillingWebhookService,
  ) {}

  @Public()
  @SkipThrottle()
  @Post('stripe')
  @HttpCode(200)
  async stripe(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing request body');
    // Throws 400 unless the signature is valid and fresh. Nothing below runs for unsigned requests.
    const event = this.provider.verifyWebhook(req.rawBody, signature);
    const r = await this.webhooks.process(event);
    return { received: true, duplicate: r.duplicate };
  }
}
