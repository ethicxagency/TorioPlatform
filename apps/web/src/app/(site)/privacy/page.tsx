import type { Metadata } from 'next';
import { POLICY } from '@/features/site/privacy-content';
import { absoluteUrl, SITE } from '@/lib/site';

const title = 'Privacy Policy';
const description = `How Torio, operated by ${SITE.company}, collects, uses, shares and protects information, and how you can delete your account.`;
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl('/privacy') },
  openGraph: {
    type: 'article',
    url: absoluteUrl('/privacy'),
    siteName: SITE.name,
    title: `${title} · ${SITE.name}`,
    description,
  },
  twitter: { card: 'summary_large_image', title: `${title} · ${SITE.name}`, description },
};

export default function Page() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 border-b border-line pb-8">
        <h1 className="m-0 text-[36px] font-bold leading-tight tracking-[-0.025em] sm:text-[44px]">
          Privacy Policy
        </h1>
        <p className="m-0 mt-3 text-[15px] text-muted">
          Last updated: <time dateTime={SITE.policyUpdated}>{SITE.policyUpdatedLabel}</time>
        </p>
      </header>
      <div className="grid gap-12 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Table of contents" className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="m-0 mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink">
            Contents
          </h2>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
            {POLICY.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-muted no-underline hover:text-primary hover:underline"
                >
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article>
          {POLICY.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-24 border-b border-line-subtle pb-8 pt-8 first:pt-0 last:border-b-0"
            >
              <h2 className="m-0 mb-4 text-[24px] font-semibold tracking-[-0.015em] text-ink">
                {i + 1}. {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
