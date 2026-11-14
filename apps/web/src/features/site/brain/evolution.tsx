import { BRAIN_RELEASE } from '@torio/contracts';
import { BookOpen, Cpu, ListChecks, Tag } from 'lucide-react';
import { Reveal } from './reveal';
import { eyebrow, h2, lead, wrap } from './shared';

const STEPS = [
  {
    icon: BookOpen,
    title: 'Knowledge updates',
    text: 'Add or change what the Brain knows, and save. Each save is recorded.',
  },
  {
    icon: ListChecks,
    title: 'New business rules',
    text: 'Write new rules and instructions as your business changes.',
  },
  {
    icon: Cpu,
    title: 'AI capability improvements',
    text: 'Torio improves how the Brain uses AI, and ships it as a numbered release.',
  },
];

export function Evolution() {
  return (
    <section
      aria-labelledby="evo-h"
      className="bg-[linear-gradient(180deg,#F7F6FF,#FFFFFF)] py-20 sm:py-28"
    >
      <div className={wrap}>
        <Reveal className="mx-auto max-w-[700px] text-center">
          <p className={eyebrow}>Learning &amp; evolution</p>
          <h2 id="evo-h" className={h2}>
            Intelligence That Evolves With Your Business.
          </h2>
          <p className={`${lead} mx-auto`}>
            What the Brain knows is what you teach it, and it is versioned so you always know which
            Brain you are on.
          </p>
        </Reveal>
        <Reveal className="mt-14">
          <ol className="relative m-0 mx-auto grid max-w-[980px] list-none gap-6 p-0 md:grid-cols-4 md:gap-0">
            <span
              aria-hidden
              className="absolute left-[5%] right-[5%] top-[27px] hidden h-px bg-gradient-to-r from-transparent via-[#B7B5F0] to-transparent md:block"
            />
            {STEPS.map((s) => (
              <li
                key={s.title}
                className="relative flex gap-4 md:flex-col md:items-center md:gap-3 md:px-3 md:text-center"
              >
                <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#D9D9F5] bg-white text-primary shadow-[0_10px_30px_-16px_rgba(60,60,160,0.5)]">
                  <s.icon size={22} aria-hidden />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-[#0F1033]">{s.title}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-[#4A4D6A]">
                    {s.text}
                  </span>
                </span>
              </li>
            ))}
            <li className="relative flex gap-4 md:flex-col md:items-center md:gap-3 md:px-3 md:text-center">
              <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_14px_36px_-10px_rgba(91,92,226,0.8)]">
                <Tag size={22} aria-hidden />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-[#0F1033]">
                  Brain version
                </span>
                <span
                  data-testid="landing-brain-version"
                  className="mt-1 inline-flex rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-primary-hover"
                >
                  v{BRAIN_RELEASE.version}
                </span>
              </span>
            </li>
          </ol>
        </Reveal>
        <p className="m-0 mt-8 text-center text-xs text-[#8A8DAA]">
          The Brain does not train itself on your conversations: it knows what you save and follows
          the rules you write.
        </p>
      </div>
    </section>
  );
}
