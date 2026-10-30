'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  customerInputSchema,
  type CustomerInput,
  type CustomerInputParsed,
} from '@torio/contracts';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/features/leads/components/modal';
import { SOURCES } from '@/features/leads/constants';
import { ApiRequestError } from '@/features/leads/queries';
import { STATUSES } from '../constants';
import type { CustomerItem } from '../types';

interface Props {
  customer: CustomerItem | null;
  owners: { id: string; name: string }[];
  onClose: () => void;
  /** Resolves only after the server confirmed the save. */
  onSubmit: (values: CustomerInputParsed, customer: CustomerItem | null) => Promise<void>;
}

const label = 'flex flex-col gap-1.5 text-[13px] font-medium';
const err = 'text-xs font-normal text-danger';
const selectCls =
  'h-10 w-full rounded-[10px] border border-line bg-white px-2.5 text-sm font-normal';

export function CustomerFormDialog({ customer, owners, onClose, onSubmit }: Props) {
  const editing = !!customer;
  const [tagInput, setTagInput] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput, unknown, CustomerInputParsed>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      company: customer?.company ?? '',
      address: customer?.address ?? '',
      source: customer?.source ?? 'MANUAL',
      status: customer?.status ?? 'ACTIVE',
      ownerId: customer?.owner?.id ?? null,
      tags: customer?.tags ?? [],
      notes: customer?.notes ?? '',
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
      await onSubmit(values, customer);
      onClose();
    } catch (e) {
      // Input is preserved: the form stays open with the server's message on the right field.
      if (e instanceof ApiRequestError) {
        const field =
          e.status === 409
            ? /phone/i.test(e.message)
              ? 'phone'
              : 'email'
            : (e.details[0]?.path as keyof CustomerInput | undefined);
        if (field) return setError(field, { message: e.message });
      }
      setError('root', { message: e instanceof Error ? e.message : 'Could not save the customer' });
    }
  });

  return (
    <Modal
      title={editing ? 'Edit customer' : 'Add customer'}
      description={
        editing
          ? undefined
          : 'Only the name is required. Existing customers are never merged automatically.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Save customer'}
          </Button>
        </>
      }
    >
      <form
        id="customer-form"
        onSubmit={submit}
        noValidate
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2"
      >
        <label className={`${label} sm:col-span-2`}>
          Full name *<Input autoComplete="off" aria-invalid={!!errors.name} {...register('name')} />
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
          Address
          <Input autoComplete="off" {...register('address')} />
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
          <select className={selectCls} {...register('status')}>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
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
        <div className={`${label} sm:col-span-2`}>
          <label htmlFor="customer-tags">Tags</label>
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
              id="customer-tags"
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
          Internal notes
          <textarea
            rows={3}
            maxLength={5000}
            className="w-full resize-y rounded-[10px] border border-line p-2.5 text-sm font-normal"
            {...register('notes')}
          />
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
