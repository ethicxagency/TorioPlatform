'use client';

import { ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { TorioLogo } from '@/components/shell/torio-logo';
import { cn } from '@/lib/utils';

const LINKS = [
  { label: 'Product', href: '/#product' },
  { label: 'Features', href: '/#features' },
  { label: 'Integrations', href: '/#integrations' },
  { label: 'Pricing', href: '/#pricing' },
] as const;
const RESOURCES = [
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Account Deletion', href: '/delete-account' },
] as const;

const link =
  'rounded-md px-3 py-2 text-[14.5px] font-medium text-ink-secondary no-underline transition-colors duration-150 hover:bg-wash hover:text-ink hover:no-underline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none';

/** Sticky public header. Anchors work from every public page (`/#features` goes home first). */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setRes(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setRes(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line-subtle bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Torio home" className="flex shrink-0">
          <TorioLogo className="h-8 w-auto object-contain" />
        </Link>
        <nav aria-label="Primary" className="ml-6 hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={link}>
              {l.label}
            </a>
          ))}
          <div ref={menu} className="relative">
            <button
              type="button"
              aria-expanded={res}
              aria-haspopup="menu"
              onClick={() => setRes((v) => !v)}
              className={cn(
                link,
                'inline-flex cursor-pointer items-center gap-1 border-none bg-transparent',
              )}
            >
              Resources{' '}
              <ChevronDown
                size={15}
                aria-hidden
                className={cn(
                  'transition-transform duration-150 motion-reduce:transition-none',
                  res && 'rotate-180',
                )}
              />
            </button>
            {res && (
              <div
                role="menu"
                className="absolute left-0 top-full mt-1 w-[210px] animate-panel-in rounded-xl border border-line bg-white p-1.5 shadow-popover motion-reduce:animate-none"
              >
                {RESOURCES.map((r) => (
                  <Link
                    key={r.href}
                    role="menuitem"
                    href={r.href}
                    className="block rounded-lg px-3 py-2 text-[14px] font-medium text-ink no-underline hover:bg-wash hover:no-underline"
                  >
                    {r.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="rounded-[10px] px-3.5 py-2 text-[14.5px] font-semibold text-ink no-underline hover:bg-wash hover:no-underline"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-[10px] bg-primary px-4 py-2 text-[14.5px] font-semibold text-white no-underline transition-colors duration-150 hover:bg-primary-hover hover:no-underline motion-reduce:transition-none"
          >
            Get started
          </Link>
        </div>
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="site-mobile-menu"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-line bg-white text-ink md:hidden"
        >
          {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
        </button>
      </div>
      {open && (
        <nav
          id="site-mobile-menu"
          aria-label="Mobile"
          className="animate-panel-in border-t border-line-subtle bg-white px-4 pb-4 pt-2 motion-reduce:animate-none md:hidden"
        >
          <ul className="m-0 flex list-none flex-col p-0">
            {[...LINKS, ...RESOURCES].map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-[15px] font-medium text-ink no-underline hover:bg-wash hover:no-underline"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/login"
              className="flex h-11 items-center justify-center rounded-[10px] border border-line text-[15px] font-semibold text-ink no-underline hover:no-underline"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="flex h-11 items-center justify-center rounded-[10px] bg-primary text-[15px] font-semibold text-white no-underline hover:no-underline"
            >
              Get started
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
