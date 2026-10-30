'use client';

import { ChevronDown, Mail, MapPin, Phone, Plus, X, Sparkles, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CHANNELS, LEAD_STATUSES } from '../constants';
import { initialsOf } from '../format';
import type { Conversation, LeadStatus } from '../types';
import { ChannelBadge } from './channel-badge';

interface Props {
  c: Conversation;
  agents: { id: string; name: string }[];
  canEditCustomer: boolean;
  canManage: boolean;
  onClose: () => void;
  onLead: (s: LeadStatus) => void;
  onTags: (tags: string[]) => void;
  onNotes: (notes: string) => void;
  onAssign: (agentId: string | null) => void;
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `pf-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="border-b border-line-subtle">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-[13px] font-semibold"
        >
          {title}
          <ChevronDown
            size={15}
            className={cn('text-faint transition-transform', open && 'rotate-180')}
          />
        </button>
      </h3>
      {open && (
        <div id={id} className="px-4 pb-3.5">
          {children}
        </div>
      )}
    </section>
  );
}

const fieldCls =
  'h-8 w-full rounded-lg border border-line bg-white px-2 text-[13px] text-ink disabled:bg-[#FBFBFC] disabled:text-muted';

export function CustomerProfile({
  c,
  agents,
  canEditCustomer,
  canManage,
  onClose,
  onLead,
  onTags,
  onNotes,
  onAssign,
}: Props) {
  const cu = c.customer;
  const [adding, setAdding] = useState(false);
  const [tag, setTag] = useState('');
  const [notes, setNotes] = useState(cu.notes);
  const lead = LEAD_STATUSES.find((l) => l.key === cu.leadStatus)!;

  const addTag = () => {
    const v = tag.trim().slice(0, 40);
    if (v && !cu.tags.includes(v) && cu.tags.length < 20) onTags([...cu.tags, v]);
    setTag('');
    setAdding(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-3">
        <h2 className="m-0 flex-1 text-sm font-semibold">Customer</h2>
        <button
          type="button"
          aria-label="Close customer profile"
          onClick={onClose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
        >
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-1 border-b border-line-subtle px-4 pb-4 pt-5 text-center">
          <span className="relative mb-1">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-line-subtle text-lg font-semibold text-muted">
              {initialsOf(cu.name)}
            </span>
            <span className="absolute -bottom-0.5 -left-0.5">
              <ChannelBadge provider={c.channel.provider} size={20} />
            </span>
          </span>
          <div className="text-[15px] font-semibold">{cu.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span style={{ color: CHANNELS[c.channel.provider].color }} className="font-medium">
              {CHANNELS[c.channel.provider].label}
            </span>
            <span
              className="rounded-md px-1.5 py-px font-medium"
              style={{ background: lead.bg, color: lead.color }}
            >
              {lead.label}
            </span>
          </div>
          {cu.isSample && (
            <span className="mt-1 rounded-md bg-wash-2 px-2 py-0.5 text-[11px] text-faint">
              Sample customer
            </span>
          )}
        </div>

        <Section title="Details">
          <dl className="m-0 flex flex-col gap-2 text-[13px]">
            {cu.phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} className="shrink-0 text-faint" />
                <dd className="m-0 break-all">{cu.phone}</dd>
              </div>
            )}
            {cu.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} className="shrink-0 text-faint" />
                <dd className="m-0 break-all">{cu.email}</dd>
              </div>
            )}
            {cu.handle && (
              <div className="flex items-center gap-2">
                <span className="w-3.5 shrink-0 text-center text-faint">@</span>
                <dd className="m-0 break-all">{cu.handle.replace(/^@/, '')}</dd>
              </div>
            )}
            {cu.location && (
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-faint" />
                <dd className="m-0">{cu.location}</dd>
              </div>
            )}
            {!cu.phone && !cu.email && !cu.handle && !cu.location && (
              <p className="m-0 text-muted">No contact details on file.</p>
            )}
            <div className="text-xs text-faint">
              Customer since{' '}
              {new Date(cu.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
              })}
            </div>
          </dl>
        </Section>

        <Section title="Lead & assignment">
          <label className="mb-2.5 flex flex-col gap-1 text-[11.5px] text-faint">
            Lead status
            <select
              disabled={!canEditCustomer}
              value={cu.leadStatus}
              onChange={(e) => onLead(e.target.value as LeadStatus)}
              className={fieldCls}
            >
              {LEAD_STATUSES.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-faint">
            Assigned agent
            <select
              disabled={!canManage}
              value={c.assignee?.id ?? ''}
              onChange={(e) => onAssign(e.target.value || null)}
              className={fieldCls}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </Section>

        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {cu.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-[3px] pl-2.5 pr-1.5 text-xs font-medium text-primary-hover"
              >
                {t}
                {canEditCustomer && (
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => onTags(cu.tags.filter((x) => x !== t))}
                    className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {cu.tags.length === 0 && !adding && (
              <span className="text-[13px] text-muted">No tags</span>
            )}
            {canEditCustomer &&
              (adding ? (
                <input
                  autoFocus
                  aria-label="New tag"
                  value={tag}
                  maxLength={40}
                  onChange={(e) => setTag(e.target.value)}
                  onBlur={addTag}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                    if (e.key === 'Escape') {
                      setTag('');
                      setAdding(false);
                    }
                  }}
                  className="h-6 w-28 rounded-full border border-primary px-2.5 text-xs"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-[#C9CBD3] px-2.5 py-[3px] text-xs text-muted hover:bg-wash"
                >
                  <Plus size={11} />
                  Add tag
                </button>
              ))}
          </div>
        </Section>

        <Section title="Orders">
          <div className="flex items-start gap-2 rounded-lg bg-[#FBFBFC] p-3 text-[13px] text-muted">
            <ShoppingBag size={15} className="mt-0.5 shrink-0 text-faint" />
            Orders aren&apos;t available yet. They&apos;ll appear here once the Orders module is
            built.
          </div>
        </Section>

        <Section title="Internal notes" defaultOpen={false}>
          <textarea
            aria-label="Customer notes"
            rows={4}
            maxLength={5000}
            disabled={!canEditCustomer}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== cu.notes && onNotes(notes)}
            placeholder={
              canEditCustomer ? 'Notes about this customer — visible to your team only' : 'No notes'
            }
            className="w-full resize-y rounded-lg border border-line bg-white p-2 text-[13px] disabled:bg-[#FBFBFC]"
          />
          <p className="m-0 mt-1 text-[11.5px] text-faint">Saved when you click away.</p>
        </Section>

        <Section title="AI summary" defaultOpen={false}>
          <div className="flex items-start gap-2 rounded-lg border border-primary-line bg-primary-tint p-3 text-[13px] text-muted">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-primary" />
            No AI summary yet. Summaries will appear here once Brain is connected.
          </div>
        </Section>
      </div>
    </div>
  );
}
