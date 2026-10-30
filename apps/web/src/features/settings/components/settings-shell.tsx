'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { GROUPS, SETTINGS } from '../nav';
import { GuardProvider, useSettingsGuard } from './guard';

function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = useWorkspace();
  const { dirty, setDirty } = useSettingsGuard();
  const [pending, setPending] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  const visible = SETTINGS.filter((s) => !s.needs || can(s.needs));
  const current = visible.find((s) => pathname.startsWith(s.href));

  const go = (e: React.MouseEvent, href: string) => {
    if (dirty && href !== pathname) {
      e.preventDefault();
      setPending(href);
    }
  };
  const list = (
    <ul className="m-0 list-none p-0">
      <li>
        <Link
          href="/settings"
          aria-current={pathname === '/settings' ? 'page' : undefined}
          onClick={(e) => go(e, '/settings')}
          className={cn(
            'flex h-8 items-center rounded-lg px-2.5 text-[13px] no-underline hover:bg-wash hover:no-underline',
            pathname === '/settings'
              ? 'bg-primary-soft font-semibold text-primary-hover'
              : 'text-muted',
          )}
        >
          Overview
        </Link>
      </li>
      {GROUPS.map((g) => {
        const items = visible.filter((s) => s.group === g);
        if (!items.length) return null;
        return (
          <li key={g} className="mt-3">
            <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
              {g}
            </div>
            <ul className="m-0 list-none p-0">
              {items.map((s) => {
                const active = pathname.startsWith(s.href);
                return (
                  <li key={s.key}>
                    <Link
                      href={s.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={(e) => go(e, s.href)}
                      className={cn(
                        'flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] no-underline hover:bg-wash hover:no-underline',
                        active ? 'bg-primary-soft font-semibold text-primary-hover' : 'text-muted',
                      )}
                    >
                      <s.icon size={14} aria-hidden />
                      <span className="flex-1 truncate">{s.title}</span>
                      {s.unavailable && (
                        <span className="rounded bg-wash-2 px-1.5 text-[10.5px] text-faint">
                          Soon
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <nav
        aria-label="Settings"
        className="lg:sticky lg:top-5 lg:w-[232px] lg:shrink-0 lg:self-start"
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls="settings-nav-list"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-full cursor-pointer items-center justify-between rounded-xl border border-line bg-white px-3 text-[13px] font-medium lg:hidden"
        >
          <span>{current?.title ?? 'Settings overview'}</span>
          <ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
        <div
          id="settings-nav-list"
          className={cn(
            'mt-2 rounded-xl border border-line bg-white p-2 lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0',
            open ? 'block' : 'hidden',
          )}
        >
          {list}
        </div>
      </nav>
      {pending && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You have edits that haven’t been saved. If you leave this page they will be lost."
          confirmLabel="Discard changes"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setDirty(false);
            router.push(pending);
            setPending(null);
          }}
        />
      )}
    </>
  );
}

export function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <GuardProvider>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pb-10 pt-5 sm:px-6 lg:flex-row lg:gap-8">
        <Nav />
        <div className="min-w-0 flex-1 lg:max-w-[760px]">{children}</div>
      </div>
    </GuardProvider>
  );
}
