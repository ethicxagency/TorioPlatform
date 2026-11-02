'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useWorkspace } from '@/lib/workspace';
import { SETTINGS } from '../nav';

/** The Settings hub: every section the member may open, as a card. */
export function OverviewPage() {
  const { can } = useWorkspace();
  const cards = SETTINGS.filter((s) => !s.needs || can(s.needs));

  return (
    <div>
      <header>
        <h1 className="m-0 font-page-title">Settings</h1>
        <p className="m-0 mt-1.5 text-[14px] text-muted">
          Manage your account, workspace, security, and preferences.
        </p>
      </header>

      <ul
        aria-label="Settings sections"
        className="m-0 mt-7 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-2 xl:grid-cols-3"
      >
        {cards.map((s) => (
          <li key={s.key} className="min-w-0">
            <Link
              href={s.href}
              className="group flex h-full items-start gap-3.5 rounded-card border border-line bg-white px-[18px] py-4 no-underline transition-[border-color,box-shadow,background-color] duration-150 hover:border-[#CFD0F5] hover:no-underline hover:shadow-[0_1px_2px_rgba(0,55,112,0.04),0_4px_12px_rgba(0,55,112,0.05)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary transition-colors duration-150 group-hover:bg-primary group-hover:text-white motion-reduce:transition-none">
                <s.icon size={18} strokeWidth={1.8} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-card-title text-ink">{s.title}</span>
                  {s.unavailable && (
                    <span className="shrink-0 rounded-[5px] bg-wash-2 px-1.5 py-px text-[10.5px] font-medium text-muted">
                      Soon
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[13px] leading-[1.5] text-muted">
                  {s.description}
                </span>
              </span>
              <ChevronRight
                size={16}
                className="mt-2.5 shrink-0 text-[#B7B9C0] transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
