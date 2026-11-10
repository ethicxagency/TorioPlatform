import '@fontsource-variable/inter';
import type { Metadata, Viewport } from 'next';
import { Providers } from '@/lib/providers';
import { SITE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: { default: SITE.name, template: '%s · Torio' },
  description: SITE.description,
  openGraph: { siteName: SITE.name, type: 'website', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#5B5CE2' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
