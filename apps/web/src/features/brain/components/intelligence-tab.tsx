'use client';

import type { BrainConfig, BrainMaturity, ImportSourceKind, SectionKey } from '@torio/contracts';
import {
  ArrowRight,
  BookOpenText,
  CircleAlert,
  FileCode2,
  Globe,
  Hourglass,
  ListChecks,
  PenLine,
  Shirt,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { GoogleG } from '@/features/auth/social-buttons';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { useImports, useSourceAction, type ImportOverview } from '../queries';
import { fmtAgoIso } from './bits';
import { FeedDialog, FeedPanel } from './feed-import';
import { WebsiteScan } from './website-scan';

type Source = ImportOverview['sources'][number];

const STATUS: Record<Source['status'], { label: string; cls: string }> = {
  ACTIVE: { label: 'Connected', cls: 'bg-success-soft text-success' },
  PAUSED: { label: 'Paused', cls: 'bg-wash-2 text-muted' },
  ERROR: { label: 'Needs attention', cls: 'bg-danger-soft text-danger' },
  DISCONNECTED: { label: 'Disconnected', cls: 'bg-wash-2 text-muted' },
};

interface Provider {
  kind: ImportSourceKind;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  /** Why it cannot be connected from here yet, in plain words. Never a fake "connected" state. */
  unavailable: string;
}

const MetaMark = () => (
  <span aria-hidden className="text-[13px] font-bold tracking-tight text-[#0866FF]">
    Meta
  </span>
);
const Tile = ({ children }: { children: React.ReactNode }) => (
  <span
    aria-hidden
    className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-[11px] border border-line bg-white px-1.5"
  >
    {children}
  </span>
);

const PROVIDERS: Provider[] = [
  {
    kind: 'XML_FEED',
    title: 'XML product feed',
    blurb:
      'Import products from a Google Shopping-compatible feed, with preview and field mapping.',
    icon: <FileCode2 size={18} className="text-[#0F9D8A]" />,
    unavailable:
      'No feed connected. Products are only proposed for your review, never added on their own.',
  },
  {
    kind: 'META_CATALOG',
    title: 'Meta Catalog',
    blurb: 'Pull products from a Facebook and Instagram catalog you manage.',
    icon: <MetaMark />,
    unavailable:
      'Needs catalog access on the Torio Meta app, which is not configured. Messaging connections do not include it.',
  },
  {
    kind: 'GOOGLE_MERCHANT',
    title: 'Google Merchant Center',
    blurb: 'Pull eligible products from a Merchant Center account.',
    icon: <GoogleG />,
    unavailable:
      'Needs a Google OAuth app approved for Merchant Center, which is not configured on this server.',
  },
];

const KIND_LABEL: Record<ImportSourceKind, string> = {
  WEBSITE: 'Website scan',
  XML_FEED: 'XML feed',
  META_CATALOG: 'Meta Catalog',
  GOOGLE_MERCHANT: 'Google Merchant Center',
  MANUAL: 'Manual',
};

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="m-0 text-[13.5px] font-semibold text-ink">{title}</h2>
        {hint && <span className="text-[11.5px] text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const FREQ_LABEL: Record<string, string> = {
  manual: 'Manual sync',
  daily: 'Syncs daily',
  weekly: 'Syncs weekly',
};

function SourceCard({
  p,
  sources,
  actions,
}: {
  p: Provider;
  sources: Source[];
  actions?: {
    connect: () => void;
    sync: (id: string) => void;
    disconnect: (id: string) => void;
    busy: boolean;
  };
}) {
  const mine = sources.filter((s) => s.kind === p.kind);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <Tile>{p.icon}</Tile>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[14px] font-semibold">{p.title}</h3>
            {mine.length === 0 && (
              <span className="rounded-full bg-wash-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                Not connected
              </span>
            )}
          </div>
          <p className="m-0 mt-1 text-[12.5px] leading-snug text-muted">{p.blurb}</p>
        </div>
      </div>
      {actions && (
        <Button
          size="sm"
          variant={mine.length ? 'outline' : 'primary'}
          className="self-start"
          onClick={actions.connect}
        >
          {mine.length ? 'Connect another feed' : 'Connect a feed'}
        </Button>
      )}
      {mine.length === 0 ? (
        <p className="m-0 flex items-start gap-1.5 rounded-lg bg-wash px-2.5 py-2 text-xs text-muted">
          <CircleAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-faint" />
          {p.unavailable}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {mine.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-line-subtle px-2.5 py-2 text-[12.5px]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{s.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    STATUS[s.status].cls,
                  )}
                >
                  {STATUS[s.status].label}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-faint">
                {s.lastSyncedAt ? `Last synced ${fmtAgoIso(s.lastSyncedAt)}` : 'Not synced'}
                {s.frequency && ` · ${FREQ_LABEL[s.frequency] ?? s.frequency}`}
              </div>
              {actions && s.status !== 'DISCONNECTED' && (
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actions.busy}
                    onClick={() => actions.sync(s.id)}
                  >
                    Sync now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actions.busy}
                    aria-label={`Disconnect ${s.name}`}
                    onClick={() => actions.disconnect(s.id)}
                  >
                    Disconnect
                  </Button>
                </div>
              )}
              {s.lastError && <div className="mt-0.5 text-xs text-danger">{s.lastError}</div>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

const JOB: Record<ImportOverview['jobs'][number]['status'], { label: string; cls: string }> = {
  QUEUED: { label: 'Queued', cls: 'bg-wash-2 text-muted' },
  RUNNING: { label: 'Running', cls: 'bg-[#EFF6FF] text-[#2563EB]' },
  NEEDS_REVIEW: { label: 'Needs review', cls: 'bg-warning-soft text-warning' },
  COMPLETED: { label: 'Completed', cls: 'bg-success-soft text-success' },
  FAILED: { label: 'Failed', cls: 'bg-danger-soft text-danger' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-wash-2 text-muted' },
};

function Stat({
  icon: Icon,
  label,
  value,
  color,
  action,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  color: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-[18px] font-semibold tabular-nums leading-tight">{value}</div>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs font-semibold text-primary"
        >
          {action.label} <ArrowRight size={12} aria-hidden />
        </button>
      )}
    </li>
  );
}

/**
 * Intelligence is where business knowledge comes in. Scores, maturity and recommendations live on the Summary; what is
 * approved and active is managed under Knowledge. This page shows the sources that can feed Brain, what each one's
 * status really is, and the activity of imports. Nothing here is a made-up connection or count.
 */
export function IntelligenceTab({
  config,
  maturity: m,
  onGoTo,
  onImported,
}: {
  config: BrainConfig;
  maturity: BrainMaturity;
  onGoTo: (section: SectionKey) => void;
  /** Called after approved entries were added to Brain, so the page can load the new version. */
  onImported: () => void;
}) {
  const { workspaceId } = useWorkspace();
  const imports = useImports(workspaceId);
  const [feedDialog, setFeedDialog] = useState(false);
  const [feedChoice, setFeedChoice] = useState<string | null | undefined>(undefined);
  const [feedError, setFeedError] = useState('');
  const sync = useSourceAction(workspaceId ?? '', 'sync');
  const disconnect = useSourceAction(workspaceId ?? '', 'disconnect');
  const data = imports.data;
  const sources = data?.sources ?? [];
  const jobs = data?.jobs ?? [];
  const lastSync = sources
    .map((s) => s.lastSyncedAt)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  // a website scan that is running or waiting for review carries on after a refresh
  const resumable = jobs.find(
    (j) => j.kind === 'WEBSITE' && ['QUEUED', 'RUNNING', 'NEEDS_REVIEW'].includes(j.status),
  );
  const feedResumable = jobs.find(
    (j) => j.kind === 'XML_FEED' && ['QUEUED', 'RUNNING', 'NEEDS_REVIEW'].includes(j.status),
  );
  // undefined = follow the sync the server reports as open; a value (or null) is the person's choice
  const feedJobId = feedChoice === undefined ? (feedResumable?.id ?? null) : feedChoice;
  const review = jobs.filter((j) => j.status === 'NEEDS_REVIEW').length;
  const failed = jobs.filter((j) => j.status === 'FAILED').length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="m-0 text-[18px] font-semibold">Intelligence</h2>
          <p className="m-0 mt-0.5 text-[13px] text-muted">
            Connect your business data and let Torio learn automatically.
          </p>
        </div>
        {lastSync && (
          <span className="text-xs text-faint">Last synchronized {fmtAgoIso(lastSync)}</span>
        )}
      </header>

      <Panel title="Discover your business">
        <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Tile>
              <Globe size={18} className="text-primary" />
            </Tile>
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-[14.5px] font-semibold">Scan your website</h3>
              <p className="m-0 mt-1 text-[13px] text-muted">
                Torio reads your public pages and proposes your business profile, products, policies
                and FAQs for you to review. Only what is on your site is proposed, and nothing
                becomes active until you approve it.
              </p>
            </div>
          </div>
          {workspaceId && (
            <WebsiteScan
              ws={workspaceId}
              initialJobId={resumable?.id ?? null}
              defaults={{
                url: config.identity.website,
                country: config.identity.country,
                category: config.identity.category,
              }}
              onImported={onImported}
            />
          )}
        </div>
      </Panel>

      <Panel title="Connect your data sources" hint="Each source shows its real status">
        {imports.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
            {PROVIDERS.map((p) => (
              <SourceCard
                key={p.kind}
                p={p}
                sources={sources}
                actions={
                  p.kind === 'XML_FEED' && workspaceId
                    ? {
                        connect: () => setFeedDialog(true),
                        busy: sync.isPending || disconnect.isPending,
                        sync: (id) =>
                          sync.mutate(id, {
                            onSuccess: (d) => setFeedChoice(d.job.id),
                            onError: (e) => setFeedError(e.message),
                          }),
                        disconnect: (id) =>
                          disconnect.mutate(id, { onError: (e) => setFeedError(e.message) }),
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        )}
        {feedError && (
          <p
            role="alert"
            className="m-0 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
          >
            {feedError}
          </p>
        )}
        {workspaceId && feedJobId && (
          <FeedPanel
            ws={workspaceId}
            jobId={feedJobId}
            onImported={onImported}
            onClose={() => setFeedChoice(null)}
            onJob={setFeedChoice}
          />
        )}
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
          <PenLine size={13} aria-hidden className="text-faint" />
          Prefer to write it yourself? Add products and FAQs by hand under{' '}
          <button
            type="button"
            onClick={() => onGoTo('products')}
            className="cursor-pointer border-none bg-transparent p-0 font-semibold text-primary"
          >
            Knowledge
          </button>
          .
        </p>
      </Panel>

      {feedDialog && workspaceId && (
        <FeedDialog
          ws={workspaceId}
          onClose={() => setFeedDialog(false)}
          onStarted={(id) => {
            setFeedDialog(false);
            setFeedChoice(id);
          }}
        />
      )}

      <Panel title="Knowledge in your Brain" hint="Approved and active. Edit it under Knowledge">
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 lg:grid-cols-4">
          <Stat icon={Shirt} label="Products" value={config.products.length} color="#2B8FD9" />
          <Stat
            icon={BookOpenText}
            label="Active FAQs"
            value={m.stats.activeFaqs}
            color="#0F9D8A"
          />
          <Stat
            icon={ListChecks}
            label="Active rules"
            value={m.stats.activeRules}
            color="#5B5CE2"
          />
          <Stat icon={Hourglass} label="Pending review" value={review} color="#D97706" />
        </ul>
        {failed > 0 && (
          <p className="m-0 flex items-center gap-1.5 text-xs text-danger">
            <CircleAlert size={13} aria-hidden /> {failed} recent import{failed === 1 ? '' : 's'}{' '}
            failed. See the activity below.
          </p>
        )}
      </Panel>

      <Panel title="Import activity">
        {imports.isError ? (
          <p
            role="alert"
            className="m-0 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-[#8F2424]"
          >
            Couldn&apos;t load import activity.{' '}
            <button
              type="button"
              onClick={() => void imports.refetch()}
              className="cursor-pointer border-none bg-transparent p-0 font-semibold underline"
            >
              Try again
            </button>
          </p>
        ) : jobs.length === 0 ? (
          <p className="m-0 rounded-xl bg-wash px-3 py-2.5 text-[13px] text-muted">
            Scans and syncs appear here once you run one.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line-subtle rounded-card border border-line bg-white p-0">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]"
              >
                <span className="font-medium text-ink">{KIND_LABEL[j.kind]}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    JOB[j.status].cls,
                  )}
                >
                  {JOB[j.status].label}
                </span>
                {j.stats && (
                  <span className="text-xs text-muted tabular-nums">
                    {Object.entries(j.stats)
                      .map(([k, v]) => `${v} ${k}`)
                      .join(' · ')}
                  </span>
                )}
                {j.error && <span className="text-xs text-danger">{j.error}</span>}
                <span className="ml-auto text-xs text-faint">{fmtAgoIso(j.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
