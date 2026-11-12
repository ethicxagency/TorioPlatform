export type InvoicePaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';

/** Everything the PDF shows. Built from the live order by InvoiceService; the renderer never reads the database. */
export interface InvoiceData {
  /** "INV-00001". */
  number: string;
  /** When the invoice was first generated (fixed from then on). */
  issuedAt: Date;
  orderNumber: number;
  orderDate: Date;
  /** IANA zone the dates are written in (the store's reporting zone). */
  timeZone: string;
  currency: string;
  paymentStatus: InvoicePaymentStatus;
  orderCancelled: boolean;
  seller: {
    name: string;
    lines: string[];
    email: string | null;
    phone: string | null;
    /** PNG or JPEG bytes; null when the store has no logo or it cannot be embedded. */
    logo: Buffer | null;
  };
  billTo: {
    name: string;
    company: string | null;
    lines: string[];
    email: string | null;
    phone: string | null;
  };
  /** Only when it differs from the billing address. */
  shipTo: string[] | null;
  items: {
    name: string;
    sku: string | null;
    quantity: number;
    unitMinor: number;
    totalMinor: number;
  }[];
  totals: {
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    taxMinor: number;
    totalMinor: number;
    paidMinor: number;
    dueMinor: number;
  };
  payments: { reference: string | null; method: string; paidAt: Date; amountMinor: number }[];
  words: string;
}
