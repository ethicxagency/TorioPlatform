import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { BillingProvider, ProviderEvent } from './billing-provider';
import { verifyStripeSignature } from './stripe-signature';

const API = 'https://api.stripe.com';

/**
 * Stripe over its REST API (no SDK dependency). The secret key is only ever sent to api.stripe.com and never
 * logged. Stripe error messages are passed through (they contain no secrets); anything else is generic.
 */
export class StripeProvider implements BillingProvider {
  readonly name = 'stripe';
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  isConfigured() {
    return true;
  }

  private async call<T = Record<string, unknown>>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, string>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this.http(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          ...(body && { 'Content-Type': 'application/x-www-form-urlencoded' }),
        },
        ...(body && { body: new URLSearchParams(body).toString() }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BadGatewayException('Could not reach the payment provider. Try again shortly.');
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
    if (!res.ok)
      throw new BadGatewayException(
        `Payment provider error: ${json.error?.message ?? `HTTP ${res.status}`}`,
      );
    return json;
  }

  async ensureCustomer(i: { workspaceId: string; email: string | null; name: string | null }) {
    const c = await this.call<{ id: string }>('POST', '/v1/customers', {
      'metadata[workspaceId]': i.workspaceId,
      ...(i.email && { email: i.email }),
      ...(i.name && { name: i.name }),
    });
    return c.id;
  }

  async createCheckoutSession(i: Parameters<BillingProvider['createCheckoutSession']>[0]) {
    const s = await this.call<{ url?: string }>('POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      customer: i.customerId,
      client_reference_id: i.workspaceId,
      'line_items[0][price]': i.priceId,
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][workspaceId]': i.workspaceId,
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
    });
    if (!s.url) throw new BadGatewayException('The payment provider returned no checkout link');
    return { url: s.url };
  }

  async createPaymentMethodSession(
    i: Parameters<BillingProvider['createPaymentMethodSession']>[0],
  ) {
    const s = await this.call<{ url?: string }>('POST', '/v1/checkout/sessions', {
      mode: 'setup',
      customer: i.customerId,
      client_reference_id: i.workspaceId,
      'payment_method_types[0]': 'card',
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
    });
    if (!s.url) throw new BadGatewayException('The payment provider returned no setup link');
    return { url: s.url };
  }

  async changeSubscription(i: { subscriptionId: string; priceId: string }) {
    const sub = await this.call<{ items?: { data?: { id: string }[] } }>(
      'GET',
      `/v1/subscriptions/${encodeURIComponent(i.subscriptionId)}`,
    );
    const itemId = sub.items?.data?.[0]?.id;
    if (!itemId) throw new BadGatewayException('The subscription has no item to change');
    await this.call('POST', `/v1/subscriptions/${encodeURIComponent(i.subscriptionId)}`, {
      'items[0][id]': itemId,
      'items[0][price]': i.priceId,
      proration_behavior: 'create_prorations',
    });
  }

  async cancelSubscription(i: { subscriptionId: string; atPeriodEnd: boolean; reason?: string }) {
    const id = encodeURIComponent(i.subscriptionId);
    if (i.atPeriodEnd)
      await this.call('POST', `/v1/subscriptions/${id}`, {
        cancel_at_period_end: 'true',
        ...(i.reason && { 'cancellation_details[comment]': i.reason.slice(0, 500) }),
      });
    else await this.call('DELETE', `/v1/subscriptions/${id}`);
  }

  async resumeSubscription(i: { subscriptionId: string }) {
    await this.call('POST', `/v1/subscriptions/${encodeURIComponent(i.subscriptionId)}`, {
      cancel_at_period_end: 'false',
    });
  }

  async setDefaultPaymentMethod(i: { customerId: string; paymentMethodId: string }) {
    await this.call('POST', `/v1/customers/${encodeURIComponent(i.customerId)}`, {
      'invoice_settings[default_payment_method]': i.paymentMethodId,
    });
  }

  async detachPaymentMethod(i: { paymentMethodId: string }) {
    await this.call(
      'POST',
      `/v1/payment_methods/${encodeURIComponent(i.paymentMethodId)}/detach`,
      {},
    );
  }

  async retryInvoice(i: { invoiceId: string }) {
    await this.call('POST', `/v1/invoices/${encodeURIComponent(i.invoiceId)}/pay`, {});
  }

  verifyWebhook(rawBody: Buffer, header: string | undefined): ProviderEvent {
    if (!verifyStripeSignature(rawBody, header, this.webhookSecret))
      throw new BadRequestException('Invalid webhook signature');
    const e = JSON.parse(rawBody.toString('utf8')) as {
      id?: string;
      type?: string;
      created?: number;
      data?: { object?: Record<string, unknown> };
    };
    if (!e.id || !e.type || typeof e.created !== 'number' || !e.data?.object)
      throw new BadRequestException('Malformed webhook event');
    return { id: e.id, type: e.type, created: e.created, object: e.data.object };
  }
}
