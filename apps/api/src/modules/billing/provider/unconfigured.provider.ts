import { ServiceUnavailableException } from '@nestjs/common';
import type { BillingProvider } from './billing-provider';

const NOT_CONFIGURED =
  'Payments aren’t connected. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and BILLING_PRICE_IDS to enable billing changes.';

/** Used when no payment provider credentials exist. Every operation refuses; nothing is ever simulated. */
export class UnconfiguredProvider implements BillingProvider {
  readonly name = null;
  isConfigured() {
    return false;
  }
  private no(): never {
    throw new ServiceUnavailableException(NOT_CONFIGURED);
  }
  ensureCustomer = async () => this.no();
  createCheckoutSession = async () => this.no();
  createPaymentMethodSession = async () => this.no();
  changeSubscription = async () => this.no();
  cancelSubscription = async () => this.no();
  resumeSubscription = async () => this.no();
  setDefaultPaymentMethod = async () => this.no();
  detachPaymentMethod = async () => this.no();
  retryInvoice = async () => this.no();
  verifyWebhook = () => this.no();
}
