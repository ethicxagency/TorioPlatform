import Link from 'next/link';
import { BrainVisual } from './brain-visual';
import { Reveal } from './reveal';
import { btnGhost, btnPrimary, wrap } from './shared';

export function FinalCta() {
  return (
    <section
      aria-labelledby="cta-h"
      className="relative overflow-hidden bg-[#0E0F2E] py-24 text-white sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 w-[min(120%,900px)] -translate-x-1/2 -translate-y-1/2 opacity-25"
      >
        <BrainVisual decorative interactive={false} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_50%,transparent,#0E0F2E_85%)]"
      />
      <div className={`${wrap} relative`}>
        <Reveal className="mx-auto max-w-[780px] text-center">
          <h2
            id="cta-h"
            className="m-0 text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[58px]"
          >
            Give Your Business an Intelligence of Its Own.
          </h2>
          <p className="m-0 mx-auto mt-5 max-w-[520px] text-[18px] leading-relaxed text-[#C4C5EA]">
            Bring your business knowledge, conversations and AI together with Torio Brain.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={btnPrimary}>
              Get Started with Torio
            </Link>
            <Link
              href="/"
              className={`${btnGhost} !border-white/25 !bg-white/10 !text-white hover:!bg-white/20`}
            >
              Explore Torio
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
