'use client';

import {
  BRAIN_RELEASE,
  BRAIN_RELEASE_HISTORY,
  BRAIN_STATUS_LABEL,
  type BrainRelease,
} from '@torio/contracts';
import {
  ArrowRight,
  BookOpenText,
  Building2,
  Mic2,
  PackageSearch,
  ShieldCheck,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';
import { AIIcon } from '@/components/ui/ai';
import { cn } from '@/lib/utils';
import { BrainOrbit } from './brain-orbit';
import type { TabId } from './brain-tabs';
import { BrainVersionBadge } from './version-badge';

const CAPABILITIES: {
  icon: LucideIcon;
  title: string;
  text: string;
  tint: string;
  fg: string;
  to: TabId;
}[] = [
  {
    icon: Building2,
    title: 'Business Understanding',
    text: 'Understands your profile, category, audience and how your business operates.',
    tint: 'bg-[#EEF0FF]',
    fg: 'text-[#5B5CE2]',
    to: 'knowledge',
  },
  {
    icon: PackageSearch,
    title: 'Product Knowledge',
    text: 'Uses your products, pricing and product details when customers ask.',
    tint: 'bg-[#E8F3FC]',
    fg: 'text-[#2B8FD9]',
    to: 'knowledge',
  },
  {
    icon: Mic2,
    title: 'Brand Voice',
    text: 'Follows your tone, preferred language and way of speaking.',
    tint: 'bg-[#F3EEFF]',
    fg: 'text-[#7C4DE8]',
    to: 'rules',
  },
  {
    icon: BookOpenText,
    title: 'Knowledge Intelligence',
    text: 'Draws on FAQs, policies and structured information to answer accurately.',
    tint: 'bg-[#EAF8EF]',
    fg: 'text-[#16803C]',
    to: 'knowledge',
  },
  {
    icon: ShieldCheck,
    title: 'Rules & Behavior',
    text: 'Respects your instructions, restrictions and when to hand over to a person.',
    tint: 'bg-[#FFF5E4]',
    fg: 'text-[#B76E00]',
    to: 'rules',
  },
  {
    icon: UserRoundCheck,
    title: 'AI Personalization',
    text: 'Keeps replies about your business and the conversation, not generic answers.',
    tint: 'bg-[#FDEBF3]',
    fg: 'text-[#C0306F]',
    to: 'test',
  },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * The About page for Torio Brain: a product identity page, not a settings form. Everything about the version comes from the central
 * release config; sections for release notes and history appear only when real entries exist there.
 */
export function AboutTab({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  const r = BRAIN_RELEASE;
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5">
      {/* hero */}
      <section
        aria-label="Meet Torio Brain"
        className="relative overflow-hidden rounded-[20px] border border-line bg-white"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute -right-24 -top-28 h-[360px] w-[360px] rounded-full bg-[#EEF0FF]" />
          <span className="absolute -bottom-32 left-1/4 h-[280px] w-[280px] rounded-full bg-[#F5F0FF]/80" />
          <span className="absolute -left-16 top-10 h-40 w-40 rotate-12 rounded-[40px] bg-[#F4F4FF]" />
        </div>
        <div className="relative grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-4 lg:p-10">
          <div className="flex min-w-0 flex-col items-start gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-line bg-white/80 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-primary">
              <AIIcon size={12} />
              Torio Intelligence Engine
            </span>
            <h2 className="m-0 text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[42px]">
              Meet Torio Brain
            </h2>
            <p className="m-0 max-w-[460px] text-[15.5px] leading-relaxed text-muted">
              The intelligence behind every conversation. Built to understand your business, follow
              your rules and help your team deliver better customer experiences.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <BrainVersionBadge size="md" />
              <span className="text-[13px] text-muted">
                {BRAIN_STATUS_LABEL[r.status]}
                {r.releasedAt ? ` · ${fmtDate(r.releasedAt)}` : ''}
              </span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[560px]">
            <BrainOrbit />
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* what it is */}
        <section
          aria-label="About Torio Brain"
          className="rounded-card border border-line bg-white p-5 sm:p-6"
        >
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary">
            Your business. Your knowledge. Your intelligence.
          </p>
          <h3 className="m-0 mt-2 text-[20px] font-semibold leading-snug text-ink">
            The business intelligence layer of Torio
          </h3>
          <p className="m-0 mt-3 text-[14px] leading-relaxed text-muted">
            Torio Brain helps Torio understand how each business operates, what its customers need
            and how its AI should respond.
          </p>
          <p className="m-0 mt-2.5 text-[14px] leading-relaxed text-muted">
            It brings together business knowledge, products, policies, brand voice, instructions and
            operational rules, so AI replies are relevant to your business instead of generic.
          </p>
        </section>

        {/* version */}
        <section
          aria-label="Brain version"
          className="relative overflow-hidden rounded-card border border-primary-line bg-gradient-to-br from-[#F7F7FF] to-white p-5 sm:p-6"
        >
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
            Torio Brain
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[13px] font-medium text-muted">Version</span>
            <span
              data-testid="about-version"
              className="text-[34px] font-semibold leading-none tabular-nums text-primary"
            >
              {r.version}
            </span>
          </div>
          <dl className="m-0 mt-4 flex flex-col gap-2 text-[13px]">
            <Row k="Status" v={BRAIN_STATUS_LABEL[r.status]} />
            {r.releasedAt && <Row k="Release date" v={fmtDate(r.releasedAt)} />}
          </dl>
          <p className="m-0 mt-3 border-t border-line-subtle pt-3 text-[13px] leading-snug text-muted">
            {r.description}
          </p>
        </section>
      </div>

      {/* capabilities */}
      <section aria-label="Core capabilities">
        <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">What Brain does</h3>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <li key={c.title}>
              <button
                type="button"
                onClick={() => onNavigate(c.to)}
                className="group flex h-full w-full cursor-pointer flex-col gap-3 rounded-card border border-line bg-white p-4 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary-line hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    c.tint,
                    c.fg,
                  )}
                >
                  <c.icon size={19} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold text-ink">{c.title}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-muted">{c.text}</span>
                </span>
                <span className="mt-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100">
                  Open <ArrowRight size={12} aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ReleaseNotes current={r} history={BRAIN_RELEASE_HISTORY} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="m-0 text-right font-medium text-ink">{v}</dd>
    </div>
  );
}

/** Release notes and history. Rendered only when the release config actually holds entries; nothing is made up. */
function ReleaseNotes({ current, history }: { current: BrainRelease; history: BrainRelease[] }) {
  const entries = [current, ...history].filter((e) => e.notes.length > 0);
  if (entries.length === 0) return null;
  return (
    <section aria-label="Release notes" className="rounded-card border border-line bg-white p-5">
      <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">Release notes</h3>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {entries.map((e) => (
          <li key={e.version}>
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] font-semibold text-ink">v{e.version}</span>
              {e.releasedAt && <span className="text-xs text-muted">{fmtDate(e.releasedAt)}</span>}
            </div>
            <ul className="m-0 mt-1 list-disc pl-5 text-[13px] leading-snug text-muted">
              {e.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
