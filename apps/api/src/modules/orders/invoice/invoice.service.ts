import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { outstandingMinor } from '@torio/contracts';
import { PrismaService } from '../../../database/prisma.service';
import { amountInWords } from './amount-words';
import type { InvoiceData } from './invoice-types';
import { renderOrderInvoicePdf } from './invoice-pdf';

/** "INV-00001": a per-store sequence, zero-padded so numbers sort and read consistently. */
export const formatInvoiceNumber = (n: number) => `INV-${String(n).padStart(5, '0')}`;

const METHOD: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  MOBILE_WALLET: 'Mobile wallet',
  CARD_EXTERNAL: 'Card',
  OTHER: 'Other',
};

const MAX_LOGO_BYTES = 2_000_000;

/**
 * The store logo, when it can be embedded: a PNG or JPEG data URL. Remote URLs are never fetched while rendering (that would be
 * a server-side request to an address the store typed in), and other formats fall back to the store name.
 */
export function logoBytes(logo: string | null): Buffer | null {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(logo?.trim() ?? '');
  if (!m) return null;
  const buf = Buffer.from(m[2]!.replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > MAX_LOGO_BYTES) return null;
  const png = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const jpg = buf[0] === 0xff && buf[1] === 0xd8;
  return png || jpg ? buf : null;
}

const addressLines = (s: string | null | undefined) =>
  (s ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
const norm = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[\s,]+/g, ' ')
    .trim();

const isMissingTable = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && ['P2021', 'P2022'].includes(e.code);

/**
 * Builds a customer invoice from a live order. Everything is read from the database for the given store (the order must
 * belong to it) and nothing is recomputed: totals are the ones frozen on the order. Only the invoice number and its issue
 * date are stored, the first time the invoice is generated, so every later print is the same invoice.
 */
@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The order's invoice identity, issued once. Concurrent first requests produce exactly one number. */
  private async identity(ws: string, orderId: string, userId: string) {
    const db = this.prisma.client;
    const existing = await db.orderInvoice.findUnique({ where: { orderId } });
    if (existing) return existing;
    try {
      return await db.$transaction(async (tx) => {
        // The increment locks the store's counter row, so two orders being invoiced at once get different numbers, and a
        // transaction that loses the race to the same order rolls its number back instead of leaving a gap.
        const w = await tx.workspace.update({
          where: { id: ws },
          data: { invoiceSeq: { increment: 1 } },
          select: { invoiceSeq: true },
        });
        return tx.orderInvoice.create({
          data: { workspaceId: ws, orderId, number: w.invoiceSeq, createdById: userId },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await db.orderInvoice.findUnique({ where: { orderId } });
        if (again) return again;
      }
      throw e;
    }
  }

  async data(ws: string, orderId: string, userId: string): Promise<InvoiceData> {
    const db = this.prisma.client;
    const order = await db.order.findFirst({
      where: { id: orderId, workspaceId: ws },
      include: {
        customer: true,
        items: { orderBy: { position: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        workspace: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    let inv;
    try {
      inv = await this.identity(ws, order.id, userId);
    } catch (e) {
      if (isMissingTable(e))
        throw new ServiceUnavailableException(
          'Invoices are not available yet: the database update for invoices has not been applied.',
        );
      throw e;
    }

    const w = order.workspace;
    const c = order.customer;
    const billing = addressLines(c.address);
    const shipping = addressLines(order.shippingAddress);
    const sameAddress = norm(billing.join(' ')) === norm(shipping.join(' '));
    const place = [w.city, w.state, w.postalCode].filter(Boolean).join(', ');
    return {
      number: formatInvoiceNumber(inv.number),
      issuedAt: inv.issuedAt,
      orderNumber: order.number,
      orderDate: order.createdAt,
      timeZone: w.reportingTimeZone || 'UTC',
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      orderCancelled: order.status === 'CANCELLED',
      seller: {
        name: w.name,
        lines: [
          ...addressLines(w.addressLine),
          ...(place ? [place] : []),
          ...(w.country ? [w.country] : []),
        ],
        email: w.contactEmail,
        phone: w.phone,
        logo: logoBytes(w.logo),
      },
      billTo: {
        name: c.name,
        company: c.company,
        lines: billing,
        email: c.email,
        phone: c.phone,
      },
      shipTo: shipping.length && (!billing.length || !sameAddress) ? shipping : null,
      items: order.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        quantity: i.quantity,
        unitMinor: i.unitPriceMinor,
        totalMinor: i.lineTotalMinor,
      })),
      totals: {
        subtotalMinor: order.subtotalMinor,
        discountMinor: order.discountMinor,
        shippingMinor: order.shippingMinor,
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        paidMinor: order.paidMinor,
        dueMinor: outstandingMinor(order),
      },
      payments: order.payments.map((p) => ({
        reference: p.reference,
        method: METHOD[p.method] ?? 'Other',
        paidAt: p.paidAt,
        amountMinor: p.amountMinor,
      })),
      words: amountInWords(order.totalMinor, order.currency),
    };
  }

  async pdf(ws: string, orderId: string, userId: string) {
    const d = await this.data(ws, orderId, userId);
    return {
      buffer: await renderOrderInvoicePdf(d),
      filename: `TORIO-${d.number}.pdf`,
      number: d.number,
    };
  }
}
