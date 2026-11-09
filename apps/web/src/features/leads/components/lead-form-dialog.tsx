'use client';

import { CURRENCY_DEFS, DEFAULT_CURRENCY } from '@torio/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { leadInputSchema, type LeadInput, type LeadInputParsed } from '@torio/contracts';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { AREA, controlCls, Input } from '@/components/ui/input';
import { ApiRequestError } from '../queries';
import { SOURCES, STAGES } from '../constants';
import type { Lead } from '../types';
import { Modal } from './modal';

interface Props {
  lead: Lead | null;
  owners: { id: string; name: string }[];
  onClose: () => void;
  /** Resolves when the server confirmed the save; rejects with ApiRequestError otherwise. */
  onSubmit: (values: LeadInputParsed, lead: Lead | null) => Promise<void>;
}

const label = 'flex flex-col gap-1.5 text-[13px] font-medium';
const err = 'text-xs font-normal text-danger';
const selectCls = controlCls;

export function LeadFormDialog({ lead, owners, onClose, onSubmit }: Props) {
  const editing = !!lead;
  const [again, setAgain] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LeadInput, unknown, LeadInputParsed>({
    resolver: zodResolver(leadInputSchema),
    defaultValues: {
      name: lead?.name ?? '',
      email: lead?.email ?? '',
      phone: lead?.phone ?? '',
      company: lead?.company ?? '',
      jobTitle: lead?.jobTitle ?? '',
      source: lead?.source ?? 'MANUAL',
      stage: lead?.stage ?? 'NEW',
      ownerId: lead?.owner?.id ?? null,
      tags: lead?.tags ?? [],
      dealValue: lead?.dealValue ?? null,
      notes: lead?.notes ?? '',
      customerId: lead?.customerId ?? null,
    },
  });
  const tags = useWatch({ control, name: 'tags' }) ?? [];

  const addTag = () => {
    const t = tagInput.trim().slice(0, 40);
    if (t && !tags.includes(t) && tags.length < 20)
      setValue('tags', [...tags, t], { shouldDirty: true });
    setTagInput('');
  };

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values, lead);
      if (editing || !again) return onClose();
      reset();
      setAgain(false);
      setTimeout(() => setFocus('name'), 0);
    } catch (e) {
      setAgain(false);
      if (e instanceof ApiRequestError) {
        const field =
          e.status === 409
            ? /phone/i.test(e.message)
              ? 'phone'
              : 'email'
            : (e.details[0]?.path as keyof LeadInput | undefined);
        if (field) return setError(field, { message: e.message });
      }
      setError('root', { message: e instanceof Error ? e.message : 'Could not save the lead' });
    }
  });

  return (
    <Modal
      title={editing ? 'Edit lead' : 'Add lead'}
      description={editing ? undefined : 'Only the name is required.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!editing && (
            <Button
              variant="outline"
              type="submit"
              form="lead-form"
              disabled={isSubmitting}
              onClick={() => setAgain(true)}
            >
              Save and add another
            </Button>
          )}
          <Button type="submit" form="lead-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Save lead'}
          </Button>
        </>
      }
    >
      <form
        id="lead-form"
        onSubmit={submit}
        noValidate
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2"
      >
        <label className={`${label} sm:col-span-2`}>
          Full name *
          <Input autoComplete="off" aria-invalid={!!errors.name} {...register('name')} />
          {errors.name && (
            <span role="alert" className={err}>
              {errors.name.message}
            </span>
          )}
        </label>
        <label className={label}>
          Email
          <Input
            type="email"
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && (
            <span role="alert" className={err}>
              {errors.email.message}
            </span>
          )}
        </label>
        <label className={label}>
          Phone (with country code)
          <Input
            type="tel"
            autoComplete="off"
            placeholder="+880 1712 345678"
            aria-invalid={!!errors.phone}
            {...register('phone')}
          />
          {errors.phone && (
            <span role="alert" className={err}>
              {errors.phone.message}
            </span>
          )}
        </label>
        <label className={label}>
          Company
          <Input autoComplete="off" {...register('company')} />
        </label>
        <label className={label}>
          Job title
          <Input autoComplete="off" {...register('jobTitle')} />
        </label>
        <label className={label}>
          Source
          <select className={selectCls} {...register('source')}>
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Status
          <select className={selectCls} {...register('stage')}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Owner
          <select className={selectCls} {...register('ownerId', { setValueAs: (v) => v || null })}>
            <option value="">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Estimated deal value ({CURRENCY_DEFS[DEFAULT_CURRENCY].symbol})
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            aria-invalid={!!errors.dealValue}
            {...register('dealValue', {
              setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
            })}
          />
          {errors.dealValue && (
            <span role="alert" className={err}>
              {errors.dealValue.message}
            </span>
          )}
        </label>
        <div className={`${label} sm:col-span-2`}>
          <label htmlFor="lead-tags">Tags</label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-line px-2 py-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-[3px] pl-2.5 pr-1.5 text-xs font-medium text-primary-hover"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() =>
                    setValue(
                      'tags',
                      tags.filter((x) => x !== t),
                      { shouldDirty: true },
                    )
                  }
                  className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              id="lead-tags"
              value={tagInput}
              maxLength={40}
              onChange={(e) => setTagInput(e.target.value)}
              onBlur={addTag}
              placeholder={tags.length ? '' : 'Type a tag and press Enter'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="min-w-[120px] flex-1 border-none bg-transparent py-1 text-sm font-normal"
            />
          </div>
        </div>
        <label className={`${label} sm:col-span-2`}>
          Notes
          <textarea rows={3} maxLength={5000} className={AREA} {...register('notes')} />
          {errors.notes && (
            <span role="alert" className={err}>
              {errors.notes.message}
            </span>
          )}
        </label>
        {errors.root && (
          <p role="alert" className="m-0 text-[13px] text-danger sm:col-span-2">
            {errors.root.message}
          </p>
        )}
      </form>
    </Modal>
  );
}
