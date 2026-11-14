import type { Metadata } from 'next';
import { BrainLanding } from '@/features/site/brain/brain-landing';
import { SignedInRedirect } from '@/features/site/signed-in-redirect';
import { absoluteUrl, SITE } from '@/lib/site';

/**
 * The public Torio Brain page, served at `/brain` (src/proxy.ts rewrites visitors there: signed-in customers get the Brain editor
 * at the same address). `/torio-brain` itself redirects to `/brain`, so there is one public address.
 */
const title = 'Torio Brain: Your Business. Understood.';
const description =
  'Torio Brain is the business knowledge, brand voice and rules behind Torio’s AI: it helps your team draft replies that reflect how your business works.';
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: absoluteUrl('/brain') },
  openGraph: {
    type: 'website',
    url: absoluteUrl('/brain'),
    siteName: SITE.name,
    title,
    description,
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title, description },
};

export default function Page() {
  return (
    <>
      <SignedInRedirect to="/brain" />
      <BrainLanding />
    </>
  );
}
