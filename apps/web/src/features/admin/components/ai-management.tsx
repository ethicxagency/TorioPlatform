'use client';

import {
  AI_MODE_LABEL,
  type AiProviderView,
  type AiSettings,
  type UpdateAiSettings,
} from '@torio/contracts';
import {
  Activity,
  Cpu,
  KeyRound,
  ListChecks,
  Settings2,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Toggle } from '@/features/brain/components/bits';
import { adminRequest } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminAction, useAdminList, useAdminOne } from '../queries';
import { useAdminShell } from './admin-shell';
import {
  Empty,
  fmtDateTime,
  input,
  Loading,
  Notice,
  PageHead,
  Panel,
  Pager,
  td,
  th,
} from './common';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'providers', label: 'Providers', icon: KeyRound },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'orchestration', label: 'Orchestration', icon: SlidersHorizontal },
  { id: 'usage', label: 'Usage & Costs', icon: Wallet },
  { id: 'logs', label: 'AI Logs', icon: ListChecks },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Micro-dollars as dollars. Always labelled "estimated" where shown: prices are entered by the platform owner. */
const usd = (micros: number | null | undefined) =>
  micros === null || micros === undefined
    ? '—'
    : `$${(micros / 1_000_000).toFixed(micros >= 1_000_000 ? 2 : 4)}`;
const num = (n: number) => n.toLocaleString('en-US');
const ms = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`;
const reason = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

interface ProvidersResp {
  encryptionReady: boolean;
  data: AiProviderView[];
}
interface Overview {
  days: number;
  configuredProviders: number;
  activeProviders: number;
  availableModels: number;
  requests: number;
  succeeded: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number | null;
  costIncomplete: boolean;
  avgDurationMs: number | null;
  multiModelRequests: number;
  orchestrationSuccessRate: number | null;
  daily: { date: string; total: number; failed: number; costMicros: number | null }[];
  providerUsage: {
    provider: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costMicros: number | null;
  }[];
  modelPerformance: {
    provider: string;
    model: string;
    calls: number;
    ok: number;
    avgLatencyMs: number | null;
    inputTokens: number;
    outputTokens: number;
    costMicros: number | null;
  }[];
}

export function AiManagementPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = params.get('tab');
  const tab: TabId = TABS.some((x) => x.id === t) ? (t as TabId) : 'overview';
  return (
    <>
      <PageHead
        title="AI Management"
        description="Platform-wide AI providers, models and the orchestration engine behind Inbox AI Assist."
      />
      <nav
        aria-label="AI Management"
        className="mb-4 overflow-x-auto rounded-xl border border-line bg-white p-1 [scrollbar-width:none]"
      >
        <ul className="m-0 flex list-none gap-1 p-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => router.replace(`${pathname}?tab=${id}`)}
                className={cn(
                  'inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border-none px-3 text-[13px] transition-colors duration-150 motion-reduce:transition-none',
                  tab === id
                    ? 'bg-primary-soft font-semibold text-primary-hover'
                    : 'bg-transparent font-medium text-muted hover:bg-wash',
                )}
              >
                <Icon size={14} aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'models' && <ModelsTab />}
      {tab === 'orchestration' && <OrchestrationTab />}
      {tab === 'usage' && <UsageTab />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'settings' && <SettingsTab />}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-white px-4 py-3">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className="mt-1 truncate text-[22px] font-semibold tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Bars({
  rows,
  color = 'bg-primary',
}: {
  rows: { label: string; value: number; sub?: string }[];
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[12.5px]"
        >
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-wash-2">
            <span
              className={cn('block h-full rounded-full', color)}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="tabular-nums text-ink">{r.sub ?? num(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- overview
function OverviewTab() {
  const q = useAdminOne<Overview>('/ai/overview?days=30');
  const s = useAdminOne<AiSettings>('/ai/settings');
  if (q.isPending) return <Loading />;
  if (q.isError) return <Notice tone="bad">{q.error.message}</Notice>;
  const o = q.data;
  return (
    <div className="flex flex-col gap-4">
      {s.data && !s.data.enabled && (
        <Notice tone="warn">
          AI Assist is switched off for customers. Turn it on in Settings once a provider is ready.
        </Notice>
      )}
      <section
        aria-label="AI metrics"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
      >
        <Stat
          label="Configured providers"
          value={num(o.configuredProviders)}
          sub={`${o.activeProviders} active`}
        />
        <Stat label="Enabled models" value={num(o.availableModels)} />
        <Stat label={`Requests (${o.days}d)`} value={num(o.requests)} />
        <Stat label="Successful" value={num(o.succeeded)} />
        <Stat label="Failed" value={num(o.failed)} />
        <Stat label="Input tokens" value={num(o.inputTokens)} />
        <Stat label="Output tokens" value={num(o.outputTokens)} />
        <Stat
          label="Estimated cost"
          value={usd(o.estimatedCostMicros)}
          sub={
            o.estimatedCostMicros === null
              ? 'No model prices set'
              : o.costIncomplete
                ? 'Some requests had no price'
                : 'From the prices you entered'
          }
        />
        <Stat label="Avg response time" value={ms(o.avgDurationMs)} />
        <Stat label="Multi-model requests" value={num(o.multiModelRequests)} />
        <Stat
          label="Orchestration success"
          value={o.orchestrationSuccessRate === null ? '—' : `${o.orchestrationSuccessRate}%`}
        />
      </section>
      {o.requests === 0 ? (
        <Empty>No AI requests yet. Usage appears here as agents use AI Assist.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Request volume by day">
            <Bars
              rows={o.daily.map((d) => ({
                label: d.date.slice(5),
                value: d.total,
                sub: `${d.total}${d.failed ? ` · ${d.failed} failed` : ''}`,
              }))}
            />
          </Panel>
          <Panel title="Estimated spend by day">
            {o.daily.some((d) => d.costMicros !== null) ? (
              <Bars
                color="bg-success"
                rows={o.daily.map((d) => ({
                  label: d.date.slice(5),
                  value: d.costMicros ?? 0,
                  sub: usd(d.costMicros),
                }))}
              />
            ) : (
              <Empty>Set model prices to see estimated spend.</Empty>
            )}
          </Panel>
          <Panel title="Provider usage">
            <Bars
              rows={o.providerUsage.map((p) => ({
                label: p.provider,
                value: p.calls,
                sub: `${p.calls} calls`,
              }))}
            />
          </Panel>
          <Panel title="Success and failure">
            <Bars
              color="bg-success"
              rows={[
                { label: 'Successful', value: o.succeeded },
                { label: 'Failed', value: o.failed },
              ]}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- providers
function ProvidersTab() {
  const q = useAdminOne<ProvidersResp>('/ai/providers');
  if (q.isPending) return <Loading />;
  if (q.isError) return <Notice tone="bad">{q.error.message}</Notice>;
  return (
    <div className="flex flex-col gap-4">
      {!q.data.encryptionReady && (
        <Notice tone="bad">
          CHANNEL_ENCRYPTION_KEY is not set on the server, so API keys cannot be stored. Set it,
          then add the keys.
        </Notice>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {q.data.data.map((p) => (
          <ProviderCard key={p.key} p={p} encryptionReady={q.data.encryptionReady} />
        ))}
      </div>
    </div>
  );
}

const HEALTH_TONE: Record<string, string> = {
  HEALTHY: 'bg-success-soft text-success',
  DEGRADED: 'bg-warning-soft text-warning',
  DOWN: 'bg-danger-soft text-danger',
  UNKNOWN: 'bg-wash-2 text-muted',
};

function ProviderCard({ p, encryptionReady }: { p: AiProviderView; encryptionReady: boolean }) {
  const { toast } = useAdminShell();
  const [key, setKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const setKeyM = useAdminAction<unknown, { apiKey: string }>('PUT', `/ai/providers/${p.key}/key`);
  const qc = useQueryClient();
  const [removing, setRemoving] = useState(false);
  const patch = useAdminAction<unknown, { enabled?: boolean; defaultModel?: string | null }>(
    'PATCH',
    `/ai/providers/${p.key}`,
  );
  const test = useAdminAction<
    { ok: boolean; category: string | null; modelCount: number; latencyMs: number },
    void
  >('POST', `/ai/providers/${p.key}/test`);
  const [result, setResult] = useState<null | {
    ok: boolean;
    category: string | null;
    modelCount: number;
    latencyMs: number;
  }>(null);
  return (
    <Panel
      title={p.name}
      action={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium',
            HEALTH_TONE[p.health],
          )}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          {p.health === 'UNKNOWN'
            ? 'Not checked'
            : p.health.charAt(0) + p.health.slice(1).toLowerCase()}
        </span>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <div>
          <div className="mb-1 text-[12px] font-medium text-muted">API key</div>
          {p.hasKey && !replacing ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-wash px-2 py-1 text-[12.5px]">{p.keyMask}</code>
              <Button size="sm" variant="outline" onClick={() => setReplacing(true)}>
                Replace
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={removing}
                onClick={async () => {
                  if (!window.confirm(`Remove the ${p.name} key? The provider will be turned off.`))
                    return;
                  setRemoving(true);
                  try {
                    await adminRequest(`/ai/providers/${p.key}/key`, { method: 'DELETE' });
                    await qc.invalidateQueries({ queryKey: ['admin'] });
                    toast('Key removed');
                  } catch (e) {
                    toast(reason(e));
                  } finally {
                    setRemoving(false);
                  }
                }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await setKeyM.mutateAsync({ apiKey: key });
                  setKey('');
                  setReplacing(false);
                  toast('Key saved. Run a connection test next.');
                } catch (err) {
                  toast(reason(err));
                }
              }}
            >
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                aria-label={`${p.name} API key`}
                placeholder="Paste the API key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={!encryptionReady}
                className={cn(input, 'min-w-[220px] flex-1')}
              />
              <Button
                size="sm"
                type="submit"
                loading={setKeyM.isPending}
                disabled={!encryptionReady || key.trim().length < 16}
              >
                Save key
              </Button>
              {replacing && (
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setReplacing(false);
                    setKey('');
                  }}
                >
                  Cancel
                </Button>
              )}
            </form>
          )}
          <p className="m-0 mt-1 text-xs text-faint">
            Stored encrypted on the server. It is never shown again or sent to customers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!p.hasKey}
            loading={test.isPending}
            onClick={async () => {
              try {
                const r = await test.mutateAsync();
                setResult(r);
              } catch (e) {
                toast(reason(e));
              }
            }}
          >
            Test connection
          </Button>
          {result && (
            <span
              role="status"
              className={cn('text-[12.5px]', result.ok ? 'text-success' : 'text-danger')}
            >
              {result.ok
                ? `Connected · ${result.modelCount} models · ${ms(result.latencyMs)}`
                : `Failed (${result.category ?? 'error'})`}
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">
            Default model
            <Select
              aria-label={`${p.name} default model`}
              value={p.defaultModel ?? ''}
              placeholder="Choose a model"
              disabled={p.models.length === 0}
              options={p.models.map((m) => ({ value: m.modelId, label: m.label }))}
              onChange={(v) =>
                patch.mutate({ defaultModel: v }, { onError: (e) => toast(reason(e)) })
              }
            />
          </label>
          <div className="flex flex-col justify-end">
            <Toggle
              label={p.enabled ? 'Enabled' : 'Disabled'}
              checked={p.enabled}
              onChange={(v) => patch.mutate({ enabled: v }, { onError: (e) => toast(reason(e)) })}
            />
          </div>
        </div>
        {p.models.length === 0 && p.hasKey && (
          <p className="m-0 text-xs text-muted">
            Run a connection test to load this provider’s models.
          </p>
        )}
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
          <dt>Last successful connection</dt>
          <dd className="m-0 text-right text-ink">
            {p.lastSuccessAt ? fmtDateTime(p.lastSuccessAt) : '—'}
          </dd>
          <dt>Last check</dt>
          <dd className="m-0 text-right text-ink">
            {p.lastCheckedAt ? fmtDateTime(p.lastCheckedAt) : '—'}
          </dd>
          <dt>Configuration updated</dt>
          <dd className="m-0 text-right text-ink">
            {p.updatedAt ? fmtDateTime(p.updatedAt) : '—'}
          </dd>
        </dl>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- models
function ModelsTab() {
  const q = useAdminOne<ProvidersResp>('/ai/providers');
  if (q.isPending) return <Loading />;
  if (q.isError) return <Notice tone="bad">{q.error.message}</Notice>;
  const any = q.data.data.some((p) => p.models.length > 0);
  return (
    <div className="flex flex-col gap-4">
      <Notice>
        Models come from each provider’s own list. Prices are what you enter per million tokens;
        without them no cost is shown. Temperature is only offered for models that accept it.
      </Notice>
      {!any && (
        <Empty>No models yet. Save a key on the Providers tab and run a connection test.</Empty>
      )}
      {q.data.data
        .filter((p) => p.models.length > 0)
        .map((p) => (
          <Panel key={p.key} title={p.name}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className={th}>Model</th>
                    <th className={th}>Enabled</th>
                    <th className={th}>Priority</th>
                    <th className={th}>Max output tokens</th>
                    <th className={th}>Temperature</th>
                    <th className={th}>Input $/1M</th>
                    <th className={th}>Output $/1M</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {p.models.map((m) => (
                    <ModelRow key={m.id} m={m} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
    </div>
  );
}

function ModelRow({ m }: { m: AiProviderView['models'][number] }) {
  const { toast } = useAdminShell();
  const act = useAdminAction<unknown, Record<string, unknown>>('PATCH', `/ai/models/${m.id}`);
  const [d, setD] = useState({
    priority: String(m.priority),
    max: m.maxOutputTokens?.toString() ?? '',
    temp: m.temperature?.toString() ?? '',
    inP: m.inputPriceMicros === null ? '' : String(m.inputPriceMicros / 1_000_000),
    outP: m.outputPriceMicros === null ? '' : String(m.outputPriceMicros / 1_000_000),
  });
  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  const bad = [d.priority, d.max, d.temp, d.inP, d.outP].some(
    (s) => s.trim() !== '' && Number.isNaN(Number(s)),
  );
  const small = cn(input, 'h-8 w-24');
  return (
    <tr>
      <td className={td}>
        <div className="font-medium text-ink">{m.label}</div>
        {m.label !== m.modelId && <div className="text-xs text-muted">{m.modelId}</div>}
      </td>
      <td className={td}>
        <input
          type="checkbox"
          aria-label={`Enable ${m.modelId}`}
          checked={m.enabled}
          onChange={(e) =>
            act.mutate({ enabled: e.target.checked }, { onError: (err) => toast(reason(err)) })
          }
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </td>
      <td className={td}>
        <input
          aria-label={`${m.modelId} priority`}
          className={cn(small, 'w-16')}
          value={d.priority}
          onChange={(e) => setD({ ...d, priority: e.target.value })}
        />
      </td>
      <td className={td}>
        <input
          aria-label={`${m.modelId} max output tokens`}
          className={small}
          placeholder="default"
          value={d.max}
          onChange={(e) => setD({ ...d, max: e.target.value })}
        />
      </td>
      <td className={td}>
        <input
          aria-label={`${m.modelId} temperature`}
          className={cn(small, 'w-20')}
          placeholder={m.supportsTemperature ? 'default' : 'n/a'}
          disabled={!m.supportsTemperature}
          value={d.temp}
          onChange={(e) => setD({ ...d, temp: e.target.value })}
        />
      </td>
      <td className={td}>
        <input
          aria-label={`${m.modelId} input price per million tokens`}
          className={small}
          placeholder="not set"
          value={d.inP}
          onChange={(e) => setD({ ...d, inP: e.target.value })}
        />
      </td>
      <td className={td}>
        <input
          aria-label={`${m.modelId} output price per million tokens`}
          className={small}
          placeholder="not set"
          value={d.outP}
          onChange={(e) => setD({ ...d, outP: e.target.value })}
        />
      </td>
      <td className={td}>
        <Button
          size="sm"
          variant="outline"
          disabled={bad}
          loading={act.isPending}
          onClick={() =>
            act.mutate(
              {
                priority: Math.max(1, Math.round(Number(d.priority) || 100)),
                maxOutputTokens: n(d.max) === null ? null : Math.round(n(d.max)!),
                ...(m.supportsTemperature && { temperature: n(d.temp) }),
                inputPriceMicros: n(d.inP) === null ? null : Math.round(n(d.inP)! * 1_000_000),
                outputPriceMicros: n(d.outP) === null ? null : Math.round(n(d.outP)! * 1_000_000),
              },
              { onSuccess: () => toast('Model saved'), onError: (e) => toast(reason(e)) },
            )
          }
        >
          Save
        </Button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- orchestration + settings
function useSettings() {
  const q = useAdminOne<AiSettings>('/ai/settings');
  const save = useAdminAction<AiSettings, UpdateAiSettings>('PATCH', '/ai/settings');
  const { toast } = useAdminShell();
  const update = (p: UpdateAiSettings, done = 'Saved') =>
    save.mutate(p, { onSuccess: () => toast(done), onError: (e) => toast(reason(e)) });
  return { q, update, saving: save.isPending };
}

function OrchestrationTab() {
  const { q, update, saving } = useSettings();
  const prov = useAdminOne<ProvidersResp>('/ai/providers');
  const [w, setW] = useState<AiSettings['weights'] | null>(null);
  if (q.isPending || prov.isPending) return <Loading />;
  if (q.isError) return <Notice tone="bad">{q.error.message}</Notice>;
  const s = q.data;
  const weights = w ?? s.weights;
  const total = Object.values(weights).reduce((n, x) => n + x, 0);
  const providerOpts = [
    { value: '', label: 'Automatic' },
    ...(prov.data?.data ?? []).map((p) => ({ value: p.key, label: p.name })),
  ];
  const num2 = (
    label: string,
    value: number,
    key: keyof AiSettings,
    min: number,
    max: number,
    hint?: string,
  ) => (
    <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        defaultValue={value}
        className={cn(input, 'w-32')}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v !== value && v >= min && v <= max)
            update({ [key]: Math.round(v) } as UpdateAiSettings);
        }}
      />
      {hint && <span className="font-normal text-faint">{hint}</span>}
    </label>
  );
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Operating modes">
        <div className="flex flex-col gap-1">
          <Toggle
            label="Single model (OpenAI or Gemini on its own)"
            checked={s.modes.single}
            onChange={(v) => update({ modes: { single: v } })}
          />
          <Toggle
            label="Automatic model selection (Auto)"
            checked={s.modes.auto}
            onChange={(v) => update({ modes: { auto: v } })}
          />
          <Toggle
            label="Multi-model synthesis"
            hint="Runs two providers, compares their answers and writes one. Costs more and needs two enabled providers."
            checked={s.modes.synthesis}
            onChange={(v) => update({ modes: { synthesis: v } })}
          />
        </div>
      </Panel>
      <Panel title="Routing and resilience">
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">
            Default provider
            <Select
              aria-label="Default provider"
              value={s.defaultProvider ?? ''}
              options={providerOpts}
              onChange={(v) =>
                update({ defaultProvider: (v || null) as AiSettings['defaultProvider'] })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">
            Synthesis provider
            <Select
              aria-label="Synthesis provider"
              value={s.synthesisProvider ?? ''}
              options={providerOpts}
              onChange={(v) =>
                update({ synthesisProvider: (v || null) as AiSettings['synthesisProvider'] })
              }
            />
          </label>
          {num2('Request timeout (ms)', s.requestTimeoutMs, 'requestTimeoutMs', 3000, 60000)}
          {num2(
            'Max retries',
            s.maxRetries,
            'maxRetries',
            0,
            3,
            'Only for timeouts, rate limits and outages.',
          )}
          {num2('Max parallel models', s.maxParallel, 'maxParallel', 1, 4)}
          {num2(
            'Review below score',
            s.minQualityScore,
            'minQualityScore',
            0,
            100,
            'Drafts scoring lower are flagged for review.',
          )}
        </div>
        <div className="mt-3">
          <Toggle
            label="Provider fallback"
            hint="Use another enabled provider when one fails."
            checked={s.fallback}
            onChange={(v) => update({ fallback: v })}
          />
        </div>
      </Panel>
      <Panel title="Evaluation weights">
        <p className="m-0 mb-3 text-[12.5px] text-muted">
          Internal signals used to rank candidate answers and decide when a person should look
          closer. They are not a guarantee of factual correctness. Weights are normalised.
        </p>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(weights) as (keyof typeof weights)[]).map((k) => (
            <label
              key={k}
              className="flex flex-col gap-1 text-[12px] font-medium capitalize text-muted"
            >
              {k}
              <input
                type="number"
                min={0}
                max={100}
                value={weights[k]}
                onChange={(e) =>
                  setW({ ...weights, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                }
                className={cn(input, 'w-24')}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            disabled={!w || total === 0}
            loading={saving}
            onClick={() => w && update({ weights: w }, 'Weights saved')}
          >
            Save weights
          </Button>
          <span className="text-xs text-muted">Total {total}</span>
        </div>
      </Panel>
    </div>
  );
}

function SettingsTab() {
  const { q, update } = useSettings();
  if (q.isPending) return <Loading />;
  if (q.isError) return <Notice tone="bad">{q.error.message}</Notice>;
  const s = q.data;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Availability">
        <Toggle
          label="AI Assist enabled for customers"
          hint="When off, Inbox AI Assist says it is unavailable. Nothing is sent to any provider."
          checked={s.enabled}
          onChange={(v) =>
            update({ enabled: v }, v ? 'AI Assist turned on' : 'AI Assist turned off')
          }
        />
      </Panel>
      <Panel title="Context and retention">
        <div className="flex flex-wrap gap-6">
          {(
            [
              ['Messages sent for context', s.contextMessages, 'contextMessages', 1, 30],
              ['Log retention (days)', s.logRetentionDays, 'logRetentionDays', 1, 365],
            ] as const
          ).map(([label, value, key, min, max]) => (
            <label key={key} className="flex flex-col gap-1 text-[12px] font-medium text-muted">
              {label}
              <input
                type="number"
                min={min}
                max={max}
                defaultValue={value}
                className={cn(input, 'w-32')}
                onBlur={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v !== value && v >= min && v <= max) update({ [key]: v } as UpdateAiSettings);
                }}
              />
            </label>
          ))}
        </div>
        <p className="m-0 mt-3 text-xs text-muted">
          Logs hold metadata only (provider, model, tokens, cost, outcome). Customer messages and
          drafts are never stored.
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- usage
function UsageTab() {
  const q = useAdminOne<Overview>('/ai/overview?days=30');
  if (q.isPending) return <Loading />;
  if (q.isError) return <Notice tone="bad">{q.error.message}</Notice>;
  const o = q.data;
  return (
    <div className="flex flex-col gap-4">
      <Notice>
        Costs are estimates from the per-million-token prices you entered on the Models tab, not
        confirmed provider billing.
        {o.costIncomplete && ' Some requests had no price set, so the total is a lower bound.'}
      </Notice>
      <Panel title={`By model (last ${o.days} days)`}>
        {o.modelPerformance.length === 0 ? (
          <Empty>No calls recorded yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  {[
                    'Provider',
                    'Model',
                    'Calls',
                    'Succeeded',
                    'Avg latency',
                    'Input',
                    'Output',
                    'Est. cost',
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {o.modelPerformance.map((m) => (
                  <tr key={`${m.provider}/${m.model}`}>
                    <td className={td}>{m.provider}</td>
                    <td className={td}>{m.model}</td>
                    <td className={cn(td, 'tabular-nums')}>{num(m.calls)}</td>
                    <td className={cn(td, 'tabular-nums')}>
                      {m.calls ? `${Math.round((m.ok / m.calls) * 100)}%` : '—'}
                    </td>
                    <td className={cn(td, 'tabular-nums')}>{ms(m.avgLatencyMs)}</td>
                    <td className={cn(td, 'tabular-nums')}>{num(m.inputTokens)}</td>
                    <td className={cn(td, 'tabular-nums')}>{num(m.outputTokens)}</td>
                    <td className={cn(td, 'tabular-nums')}>{usd(m.costMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- logs
interface LogsResp {
  data: {
    id: string;
    requestId: string;
    workspace: { id: string; name: string };
    mode: string;
    status: string;
    strategy: string | null;
    providers: string[];
    models: string[];
    durationMs: number | null;
    inputTokens: number;
    outputTokens: number;
    costMicros: number | null;
    errorCategory: string | null;
    needsReview: boolean;
    retryCount: number;
    createdAt: string;
  }[];
  meta: { page: number; totalPages: number; total: number };
}
function LogsTab() {
  const [f, setF] = useState({ provider: '', status: '', mode: '', page: 1 });
  const q = useAdminList<LogsResp>('/ai/logs', {
    provider: f.provider,
    status: f.status,
    mode: f.mode,
    page: f.page,
  });
  const set = (p: Partial<typeof f>) => setF({ ...f, page: 1, ...p });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Provider"
          value={f.provider}
          onChange={(v) => set({ provider: v })}
          options={[
            { value: '', label: 'All providers' },
            { value: 'openai', label: 'OpenAI' },
            { value: 'gemini', label: 'Gemini' },
          ]}
        />
        <Select
          aria-label="Status"
          value={f.status}
          onChange={(v) => set({ status: v })}
          options={[
            { value: '', label: 'Any status' },
            { value: 'succeeded', label: 'Succeeded' },
            { value: 'failed', label: 'Failed' },
            { value: 'running', label: 'Running' },
          ]}
        />
        <Select
          aria-label="Mode"
          value={f.mode}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: '', label: 'Any mode' },
            ...Object.entries(AI_MODE_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Notice tone="bad">{q.error.message}</Notice>
      ) : q.data.data.length === 0 ? (
        <Empty>No AI requests match.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {[
                  'Time',
                  'Request',
                  'Workspace',
                  'Mode',
                  'Provider / model',
                  'Status',
                  'Duration',
                  'Tokens',
                  'Est. cost',
                  'Error',
                ].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {q.data.data.map((r) => (
                <tr key={r.id}>
                  <td className={cn(td, 'whitespace-nowrap tabular-nums')}>
                    {fmtDateTime(r.createdAt)}
                  </td>
                  <td className={cn(td, 'font-mono text-xs')} title={r.requestId}>
                    {r.requestId.slice(0, 8)}
                  </td>
                  <td className={td}>{r.workspace.name}</td>
                  <td className={td}>
                    {AI_MODE_LABEL[r.mode as keyof typeof AI_MODE_LABEL] ?? r.mode}
                    {r.strategy ? (
                      <span className="block text-xs text-muted">{r.strategy}</span>
                    ) : null}
                  </td>
                  <td className={td}>
                    {r.providers.join(', ') || '—'}
                    <span className="block text-xs text-muted">{r.models.join(', ')}</span>
                  </td>
                  <td className={td}>
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[11.5px] font-medium',
                        r.status === 'succeeded'
                          ? 'bg-success-soft text-success'
                          : r.status === 'failed'
                            ? 'bg-danger-soft text-danger'
                            : 'bg-wash-2 text-muted',
                      )}
                    >
                      {r.status}
                    </span>
                    {r.needsReview && <span className="ml-1 text-xs text-warning">review</span>}
                  </td>
                  <td className={cn(td, 'tabular-nums')}>{ms(r.durationMs)}</td>
                  <td className={cn(td, 'tabular-nums')}>
                    {num(r.inputTokens)} / {num(r.outputTokens)}
                  </td>
                  <td className={cn(td, 'tabular-nums')}>{usd(r.costMicros)}</td>
                  <td className={td}>{r.errorCategory ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && <Pager meta={q.data.meta} onPage={(page) => setF({ ...f, page })} />}
    </div>
  );
}
