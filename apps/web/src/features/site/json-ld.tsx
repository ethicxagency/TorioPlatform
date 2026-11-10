import { absoluteUrl, SITE } from '@/lib/site';

/** Structured data with only facts we can stand behind: who runs Torio, what it is, where it lives. No ratings, prices or reviews. */
export function JsonLd() {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE.name,
      legalName: SITE.company,
      url: SITE.url,
      logo: absoluteUrl('/torio-logo.png'),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE.name,
      description: SITE.description,
      url: SITE.url,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      publisher: { '@type': 'Organization', name: SITE.company },
    },
  ];
  return (
    <script
      type="application/ld+json"
      // Static, server-built JSON: no user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
