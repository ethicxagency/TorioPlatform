import Link from 'next/link';
import { TorioLogo } from '@/components/shell/torio-logo';
import { LEGAL, SITE } from '@/lib/site';

const col = 'm-0 flex list-none flex-col gap-2.5 p-0 text-[14px]';
const a = 'text-muted no-underline hover:text-ink hover:underline';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-wash">
      <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <TorioLogo className="h-8 w-auto object-contain" />
            <p className="m-0 mt-3 max-w-[260px] text-[13.5px] leading-relaxed text-muted">
              {SITE.tagline}
            </p>
          </div>
          <nav aria-label="Product">
            <h2 className="m-0 mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink">
              Product
            </h2>
            <ul className={col}>
              <li>
                <Link className={a} href="/#features">
                  Features
                </Link>
              </li>
              <li>
                <Link className={a} href="/#integrations">
                  Integrations
                </Link>
              </li>
              <li>
                <Link className={a} href="/#pricing">
                  Pricing
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <h2 className="m-0 mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink">
              Company
            </h2>
            <ul className={col}>
              <li>
                <Link className={a} href="/#about">
                  About Torio
                </Link>
              </li>
              {LEGAL.contactEmail && (
                <li>
                  <a className={a} href={`mailto:${LEGAL.contactEmail}`}>
                    Contact
                  </a>
                </li>
              )}
            </ul>
          </nav>
          <nav aria-label="Resources">
            <h2 className="m-0 mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink">
              Resources
            </h2>
            <ul className={col}>
              <li>
                <Link className={a} href="/privacy-policy">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link className={a} href="/delete-account">
                  Account Deletion
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <h2 className="m-0 mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink">
              Account
            </h2>
            <ul className={col}>
              <li>
                <Link className={a} href="/login">
                  Sign in
                </Link>
              </li>
              <li>
                <Link className={a} href="/signup">
                  Create account
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-1 border-t border-line pt-6 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Torio. All rights reserved.</span>
          <span>Powered by {SITE.company}.</span>
        </div>
      </div>
    </footer>
  );
}
