export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');

export interface ProviderEvent {
  id: string;
  type: string;
  /** Provider event time (seconds since epoch). */
  created: number;
  object: Record<string, unknown>;
}

/**
 * Everything Torio needs from a payment provider. Business code only talks to this interface, so Stripe can be
 * swapped or extended without touching billing logic. Methods return only what the caller needs; subscription,
 * invoice and payment-method *state* always arrives through verified webhooks, never from these calls.
 */
export interface BillingProvider {
  readonly name: string | null;
  isConfigured(): boolean;
  ensureCustomer(i: {
    workspaceId: string;
    email: string | null;
    name: string | null;
  }): Promise<string>;
  createCheckoutSession(i: {
    customerId: string;
    workspaceId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPaymentMethodSession(i: {
    customerId: string;
    workspaceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  changeSubscription(i: { subscriptionId: string; priceId: string }): Promise<void>;
  cancelSubscription(i: {
    subscriptionId: string;
    atPeriodEnd: boolean;
    reason?: string;
  }): Promise<void>;
  resumeSubscription(i: { subscriptionId: string }): Promise<void>;
  setDefaultPaymentMethod(i: { customerId: string; paymentMethodId: string }): Promise<void>;
  detachPaymentMethod(i: { paymentMethodId: string }): Promise<void>;
  retryInvoice(i: { invoiceId: string }): Promise<void>;
  /** Throws if the signature is missing, wrong, or too old. Returns the parsed event. */
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): ProviderEvent;
}
