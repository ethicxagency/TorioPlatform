import type { Metadata } from 'next';
import { JsonLd } from '@/features/site/json-ld';
import { Landing } from '@/features/site/landing';
import { SignedInRedirect } from '@/features/site/signed-in-redirect';
import { absoluteUrl, SITE } from '@/lib/site';

/**
 * The public home page. It is served at `/` (src/proxy.ts rewrites visitors here); `/welcome` itself redirects to `/`.
 * Rendered on the server, so crawlers get the full page without running any script.
 */
const title = `${SITE.name}: ${SITE.tagline}`;
export const metadata: Metadata = {
  title: { absolute: title },
  description: SITE.description,
  alternates: { canonical: absoluteUrl('/') },
  openGraph: {
    type: 'website',
    url: absoluteUrl('/'),
    siteName: SITE.name,
    title,
    description: SITE.description,
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title, description: SITE.description },
};

export default function Page() {
  return (
    <>
      <JsonLd />
      <SignedInRedirect />
      <Landing />
    </>
  );
}
