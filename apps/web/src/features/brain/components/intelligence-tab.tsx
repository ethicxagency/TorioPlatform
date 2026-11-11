'use client';

import type { BrainMaturity, SectionKey } from '@torio/contracts';
import { useAudit } from '@/features/settings/queries';
import { useWorkspace } from '@/lib/workspace';
import { fmtAgoIso } from './bits';
import { Dimensions, Journey, MaturityCard, Recommendations } from './maturity-parts';

/**
 * Everything about how well the Brain understands the business: the score, the four dimensions and what they measure,
 * the maturity journey, what unlocks the next stage, every recommendation, and recent saves. Setup completion (how much
 * of the form is filled in) is a separate measure shown on the Summary.
 */
export function IntelligenceTab({
  maturity: m,
  dirty,
  savedAt,
  savedBy,
  onGoTo,
}: {
  maturity: BrainMaturity;
  dirty: boolean;
  savedAt: string | null;
  savedBy: string | null;
  onGoTo: (section: SectionKey) => void;
}) {
  const { workspaceId, can } = useWorkspace();
  const activity = useAudit(can('audit:read') ? workspaceId : null, { page: 1, q: 'brain' });
  const recent = (activity.data?.data ?? []).filter((e) => e.action === 'brain.update').slice(0, 4);
  return (
    <div className="flex flex-col gap-5">
      {dirty && (
        <p className="m-0 rounded-xl bg-[#FBFBFC] px-3 py-2 text-xs text-muted ring-1 ring-line-subtle">
          Intelligence is evaluated on your last saved Brain. Unsaved changes count once you save.
        </p>
      )}
      <section aria-label="Intelligence score" className="flex flex-col gap-2">
        <h2 className="m-0 text-[13.5px] font-semibold">Intelligence score</h2>
        <MaturityCard m={m} maxRequirements={6} />
      </section>
      <section aria-label="Scoring dimensions" className="flex flex-col gap-2">
        <h2 className="m-0 text-[13.5px] font-semibold">How the score is made</h2>
        <p className="m-0 text-[12.5px] text-muted">
          30% quality, 25% completeness, 25% validity and 20% operational intelligence. Empty,
          vague, duplicate, inactive or invalid entries earn nothing, and volume alone never raises
          it.
        </p>
        <Dimensions m={m} />
      </section>
      <section aria-label="Maturity progression" className="flex flex-col gap-2">
        <h2 className="m-0 text-[13.5px] font-semibold">Your Brain&apos;s Growth Journey</h2>
        <div className="rounded-2xl border border-line bg-white p-4">
          <Journey m={m} />
        </div>
      </section>
      <section aria-label="Improvement recommendations" className="flex flex-col gap-2">
        <h2 className="m-0 text-[13.5px] font-semibold">Improvement recommendations</h2>
        <Recommendations m={m} limit={5} onGoTo={onGoTo} />
      </section>
      <section aria-label="Recent activity" className="flex flex-col gap-2">
        <h2 className="m-0 text-[13.5px] font-semibold">Recent activity</h2>
        <div className="rounded-xl border border-line bg-white px-3.5 py-3 text-[13px]">
          <div className="text-muted">
            {savedAt
              ? `Last saved ${fmtAgoIso(savedAt)}${savedBy ? ` by ${savedBy}` : ''}`
              : 'This Brain has never been saved.'}
          </div>
          {recent.length > 0 && (
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 border-t border-line-subtle p-0 pt-2">
              {recent.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-ink">{e.description}</span>
                  <span className="text-xs text-faint">
                    {e.actor ? `${e.actor.name} · ` : ''}
                    {fmtAgoIso(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <p className="m-0 text-xs text-faint">
        Evaluation history isn&apos;t kept: each save replaces the previous evaluation.
      </p>
    </div>
  );
}
