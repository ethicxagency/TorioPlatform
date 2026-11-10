import type { MetadataRoute } from 'next';
import { absoluteUrl, SITE } from '@/lib/site';

/** Only the public pages. Signed-in and admin areas are not listed (and are marked noindex). */
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date(SITE.policyUpdated);
  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    {
      url: absoluteUrl('/privacy'),
      lastModified: updated,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    { url: absoluteUrl('/delete-account'), changeFrequency: 'yearly', priority: 0.4 },
  ];
}
