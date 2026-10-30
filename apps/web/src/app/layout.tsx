import '@fontsource-variable/inter';
import type { Metadata, Viewport } from 'next';
import { Providers } from '@/lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Torio', template: '%s · Torio' },
  description: 'AI-powered omnichannel messaging, CRM and sales for eCommerce businesses.',
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
