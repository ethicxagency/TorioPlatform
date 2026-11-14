import { Compare } from './compare';
import { Evolution } from './evolution';
import { FinalCta } from './final-cta';
import { BrainHero } from './hero';
import { Intelligence } from './intelligence';
import { Knowledge } from './knowledge';
import { MultiAi } from './multi-ai';
import { Rules } from './rules';
import { UseCases } from './use-cases';

/** The public Torio Brain product page. Sections are independent client islands inside one server-rendered page. */
export function BrainLanding() {
  return (
    <div className="overflow-x-clip">
      <BrainHero />
      <Intelligence />
      <Knowledge />
      <Compare />
      <MultiAi />
      <Rules />
      <UseCases />
      <Evolution />
      <FinalCta />
    </div>
  );
}
