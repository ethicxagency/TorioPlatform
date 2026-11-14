'use client';

import {
  Hand,
  Megaphone,
  ScrollText,
  ShieldAlert,
  Sparkles,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from './reveal';
import { eyebrow, h2, lead, wrap } from './shared';

const RULES: { key: string; label: string; icon: LucideIcon; rule: string; reply: string }[] = [
  {
    key: 'voice',
    label: 'Brand Voice',
    icon: Megaphone,
    rule: 'Friendly, short sentences, say “Hi”, never “Dear customer”.',
    reply: 'Hi Nadia! Yes, the sofa is in stock.',
  },
  {
    key: 'guidelines',
    label: 'Response Guidelines',
    icon: Sparkles,
    rule: 'Answer first, then offer one next step.',
    reply: 'It ships in 2–3 days. Want me to book it?',
  },
  {
    key: 'policies',
    label: 'Business Policies',
    icon: ScrollText,
    rule: 'Returns within 7 days, unused items only.',
    reply: 'You can return it within 7 days if it’s unused.',
  },
  {
    key: 'escalation',
    label: 'Escalation Rules',
    icon: Hand,
    rule: 'Refund disputes go to the team.',
    reply: 'I’ll ask my teammate to look into this and reply soon.',
  },
  {
    key: 'handling',
    label: 'Customer Handling',
    icon: UserRoundCheck,
    rule: 'Use the customer’s first name. Be patient with repeat questions.',
    reply: 'Happy to explain again, Nadia. Here’s how it works…',
  },
  {
    key: 'restricted',
    label: 'Restricted Topics',
    icon: ShieldAlert,
    rule: 'No discounts that aren’t listed. No medical advice.',
    reply: 'I can only share the offers on our price list.',
  },
];

export function Rules() {
  const [on, setOn] = useState(RULES[0]!.key);
  const cur = RULES.find((r) => r.key === on)!;
  return (
    <section
      aria-labelledby="rules-h"
      className="bg-[linear-gradient(180deg,#FFFFFF,#F7F6FF)] py-20 sm:py-28"
    >
      <div className={wrap}>
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <Reveal>
            <p className={eyebrow}>Rules &amp; behavior</p>
            <h2 id="rules-h" className={h2}>
              Your Business. Your Rules.
            </h2>
            <p className={lead}>
              Define how your AI communicates, what it knows and when it should ask your team for
              help.
            </p>
            <ul className="m-0 mt-8 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2">
              {RULES.map((r) => {
                const sel = r.key === on;
                return (
                  <li key={r.key}>
                    <button
                      type="button"
                      aria-pressed={sel}
                      onMouseEnter={() => setOn(r.key)}
                      onFocus={() => setOn(r.key)}
                      onClick={() => setOn(r.key)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-white p-3 text-left transition-[transform,border-color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                        sel
                          ? '-translate-y-0.5 border-primary shadow-[0_14px_30px_-16px_rgba(91,92,226,0.6)]'
                          : 'border-[#E6E6F8] hover:border-[#C9C9F0]',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
                          sel ? 'bg-primary text-white' : 'bg-primary-soft text-primary',
                        )}
                      >
                        <r.icon size={17} aria-hidden />
                      </span>
                      <span className="text-[14px] font-semibold text-[#0F1033]">{r.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <div
              className="rounded-[28px] border border-[#E6E6F8] bg-white p-5 shadow-[0_30px_70px_-40px_rgba(60,60,160,0.5)] sm:p-7"
              aria-live="polite"
            >
              <p className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[#8A8DAA]">
                Rule
              </p>
              <div key={cur.key} className="bl-swap">
                <p className="m-0 mt-2 rounded-xl border border-dashed border-primary/40 bg-primary-soft/60 px-4 py-3 text-[14.5px] font-medium leading-snug text-[#1A1B4B]">
                  {cur.rule}
                </p>
                <p className="m-0 mt-5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[#8A8DAA]">
                  Brain draft within that rule
                </p>
                <p className="m-0 mt-2 rounded-2xl rounded-tl-md bg-[#14153F] px-4 py-3 text-[15px] leading-snug text-white">
                  {cur.reply}
                </p>
              </div>
              <p className="m-0 mt-5 text-xs text-[#8A8DAA]">
                Illustrative rule and reply. Each business writes its own.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
