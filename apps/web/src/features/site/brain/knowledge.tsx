'use client';

import {
  Building2,
  FileText,
  Palette,
  Package,
  Receipt,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { BrainVisual } from './brain-visual';
import { Reveal } from './reveal';
import { eyebrow, h2, lead, wrap } from './shared';

const PANELS: {
  key: string;
  label: string;
  icon: LucideIcon;
  line: string;
  side: 'l' | 'r';
  row: number;
}[] = [
  {
    key: 'profile',
    label: 'Business Profile',
    icon: Building2,
    line: 'Who you are, where you operate, how to reach you',
    side: 'l',
    row: 0,
  },
  {
    key: 'catalog',
    label: 'Product Catalog',
    icon: Package,
    line: 'Names, categories, variants and stock notes',
    side: 'r',
    row: 0,
  },
  {
    key: 'faqs',
    label: 'FAQs',
    icon: FileText,
    line: 'The answers you give every day',
    side: 'l',
    row: 1,
  },
  {
    key: 'pricing',
    label: 'Pricing Information',
    icon: Receipt,
    line: 'Prices, offers and payment methods',
    side: 'r',
    row: 1,
  },
  {
    key: 'policies',
    label: 'Customer Policies',
    icon: ScrollText,
    line: 'Delivery, returns and refunds',
    side: 'l',
    row: 2,
  },
  {
    key: 'brand',
    label: 'Brand Guidelines',
    icon: Palette,
    line: 'Voice, tone and wording to use or avoid',
    side: 'r',
    row: 2,
  },
];

function Panel({
  p,
  on,
  set,
}: {
  p: (typeof PANELS)[number];
  on: boolean;
  set: (k: string | null) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onMouseEnter={() => set(p.key)}
        onMouseLeave={() => set(null)}
        onFocus={() => set(p.key)}
        onBlur={() => set(null)}
        className={cn(
          'flex w-full cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3.5 text-left transition-[transform,border-color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
          on
            ? '-translate-y-0.5 border-primary shadow-[0_14px_34px_-16px_rgba(91,92,226,0.6)]'
            : 'border-[#E6E6F8]',
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
            on ? 'bg-primary text-white' : 'bg-primary-soft text-primary',
          )}
        >
          <p.icon size={17} aria-hidden />
        </span>
        <span>
          <span className="block text-[14px] font-semibold text-[#0F1033]">{p.label}</span>
          <span className="block text-[12.5px] leading-snug text-[#4A4D6A]">{p.line}</span>
        </span>
      </button>
    </li>
  );
}

export function Knowledge() {
  const [on, setOn] = useState<string | null>(null);
  const left = PANELS.filter((p) => p.side === 'l');
  const right = PANELS.filter((p) => p.side === 'r');
  return (
    <section
      aria-labelledby="know-h"
      className="bg-[linear-gradient(180deg,#F7F6FF_0%,#FFFFFF_100%)] py-20 sm:py-28"
    >
      <div className={wrap}>
        <Reveal className="mx-auto max-w-[680px] text-center">
          <p className={eyebrow}>Business knowledge</p>
          <h2 id="know-h" className={h2}>
            It Knows What Your Business Knows.
          </h2>
          <p className={`${lead} mx-auto`}>
            From products and pricing to policies and FAQs, Torio Brain uses your business knowledge
            to create relevant answers.
          </p>
        </Reveal>
        <Reveal className="mt-12">
          <div className="relative mx-auto grid max-w-[980px] items-center gap-4 lg:grid-cols-[1fr_minmax(240px,0.8fr)_1fr] lg:gap-8">
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {left.map((p) => (
                <Panel key={p.key} p={p} on={on === p.key} set={setOn} />
              ))}
            </ul>
            <div className="relative order-first mx-auto w-[min(70%,300px)] lg:order-none lg:w-full">
              {/* Lines from each side into the Brain light up with the panel that is being looked at. */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
                className="absolute -inset-x-[34%] inset-y-0 hidden h-full w-[168%] lg:block"
              >
                {PANELS.map((p) => {
                  const y = 18 + p.row * 32;
                  const l = p.side === 'l';
                  return (
                    <path
                      key={p.key}
                      d={`M${l ? 0 : 100} ${y} C ${l ? 22 : 78} ${y}, ${l ? 30 : 70} 50, 50 50`}
                      fill="none"
                      stroke="#5B5CE2"
                      strokeWidth={on === p.key ? 0.7 : 0.35}
                      strokeOpacity={on === p.key ? 1 : on ? 0.15 : 0.45}
                      vectorEffect="non-scaling-stroke"
                      className="bl-flow transition-[stroke-opacity,stroke-width] duration-200"
                    />
                  );
                })}
              </svg>
              <BrainVisual decorative />
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {right.map((p) => (
                <Panel key={p.key} p={p} on={on === p.key} set={setOn} />
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
