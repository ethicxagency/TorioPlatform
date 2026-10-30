'use client';

import { TRIGGERS } from '@torio/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';

const field = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px]';

/** Create (name + trigger) and rename share one dialog. */
export function NameDialog({
  mode,
  initialName = '',
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'rename';
  initialName?: string;
  onClose: () => void;
  onSubmit: (v: { name: string; trigger: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [trigger, setTrigger] = useState(TRIGGERS[0]!.type);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Name is required');
    setBusy(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), trigger });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  };
  const t = TRIGGERS.find((x) => x.type === trigger)!;
  return (
    <Modal
      title={mode === 'create' ? 'Create automation' : 'Rename automation'}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="name-form" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create draft' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="name-form" onSubmit={submit} noValidate className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[12.5px] font-medium">
          Name
          <input
            value={name}
            maxLength={120}
            aria-invalid={!!error && !name.trim()}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
        {mode === 'create' && (
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            When this happens
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className={field}>
              {TRIGGERS.map((x) => (
                <option key={x.type} value={x.type}>
                  {x.label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-faint">{t.description}</span>
          </label>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
          >
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
