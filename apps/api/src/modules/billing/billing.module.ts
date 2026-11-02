import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingWebhookService } from './billing-webhook.service';
import { PlansService } from './plans.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BILLING_PROVIDER, type BillingProvider } from './provider/billing-provider';
import { StripeProvider } from './provider/stripe.provider';
import { UnconfiguredProvider } from './provider/unconfigured.provider';

@Global()
@Module({
  controllers: [BillingController, BillingWebhookController],
  exports: [PlansService, BillingService, BILLING_PROVIDER],
  providers: [
    BillingService,
    BillingWebhookService,
    PlansService,
    {
      provide: BILLING_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): BillingProvider =>
        c.STRIPE_SECRET_KEY && c.STRIPE_WEBHOOK_SECRET
          ? new StripeProvider(c.STRIPE_SECRET_KEY, c.STRIPE_WEBHOOK_SECRET)
          : new UnconfiguredProvider(),
    },
  ],
})
export class BillingModule {}
