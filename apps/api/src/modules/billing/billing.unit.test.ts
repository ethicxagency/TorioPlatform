import { describe, expect, it, vi } from 'vitest';
import { renderInvoicePdf } from './invoice-pdf';
import { planFromPriceId, priceIdOf } from './plans';
import { StripeProvider } from './provider/stripe.provider';
import { signStripePayload, verifyStripeSignature } from './provider/stripe-signature';

const SECRET = 'whsec_unit_test_secret';
const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'x' }));

describe('webhook signature', () => {
  const now = 1_800_000_000;
  const good = signStripePayload(body.toString(), SECRET, now);
  it('accepts a correct, fresh signature over the exact bytes', () => {
    expect(verifyStripeSignature(body, good, SECRET, now)).toBe(true);
    expect(verifyStripeSignature(body, good, SECRET, now + 299)).toBe(true);
  });
  it('rejects tampering, wrong secret, stale timestamps and malformed headers', () => {
    expect(verifyStripeSignature(Buffer.from(body.toString() + ' '), good, SECRET, now)).toBe(
      false,
    );
    expect(verifyStripeSignature(body, good, 'whsec_other', now)).toBe(false);
    expect(verifyStripeSignature(body, good, SECRET, now + 301)).toBe(false);
    expect(verifyStripeSignature(body, undefined, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, 't=abc,v1=zz', SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now},v1=${'0'.repeat(64)}`, SECRET, now)).toBe(false);
  });
});

describe('price id mapping', () => {
  const ids = { growth: { month: 'price_gm', year: 'price_gy' } };
  it('maps plan+interval to a price and back', () => {
    expect(priceIdOf(ids, 'growth', 'YEAR')).toBe('price_gy');
    expect(priceIdOf(ids, 'starter', 'MONTH')).toBeUndefined();
    expect(planFromPriceId(ids, 'price_gm')).toEqual({ planKey: 'growth', interval: 'MONTH' });
    expect(planFromPriceId(ids, 'price_unknown')).toBeNull();
  });
});

describe('Stripe provider requests', () => {
  const mk = (res: unknown, ok = true) => {
    const fetchMock = vi.fn(
      async () => ({ ok, status: ok ? 200 : 402, json: async () => res }) as Response,
    );
    return {
      fetchMock,
      p: new StripeProvider('sk_test_123456', SECRET, fetchMock as unknown as typeof fetch),
    };
  };
  it('creates a subscription checkout for a known price, with our workspace reference and no amounts', async () => {
    const { fetchMock, p } = mk({ url: 'https://checkout.stripe.com/c/1' });
    const r = await p.createCheckoutSession({
      customerId: 'cus_1',
      workspaceId: 'ws-1',
      priceId: 'price_1',
      successUrl: 'https://a/ok',
      cancelUrl: 'https://a/no',
    });
    expect(r.url).toBe('https://checkout.stripe.com/c/1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_123456');
    const form = new URLSearchParams(init.body as string);
    expect(form.get('mode')).toBe('subscription');
    expect(form.get('line_items[0][price]')).toBe('price_1');
    expect(form.get('client_reference_id')).toBe('ws-1');
    expect([...form.keys()].some((k) => /amount|unit_price/.test(k))).toBe(false);
  });
  it('surfaces provider errors without echoing the secret key', async () => {
    const { p } = mk({ error: { message: 'Your card was declined.' } }, false);
    await expect(p.retryInvoice({ invoiceId: 'in_1' })).rejects.toThrow('Your card was declined.');
    await expect(p.retryInvoice({ invoiceId: 'in_1' })).rejects.not.toThrow(/sk_test/);
  });
  it('cancels at period end with an update, and immediately with DELETE', async () => {
    const a = mk({});
    await a.p.cancelSubscription({
      subscriptionId: 'sub_1',
      atPeriodEnd: true,
      reason: 'too pricey',
    });
    const [, i1] = a.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URLSearchParams(i1.body as string).get('cancel_at_period_end')).toBe('true');
    const b = mk({});
    await b.p.cancelSubscription({ subscriptionId: 'sub_1', atPeriodEnd: false });
    expect((b.fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe(
      'DELETE',
    );
  });
});

describe('invoice PDF', () => {
  it('is a valid PDF built from the stored record, escaping text', () => {
    const pdf = renderInvoicePdf({
      number: 'INV-0001',
      issuedAt: new Date('2026-10-01T00:00:00Z'),
      status: 'PAID',
      periodStart: new Date('2026-10-01T00:00:00Z'),
      periodEnd: new Date('2026-11-01T00:00:00Z'),
      planName: 'Growth',
      currency: 'USD',
      subtotalMinor: 4900,
      taxMinor: 0,
      totalMinor: 4900,
      paymentSummary: 'Card ending 4242',
      customer: { companyName: 'Acme (Pvt) Ltd', billingEmail: 'pay@acme.co', country: 'BD' },
      lines: [{ description: 'Growth plan (monthly)', quantity: 1, amountMinor: 4900 }],
      seller: { name: 'Torio', note: 'n/a' },
    });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('Invoice INV-0001');
    expect(text).toContain('Acme \\(Pvt\\) Ltd');
    expect(text).toContain('USD 49.00'); // ASCII PDF font: ISO code instead of a symbol
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
  });
  it('keeps the invoice currency and writes taka as BDT (the PDF font has no ৳)', () => {
    const pdf = renderInvoicePdf({
      number: 'INV-0001',
      issuedAt: new Date('2026-10-01T00:00:00Z'),
      status: 'PAID',
      periodStart: new Date('2026-10-01T00:00:00Z'),
      periodEnd: new Date('2026-11-01T00:00:00Z'),
      planName: 'Growth',
      currency: 'BDT',
      subtotalMinor: 15_000_000,
      taxMinor: 0,
      totalMinor: 15_000_000,
      paymentSummary: 'Card ending 4242',
      customer: { companyName: 'Acme (Pvt) Ltd', billingEmail: 'pay@acme.co', country: 'BD' },
      lines: [{ description: 'Growth plan (monthly)', quantity: 1, amountMinor: 15_000_000 }],
      seller: { name: 'Torio', note: 'n/a' },
    });
    const text = pdf.toString('latin1');
    expect(text).toContain('BDT 1,50,000');
    expect(text).not.toContain('?1,50,000');
  });
});
