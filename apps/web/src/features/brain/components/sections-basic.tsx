'use client';

import { areas, filled, TONES } from '@torio/contracts';
import { Plus } from 'lucide-react';
import {
  AreaField,
  Chips,
  Pill,
  SectionCard,
  Segmented,
  SelectField,
  TextField,
  Toggle,
} from './bits';
import { PAYMENT_CATALOG, SHIPPING_CATALOG, ServiceCards } from './service-cards';
import type { SectionProps } from './types';
import { CURRENCY_DEFS, DEFAULT_CURRENCY } from '@torio/contracts';

const CURRENCY_SYMBOL = CURRENCY_DEFS[DEFAULT_CURRENCY].symbol;

const CATEGORIES = [
  'Home & Lifestyle',
  'Fashion & Apparel',
  'Beauty & Personal Care',
  'Electronics',
  'Food & Grocery',
  'Health & Wellness',
  'Books & Stationery',
  'Services',
  'Other',
];
const LANGS = ['Bengali', 'English', 'Hindi', 'Arabic'];
const CURRENCIES = ['BDT (৳)', 'USD ($)', 'INR (₹)', 'EUR (€)', 'GBP (£)'];
const COVERAGE = ['Nationwide', 'Inside Dhaka only', 'Major cities', 'Selected areas'];
const DISCOUNTS = ['None', 'Up to 5%', 'Up to 10%', 'Up to 15%', 'Up to 20%'];
const APPROVAL = [
  'Discounts',
  'Refunds',
  'Payment issues',
  'Complaints',
  'Bulk orders',
  'Custom orders',
];
const ANGRY = [
  'Apologise, acknowledge, then hand off',
  'Apologise and try to resolve',
  'Hand off immediately',
];

const status = (d: SectionProps['d'], key: string) => {
  const a = areas(d).find((x) => x.key === key);
  if (!a) return null;
  const p = Math.round(a.pct * 100);
  return (
    <Pill tone={a.review ? 'warn' : p === 100 ? 'ok' : p === 0 ? 'neutral' : 'info'}>
      {a.review
        ? 'Needs review'
        : p === 100
          ? 'Complete'
          : p === 0
            ? 'Not started'
            : `${p}% complete`}
    </Pill>
  );
};

export function IdentitySection({
  d,
  mut,
  canWrite,
  onAddField,
}: SectionProps & { onAddField: () => void }) {
  const i = d.identity;
  const set = (k: keyof typeof i) => (v: string) =>
    mut((c) => {
      (c.identity[k] as string) = v;
    });
  return (
    <SectionCard
      id="identity"
      title="Business Profile"
      description="Who you are. AI uses this to introduce your brand consistently."
      status={status(d, 'identity')}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          label="Brand name *"
          value={i.name}
          onChange={set('name')}
          error={!filled(i.name) ? 'Required before you can save.' : undefined}
        />
        <SelectField
          label="Business category"
          value={i.category}
          onChange={set('category')}
          options={['', ...CATEGORIES]}
        />
        <TextField
          label="Website URL"
          value={i.website}
          onChange={set('website')}
          placeholder="example.com"
        />
        <TextField label="Country" value={i.country} onChange={set('country')} />
        <TextField
          label="Primary market"
          value={i.market}
          onChange={set('market')}
          placeholder="e.g. Dhaka & major cities"
        />
        <SelectField
          label="Currency"
          value={i.currency}
          onChange={set('currency')}
          options={['', ...CURRENCIES]}
        />
      </div>
      <Chips
        label="Supported languages"
        values={i.languages}
        options={LANGS}
        onChange={(v) =>
          mut((c) => {
            c.identity.languages = v;
          })
        }
      />
      <AreaField
        label="Brand description"
        value={i.description}
        onChange={set('description')}
        rows={3}
        hint="One or two sentences about what you sell."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="Target audience" value={i.audience} onChange={set('audience')} />
        <TextField label="Brand positioning" value={i.positioning} onChange={set('positioning')} />
      </div>
      <TextField label="Unique selling proposition" value={i.usp} onChange={set('usp')} />
      {canWrite && (
        <button
          type="button"
          onClick={onAddField}
          className="flex w-fit cursor-pointer items-center gap-1.5 text-[13px] font-medium text-primary"
        >
          <Plus size={14} />
          Add a custom field to the profile
        </button>
      )}
    </SectionCard>
  );
}

export function PoliciesSection({ d, mut }: SectionProps) {
  const s = d.shipping,
    r = d.returns;
  const sh =
    (
      k:
        | 'coverage'
        | 'feeInside'
        | 'feeOutside'
        | 'timeInside'
        | 'timeOutside'
        | 'threshold'
        | 'processing'
        | 'tracking',
    ) =>
    (v: string) =>
      mut((c) => {
        c.shipping[k] = v;
      });
  const re = (k: keyof typeof r) => (v: string) =>
    mut((c) => {
      c.returns[k] = v;
    });
  return (
    <>
      <SectionCard
        id="policies"
        title="Customer Policies"
        description="Orders, delivery and payments. AI quotes these exactly; it never guesses fees or times."
        status={status(d, 'shipping')}
      >
        <ServiceCards
          title="Shipping Providers"
          description="Manage the courier services available to your store."
          addTitle="Add Shipping Provider"
          addHint="Connect a courier or shipping service."
          pickerTitle="Add shipping provider"
          customLabel="Add as a custom provider"
          emptyTitle="No shipping providers yet."
          emptyText="Add the couriers you deliver with so AI can name them."
          catalog={SHIPPING_CATALOG}
          customCategory="Custom provider"
          values={s.providers}
          onChange={(v) =>
            mut((c) => {
              c.shipping.providers = v;
            })
          }
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField
            label="Delivery coverage"
            value={s.coverage}
            onChange={sh('coverage')}
            options={['', ...COVERAGE]}
          />
          <TextField
            label="Order processing time"
            value={s.processing}
            onChange={sh('processing')}
            placeholder="e.g. 1 business day"
          />
          <TextField
            label={`Inside-city delivery fee (${CURRENCY_SYMBOL})`}
            value={s.feeInside}
            onChange={sh('feeInside')}
          />
          <TextField
            label={`Outside-city delivery fee (${CURRENCY_SYMBOL})`}
            value={s.feeOutside}
            onChange={sh('feeOutside')}
          />
          <TextField
            label="Inside-city delivery time"
            value={s.timeInside}
            onChange={sh('timeInside')}
            placeholder="e.g. 1–2 days"
          />
          <TextField
            label="Outside-city delivery time"
            value={s.timeOutside}
            onChange={sh('timeOutside')}
            placeholder="e.g. 3–5 days"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Toggle
            checked={s.cod}
            onChange={(v) =>
              mut((c) => {
                c.shipping.cod = v;
              })
            }
            label="Cash on delivery"
            hint="AI will tell customers COD is available."
          />
          <Toggle
            checked={s.freeShip}
            onChange={(v) =>
              mut((c) => {
                c.shipping.freeShip = v;
              })
            }
            label="Free shipping above a minimum order"
          />
        </div>
        {s.freeShip && (
          <TextField
            label={`Free shipping threshold (${CURRENCY_SYMBOL})`}
            value={s.threshold}
            onChange={sh('threshold')}
            className="max-w-xs"
          />
        )}
        <ServiceCards
          title="Payment Methods"
          description="Manage how your customers can pay for their orders."
          addTitle="Add Payment Method"
          addHint="Offer another way to pay."
          pickerTitle="Add payment method"
          customLabel="Add as a custom method"
          emptyTitle="No payment methods yet."
          emptyText="Add the ways customers can pay so AI can tell them."
          catalog={PAYMENT_CATALOG}
          customCategory="Custom payment method"
          values={s.payments}
          onChange={(v) =>
            mut((c) => {
              c.shipping.payments = v;
            })
          }
        />
        <AreaField
          label="Delivery tracking instructions"
          value={s.tracking}
          onChange={sh('tracking')}
          rows={3}
          hint="What AI tells customers who ask where their order is."
        />
      </SectionCard>
      <SectionCard
        id="returns"
        title="Returns & Refunds"
        description="Return, exchange and refund rules."
        status={status(d, 'returns')}
      >
        <AreaField
          label="Return eligibility"
          value={r.eligibility}
          onChange={re('eligibility')}
          rows={2}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Return window"
            value={r.window}
            onChange={re('window')}
            placeholder="e.g. 7 days"
          />
          <TextField
            label="Refund processing time"
            value={r.refundTime}
            onChange={re('refundTime')}
            placeholder="e.g. 5–7 business days"
          />
        </div>
        <AreaField
          label="Exchange eligibility"
          value={r.exchange}
          onChange={re('exchange')}
          rows={2}
        />
        <AreaField
          label="Damaged product policy"
          value={r.damaged}
          onChange={re('damaged')}
          rows={2}
        />
        <AreaField label="Wrong product policy" value={r.wrong} onChange={re('wrong')} rows={2} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Return shipping responsibility"
            value={r.shippingResp}
            onChange={re('shippingResp')}
          />
          <TextField label="Required proof" value={r.proof} onChange={re('proof')} />
        </div>
        <AreaField
          label="Escalation instructions"
          value={r.escalation}
          onChange={re('escalation')}
          rows={2}
          hint="When AI should hand a return dispute to a person."
        />
      </SectionCard>
    </>
  );
}

export function VoiceSection({ d, mut }: SectionProps) {
  const v = d.voice;
  const set = (k: 'greeting' | 'terms' | 'avoid' | 'examples') => (x: string) =>
    mut((c) => {
      c.voice[k] = x;
    });
  const filledCount = [v.greeting, v.terms, v.avoid, v.examples].filter(filled).length;
  return (
    <SectionCard
      id="voice"
      title="Brand Voice"
      description="How replies should sound."
      status={
        <Pill tone={filledCount >= 2 ? 'ok' : 'neutral'}>
          {filledCount >= 2 ? 'Configured' : 'Defaults'}
        </Pill>
      }
    >
      <Segmented
        label="Tone"
        value={v.tone}
        options={TONES}
        onChange={(x) =>
          mut((c) => {
            c.voice.tone = x as typeof v.tone;
          })
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Segmented
          label="Reply language"
          value={v.language}
          options={['Bengali', 'English', 'Mixed']}
          onChange={(x) =>
            mut((c) => {
              c.voice.language = x as typeof v.language;
            })
          }
        />
        <Segmented
          label="Length"
          value={v.length}
          options={['Concise', 'Balanced', 'Detailed']}
          onChange={(x) =>
            mut((c) => {
              c.voice.length = x as typeof v.length;
            })
          }
        />
        <Segmented
          label="Emoji"
          value={v.emoji}
          options={['None', 'Minimal', 'Moderate']}
          onChange={(x) =>
            mut((c) => {
              c.voice.emoji = x as typeof v.emoji;
            })
          }
        />
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <label htmlFor="formality" className="text-[13px] font-medium">
          Formality: {v.formality} of 5
        </label>
        <input
          id="formality"
          type="range"
          min={1}
          max={5}
          step={1}
          value={v.formality}
          onChange={(e) =>
            mut((c) => {
              c.voice.formality = Number(e.target.value);
            })
          }
          className="w-full accent-[#5B5CE2]"
        />
        <div className="flex justify-between text-xs text-faint">
          <span>Relaxed</span>
          <span>Formal</span>
        </div>
      </div>
      <TextField
        label="Custom greeting"
        value={v.greeting}
        onChange={set('greeting')}
        hint="Leave empty to use a greeting matching the tone."
      />
      <AreaField
        label="Preferred terms"
        value={v.terms}
        onChange={set('terms')}
        rows={2}
        placeholder="Say “order”, not “purchase”."
      />
      <TextField
        label="Words to avoid"
        value={v.avoid}
        onChange={set('avoid')}
        placeholder="cheap, guaranteed"
      />
      <AreaField
        label="Example conversation"
        value={v.examples}
        onChange={set('examples')}
        rows={4}
        hint="Show the style you want. Customer: … / Us: …"
      />
    </SectionCard>
  );
}

export function GuardrailsSection({ d, mut }: SectionProps) {
  const ru = d.rules;
  const set = (k: 'always' | 'never' | 'escalate') => (v: string) =>
    mut((c) => {
      c.rules[k] = v;
    });
  return (
    <SectionCard
      id="guardrails"
      title="AI Guardrails"
      description="Hard limits. AI must not invent business facts that are not in your approved knowledge."
      status={<Pill tone="info">Safety</Pill>}
    >
      <div className="rounded-[10px] border border-primary-line bg-primary-tint px-3 py-2.5 text-[12.5px] text-[#3A3C42]">
        If the answer isn&apos;t in your knowledge, AI uses the fallback below instead of guessing.
      </div>
      <AreaField label="AI should always…" value={ru.always} onChange={set('always')} rows={2} />
      <AreaField label="AI must never…" value={ru.never} onChange={set('never')} rows={2} />
      <Chips
        label="Topics that need human approval"
        values={ru.approvalTopics}
        options={APPROVAL}
        onChange={(v) =>
          mut((c) => {
            c.rules.approvalTopics = v;
          })
        }
      />
      <AreaField
        label="Human escalation instructions"
        value={ru.escalate}
        onChange={set('escalate')}
        rows={2}
        hint="When and how to hand a conversation to a person."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          label="Discount authorization limit"
          value={ru.discount}
          onChange={(v) =>
            mut((c) => {
              c.rules.discount = v;
            })
          }
          options={DISCOUNTS}
        />
        <SelectField
          label="Angry-customer handling"
          value={ru.angry}
          onChange={(v) =>
            mut((c) => {
              c.rules.angry = v;
            })
          }
          options={ANGRY}
        />
      </div>
      <Segmented
        label="When AI doesn't know"
        value={
          ru.fallback === 'human'
            ? 'Offer a person'
            : ru.fallback === 'clarify'
              ? 'Ask a question'
              : 'Say so plainly'
        }
        options={['Offer a person', 'Ask a question', 'Say so plainly']}
        onChange={(x) =>
          mut((c) => {
            c.rules.fallback =
              x === 'Offer a person' ? 'human' : x === 'Ask a question' ? 'clarify' : 'plain';
          })
        }
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Toggle
          checked={ru.alternatives}
          onChange={(v) =>
            mut((c) => {
              c.rules.alternatives = v;
            })
          }
          label="Suggest alternatives"
          hint="When something is unavailable"
        />
        <Toggle
          checked={ru.competitors}
          onChange={(v) =>
            mut((c) => {
              c.rules.competitors = v;
            })
          }
          label="May mention competitors"
        />
        <Toggle
          checked={ru.promises}
          onChange={(v) =>
            mut((c) => {
              c.rules.promises = v;
            })
          }
          label="May promise delivery dates"
        />
      </div>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-medium">
          Sensitive situations that need human review
        </legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {(['refund', 'payment', 'complaint', 'delivery'] as const).map((k) => (
            <Toggle
              key={k}
              checked={ru.sensitive[k]}
              onChange={(v) =>
                mut((c) => {
                  c.rules.sensitive[k] = v;
                })
              }
              label={
                {
                  refund: 'Refund requests',
                  payment: 'Payment problems',
                  complaint: 'Complaints',
                  delivery: 'Specific delivery commitments',
                }[k]
              }
            />
          ))}
        </div>
      </fieldset>
      <p className="m-0 text-xs text-faint">
        Tip: keep “always” and “never” short and specific. Rules in Business Logic override general
        guidance.
      </p>
    </SectionCard>
  );
}
