import Link from 'next/link';
import { getPublicPlans } from '@/lib/public-plans';
import { PricingCards } from './pricing-cards';

const wrap = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';

/**
 * Public pricing, rendered on the server from the plans Super Admin has published, so search engines see real prices.
 * There is no hard-coded plan anywhere in the website: if the API cannot be read, this says so instead of showing numbers.
 */
export async function PricingSection({ heading = 'h2' }: { heading?: 'h1' | 'h2' }) {
  const { status, plans } = await getPublicPlans();
  const H = heading;
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 py-20">
      <div className={wrap}>
        <div className="mx-auto max-w-[680px] text-center">
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-primary">
            Pricing
          </p>
          <H
            id="pricing-title"
            className="m-0 mt-3 text-[32px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink sm:text-[40px]"
          >
            Simple pricing for every brand
          </H>
          <p className="m-0 mt-4 text-[17px] leading-relaxed text-muted">
            Each brand has its own workspace and its own plan. Pay monthly or yearly; change plan
            any time from Billing.
          </p>
        </div>
        {status === 'error' ? (
          <p
            role="status"
            className="mx-auto mt-10 max-w-[560px] rounded-2xl border border-line bg-white p-6 text-center text-[15px] text-muted"
          >
            Pricing couldn’t be loaded right now. Please try again in a moment, or{' '}
            <Link href="/login" className="font-medium text-primary">
              sign in
            </Link>{' '}
            to see the plans for your workspace.
          </p>
        ) : plans.length === 0 ? (
          <p className="mx-auto mt-10 max-w-[560px] rounded-2xl border border-line bg-white p-6 text-center text-[15px] text-muted">
            Plans aren’t published yet.{' '}
            <Link href="/signup" className="font-medium text-primary">
              Create an account
            </Link>{' '}
            to get started.
          </p>
        ) : (
          <PricingCards plans={plans} />
        )}
      </div>
    </section>
  );
}
