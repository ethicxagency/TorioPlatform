import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/delete-account'],
        // The API, the admin console and the signed-in app are not for search engines.
        disallow: [
          '/api/',
          '/admin',
          '/inbox',
          '/leads',
          '/customers',
          '/orders',
          '/automation',
          '/brain',
          '/settings',
          '/team',
          '/channels',
          '/billing',
          '/status',
          '/auth/',
          '/accept-invite',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
