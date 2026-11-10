import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DeleteAccount } from '@/features/site/delete-account';
import { absoluteUrl, SITE } from '@/lib/site';

const title = 'Delete Your Torio Account';
const description =
  'Request permanent deletion of your Torio account and associated personal information, and check the status of a request.';
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl('/delete-account') },
  openGraph: {
    type: 'website',
    url: absoluteUrl('/delete-account'),
    siteName: SITE.name,
    title: `${title} · ${SITE.name}`,
    description,
  },
  twitter: { card: 'summary', title: `${title} · ${SITE.name}`, description },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DeleteAccount />
    </Suspense>
  );
}
