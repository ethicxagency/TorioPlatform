import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { BrainVisual } from './brain-visual';
import { btnGhost, btnPrimary, eyebrow, wrap } from './shared';

export function BrainHero() {
  return (
    <section
      aria-labelledby="brain-hero"
      className="relative overflow-hidden bg-[radial-gradient(120%_80%_at_75%_10%,#EFEBFF_0%,#F7F6FF_45%,#FFFFFF_80%)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-24 h-[420px] w-[420px] rounded-full bg-[#E3E4FF] opacity-60 blur-3xl"
      />
      <div
        className={`${wrap} relative grid items-center gap-8 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.02fr_1fr] lg:gap-6 lg:pb-24 lg:pt-24`}
      >
        <div className="bl-enter">
          <p className={eyebrow}>Torio Brain</p>
          <h1
            id="brain-hero"
            className="m-0 mt-4 text-[46px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#0F1033] sm:text-[64px] lg:text-[76px]"
          >
            Your Business.
            <br />
            <span className="bg-gradient-to-r from-[#5B5CE2] to-[#8B5CF6] bg-clip-text text-transparent">
              Understood.
            </span>
          </h1>
          <p className="m-0 mt-6 max-w-[500px] text-[18px] leading-relaxed text-[#4A4D6A]">
            An AI that understands your business, learns your rules, and helps every conversation
            feel personal.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#intelligence" className={btnPrimary}>
              Explore Torio Brain <ArrowRight size={17} aria-hidden />
            </a>
            <Link href="/signup" className={btnGhost}>
              Get Started
            </Link>
          </div>
        </div>
        <div className="bl-enter [animation-delay:150ms]">
          <BrainVisual className="mx-auto max-w-[560px]" />
        </div>
      </div>
    </section>
  );
}
