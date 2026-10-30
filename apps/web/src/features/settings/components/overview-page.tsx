'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { NOT_AVAILABLE, SETTINGS } from '../nav';

export function OverviewPage() {
  const router = useRouter();
  const { can } = useWorkspace();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const usable = SETTINGS.filter((s) => !s.unavailable && (!s.needs || can(s.needs)));
  const term = q.trim().toLowerCase();
  const results = term
    ? usable.filter((s) =>
        [s.title, s.description, ...s.keywords].some((t) => t.toLowerCase().includes(term)),
      )
    : [];
  const cards = SETTINGS.filter((s) => !s.needs || can(s.needs));

  const onKey = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      router.push(results[Math.min(active, results.length - 1)]!.href);
    } else if (e.key === 'Escape') setQ('');
  };

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-1 text-xs text-faint">
        <span className="text-muted">Settings</span>
      </nav>
      <h1 className="m-0 text-2xl font-semibold tracking-[-0.015em]">Settings</h1>
      <p className="m-0 mb-5 mt-1 text-sm text-muted">
        Manage your account, workspace, security, and preferences.
      </p>

      <div className="relative mb-5">
        <label className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-white px-3">
          <Search size={15} className="text-faint" aria-hidden />
          <input
            role="combobox"
            aria-label="Search settings"
            aria-expanded={!!term}
            aria-controls={`${id}-list`}
            aria-activedescendant={
              results.length ? `${id}-${Math.min(active, results.length - 1)}` : undefined
            }
            value={q}
            placeholder="Search settings, e.g. password or currency"
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            className="min-w-0 flex-1 border-none bg-transparent text-[13.5px]"
          />
        </label>
        {term && (
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label="Matching settings"
            className="absolute left-0 right-0 top-12 z-20 m-0 list-none rounded-xl border border-line bg-white p-1.5 shadow-popover"
          >
            {results.length === 0 && (
              <li className="px-3 py-3 text-[13px] text-muted">
                No settings match “{q.trim()}”. Try a word like “password”, “time zone” or
                “currency”.
              </li>
            )}
            {results.map((s, i) => (
              <li
                key={s.key}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => router.push(s.href)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2',
                  i === active && 'bg-primary-soft',
                )}
              >
                <s.icon size={15} className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{s.title}</span>
                  <span className="block truncate text-xs text-muted">{s.description}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {cards.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className="flex h-full items-start gap-3 rounded-card border border-line bg-white p-4 no-underline hover:border-[#D4D6F5] hover:bg-[#FBFBFF] hover:no-underline"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary-hover">
                <s.icon size={17} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                  {s.title}
                  {s.unavailable && (
                    <span className="rounded bg-wash-2 px-1.5 text-[10.5px] font-medium text-faint">
                      Not available yet
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{s.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-label="Not available yet" className="mt-6">
        <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">
          Not available yet
        </h2>
        <ul className="m-0 mt-2 list-none divide-y divide-line-subtle rounded-card border border-dashed border-line bg-white p-0">
          {NOT_AVAILABLE.map((n) => (
            <li
              key={n.title}
              className="flex flex-wrap justify-between gap-x-4 px-4 py-2.5 text-[13px]"
            >
              <span className="font-medium text-muted">{n.title}</span>
              <span className="text-faint">{n.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
