import type { Metadata } from 'next';
import { PricingSection } from '@/features/site/pricing';
import { absoluteUrl, SITE } from '@/lib/site';

/** Public pricing. Statically cached and refreshed within a minute, or at once when Super Admin saves a plan. */
// Must be a literal for Next to read it; keep in step with PLANS_REVALIDATE_SECONDS in lib/public-plans.ts.
export const revalidate = 60;

const title = `Pricing | ${SITE.name}`;
const description = `Plans and pricing for ${SITE.name}. Every plan includes the unified inbox; limits and features are listed on each plan.`;
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: absoluteUrl('/pricing') },
  openGraph: {
    type: 'website',
    url: absoluteUrl('/pricing'),
    siteName: SITE.name,
    title,
    description,
  },
  twitter: { card: 'summary', title, description },
};

export default function Page() {
  return <PricingSection heading="h1" />;
}
