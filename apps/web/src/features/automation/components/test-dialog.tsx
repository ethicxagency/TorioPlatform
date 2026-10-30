'use client';

import { triggerOf, type Definition } from '@torio/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';
import type { TestResult } from '../types';

const field = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px]';
type Sample = Record<string, string | number | boolean | string[]>;

export function TestDialog({
  def,
  onClose,
  onRun,
}: {
  def: Definition;
  onClose: () => void;
  onRun: (sample: Sample) => Promise<TestResult>;
}) {
  const trig = triggerOf(def.trigger.type);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true);
    setError('');
    const sample: Sample = {};
    for (const f of trig?.fields ?? []) {
      const v = vals[f.key];
      if (v === undefined || v === '') continue;
      sample[f.key] =
        f.kind === 'number'
          ? Number(v)
          : f.kind === 'flag'
            ? v === 'true'
            : f.kind === 'tags'
              ? v
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
              : v;
    }
    try {
      setResult(await onRun(sample));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The test could not run');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Test workflow"
      description="A simulation with sample data. Nothing is sent, and no real record is read or changed."
      onClose={onClose}
      className="sm:max-w-[620px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? 'Running…' : result ? 'Run again' : 'Run test'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {trig?.fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-[12px] font-medium">
            {f.label}
            {f.kind === 'enum' || f.kind === 'flag' ? (
              <select
                value={vals[f.key] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                className={field}
              >
                <option value="">Not provided</option>
                {f.kind === 'flag' ? (
                  <>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </>
                ) : (
                  f.options!.map((o) => <option key={o}>{o}</option>)
                )}
              </select>
            ) : (
              <input
                value={vals[f.key] ?? ''}
                inputMode={f.kind === 'number' ? 'decimal' : undefined}
                placeholder={f.kind === 'tags' ? 'comma, separated' : ''}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                className={field}
              />
            )}
          </label>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
        >
          {error}
        </div>
      )}
      {result && (
        <section aria-label="Test result" className="mt-4 rounded-xl border border-line p-3">
          <div className="mb-2 text-[13px] font-semibold">
            Result:{' '}
            {result.execution.status === 'SUCCEEDED'
              ? 'would run all steps'
              : result.execution.status === 'SKIPPED'
                ? 'would stop at a condition'
                : 'not runnable'}
          </div>
          {result.execution.error && (
            <p role="alert" className="m-0 mb-2 text-[12.5px] text-danger">
              {result.execution.error}
            </p>
          )}
          <ol className="m-0 list-none p-0 text-[12.5px]">
            {result.execution.steps.map((s, i) => (
              <li key={i} className="border-b border-line-subtle py-1.5 last:border-0">
                <b>{s.type}</b> <span className="text-faint">· {s.status}</span>
                <div className="text-muted">{s.message}</div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Modal>
  );
}
