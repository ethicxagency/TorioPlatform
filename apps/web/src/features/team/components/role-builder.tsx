'use client';

import {
  OWNER_ONLY_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_TEMPLATES,
  normalizeRolePermissions,
} from '@torio/types';
import { ArrowLeft, ArrowRight, Check, ChevronDown, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import type { RoleDetail } from '../types';
import { OwnerOnlyBadge, PERMISSION_TOTAL } from './role-parts';

interface Props {
  /** Editing this role; omit to create. */
  role?: RoleDetail;
  /** What the person using the builder may give out: nothing beyond it is offered. */
  mine: ReadonlySet<string>;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSave: (v: {
    name: string;
    description: string | null;
    templateKey: string | null;
    permissions: string[];
  }) => void;
}

const baseline = ['workspace:read'];

export function RoleBuilder({ role, mine, busy, error, onClose, onSave }: Props) {
  const editing = !!role;
  const [step, setStep] = useState<1 | 2>(editing ? 2 : 1);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [templateKey, setTemplateKey] = useState<string | null>(role?.templateKey ?? null);
  const [picked, setPicked] = useState<Set<string>>(new Set(role?.permissions ?? baseline));
  const [open, setOpen] = useState<Set<string>>(new Set([PERMISSION_GROUPS[0]!.key]));
  const [touched, setTouched] = useState(false);

  const tpl = ROLE_TEMPLATES.find((t) => t.key === templateKey) ?? null;
  // What "recommended" and "reset" mean: the template's list, kept to what this person may give.
  const recommended = useMemo(
    () => new Set(tpl ? tpl.permissions.filter((p) => mine.has(p)) : baseline),
    [tpl, mine],
  );
  const original = useMemo(() => new Set(role?.permissions ?? []), [role]);
  const added = [...picked].filter((p) => editing && !original.has(p));
  const removed = [...original].filter((p) => editing && !picked.has(p));
  const label = (k: string) =>
    PERMISSION_GROUPS.flatMap((g) => g.permissions).find((p) => p.key === k)?.label ?? k;

  const choose = (key: string) => {
    const t = ROLE_TEMPLATES.find((x) => x.key === key)!;
    setTemplateKey(key);
    setPicked(new Set(normalizeRolePermissions(t.permissions).filter((p) => mine.has(p))));
  };
  const toggle = (p: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(p);
      else n.delete(p);
      n.add('workspace:read');
      return n;
    });
  const setGroup = (keys: string[], on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      for (const k of keys) {
        if (k === 'workspace:read' && !on) continue;
        if (on) n.add(k);
        else n.delete(k);
      }
      return n;
    });

  const nameError =
    touched && name.trim().length < 2 ? 'Role name needs at least 2 characters' : undefined;
  const next = () => {
    setTouched(true);
    if (name.trim().length >= 2) setStep(2);
  };
  const save = () => {
    setTouched(true);
    if (name.trim().length < 2) return setStep(1);
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      templateKey,
      permissions: [...picked],
    });
  };

  return (
    <Modal
      title={editing ? `Edit role: ${role.name}` : 'Create custom role'}
      description={
        step === 1
          ? 'Step 1 of 2 · Name the role and start from a template.'
          : 'Step 2 of 2 · Choose exactly what this role can do.'
      }
      onClose={onClose}
      className="sm:max-w-[760px]"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-muted" aria-live="polite">
            {picked.size} of {PERMISSION_TOTAL - OWNER_ONLY_PERMISSIONS.length} permissions selected
          </span>
          <div className="flex gap-2">
            {step === 2 && !editing && (
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft size={14} aria-hidden /> Back
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {step === 1 ? (
              <Button onClick={next}>
                Next <ArrowRight size={14} aria-hidden />
              </Button>
            ) : (
              <Button onClick={save} loading={busy}>
                {editing ? 'Save changes' : 'Create role'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            <span>
              Role name{' '}
              <span aria-hidden className="text-danger">
                *
              </span>
            </span>
            <input
              id="role-name"
              value={name}
              maxLength={40}
              aria-required="true"
              aria-invalid={!!nameError}
              placeholder="e.g. Support lead"
              onChange={(e) => setName(e.target.value)}
              className={controlCls}
            />
            {nameError && (
              <span role="alert" className="text-xs font-normal text-danger">
                {nameError}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Description
            <textarea
              value={description}
              maxLength={200}
              rows={2}
              placeholder="What this role is for"
              onChange={(e) => setDescription(e.target.value)}
              className={`${controlCls} h-auto resize-y p-2.5`}
            />
          </label>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 p-0 text-[13px] font-medium">Start from a template</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Role template">
              {ROLE_TEMPLATES.map((t) => {
                const on = templateKey === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(t.key)}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 rounded-xl border bg-white p-3 text-left transition-colors duration-150 hover:border-line-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                      on ? 'border-primary bg-primary-soft/40' : 'border-line',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{t.label}</span>
                      {on && <Check size={14} aria-hidden className="text-primary" />}
                    </span>
                    <span className="text-xs leading-[1.45] text-muted">{t.description}</span>
                    <span className="text-[11px] tabular-nums text-faint">
                      {t.permissions.length} permission{t.permissions.length === 1 ? '' : 's'}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-2 text-xs text-faint">
              A template only fills in the permissions. You can change any of them in the next step.
            </p>
          </fieldset>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tpl && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-wash px-3 py-2 text-xs text-muted">
              <span>
                Started from <strong className="font-semibold text-ink">{tpl.label}</strong>
              </span>
              <button
                type="button"
                onClick={() => setPicked(new Set(recommended))}
                className="cursor-pointer border-none bg-transparent p-0 text-xs font-medium text-primary hover:text-primary-hover"
              >
                Reset to template
              </button>
            </div>
          )}
          {editing && (removed.length > 0 || added.length > 0) && (
            <div
              role="status"
              className={cn(
                'flex gap-2 rounded-xl border px-3 py-2.5 text-xs leading-[1.5]',
                removed.length && role.memberCount > 0
                  ? 'border-warning/30 bg-warning-soft text-warning'
                  : 'border-line bg-wash text-muted',
              )}
            >
              <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                {added.length > 0 && <>Adding {added.map(label).join(', ')}. </>}
                {removed.length > 0 && <>Removing {removed.map(label).join(', ')}. </>}
                {removed.length > 0 && role.memberCount > 0 && (
                  <strong className="font-semibold">
                    {role.memberCount} member{role.memberCount === 1 ? '' : 's'} with this role will
                    lose that access immediately.
                  </strong>
                )}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {PERMISSION_GROUPS.map((g) => {
              const keys = g.permissions.map((p) => p.key as string);
              const grantable = keys.filter(
                (k) => !(OWNER_ONLY_PERMISSIONS as readonly string[]).includes(k) && mine.has(k),
              );
              const on = grantable.filter((k) => picked.has(k)).length;
              const isOpen = open.has(g.key);
              return (
                <section
                  key={g.key}
                  className="overflow-hidden rounded-xl border border-line bg-white"
                >
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`grp-${g.key}`}
                      onClick={() =>
                        setOpen((s) => {
                          const n = new Set(s);
                          if (n.has(g.key)) n.delete(g.key);
                          else n.add(g.key);
                          return n;
                        })
                      }
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
                    >
                      <ChevronDown
                        size={15}
                        aria-hidden
                        className={cn(
                          'shrink-0 text-faint transition-transform duration-150 motion-reduce:transition-none',
                          !isOpen && '-rotate-90',
                        )}
                      />
                      <span className="text-[13.5px] font-semibold text-ink">{g.label}</span>
                      <span className="text-xs tabular-nums text-faint">
                        {on} / {grantable.length}
                      </span>
                    </button>
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setGroup(grantable, true)}
                        className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary hover:text-primary-hover"
                      >
                        Enable all
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroup(grantable, false)}
                        className="cursor-pointer border-none bg-transparent p-0 font-medium text-muted hover:text-ink"
                      >
                        Disable all
                      </button>
                      {tpl && (
                        <button
                          type="button"
                          onClick={() => {
                            setGroup(grantable, false);
                            setGroup(
                              grantable.filter((k) => recommended.has(k)),
                              true,
                            );
                          }}
                          className="cursor-pointer border-none bg-transparent p-0 font-medium text-muted hover:text-ink"
                        >
                          Recommended
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <ul
                      id={`grp-${g.key}`}
                      className="m-0 list-none border-t border-line-subtle p-0"
                    >
                      {g.permissions.map((p) => {
                        const locked = (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(
                          p.key,
                        );
                        const beyond = !locked && !mine.has(p.key);
                        const base = p.key === 'workspace:read';
                        const checked = picked.has(p.key);
                        return (
                          <li
                            key={p.key}
                            className="flex items-start gap-3 border-b border-line-subtle px-3 py-2.5 last:border-0"
                          >
                            <input
                              id={`perm-${p.key}`}
                              type="checkbox"
                              checked={base || checked}
                              disabled={locked || beyond || base}
                              onChange={(e) => toggle(p.key, e.target.checked)}
                              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#5B5CE2] disabled:cursor-not-allowed"
                            />
                            <label
                              htmlFor={`perm-${p.key}`}
                              className="min-w-0 flex-1 cursor-pointer"
                            >
                              <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink">
                                {p.label}
                                {locked && <OwnerOnlyBadge />}
                                {p.sensitive && !locked && (
                                  <span
                                    title="Sensitive: this gives access to critical or irreversible actions."
                                    className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning"
                                  >
                                    <TriangleAlert size={10} aria-hidden /> Sensitive
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs leading-[1.45] text-muted">
                                {p.description}
                                {base && ' Always included.'}
                                {beyond &&
                                  ' You do not have this permission, so you cannot give it.'}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
          {error && (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
      {step === 1 && error && (
        <p role="alert" className="m-0 mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
