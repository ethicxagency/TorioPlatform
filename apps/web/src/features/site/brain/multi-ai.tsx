'use client';

import { Cpu, GitMerge, Layers, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Reveal, useInView } from './reveal';
import { eyebrow, h2, wrap } from './shared';

const STAGES = [
  {
    icon: Cpu,
    title: 'AI models respond',
    text: 'One or more supported models write candidate replies.',
  },
  {
    icon: Layers,
    title: 'Torio Brain evaluates',
    text: 'Candidates are scored against your knowledge.',
  },
  {
    icon: ShieldCheck,
    title: 'Business rules applied',
    text: 'Context, voice and rules shape the reply.',
  },
  {
    icon: Sparkles,
    title: 'Response refined',
    text: 'Checked for ungrounded figures and banned terms.',
  },
  {
    icon: Send,
    title: 'Ready for your team',
    text: 'A draft, reviewed by a person before it is sent.',
  },
] as const;
const PROVIDERS = ['OpenAI', 'Gemini'];

/** The pipeline Torio runs for an AI Assist draft. It describes what exists: the number of models used depends on settings and plan. */
export function MultiAi() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [step, setStep] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (!inView || hold) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STAGES.length), 1800);
    return () => clearInterval(t);
  }, [inView, hold]);
  return (
    <section
      aria-labelledby="mai-h"
      className="relative overflow-hidden bg-[#0E0F2E] py-20 text-white sm:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[#5B5CE2] opacity-25 blur-[110px]"
      />
      <div className={`${wrap} relative`}>
        <Reveal className="mx-auto max-w-[720px] text-center">
          <p className={`${eyebrow} text-[#A9A8FF]`}>Multi-AI intelligence</p>
          <h2 id="mai-h" className={`${h2} text-white`}>
            Multiple AI Perspectives. One Intelligent Response.
          </h2>
          <p className="m-0 mx-auto mt-4 max-w-[560px] text-[17px] leading-relaxed text-[#B9BADF]">
            Torio brings AI capabilities together with your business context to create more relevant
            responses.
          </p>
        </Reveal>

        <Reveal className="mt-14">
          <div ref={ref} className="mx-auto max-w-[1000px]">
            <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5 lg:gap-0">
              {STAGES.map((s, i) => {
                const on = i === step;
                const done = i < step;
                return (
                  <li key={s.title} className="relative lg:px-2">
                    {i > 0 && (
                      <span
                        aria-hidden
                        className="absolute -left-1/2 top-[27px] hidden h-px w-full lg:block"
                      >
                        <span
                          className={cn(
                            'block h-full origin-left bg-gradient-to-r from-[#5B5CE2] to-[#8B5CF6] transition-transform duration-700 motion-reduce:transition-none',
                            i <= step ? 'scale-x-100' : 'scale-x-0',
                          )}
                        />
                        <span className="absolute inset-0 -z-10 bg-white/10" />
                      </span>
                    )}
                    <button
                      type="button"
                      aria-current={on ? 'step' : undefined}
                      onMouseEnter={() => {
                        setHold(true);
                        setStep(i);
                      }}
                      onMouseLeave={() => setHold(false)}
                      onFocus={() => {
                        setHold(true);
                        setStep(i);
                      }}
                      onBlur={() => setHold(false)}
                      className="relative flex w-full cursor-pointer flex-col items-start gap-3 rounded-2xl border-none bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#A9A8FF] lg:items-center lg:text-center"
                    >
                      <span
                        className={cn(
                          'relative flex h-14 w-14 items-center justify-center rounded-2xl border transition-[background-color,border-color,box-shadow,transform] duration-300 motion-reduce:transition-none',
                          on
                            ? '-translate-y-1 border-[#8B7CFF] bg-[#5B5CE2] shadow-[0_12px_40px_-8px_rgba(124,92,255,0.9)]'
                            : done
                              ? 'border-[#5B5CE2]/60 bg-[#5B5CE2]/30'
                              : 'border-white/15 bg-white/5',
                        )}
                      >
                        <s.icon
                          size={22}
                          aria-hidden
                          className={on || done ? 'text-white' : 'text-[#9798C8]'}
                        />
                      </span>
                      <span>
                        <span className="block text-[14.5px] font-semibold text-white">
                          {s.title}
                        </span>
                        <span
                          className={cn(
                            'mt-1 block text-[12.5px] leading-snug transition-colors duration-300',
                            on ? 'text-[#D6D6F5]' : 'text-[#8E90BB]',
                          )}
                        >
                          {s.text}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-[13px] text-[#B9BADF]">
              <span className="inline-flex items-center gap-2">
                <GitMerge size={15} aria-hidden /> Supported providers
              </span>
              {PROVIDERS.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-medium text-white"
                >
                  {p}
                </span>
              ))}
            </div>
            <p className="m-0 mx-auto mt-4 max-w-[640px] text-center text-xs leading-relaxed text-[#8E90BB]">
              Depending on settings and plan, Torio can use one provider, ask a second for a second
              opinion, or compare independent candidates and merge them. It always prepares a draft
              for review; it does not guarantee a perfect answer.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
