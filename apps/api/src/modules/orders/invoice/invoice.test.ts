import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { amountInWords } from './amount-words';
import { renderOrderInvoicePdf } from './invoice-pdf';
import type { InvoiceData } from './invoice-types';
import { formatInvoiceNumber, InvoiceService, logoBytes } from './invoice.service';

/** An in-memory stand-in for the picture store: the live logo (changeable) and the frozen per-invoice copies. */
function fakeImages(initial: { bytes: Uint8Array } | null = null) {
  const state = { live: initial as { bytes: Uint8Array } | null };
  const frozen = new Map<string, { bytes: Uint8Array; sizeBytes: number }>();
  const images = {
    logoOf: async () => state.live,
    frozenLogo: async (id: string) => frozen.get(id) ?? null,
    freeze: async (_k: string, id: string, from: { bytes: Uint8Array } | null) => {
      if (!frozen.has(id))
        frozen.set(id, {
          bytes: from?.bytes ?? new Uint8Array(),
          sizeBytes: from?.bytes.length ?? 0,
        });
      return frozen.get(id)!;
    },
  };
  return { images: images as never, state, frozen };
}

const base = (over: Partial<InvoiceData> = {}): InvoiceData => ({
  number: 'INV-00001',
  issuedAt: new Date('2026-10-25T10:00:00Z'),
  orderNumber: 1001,
  orderDate: new Date('2026-10-24T10:00:00Z'),
  timeZone: 'Asia/Dhaka',
  currency: 'BDT',
  paymentStatus: 'PAID',
  orderCancelled: false,
  seller: { name: 'Shop', lines: ['Road 1'], email: 'a@b.co', phone: null, logo: null },
  billTo: { name: 'Rabby', company: null, lines: ['Dhaka'], email: null, phone: null },
  shipTo: null,
  items: [{ name: 'Panjabi', sku: 'P-1', quantity: 2, unitMinor: 150000, totalMinor: 300000 }],
  totals: {
    subtotalMinor: 300000,
    discountMinor: 0,
    shippingMinor: 0,
    taxMinor: 0,
    totalMinor: 300000,
    paidMinor: 300000,
    dueMinor: 0,
  },
  payments: [
    {
      reference: 'TX1',
      method: 'Cash',
      paidAt: new Date('2026-10-25T10:00:00Z'),
      amountMinor: 300000,
    },
  ],
  words: amountInWords(300000, 'BDT'),
  ...over,
});
const pages = (b: Buffer) => (b.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('invoice rendering', () => {
  it('produces an A4 PDF', async () => {
    const b = await renderOrderInvoicePdf(base());
    expect(b.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(b)).toBe(1);
    expect(b.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  });
  it('continues onto more pages for many items, and handles Bengali and very long text', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      name: i === 3 ? 'রেশমি শাড়ি (লাল) Size M' : `Item ${i} ${'long '.repeat(i === 5 ? 60 : 1)}`,
      sku: null,
      quantity: 1,
      unitMinor: 1000,
      totalMinor: 1000,
    }));
    const b = await renderOrderInvoicePdf(base({ items }));
    expect(pages(b)).toBeGreaterThan(1);
  });
  it('renders with no payments, a ship-to address and a cancelled badge', async () => {
    const b = await renderOrderInvoicePdf(
      base({
        payments: [],
        shipTo: ['Flat 3, Dhanmondi'],
        orderCancelled: true,
        paymentStatus: 'UNPAID',
      }),
    );
    expect(pages(b)).toBeGreaterThanOrEqual(1);
  });
});

describe('invoice helpers', () => {
  it('formats the number consistently', () => {
    expect(formatInvoiceNumber(1)).toBe('INV-00001');
    expect(formatInvoiceNumber(10269)).toBe('INV-10269');
    expect(formatInvoiceNumber(123456)).toBe('INV-123456');
  });
  it('only embeds a real PNG or JPEG data URL as a logo', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64');
    expect(logoBytes(`data:image/png;base64,${png}`)).not.toBeNull();
    expect(
      logoBytes(`data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 1]).toString('base64')}`),
    ).not.toBeNull();
    expect(
      logoBytes(`data:image/png;base64,${Buffer.from('not an image').toString('base64')}`),
    ).toBeNull();
    expect(logoBytes('https://example.com/logo.png')).toBeNull(); // never fetched
    expect(logoBytes('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(logoBytes(null)).toBeNull();
  });
});

/** A fake database holding two stores, to prove the invoice reads only the requested store's order and keeps its identity. */
function fakeDb() {
  const orders: Record<string, unknown> = {
    o1: {
      id: 'o1',
      workspaceId: 'wsA',
      number: 1001,
      currency: 'BDT',
      status: 'CONFIRMED',
      paymentStatus: 'PARTIALLY_PAID',
      subtotalMinor: 300000,
      discountMinor: 10000,
      shippingMinor: 6000,
      taxMinor: 0,
      totalMinor: 296000,
      paidMinor: 100000,
      shippingAddress: 'House 1, Road 2',
      createdAt: new Date('2026-10-24T00:00:00Z'),
      customer: {
        name: 'Rabby',
        company: null,
        address: 'House 1,  Road 2',
        email: 'r@x.co',
        phone: '017',
      },
      items: [
        {
          name: 'Panjabi',
          sku: 'P-1',
          quantity: 2,
          unitPriceMinor: 150000,
          lineTotalMinor: 300000,
        },
      ],
      payments: [
        {
          reference: 'TX9',
          method: 'MOBILE_WALLET',
          paidAt: new Date('2026-10-25T00:00:00Z'),
          amountMinor: 100000,
        },
      ],
      workspace: {
        name: 'Store A',
        addressLine: 'Road 9',
        city: 'Dhaka',
        state: null,
        postalCode: '1212',
        country: 'Bangladesh',
        contactEmail: 'a@a.co',
        phone: null,
        logo: null,
        reportingTimeZone: 'Asia/Dhaka',
      },
    },
  };
  const invoices: { orderId: string; number: number; issuedAt: Date }[] = [];
  let seq = 0;
  const client = {
    order: {
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const o = orders[where.id] as { workspaceId: string } | undefined;
        return o && o.workspaceId === where.workspaceId ? o : null;
      },
    },
    orderInvoice: {
      findUnique: async ({ where }: { where: { orderId: string } }) =>
        invoices.find((i) => i.orderId === where.orderId) ?? null,
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        workspace: { update: async () => ({ invoiceSeq: ++seq }) },
        orderInvoice: {
          create: async ({ data }: { data: { orderId: string; number: number } }) => {
            const row = { ...data, issuedAt: new Date('2026-10-25T10:00:00Z') };
            invoices.push(row);
            return row;
          },
        },
      }),
  };
  return { prisma: { client } as never, invoices };
}

describe('InvoiceService', () => {
  it('uses the order, the store and the stored totals, and keeps one number per order', async () => {
    const { prisma, invoices } = fakeDb();
    const svc = new InvoiceService(prisma, fakeImages().images);
    const a = await svc.data('wsA', 'o1', 'u1');
    expect(a.number).toBe('INV-00001');
    expect(a.seller.name).toBe('Store A');
    expect(a.seller.lines).toEqual(['Road 9', 'Dhaka, 1212', 'Bangladesh']);
    expect(a.billTo.name).toBe('Rabby');
    expect(a.shipTo).toBeNull(); // same address, only spacing differs
    expect(a.totals).toMatchObject({ totalMinor: 296000, paidMinor: 100000, dueMinor: 196000 });
    expect(a.payments).toEqual([
      expect.objectContaining({ reference: 'TX9', method: 'Mobile wallet', amountMinor: 100000 }),
    ]);
    expect(a.words).toBe('Two Thousand Nine Hundred Sixty Taka Only');
    const again = await svc.data('wsA', 'o1', 'u2');
    expect(again.number).toBe(a.number);
    expect(again.issuedAt).toEqual(a.issuedAt);
    expect(invoices).toHaveLength(1);
  });
  it("never reads another store's order", async () => {
    const { prisma, invoices } = fakeDb();
    await expect(
      new InvoiceService(prisma, fakeImages().images).data('wsB', 'o1', 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(invoices).toHaveLength(0); // no number is issued for a refused request
  });

  it('embeds the stored workspace logo (a transparent WebP becomes PNG) in the PDF, and falls back to the store name without one', async () => {
    const sharp = (await import('sharp')).default;
    const webp = await sharp({
      create: {
        width: 400,
        height: 100,
        channels: 4,
        background: { r: 91, g: 92, b: 226, alpha: 0.5 },
      },
    })
      .webp()
      .toBuffer();
    const { prisma } = fakeDb();
    const withLogo = await new InvoiceService(
      prisma,
      fakeImages({ bytes: new Uint8Array(webp) }).images,
    ).data('wsA', 'o1', 'u1');
    expect(withLogo.seller.logo).not.toBeNull();
    const m = await sharp(withLogo.seller.logo!).metadata();
    expect([m.format, m.width, m.height, m.hasAlpha]).toEqual(['png', 400, 100, true]);
    const pdf = await renderOrderInvoicePdf(withLogo);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const plain = await renderOrderInvoicePdf({
      ...withLogo,
      seller: { ...withLogo.seller, logo: null },
    });
    expect(pdf.length).toBeGreaterThan(plain.length); // the logo really is in the file
    // a logo that cannot be read never breaks the invoice
    const broken = await new InvoiceService(
      prisma,
      fakeImages({ bytes: new Uint8Array(Buffer.from('garbage')) }).images,
    ).data('wsA', 'o1', 'u1');
    expect(broken.seller.logo).toBeNull();
  });

  it('freezes the logo an invoice was issued with: replacing, removing or adding a logo later never changes it', async () => {
    const sharp = (await import('sharp')).default;
    const mk = (r: number) =>
      sharp({
        create: { width: 300, height: 90, channels: 4, background: { r, g: 40, b: 90, alpha: 1 } },
      })
        .webp()
        .toBuffer();
    const a = await mk(200);
    const b = await mk(10);
    const { prisma } = fakeDb();
    const store = fakeImages({ bytes: new Uint8Array(a) });
    const svc = new InvoiceService(prisma, store.images);
    const px = async (d: InvoiceData) => (await sharp(d.seller.logo!).raw().toBuffer())[0];
    const first = await svc.data('wsA', 'o1', 'u1');
    const was = await px(first);
    expect(was).toBeGreaterThan(150); // the red one
    store.state.live = { bytes: new Uint8Array(b) }; // the store replaces its logo
    expect(await px(await svc.data('wsA', 'o1', 'u1'))).toBe(was); // the issued invoice still has the old one
    store.state.live = null; // ...or removes it
    expect(await px(await svc.data('wsA', 'o1', 'u1'))).toBe(was);
    expect(store.frozen.size).toBe(1);
    // an invoice issued with no logo stays without one when a logo is added later
    const bare = fakeImages(null);
    const svc2 = new InvoiceService(fakeDb().prisma, bare.images);
    expect((await svc2.data('wsA', 'o1', 'u1')).seller.logo).toBeNull();
    bare.state.live = { bytes: new Uint8Array(a) };
    expect((await svc2.data('wsA', 'o1', 'u1')).seller.logo).toBeNull();
  });
});
