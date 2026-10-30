import { z } from 'zod';

/**
 * Automations: a typed, versioned, allowlisted workflow definition and the pure rules that validate and evaluate
 * it. The API executes it; the web editor uses the same registry and validation, so the UI can't offer anything the
 * engine would reject. Definitions are data only: there is no scripting and no user-supplied code.
 *
 * Model: trigger -> ordered steps. A step is a condition gate (all conditions must match or the run ends as
 * "skipped"), an action (a real change inside Torio), or a wait (a persisted delay). Branching, loops and external
 * calls (e.g. sending customer messages) are deliberately not supported.
 */

export const AUTOMATION_SCHEMA_VERSION = 1;
export const MAX_STEPS = 20;
export const MAX_CONDITIONS = 10;
export const MIN_WAIT_MINUTES = 1;
export const MAX_WAIT_MINUTES = 7 * 24 * 60;
export const MAX_TOTAL_WAIT_MINUTES = 14 * 24 * 60;
/** Per-automation cap on started runs in any rolling hour; further events are recorded as skipped. */
export const RUNS_PER_HOUR_LIMIT = 60;

export const AUTOMATION_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
export const EXECUTION_STATUSES = [
  'QUEUED',
  'RUNNING',
  'WAITING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
] as const;
export const automationStatusSchema = z.enum(AUTOMATION_STATUSES);
export const executionStatusSchema = z.enum(EXECUTION_STATUSES);
export type AutomationStatus = z.infer<typeof automationStatusSchema>;
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

// ---------- registry ----------

export type Entity = 'lead' | 'customer' | 'order' | 'conversation';
export type FieldKind = 'enum' | 'number' | 'tags' | 'flag' | 'text';
export type Operator =
  'equals' | 'not_equals' | 'contains' | 'not_contains' | 'gt' | 'lt' | 'is_set' | 'is_not_set';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  help?: string;
}
export interface TriggerDef {
  type: string;
  label: string;
  description: string;
  /** What the event is about; also decides which actions can run. */
  entity: Entity;
  /** Entities available to steps: `customer` actions need it, etc. */
  provides: Entity[];
  fields: FieldDef[];
  variables: { key: string; label: string }[];
}

const LEAD_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'] as const;
const LEAD_SOURCES = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'WEBSITE', 'MANUAL', 'IMPORT'] as const;
const CHANNELS = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER'] as const;
const CONV_STATUS = ['OPEN', 'SNOOZED', 'RESOLVED'] as const;
const PRIORITY = ['NORMAL', 'HIGH'] as const;
const ORDER_STATUS = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'] as const;
const PAY_STATUS = ['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const;
const FUL_STATUS = ['UNFULFILLED', 'PROCESSING', 'FULFILLED'] as const;
const ORDER_CHANNELS = ['MANUAL', ...CHANNELS] as const;

const leadFields: FieldDef[] = [
  { key: 'lead.stage', label: 'Lead stage', kind: 'enum', options: LEAD_STAGES },
  { key: 'lead.source', label: 'Lead source', kind: 'enum', options: LEAD_SOURCES },
  { key: 'lead.dealValue', label: 'Deal value', kind: 'number' },
  { key: 'lead.owner', label: 'Lead owner', kind: 'flag', help: 'Whether an owner is assigned' },
];
const leadVars = [
  { key: 'lead.name', label: 'Lead name' },
  { key: 'lead.stage', label: 'Lead stage' },
  { key: 'lead.source', label: 'Lead source' },
];
const orderFields: FieldDef[] = [
  { key: 'order.status', label: 'Order status', kind: 'enum', options: ORDER_STATUS },
  { key: 'order.paymentStatus', label: 'Payment status', kind: 'enum', options: PAY_STATUS },
  {
    key: 'order.fulfillmentStatus',
    label: 'Fulfillment status',
    kind: 'enum',
    options: FUL_STATUS,
  },
  { key: 'order.channel', label: 'Sales channel', kind: 'enum', options: ORDER_CHANNELS },
  {
    key: 'order.total',
    label: 'Order total',
    kind: 'number',
    help: 'In whole currency units, e.g. 250.50',
  },
  { key: 'customer.tags', label: 'Customer tags', kind: 'tags' },
];
const orderVars = [
  { key: 'order.number', label: 'Order number' },
  { key: 'order.total', label: 'Order total' },
  { key: 'order.currency', label: 'Order currency' },
  { key: 'order.status', label: 'Order status' },
  { key: 'customer.name', label: 'Customer name' },
];
const convFields: FieldDef[] = [
  { key: 'conversation.status', label: 'Conversation status', kind: 'enum', options: CONV_STATUS },
  { key: 'conversation.priority', label: 'Priority', kind: 'enum', options: PRIORITY },
  { key: 'conversation.channel', label: 'Channel', kind: 'enum', options: CHANNELS },
  {
    key: 'conversation.assignee',
    label: 'Assignee',
    kind: 'flag',
    help: 'Whether an agent is assigned',
  },
  { key: 'customer.tags', label: 'Customer tags', kind: 'tags' },
];
const convVars = [
  { key: 'conversation.id', label: 'Conversation ID' },
  { key: 'conversation.channel', label: 'Channel' },
  { key: 'conversation.status', label: 'Conversation status' },
  { key: 'customer.name', label: 'Customer name' },
];

/**
 * Only events the API really emits today. Not offered: new conversation and incoming message (no provider ingestion
 * exists), and scheduled/time triggers (use a Wait step after a real event instead).
 */
export const TRIGGERS: TriggerDef[] = [
  {
    type: 'lead.created',
    label: 'Lead created',
    description: 'A lead is added manually or through the API.',
    entity: 'lead',
    provides: ['lead'],
    fields: leadFields,
    variables: leadVars,
  },
  {
    type: 'lead.stage_changed',
    label: 'Lead stage changed',
    description: 'A lead moves to a different stage.',
    entity: 'lead',
    provides: ['lead'],
    fields: [
      ...leadFields,
      { key: 'lead.previousStage', label: 'Previous stage', kind: 'enum', options: LEAD_STAGES },
    ],
    variables: leadVars,
  },
  {
    type: 'customer.created',
    label: 'Customer created',
    description: 'A customer is added manually.',
    entity: 'customer',
    provides: ['customer'],
    fields: [
      { key: 'customer.source', label: 'Customer source', kind: 'enum', options: LEAD_SOURCES },
      { key: 'customer.tags', label: 'Customer tags', kind: 'tags' },
    ],
    variables: [{ key: 'customer.name', label: 'Customer name' }],
  },
  {
    type: 'order.created',
    label: 'Order created',
    description: 'A new order is created.',
    entity: 'order',
    provides: ['order', 'customer'],
    fields: orderFields,
    variables: orderVars,
  },
  {
    type: 'order.status_changed',
    label: 'Order status changed',
    description: 'An order moves to a different status.',
    entity: 'order',
    provides: ['order', 'customer'],
    fields: orderFields,
    variables: orderVars,
  },
  {
    type: 'order.payment_recorded',
    label: 'Payment recorded on an order',
    description: 'Staff record a payment on an order.',
    entity: 'order',
    provides: ['order', 'customer'],
    fields: orderFields,
    variables: orderVars,
  },
  {
    type: 'conversation.assigned',
    label: 'Conversation assigned',
    description: 'A conversation is assigned or unassigned.',
    entity: 'conversation',
    provides: ['conversation', 'customer'],
    fields: convFields,
    variables: convVars,
  },
  {
    type: 'conversation.status_changed',
    label: 'Conversation status changed',
    description: 'A conversation is resolved, reopened or snoozed.',
    entity: 'conversation',
    provides: ['conversation', 'customer'],
    fields: convFields,
    variables: convVars,
  },
];
export const triggerOf = (type: string) => TRIGGERS.find((t) => t.type === type);

export interface ActionDef {
  type: string;
  label: string;
  description: string;
  /** Entities that must be available from the trigger. */
  needs: Entity;
}
export const ACTIONS: ActionDef[] = [
  {
    type: 'add_conversation_note',
    label: 'Add internal note to conversation',
    description: 'Posts a private note in the conversation. Never sent to the customer.',
    needs: 'conversation',
  },
  {
    type: 'assign_conversation',
    label: 'Assign conversation',
    description: 'Assigns the conversation to a workspace member.',
    needs: 'conversation',
  },
  {
    type: 'set_conversation_status',
    label: 'Change conversation status',
    description: 'Resolves or reopens the conversation.',
    needs: 'conversation',
  },
  {
    type: 'add_customer_tag',
    label: 'Add customer tag',
    description: 'Adds a tag to the customer if it isn’t there.',
    needs: 'customer',
  },
  {
    type: 'remove_customer_tag',
    label: 'Remove customer tag',
    description: 'Removes a tag from the customer.',
    needs: 'customer',
  },
  {
    type: 'set_lead_stage',
    label: 'Change lead stage',
    description: 'Moves the lead to a stage.',
    needs: 'lead',
  },
  {
    type: 'assign_lead_owner',
    label: 'Assign lead owner',
    description: 'Assigns the lead to a workspace member.',
    needs: 'lead',
  },
  {
    type: 'add_order_note',
    label: 'Add internal note to order',
    description: 'Adds a private note to the order.',
    needs: 'order',
  },
];
export const actionOf = (type: string) => ACTIONS.find((a) => a.type === type);

export const OPERATORS: Record<FieldKind, Operator[]> = {
  enum: ['equals', 'not_equals'],
  number: ['equals', 'gt', 'lt'],
  tags: ['contains', 'not_contains'],
  flag: ['is_set', 'is_not_set'],
  text: ['equals', 'not_equals', 'contains', 'is_set', 'is_not_set'],
};
export const OPERATOR_LABEL: Record<Operator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  not_contains: 'does not contain',
  gt: 'is greater than',
  lt: 'is less than',
  is_set: 'is set',
  is_not_set: 'is not set',
};
const NO_VALUE: Operator[] = ['is_set', 'is_not_set'];
export const needsValue = (op: Operator) => !NO_VALUE.includes(op);

// ---------- definition ----------

const idSchema = z.string().min(1).max(40);
export const conditionSchema = z.object({
  field: z.string().min(1).max(60),
  op: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'gt',
    'lt',
    'is_set',
    'is_not_set',
  ]),
  value: z.string().max(200).default(''),
});
export type Condition = z.infer<typeof conditionSchema>;

const conditionStep = z.object({
  id: idSchema,
  type: z.literal('condition'),
  conditions: z.array(conditionSchema).min(1).max(MAX_CONDITIONS),
});
const waitStep = z.object({
  id: idSchema,
  type: z.literal('wait'),
  minutes: z.number().int().min(MIN_WAIT_MINUTES).max(MAX_WAIT_MINUTES),
});
const actionStep = z.object({
  id: idSchema,
  type: z.literal('action'),
  action: z.enum([
    'add_conversation_note',
    'assign_conversation',
    'set_conversation_status',
    'add_customer_tag',
    'remove_customer_tag',
    'set_lead_stage',
    'assign_lead_owner',
    'add_order_note',
  ]),
  /** Flat, string-only config. Keys per action are validated in `validateDefinition`. */
  config: z.record(z.string().max(40), z.string().max(1000)).default({}),
});
export const stepSchema = z.discriminatedUnion('type', [conditionStep, waitStep, actionStep]);
export type Step = z.infer<typeof stepSchema>;

export const definitionSchema = z.object({
  schemaVersion: z.literal(AUTOMATION_SCHEMA_VERSION),
  trigger: z.object({ type: z.string().min(1).max(60) }),
  steps: z.array(stepSchema).max(MAX_STEPS),
});
export type Definition = z.infer<typeof definitionSchema>;

export const emptyDefinition = (trigger: string): Definition => ({
  schemaVersion: AUTOMATION_SCHEMA_VERSION,
  trigger: { type: trigger },
  steps: [],
});

// ---------- validation ----------

export interface Issue {
  /** Step id the problem belongs to, or null for the workflow as a whole. */
  stepId: string | null;
  message: string;
}

const VAR = /\{\{\s*([a-zA-Z.]+)\s*\}\}/g;
export const variablesIn = (text: string) => [...text.matchAll(VAR)].map((m) => m[1]!);

/** Context a validator can check ids against (supplied by the API; the web editor skips these checks). */
export interface RefCheck {
  isMember: (userId: string) => boolean;
}

export function validateDefinition(def: Definition, refs?: RefCheck): Issue[] {
  const issues: Issue[] = [];
  const add = (stepId: string | null, message: string) => issues.push({ stepId, message });
  const trig = triggerOf(def.trigger.type);
  if (!trig) {
    add(null, 'Choose a trigger that Torio supports');
    return issues;
  }
  if (!def.steps.some((s) => s.type === 'action')) add(null, 'Add at least one action');
  const ids = new Set<string>();
  let totalWait = 0;
  def.steps.forEach((s, i) => {
    if (ids.has(s.id)) add(s.id, 'Duplicate step id');
    ids.add(s.id);
    if (s.type === 'wait') {
      totalWait += s.minutes;
      if (i === def.steps.length - 1) add(s.id, 'A wait must be followed by an action');
    }
    if (s.type === 'condition') {
      if (i === def.steps.length - 1) add(s.id, 'A condition must be followed by an action');
      for (const c of s.conditions) {
        const f = trig.fields.find((x) => x.key === c.field);
        if (!f) {
          add(s.id, `“${c.field}” isn’t available for the “${trig.label}” trigger`);
          continue;
        }
        if (!OPERATORS[f.kind].includes(c.op)) {
          add(s.id, `${f.label}: “${OPERATOR_LABEL[c.op]}” doesn’t apply to this field`);
          continue;
        }
        if (needsValue(c.op)) {
          const v = c.value.trim();
          if (!v) add(s.id, `${f.label}: enter a value`);
          else if (f.kind === 'enum' && !f.options!.includes(v))
            add(s.id, `${f.label}: “${v}” isn’t a valid option`);
          else if (f.kind === 'number' && !Number.isFinite(Number(v)))
            add(s.id, `${f.label}: enter a number`);
        }
      }
    }
    if (s.type === 'action') {
      const a = actionOf(s.action);
      if (!a) return add(s.id, 'Unknown action');
      if (!trig.provides.includes(a.needs))
        return add(
          s.id,
          `“${a.label}” needs a ${a.needs}, which the “${trig.label}” trigger doesn’t provide`,
        );
      const cfg = s.config;
      const need = (k: string, label: string) => {
        if (!cfg[k]?.trim()) add(s.id, `${a.label}: ${label} is required`);
      };
      switch (s.action) {
        case 'add_conversation_note':
        case 'add_order_note': {
          need('text', 'note text');
          const allowed = new Set(trig.variables.map((v) => v.key));
          for (const v of variablesIn(cfg.text ?? ''))
            if (!allowed.has(v)) add(s.id, `Variable {{${v}}} isn’t available for this trigger`);
          if ((cfg.text ?? '').length > 1000) add(s.id, 'Note text is too long');
          break;
        }
        case 'assign_conversation':
        case 'assign_lead_owner':
          need('userId', 'assignee');
          if (cfg.userId && refs && !refs.isMember(cfg.userId))
            add(s.id, 'The selected assignee isn’t an active member of this workspace');
          break;
        case 'set_conversation_status':
          if (!['OPEN', 'RESOLVED'].includes(cfg.status ?? ''))
            add(s.id, `${a.label}: choose Open or Resolved`);
          break;
        case 'add_customer_tag':
        case 'remove_customer_tag':
          need('tag', 'tag');
          if ((cfg.tag ?? '').trim().length > 40) add(s.id, 'Tags can be at most 40 characters');
          break;
        case 'set_lead_stage':
          if (!(LEAD_STAGES as readonly string[]).includes(cfg.stage ?? ''))
            add(s.id, `${a.label}: choose a stage`);
          break;
      }
    }
  });
  if (totalWait > MAX_TOTAL_WAIT_MINUTES) add(null, 'Total waiting time can’t exceed 14 days');
  return issues;
}

// ---------- evaluation (shared semantics between the editor's preview and the engine) ----------

export type Context = Record<string, unknown>;
const get = (ctx: Context, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Context)[k] : undefined), ctx);

export function evalCondition(c: Condition, ctx: Context, trig: TriggerDef): boolean {
  const f = trig.fields.find((x) => x.key === c.field);
  if (!f) return false;
  const raw = get(ctx, f.key);
  switch (c.op) {
    case 'is_set':
      return f.kind === 'flag' ? raw === true : raw !== null && raw !== undefined && raw !== '';
    case 'is_not_set':
      return f.kind === 'flag' ? raw !== true : raw === null || raw === undefined || raw === '';
    case 'equals':
      return f.kind === 'number'
        ? Number(raw) === Number(c.value)
        : String(raw ?? '') === c.value.trim();
    case 'not_equals':
      return String(raw ?? '') !== c.value.trim();
    case 'contains':
      return Array.isArray(raw)
        ? raw.map((x) => String(x).toLowerCase()).includes(c.value.trim().toLowerCase())
        : String(raw ?? '')
            .toLowerCase()
            .includes(c.value.trim().toLowerCase());
    case 'not_contains':
      return !evalCondition({ ...c, op: 'contains' }, ctx, trig);
    case 'gt':
      return raw !== null && raw !== undefined && Number(raw) > Number(c.value);
    case 'lt':
      return raw !== null && raw !== undefined && Number(raw) < Number(c.value);
  }
}
export const evalGate = (s: Extract<Step, { type: 'condition' }>, ctx: Context, trig: TriggerDef) =>
  s.conditions.every((c) => evalCondition(c, ctx, trig));

/** Plain-text substitution of allowlisted variables. Missing or empty values become an empty string. Never HTML. */
export function renderTemplate(text: string, ctx: Context, trig: TriggerDef): string {
  const allowed = new Set(trig.variables.map((v) => v.key));
  return text
    .replace(VAR, (_m, key: string) => {
      if (!allowed.has(key)) return '';
      const v = get(ctx, key);
      return v === null || v === undefined ? '' : String(v).slice(0, 200);
    })
    .slice(0, 1000);
}

/** Human summary of a step, used in lists, the activation confirmation and execution timelines. */
export function describeStep(s: Step): string {
  if (s.type === 'wait') return `Wait ${formatMinutes(s.minutes)}`;
  if (s.type === 'condition')
    return `Continue only if ${s.conditions.length} condition${s.conditions.length === 1 ? '' : 's'} match`;
  return actionOf(s.action)?.label ?? s.action;
}
export function formatMinutes(m: number): string {
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'}`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'}`;
  return `${m} minute${m === 1 ? '' : 's'}`;
}

// ---------- templates (each must pass validateDefinition once configured) ----------

export interface Template {
  key: string;
  name: string;
  description: string;
  complexity: 'Simple' | 'Moderate';
  /** Steps the user must complete before it can be activated. */
  setup: string[];
  definition: Definition;
}
const def = (trigger: string, steps: Step[]): Definition => ({
  schemaVersion: AUTOMATION_SCHEMA_VERSION,
  trigger: { type: trigger },
  steps,
});
export const TEMPLATES: Template[] = [
  {
    key: 'tag-instagram-customers',
    name: 'Tag new customers from Instagram',
    description: 'Adds an “instagram” tag to customers created from the Instagram source.',
    complexity: 'Simple',
    setup: [],
    definition: def('customer.created', [
      {
        id: 's1',
        type: 'condition',
        conditions: [{ field: 'customer.source', op: 'equals', value: 'INSTAGRAM' }],
      },
      { id: 's2', type: 'action', action: 'add_customer_tag', config: { tag: 'instagram' } },
    ]),
  },
  {
    key: 'assign-new-leads',
    name: 'Assign new leads to an owner',
    description: 'Gives every new lead without an owner to a teammate you choose.',
    complexity: 'Simple',
    setup: ['Choose the owner in the last step'],
    definition: def('lead.created', [
      {
        id: 's1',
        type: 'condition',
        conditions: [{ field: 'lead.owner', op: 'is_not_set', value: '' }],
      },
      { id: 's2', type: 'action', action: 'assign_lead_owner', config: { userId: '' } },
    ]),
  },
  {
    key: 'flag-large-orders',
    name: 'Flag large orders',
    description:
      'Adds an internal note to orders above an amount so the team gives them attention.',
    complexity: 'Simple',
    setup: ['Review the amount (default 500)'],
    definition: def('order.created', [
      {
        id: 's1',
        type: 'condition',
        conditions: [{ field: 'order.total', op: 'gt', value: '500' }],
      },
      {
        id: 's2',
        type: 'action',
        action: 'add_order_note',
        config: {
          text: 'Large order #{{order.number}} ({{order.total}} {{order.currency}}). Please review.',
        },
      },
    ]),
  },
  {
    key: 'note-fully-paid',
    name: 'Note when an order is fully paid',
    description: 'Adds an internal note once the recorded payments cover the whole order.',
    complexity: 'Simple',
    setup: [],
    definition: def('order.payment_recorded', [
      {
        id: 's1',
        type: 'condition',
        conditions: [{ field: 'order.paymentStatus', op: 'equals', value: 'PAID' }],
      },
      {
        id: 's2',
        type: 'action',
        action: 'add_order_note',
        config: { text: 'Order #{{order.number}} is now fully paid.' },
      },
    ]),
  },
  {
    key: 'resolved-reminder',
    name: 'Note when a conversation is resolved',
    description: 'Leaves an internal note reminding the team to check for open items.',
    complexity: 'Simple',
    setup: [],
    definition: def('conversation.status_changed', [
      {
        id: 's1',
        type: 'condition',
        conditions: [{ field: 'conversation.status', op: 'equals', value: 'RESOLVED' }],
      },
      {
        id: 's2',
        type: 'action',
        action: 'add_conversation_note',
        config: { text: 'Resolved. Double-check there are no open items for {{customer.name}}.' },
      },
    ]),
  },
  {
    key: 'assignment-follow-up',
    name: 'Follow-up reminder after assignment',
    description:
      'An hour after a conversation is assigned, leaves an internal reminder to follow up.',
    complexity: 'Moderate',
    setup: ['Review the delay (default 1 hour)'],
    definition: def('conversation.assigned', [
      {
        id: 's1',
        type: 'condition',
        conditions: [{ field: 'conversation.assignee', op: 'is_set', value: '' }],
      },
      { id: 's2', type: 'wait', minutes: 60 },
      {
        id: 's3',
        type: 'action',
        action: 'add_conversation_note',
        config: { text: 'Assigned an hour ago. Check that {{customer.name}} has been answered.' },
      },
    ]),
  },
];

// ---------- API shapes ----------

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(300).default(''),
  trigger: z.string().min(1).max(60).optional(),
  templateKey: z.string().max(60).optional(),
});
export const updateAutomationSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    description: z.string().trim().max(300).optional(),
    definition: definitionSchema.optional(),
    /** Revision the editor loaded; a stale value gets 409 so two editors can't overwrite each other. */
    baseRevision: z.number().int().min(1).optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.definition !== undefined,
    'Nothing to update',
  );
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

const csv = (e: z.ZodType) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const out: string[] = [];
      for (const p of v.split(',')) {
        if (!e.safeParse(p.trim()).success) {
          ctx.addIssue({ code: 'custom', message: `Invalid value “${p}”` });
          return z.NEVER;
        }
        out.push(p.trim());
      }
      return out;
    });

export const automationQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: csv(automationStatusSchema),
  trigger: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['updatedAt', 'name', 'lastRun']).default('updatedAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type AutomationQuery = z.infer<typeof automationQuerySchema>;

export const executionQuerySchema = z.object({
  automationId: z.uuid().optional(),
  status: csv(executionStatusSchema),
  includeTests: z.enum(['true', 'false']).default('false'),
  from: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ExecutionQuery = z.infer<typeof executionQuerySchema>;

export const testRunSchema = z.object({
  /** Explicit sample values keyed by field key, e.g. { "order.total": "900" }. Nothing real is read or changed. */
  sample: z
    .record(
      z.string().max(60),
      z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.string().max(40)).max(20)]),
    )
    .default({}),
});

const nullableString = z.string().describe('Text, or null when not set').nullable();
const issueSchema = z.object({ stepId: nullableString, message: z.string() });
const person = z.object({ id: z.uuid(), name: z.string() }).nullable();

export const automationListItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  status: automationStatusSchema,
  triggerType: z.string(),
  stepCount: z.number().int(),
  hasUnpublishedChanges: z.boolean(),
  publishedVersion: z.number().int().describe('Live version number, or 0 before the first publish'),
  runs: z.number().int().describe('Production runs in the last 30 days'),
  failed: z.number().int().describe('Failed runs in the last 30 days'),
  lastRunAt: nullableString,
  createdBy: person,
  updatedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export const automationListSchema = z.object({
  data: z.array(automationListItemSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export const automationDetailSchema = automationListItemSchema.extend({
  definition: definitionSchema,
  draftRevision: z.number().int(),
  issues: z.array(issueSchema),
});
export const validationResultSchema = z.object({ ok: z.boolean(), issues: z.array(issueSchema) });
export const automationSummarySchema = z.object({
  total: z.number().int(),
  active: z.number().int(),
  draft: z.number().int(),
  inactive: z.number().int(),
  periodDays: z.number().int(),
  runs: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
});
export const stepLogSchema = z.object({
  stepId: z.string(),
  type: z.string(),
  status: z.enum(['ok', 'failed', 'skipped', 'waiting', 'simulated']),
  message: z.string(),
  at: z.iso.datetime(),
});
export const executionItemSchema = z.object({
  id: z.uuid(),
  automationId: z.uuid(),
  automationName: z.string(),
  version: z.number().int(),
  isTest: z.boolean(),
  status: executionStatusSchema,
  triggerType: z.string(),
  entityType: z.string(),
  stepCount: z.number().int(),
  completedSteps: z.number().int(),
  attempts: z.number().int(),
  error: nullableString,
  startedAt: nullableString,
  finishedAt: nullableString,
  durationMs: z.number().int().describe('Milliseconds, or -1 when not finished'),
  createdAt: z.iso.datetime(),
});
export const executionListSchema = z.object({
  data: z.array(executionItemSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export const executionDetailSchema = executionItemSchema.extend({
  context: z.record(z.string(), z.unknown()),
  steps: z.array(stepLogSchema),
  plannedSteps: z.array(z.object({ id: z.string(), summary: z.string() })),
});
export const testResultSchema = z.object({
  execution: executionDetailSchema,
  issues: z.array(issueSchema),
});
export const publishResultSchema = automationDetailSchema;
