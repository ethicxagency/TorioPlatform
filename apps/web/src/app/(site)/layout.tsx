import { SiteFooter } from '@/features/site/site-footer';
import { SiteHeader } from '@/features/site/site-header';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-ink">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="content">{children}</main>
      <SiteFooter />
    </div>
  );
}
