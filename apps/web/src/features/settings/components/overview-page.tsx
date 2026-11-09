'use client';

import { ChevronRight } from 'lucide-react';
import { ActionCard } from '@/components/ui/card';
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
        className="m-0 mt-7 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3"
      >
        {cards.map((s) => (
          <li key={s.key} className="min-w-0">
            <ActionCard
              href={s.href}
              icon={<s.icon size={18} strokeWidth={1.8} aria-hidden />}
              title={s.title}
              description={s.description}
              badge={
                s.unavailable && (
                  <span className="shrink-0 rounded-[5px] bg-wash-2 px-1.5 py-px text-[10.5px] font-medium text-muted">
                    Soon
                  </span>
                )
              }
              trailing={
                <ChevronRight
                  size={16}
                  className="mt-2.5 shrink-0 text-faint transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                  aria-hidden
                />
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
