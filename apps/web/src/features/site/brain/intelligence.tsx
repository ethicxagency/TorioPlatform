'use client';

import { BookOpenText, Package, Palette, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { BrainVisual } from './brain-visual';
import { Reveal } from './reveal';
import { eyebrow, h2, lead, wrap } from './shared';

interface NodeDef {
  key: string;
  label: string;
  icon: LucideIcon;
  text: string;
  color: string;
  /** Position of the node on the map, in percent. */
  x: number;
  y: number;
}
const NODES: NodeDef[] = [
  {
    key: 'knowledge',
    label: 'Business Knowledge',
    icon: BookOpenText,
    color: '#5B5CE2',
    x: 14,
    y: 22,
    text: 'Your profile, policies and answers: what your business actually knows.',
  },
  {
    key: 'products',
    label: 'Products & Services',
    icon: Package,
    color: '#0EA5A4',
    x: 86,
    y: 22,
    text: 'What you sell, at what price, so answers name the right things.',
  },
  {
    key: 'voice',
    label: 'Brand Voice',
    icon: Palette,
    color: '#C026D3',
    x: 14,
    y: 78,
    text: 'How you sound: tone, greetings and the words you prefer or avoid.',
  },
  {
    key: 'rules',
    label: 'Rules & Behavior',
    icon: ShieldCheck,
    color: '#D97706',
    x: 86,
    y: 78,
    text: 'What the AI must do, never do, and when it should hand over to your team.',
  },
];

export function Intelligence() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <section
      id="intelligence"
      aria-labelledby="intel-h"
      className="scroll-mt-16 bg-white py-20 sm:py-28"
    >
      <div className={wrap}>
        <Reveal className="mx-auto max-w-[680px] text-center">
          <p className={eyebrow}>Beyond a chatbot</p>
          <h2 id="intel-h" className={h2}>
            Not Just AI. Business Intelligence.
          </h2>
          <p className={`${lead} mx-auto`}>
            Torio Brain understands your products, customers, policies and the way your business
            works.
          </p>
        </Reveal>

        <Reveal className="mt-12">
          {/* Desktop and tablet: a map. The Brain sits in the middle and four sources flow into it. */}
          <div className="relative mx-auto hidden aspect-[16/9] max-w-[980px] sm:block">
            <svg
              viewBox="0 0 100 56"
              preserveAspectRatio="none"
              aria-hidden
              className="absolute inset-0 h-full w-full"
            >
              {NODES.map((n) => {
                const x = n.x;
                const y = (n.y / 100) * 56;
                const on = active === n.key;
                return (
                  <path
                    key={n.key}
                    d={`M${x} ${y} C ${x < 50 ? 34 : 66} ${y}, ${x < 50 ? 40 : 60} 28, 50 28`}
                    fill="none"
                    stroke={n.color}
                    strokeWidth={on ? 0.55 : 0.28}
                    strokeOpacity={on ? 1 : active ? 0.18 : 0.5}
                    vectorEffect="non-scaling-stroke"
                    className="bl-flow transition-[stroke-opacity,stroke-width] duration-200"
                  />
                );
              })}
            </svg>
            <div className="absolute left-1/2 top-1/2 w-[34%] -translate-x-1/2 -translate-y-1/2">
              <BrainVisual decorative />
            </div>
            {NODES.map((n) => {
              const on = active === n.key;
              return (
                <div
                  key={n.key}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${n.x}%`, top: `${n.y}%` }}
                >
                  <button
                    type="button"
                    aria-describedby={`tip-${n.key}`}
                    aria-pressed={on}
                    onMouseEnter={() => setActive(n.key)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(n.key)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-2xl border bg-white px-3.5 py-2.5 text-left shadow-[0_10px_30px_-14px_rgba(40,40,120,0.35)] transition-[transform,border-color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                      on
                        ? '-translate-y-0.5 shadow-[0_16px_36px_-14px_rgba(40,40,120,0.5)]'
                        : 'border-[#E6E6F8]',
                    )}
                    style={on ? { borderColor: n.color } : undefined}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${n.color}1A`, color: n.color }}
                    >
                      <n.icon size={18} aria-hidden />
                    </span>
                    <span className="whitespace-nowrap text-[14px] font-semibold text-[#0F1033]">
                      {n.label}
                    </span>
                  </button>
                  <p
                    id={`tip-${n.key}`}
                    role="tooltip"
                    className={cn(
                      'pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-[230px] -translate-x-1/2 rounded-xl bg-[#14153F] px-3 py-2 text-[12.5px] leading-snug text-white transition-opacity duration-200 motion-reduce:transition-none',
                      on ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    {n.text}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Phones: the same four sources, stacked under the Brain. */}
          <div className="sm:hidden">
            <BrainVisual className="mx-auto max-w-[300px]" decorative />
            <ul className="m-0 mt-2 flex list-none flex-col gap-2.5 p-0">
              {NODES.map((n) => (
                <li
                  key={n.key}
                  className="flex gap-3 rounded-2xl border border-[#E6E6F8] bg-white p-3.5"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${n.color}1A`, color: n.color }}
                  >
                    <n.icon size={19} aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[14.5px] font-semibold text-[#0F1033]">
                      {n.label}
                    </span>
                    <span className="block text-[13px] leading-snug text-[#4A4D6A]">{n.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
