'use client';

import { Bot, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Reveal, useInView } from './reveal';
import { eyebrow, h2, lead, wrap } from './shared';

const QUESTION = 'Do you deliver to Chattogram, and how long does it take?';
const GENERIC =
  'Delivery times can vary depending on your location. Please check the website or contact support for details.';
const BRAIN =
  'Yes, we deliver to Chattogram in 2–3 working days. Orders above ৳2,000 ship free. Shall I reserve the Linen Sofa for you?';
const USES = [
  'Business knowledge',
  'Brand voice',
  'Product information',
  'Company policies',
  'Custom instructions',
];

export function Compare() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [mode, setMode] = useState<'generic' | 'brain'>('generic');
  const [auto, setAuto] = useState(true);
  // It plays on its own once, while visible, then leaves control to the reader.
  useEffect(() => {
    if (!inView || !auto) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => {
      setMode('brain');
      setAuto(false);
    }, 2200);
    return () => clearTimeout(t);
  }, [inView, auto]);
  const brain = mode === 'brain';
  return (
    <section aria-labelledby="cmp-h" className="bg-white py-20 sm:py-28">
      <div className={wrap}>
        <Reveal className="mx-auto max-w-[680px] text-center">
          <p className={eyebrow}>Personalized responses</p>
          <h2 id="cmp-h" className={h2}>
            Generic Answers Are Not Enough.
          </h2>
          <p className={`${lead} mx-auto`}>
            Every response is shaped by your business knowledge, brand voice and rules.
          </p>
        </Reveal>
        <Reveal className="mt-12">
          <div ref={ref} className="mx-auto max-w-[920px]">
            <div className="mb-4 flex justify-center">
              <div
                role="tablist"
                aria-label="Compare answers"
                className="relative inline-flex rounded-full border border-[#E1E1F5] bg-[#F7F7FF] p-1"
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-transform duration-300 motion-reduce:transition-none',
                    brain ? 'translate-x-full' : 'translate-x-0',
                  )}
                />
                {(['generic', 'brain'] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    type="button"
                    aria-selected={mode === m}
                    onClick={() => {
                      setAuto(false);
                      setMode(m);
                    }}
                    className={cn(
                      'relative z-10 h-10 min-w-[150px] cursor-pointer rounded-full border-none bg-transparent px-4 text-[14px] font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary',
                      mode === m ? 'text-[#0F1033]' : 'text-[#6A6D8C]',
                    )}
                  >
                    {m === 'generic' ? 'Generic AI' : 'Torio Brain'}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#E6E6F8] bg-[linear-gradient(180deg,#FBFBFF,#F4F3FF)] p-4 sm:p-7">
              <div className="flex justify-end">
                <p className="m-0 max-w-[85%] rounded-2xl rounded-br-md bg-[#14153F] px-4 py-3 text-[14.5px] leading-snug text-white sm:max-w-[70%]">
                  {QUESTION}
                </p>
              </div>
              <div key={mode} className="bl-swap mt-4 flex gap-3" role="tabpanel">
                <span
                  className={cn(
                    'mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors duration-300',
                    brain ? 'bg-primary' : 'bg-[#9A9DB5]',
                  )}
                >
                  {brain ? <Sparkles size={16} aria-hidden /> : <Bot size={16} aria-hidden />}
                </span>
                <div
                  className={cn(
                    'max-w-[640px] rounded-2xl rounded-tl-md border bg-white px-4 py-3.5 shadow-sm',
                    brain ? 'border-primary/40' : 'border-[#E6E6F8]',
                  )}
                >
                  <p className="m-0 text-[15px] leading-relaxed text-[#1A1B4B]">
                    {brain ? BRAIN : GENERIC}
                  </p>
                  <p className="m-0 mt-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#8A8DAA]">
                    {brain ? 'Torio Brain, using this business’s knowledge' : 'A generic AI answer'}
                  </p>
                </div>
              </div>
              <ul
                className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0"
                aria-label="What shapes the answer"
              >
                {USES.map((u, i) => (
                  <li
                    key={u}
                    style={{ transitionDelay: brain ? `${i * 70}ms` : '0ms' }}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[12.5px] font-medium transition-[opacity,transform,background-color] duration-300 motion-reduce:transition-none',
                      brain
                        ? 'border-primary/30 bg-primary-soft text-primary-hover opacity-100'
                        : 'translate-y-1 border-[#E6E6F8] bg-white text-[#9A9DB5] opacity-60',
                    )}
                  >
                    {u}
                  </li>
                ))}
              </ul>
            </div>
            <p className="m-0 mt-3 text-center text-xs text-[#8A8DAA]">
              An illustrative example with sample business details. Real answers depend on what a
              business saves in its Brain, and your team reviews a draft before anything is sent.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
