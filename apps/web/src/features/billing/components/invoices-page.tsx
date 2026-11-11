'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useWorkspace } from '@/lib/workspace';
import { useOverview } from '../queries';
import { Notice } from './bits';
import { DetailsNotice } from './details-notice';
import { InvoicesSection } from './invoices-section';
import { PaymentMethodsSection } from './payment-methods-section';

/**
 * Settings → Billing: overview, invoices, payment methods and billing details. The payment-provider status appears once,
 * inside Payment methods, where it changes what can be done.
 */
export function BillingInvoicesPage() {
  const params = useSearchParams();
  const { workspaceId: ws, can, isLoading, error: wsError } = useWorkspace();
  const q = useOverview(can('billing:read') ? ws : null);
  const canManage = can('billing:manage');
  const section = params.get('section');
  const result = params.get('result');
  useEffect(() => {
    if (section && q.data)
      document.getElementById(`billing-${section}`)?.scrollIntoView({ block: 'start' });
  }, [section, q.data]);

  if (isLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (wsError || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('billing:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Billing is available to workspace owners and admins.
      </div>
    );
  const o = q.data;
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-page-title">Billing</h1>
        <p className="m-0 mt-1 text-[13.5px] text-muted">Manage invoices and payment methods.</p>
      </header>
      <DetailsNotice ws={ws} />
      {result === 'success' && (
        <Notice>
          Back from the provider. A new payment method appears here as soon as the provider confirms
          it.
        </Notice>
      )}
      {result === 'cancelled' && <Notice>Nothing was changed.</Notice>}
      <section id="billing-invoices" className="scroll-mt-4">
        <InvoicesSection ws={ws} canManage={canManage} />
      </section>
      {o && (
        <section id="billing-payment-methods" className="scroll-mt-4">
          <PaymentMethodsSection ws={ws} o={o} canManage={canManage} />
        </section>
      )}
    </div>
  );
}
