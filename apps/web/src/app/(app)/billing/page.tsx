import { redirect } from 'next/navigation';

type Params = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The old combined "Billing & Subscriptions" page. A bookmark or a provider return link lands on the page that now holds
 * what it pointed at: payment methods, invoices and billing details moved to /billing/invoices, everything else (the
 * plan, usage, choosing a plan) to /billing/subscription. Query parameters such as `result` are carried along.
 */
export default async function Page({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const tab = first(sp.tab);
  const toBilling = first(sp.pm) === '1' || tab === 'payment-methods' || tab === 'history';
  // Billing details are edited in General Settings now; an old Billing Information link goes there.
  if (tab === 'info') redirect('/settings/general#workspace');
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v);
    if (val === undefined || k === 'tab' || k === 'pm') continue;
    out.set(k, val);
  }
  if (toBilling) {
    const section = tab === 'history' ? 'invoices' : 'payment-methods';
    out.set('section', section);
    redirect(`/billing/invoices?${out}`);
  }
  if (tab === 'plans' || tab === 'usage') out.set('tab', tab);
  redirect(`/billing/subscription${out.size ? `?${out}` : ''}`);
}
