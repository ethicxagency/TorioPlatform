'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useWorkspace } from '@/lib/workspace';
import { useOverview } from '../queries';
import { Notice } from './bits';
import { InvoicesSection } from './invoices-section';
import { CardsTab, InfoTab } from './other-tabs';

/**
 * Settings → Billing: invoices, payment methods and billing details. The one payments notice lives here, once, and
 * only when it changes what can be done (adding a payment method).
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
      </header>
      {o && !o.providerConfigured && (
        <Notice tone="warn">
          Payments aren&apos;t connected, so payment methods can&apos;t be added yet.
        </Notice>
      )}
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
          <CardsTab ws={ws} o={o} canManage={canManage} />
        </section>
      )}
      <section id="billing-info" className="scroll-mt-4">
        <InfoTab ws={ws} canManage={canManage} />
      </section>
    </div>
  );
}
