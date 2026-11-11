'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useBillingProfile } from '../queries';

/**
 * Invoices take their billing details from this store's General Settings. When something an invoice needs is missing, one
 * compact notice says what, and links to where it is edited. Nothing is shown when the details are complete.
 */
export function DetailsNotice({ ws }: { ws: string }) {
  const q = useBillingProfile(ws);
  const d = q.data;
  if (!d || d.complete) return null;
  return (
    <div
      role="status"
      data-testid="billing-details-notice"
      className="flex items-start gap-3 rounded-xl border border-[#F3DFB6] bg-[#FFFAF0] px-3.5 py-3 text-[13px]"
    >
      <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
      <p className="m-0 text-muted">
        <b className="font-semibold text-ink">Complete your business information.</b> Invoices use
        the details in General Settings, and these are missing:{' '}
        {d.missing.map((m) => m.label).join(', ')}.{' '}
        <Link href="/settings/general#workspace" className="font-semibold text-primary">
          Open Settings → General
        </Link>
      </p>
    </div>
  );
}
