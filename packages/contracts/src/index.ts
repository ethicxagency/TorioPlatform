import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[0-9]/, 'Password needs a digit');

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  /** Optional: when omitted the workspace is named after the person ("Ada's workspace") and can be renamed in Settings. */
  workspaceName: z.string().trim().min(2).max(80).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Do not enforce complexity on login; only presence.
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const tokenBodySchema = z.object({ token: z.string().min(20).max(200) });

export const pendingEmailSchema = z.object({ email: emailSchema });

/** What the sign-in and sign-up pages may offer. Public and the same for everyone; it never says anything about a person. */
export const authConfigSchema = z.object({
  google: z.boolean(),
  facebook: z.boolean(),
  /** Whether verification and password-reset emails can actually be sent. */
  email: z.boolean(),
  registrationOpen: z.boolean(),
});
export type AuthConfig = z.infer<typeof authConfigSchema>;

export const deletionStatusSchema = z.enum([
  'PENDING_VERIFICATION',
  'VERIFIED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
]);
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;

/** Public request from the Delete Account page. Ownership is proven by the emailed link (or the signed-in session + password). */
export const deletionRequestSchema = z.object({
  email: emailSchema,
  reason: z.string().trim().max(500).optional(),
  confirm: z.literal(true, { message: 'Confirm that you understand deletion is permanent' }),
});
export const deletionSignedInRequestSchema = z.object({
  /** Re-entering the password is the confirmation step for a signed-in customer. Omit to confirm by email instead. */
  password: z.string().min(1).max(128).optional(),
  reason: z.string().trim().max(500).optional(),
  confirm: z.literal(true, { message: 'Confirm that you understand deletion is permanent' }),
});
export const deletionStatusViewSchema = z.object({
  reference: z.string(),
  status: deletionStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Only when rejected. */
  rejectionReason: z.string().nullable(),
});
/** The signed-in person's own privacy requests, newest first (today: account deletion requests). */
export const myPrivacyRequestsSchema = z.object({
  data: z.array(
    deletionStatusViewSchema.extend({
      type: z.literal('ACCOUNT_DELETION'),
      processedAt: z.iso.datetime().nullable(),
    }),
  ),
});
/** `reference`/`status` are present only once a request really exists; an emailed-link request answers with `verificationSent`. */
export const deletionCreatedSchema = z.object({
  verificationSent: z.boolean(),
  reference: z.string().nullable(),
  status: deletionStatusSchema.nullable(),
});
export const adminDeletionListSchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      reference: z.string(),
      email: z.string(),
      reason: z.string().nullable(),
      status: deletionStatusSchema,
      createdAt: z.iso.datetime(),
      verifiedAt: z.iso.datetime().nullable(),
      processedAt: z.iso.datetime().nullable(),
      rejectionReason: z.string().nullable(),
      summary: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});
export const adminDeletionRejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const refreshSchema = z.object({
  /** Mobile clients send the refresh token in the body; browsers use the HttpOnly cookie. */
  refreshToken: z.string().min(20).max(512).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .string()
    .regex(/^-?[a-zA-Z]+$/)
    .optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace';

// ---------- Response schemas (used for OpenAPI + typed clients) ----------

export const workspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'AGENT']);

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const workspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().describe('Text, or null when not set').nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reportingTimeZone: z.string(),
  defaultCurrency: z.string().describe('ISO currency code, or null when not set').nullable(),
  contactEmail: z.string().describe('Text, or null when not set').nullable(),
  logo: z.string().describe('Image URL, or null when not set').nullable(),
  phone: z.string().describe('E.164 number, or null when not set').nullable(),
  industry: z.string().describe('Text, or null when not set').nullable(),
  country: z.string().describe('ISO 3166-1 alpha-2, or null when not set').nullable(),
  addressLine: z.string().describe('Text, or null when not set').nullable(),
  city: z.string().describe('Text, or null when not set').nullable(),
  state: z.string().describe('Text, or null when not set').nullable(),
  postalCode: z.string().describe('Text, or null when not set').nullable(),
  createdAt: z.iso.datetime(),
});

export const workspaceWithRoleSchema = workspaceSchema.extend({
  role: workspaceRoleSchema,
  /** The store the app opens now: the last one the person used, else the oldest. Exactly one is true. */
  active: z.boolean(),
});

export const membershipStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);

export const memberSchema = z.object({
  /** Membership id (used in /members/:memberId routes). */
  id: z.uuid(),
  userId: z.uuid(),
  role: workspaceRoleSchema,
  status: membershipStatusSchema,
  name: z.string(),
  email: z.email(),
  teams: z.array(z.object({ id: z.uuid(), name: z.string() })),
  /** Open Inbox conversations currently assigned to this member. */
  assignedOpenConversations: z.number().int(),
  /** Most recent session refresh/sign-in recorded for the user. Not live presence. */
  lastSignInAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().describe('Access token lifetime in seconds'),
  /** Present only for mobile clients (X-Torio-Client: mobile). Browsers get an HttpOnly cookie. */
  refreshToken: z.string().optional(),
  user: userSchema,
});

export const logoutResponseSchema = z.object({ ok: z.literal(true) });

export const pageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const memberListSchema = z.object({ data: z.array(memberSchema), meta: pageMetaSchema });

const healthCheckSchema = z.object({
  status: z.enum(['up', 'down', 'skipped']),
  latencyMs: z.number().optional(),
});

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  checks: z.object({ database: healthCheckSchema, redis: healthCheckSchema }).optional(),
  uptimeSeconds: z.number().optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    statusCode: z.number().int(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

// ---------- Inbox ----------

export const channelProviderSchema = z.enum(['WHATSAPP', 'INSTAGRAM', 'MESSENGER']);
export const conversationStatusSchema = z.enum(['OPEN', 'SNOOZED', 'RESOLVED']);
export const prioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH']);
export const leadStatusSchema = z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'CONVERTED', 'LOST']);
export const messageKindSchema = z.enum(['INBOUND', 'OUTBOUND', 'NOTE', 'EVENT']);
export const deliveryStatusSchema = z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']);

/**
 * Nullable string for response schemas. `z.string().nullable()` serialises to `type: ['string','null']`,
 * which @nestjs/swagger mis-reads as an array; a described schema emits `anyOf` and is read correctly.
 */
const nullableString = z.string().describe('Text, or null when not set').nullable();

export const MAX_MESSAGE_LENGTH = 4000;

export const customerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: nullableString,
  email: nullableString,
  handle: nullableString,
  location: nullableString,
  leadStatus: leadStatusSchema,
  tags: z.array(z.string()),
  notes: z.string(),
  isSample: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const conversationSchema = z.object({
  id: z.uuid(),
  status: conversationStatusSchema,
  priority: prioritySchema,
  snoozedUntil: z.iso.datetime().nullable(),
  unreadCount: z.number().int(),
  lastMessageAt: z.iso.datetime(),
  lastMessagePreview: z.string(),
  waitingSince: z.iso.datetime().nullable(),
  channel: z.object({ id: z.uuid(), provider: channelProviderSchema, displayName: z.string() }),
  assignee: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  customer: customerSchema,
});

export const conversationCountsSchema = z.object({
  open: z.number().int(),
  snoozed: z.number().int(),
  resolved: z.number().int(),
});

/**
 * Conversations per channel in the requested status (e.g. Open), across the whole workspace. View, search and
 * advanced filters do not narrow it, so the badges stay stable while you search. `all` is the sum of the providers.
 */
export const conversationChannelCountsSchema = z.object({
  all: z.number().int(),
  WHATSAPP: z.number().int(),
  INSTAGRAM: z.number().int(),
  MESSENGER: z.number().int(),
});

export const conversationListSchema = z.object({
  data: z.array(conversationSchema),
  meta: pageMetaSchema,
  counts: conversationCountsSchema,
  channelCounts: conversationChannelCountsSchema,
});

export const messageSchema = z.object({
  id: z.uuid(),
  kind: messageKindSchema,
  body: z.string(),
  author: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  replyTo: z.object({ id: z.uuid(), body: z.string(), kind: messageKindSchema }).nullable(),
  deliveryStatus: deliveryStatusSchema.nullable(),
  /** Why a send failed, when deliveryStatus is FAILED. */
  failureReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const messageListSchema = z.object({ data: z.array(messageSchema), meta: pageMetaSchema });

export const conversationQuerySchema = paginationQuerySchema.extend({
  status: conversationStatusSchema.default('OPEN'),
  view: z.enum(['all', 'mine', 'unassigned', 'unread']).default('all'),
  channel: channelProviderSchema.optional(),
  assigneeId: z.uuid().optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  priority: prioritySchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  order: z.enum(['waiting', 'newest', 'priority']).default('waiting'),
});
export type ConversationQuery = z.infer<typeof conversationQuerySchema>;

export const messageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

export const sendMessageSchema = z.object({
  kind: z.enum(['REPLY', 'NOTE']).default('REPLY'),
  body: z.string().trim().min(1, 'Message cannot be empty').max(MAX_MESSAGE_LENGTH),
  replyToId: z.uuid().optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const updateConversationSchema = z
  .object({
    status: conversationStatusSchema.optional(),
    assigneeId: z.uuid().nullable().optional(),
    priority: prioritySchema.optional(),
    snoozedUntil: z.iso.datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
  .refine((v) => v.status !== 'SNOOZED' || !!v.snoozedUntil, {
    message: 'snoozedUntil is required when snoozing',
    path: ['snoozedUntil'],
  });
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const bulkConversationSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    action: z.enum([
      'ASSIGN_ME',
      'ASSIGN',
      'MARK_READ',
      'MARK_UNREAD',
      'SET_PRIORITY',
      'SNOOZE',
      'RESOLVE',
    ]),
    snoozedUntil: z.iso.datetime().optional(),
    /** ASSIGN: a workspace member's user id, or null to unassign. */
    assigneeId: z.uuid().nullable().optional(),
    /** SET_PRIORITY: the new priority. */
    priority: prioritySchema.optional(),
  })
  .refine((v) => v.action !== 'ASSIGN' || v.assigneeId !== undefined, {
    message: 'assigneeId is required (null to unassign)',
    path: ['assigneeId'],
  })
  .refine((v) => v.action !== 'SET_PRIORITY' || !!v.priority, {
    message: 'priority is required',
    path: ['priority'],
  });
export type BulkConversationInput = z.infer<typeof bulkConversationSchema>;
export const bulkResultSchema = z.object({ updated: z.number().int() });

export const savedReplySchema = z.object({
  id: z.uuid(),
  shortcut: z.string(),
  title: z.string(),
  body: z.string(),
});
export const createSavedReplySchema = z.object({
  shortcut: z
    .string()
    .trim()
    .regex(/^\/[a-z0-9_-]{1,30}$/, 'Use a slash command like /price'),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });
export const searchResultSchema = z.object({
  conversations: z.array(
    z.object({
      id: z.uuid(),
      customerName: z.string(),
      provider: channelProviderSchema,
      preview: z.string(),
      status: conversationStatusSchema,
    }),
  ),
  customers: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      phone: nullableString,
      email: nullableString,
    }),
  ),
});

// ---------- Leads ----------

export const leadStageSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST']);
export const leadSourceSchema = z.enum([
  'WHATSAPP',
  'INSTAGRAM',
  'MESSENGER',
  'WEBSITE',
  'MANUAL',
  'IMPORT',
]);
export const leadActivityTypeSchema = z.enum(['CREATED', 'STAGE_CHANGED', 'OWNER_CHANGED', 'NOTE']);

export const leadSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: nullableString,
  phone: nullableString,
  company: nullableString,
  jobTitle: nullableString,
  source: leadSourceSchema,
  stage: leadStageSchema,
  owner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  tags: z.array(z.string()),
  dealValue: z.number().int().nullable(),
  /** 0-100 from the documented rules-based score (not an AI prediction). */
  score: z.number().int(),
  notes: z.string(),
  customerId: z.uuid().nullable(),
  /** Most recent Inbox conversation of the linked customer, if any. */
  conversationId: z.uuid().nullable(),
  lastActivityAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const leadListSchema = z.object({ data: z.array(leadSchema), meta: pageMetaSchema });

export const leadSummarySchema = z.object({
  total: z.number().int(),
  new: z.number().int(),
  qualified: z.number().int(),
  won: z.number().int(),
  lost: z.number().int(),
  unassigned: z.number().int(),
  /** Won / (Won + Lost); null until at least one lead is closed. */
  conversionRate: z.number().describe('Ratio between 0 and 1').nullable(),
  createdLast30Days: z.number().int(),
  createdPrevious30Days: z.number().int(),
});

/** Comma-separated query value validated against an enum, e.g. `stages=NEW,QUALIFIED`. */
const csvEnum = <E extends z.ZodEnum<Record<string, string>>>(item: E) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const parts = v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      const parsed = parts.map((p) => item.safeParse(p));
      if (parsed.length > 20 || parsed.some((r) => !r.success)) {
        ctx.addIssue({ code: 'custom', message: 'Invalid list value' });
        return z.NEVER;
      }
      return parts as z.output<E>[];
    });

export const LEAD_SORT_FIELDS = [
  'createdAt',
  'name',
  'score',
  'lastActivityAt',
  'dealValue',
] as const;

export const leadFilterSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  stages: csvEnum(leadStageSchema),
  sources: csvEnum(leadSourceSchema),
  /** "unassigned" or a member user id. */
  owner: z.union([z.literal('unassigned'), z.uuid()]).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  /** Leads linked to one customer (e.g. the Inbox customer panel). */
  customerId: z.uuid().optional(),
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
});
export type LeadFilter = z.infer<typeof leadFilterSchema>;

export const leadQuerySchema = leadFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(LEAD_SORT_FIELDS).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type LeadQuery = z.infer<typeof leadQuerySchema>;

export const leadExportQuerySchema = leadFilterSchema.extend({
  /** Comma-separated lead ids; when present, only these (within the workspace) are exported. */
  ids: z.string().optional(),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const leadInputSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required').max(120),
  email: z
    .union([z.literal(''), emailSchema])
    .optional()
    .transform((v) => v || undefined),
  phone: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^\+?[0-9][0-9\s().-]{5,24}$/, 'Enter a valid phone number, e.g. +880 1712 345678'),
    ])
    .optional()
    .transform((v) => v || undefined),
  company: optionalText(120),
  jobTitle: optionalText(120),
  source: leadSourceSchema.default('MANUAL'),
  stage: leadStageSchema.default('NEW'),
  ownerId: z.uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  dealValue: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  notes: z.string().max(5000).default(''),
  customerId: z.uuid().nullable().optional(),
});
export type LeadInput = z.input<typeof leadInputSchema>;
export type LeadInputParsed = z.output<typeof leadInputSchema>;

export const updateLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z
      .union([z.literal(''), emailSchema])
      .nullable()
      .optional(),
    phone: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .regex(/^\+?[0-9][0-9\s().-]{5,24}$/, 'Enter a valid phone number'),
      ])
      .nullable()
      .optional(),
    company: z.string().trim().max(120).nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    source: leadSourceSchema.optional(),
    stage: leadStageSchema.optional(),
    ownerId: z.uuid().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    dealValue: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    notes: z.string().max(5000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const leadNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(2000),
});

export const leadActivitySchema = z.object({
  id: z.uuid(),
  type: leadActivityTypeSchema,
  body: z.string(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
});
export const leadActivityListSchema = z.object({ data: z.array(leadActivitySchema) });

export const leadBulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    action: z.enum(['ASSIGN', 'SET_STAGE', 'ADD_TAGS', 'DELETE']),
    ownerId: z.uuid().nullable().optional(),
    stage: leadStageSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === 'SET_STAGE' && !v.stage)
      ctx.addIssue({ code: 'custom', path: ['stage'], message: 'stage is required' });
    if (v.action === 'ADD_TAGS' && !v.tags?.length)
      ctx.addIssue({ code: 'custom', path: ['tags'], message: 'tags are required' });
    if (v.action === 'ASSIGN' && v.ownerId === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['ownerId'],
        message: 'ownerId is required (null to unassign)',
      });
  });
export type LeadBulkInput = z.infer<typeof leadBulkSchema>;

export const leadImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
});
export const leadImportResultSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
});

// ---------- Customers ----------

export const customerStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const CUSTOMER_SEGMENTS = ['all', 'new', 'recent', 'inactive', 'tagged'] as const;
export const customerSegmentSchema = z.enum(CUSTOMER_SEGMENTS);

const phoneRule = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s().-]{5,24}$/, 'Enter a valid phone number, e.g. +880 1712 345678');

export const customerListItemSchema = customerSchema.extend({
  company: nullableString,
  address: nullableString,
  source: leadSourceSchema,
  status: customerStatusSchema,
  owner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  conversationCount: z.number().int(),
  /** Newest linked conversation, for "Open conversation". */
  conversationId: z.uuid().nullable(),
  /** Latest recorded interaction: newest conversation message, else the customer's last update. */
  lastActivityAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const customerDirectorySchema = z.object({
  data: z.array(customerListItemSchema),
  meta: pageMetaSchema,
});

/** Distinct customer tags in the workspace, sorted; feeds tag filters. */
export const customerTagListSchema = z.object({ data: z.array(z.string()) });

export const customerSummarySchema = z.object({
  total: z.number().int(),
  active: z.number().int(),
  withConversations: z.number().int(),
  createdLast30Days: z.number().int(),
  createdPrevious30Days: z.number().int(),
});

export const CUSTOMER_SORT_FIELDS = ['createdAt', 'name'] as const;

export const customerFilterSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: customerStatusSchema.optional(),
  sources: csvEnum(leadSourceSchema),
  owner: z.union([z.literal('unassigned'), z.uuid()]).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
  segment: customerSegmentSchema.default('all'),
});
export type CustomerFilter = z.infer<typeof customerFilterSchema>;

export const customerQuerySchema = customerFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(CUSTOMER_SORT_FIELDS).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type CustomerQuery = z.infer<typeof customerQuerySchema>;

export const customerExportQuerySchema = customerFilterSchema.extend({
  ids: z.string().optional(),
});

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required').max(120),
  email: z
    .union([z.literal(''), emailSchema])
    .optional()
    .transform((v) => v || undefined),
  phone: z
    .union([z.literal(''), phoneRule])
    .optional()
    .transform((v) => v || undefined),
  company: optionalText(120),
  address: optionalText(300),
  source: leadSourceSchema.default('MANUAL'),
  status: customerStatusSchema.default('ACTIVE'),
  ownerId: z.uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: z.string().max(5000).default(''),
});
export type CustomerInput = z.input<typeof customerInputSchema>;
export type CustomerInputParsed = z.output<typeof customerInputSchema>;

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z
      .union([z.literal(''), emailSchema])
      .nullable()
      .optional(),
    phone: z
      .union([z.literal(''), phoneRule])
      .nullable()
      .optional(),
    company: z.string().trim().max(120).nullable().optional(),
    address: z.string().trim().max(300).nullable().optional(),
    source: leadSourceSchema.optional(),
    status: customerStatusSchema.optional(),
    ownerId: z.uuid().nullable().optional(),
    leadStatus: leadStatusSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    notes: z.string().max(5000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerNoteSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  author: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const customerNoteListSchema = z.object({ data: z.array(customerNoteSchema) });
export const customerNoteInputSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(2000),
});

export const customerActivitySchema = z.object({
  id: z.string(),
  type: z.enum(['CREATED', 'CONVERSATION', 'NOTE']),
  body: z.string(),
  at: z.iso.datetime(),
  conversationId: z.uuid().nullable(),
});
export const customerActivityListSchema = z.object({ data: z.array(customerActivitySchema) });

export const customerConversationSchema = z.object({
  id: z.uuid(),
  provider: channelProviderSchema,
  status: conversationStatusSchema,
  preview: z.string(),
  lastMessageAt: z.iso.datetime(),
  assignee: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export const customerConversationListSchema = z.object({
  data: z.array(customerConversationSchema),
});

export const customerBulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    action: z.enum(['ADD_TAGS', 'REMOVE_TAGS', 'ASSIGN', 'SET_STATUS']),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    ownerId: z.uuid().nullable().optional(),
    status: customerStatusSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.action === 'ADD_TAGS' || v.action === 'REMOVE_TAGS') && !v.tags?.length)
      ctx.addIssue({ code: 'custom', path: ['tags'], message: 'tags are required' });
    if (v.action === 'ASSIGN' && v.ownerId === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['ownerId'],
        message: 'ownerId is required (null to unassign)',
      });
    if (v.action === 'SET_STATUS' && !v.status)
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'status is required' });
  });
export type CustomerBulkInput = z.infer<typeof customerBulkSchema>;

export const customerImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
});

// ---------- Team management ----------

export const memberQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  role: workspaceRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
  team: z.uuid().optional(),
});
export type MemberQuery = z.infer<typeof memberQuerySchema>;

export const memberDetailSchema = memberSchema.extend({ resolvedLast30Days: z.number().int() });

export const updateMemberSchema = z
  .object({
    role: z.enum(['ADMIN', 'AGENT']).optional(),
    status: membershipStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const memberActivitySchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      description: z.string(),
      actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});

export const teamSummarySchema = z.object({
  totalMembers: z.number().int(),
  activeMembers: z.number().int(),
  suspendedMembers: z.number().int(),
  pendingInvitations: z.number().int(),
  unassignedOpenConversations: z.number().int(),
});

export const invitationInputSchema = z.object({
  email: emailSchema,
  role: z.enum(['ADMIN', 'AGENT']).default('AGENT'),
  teamId: z.uuid().nullable().optional(),
});
export type InvitationInput = z.input<typeof invitationInputSchema>;

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: workspaceRoleSchema,
  team: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  invitedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  status: z.enum(['PENDING', 'EXPIRED']),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export const invitationListSchema = z.object({ data: z.array(invitationSchema) });
/** Returned only when an invitation is created or resent: the link contains the one-time token. */
export const invitationCreatedSchema = invitationSchema.extend({
  inviteUrl: z.string(),
  /** Torio does not send email yet; share the link yourself. */
  emailSent: z.boolean(),
});

export const invitationPreviewSchema = z.object({
  email: z.email(),
  workspaceName: z.string(),
  role: workspaceRoleSchema,
});
export const acceptInvitationNewUserSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
});
export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(200) });
export const acceptedSchema = z.object({ workspaceId: z.uuid() });

export const teamSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  lead: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  members: z.array(z.object({ userId: z.uuid(), name: z.string() })),
  openConversations: z.number().int(),
});
export const teamListSchema = z.object({ data: z.array(teamSchema) });
export const teamInputSchema = z.object({
  name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(60),
  description: z.string().trim().max(300).default(''),
  leadId: z.uuid().nullable().optional(),
  memberIds: z.array(z.uuid()).max(200).default([]),
});
export type TeamInput = z.input<typeof teamInputSchema>;
export const updateTeamSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).optional(),
  leadId: z.uuid().nullable().optional(),
  memberIds: z.array(z.uuid()).max(200).optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export * from './brain';
export * from './brain-maturity';
export * from './brain-preview';
export * from './orders';
export * from './currency';
export * from './locale';
export * from './settings';
export * from './stores';
export * from './automations';
export * from './billing';
export * from './admin';
export * from './date-range';
export * from './meta-admin';

// ---------- Channels ----------

export const channelStatusSchema = z.enum([
  'CONNECTED',
  'DISCONNECTED',
  'NEEDS_ATTENTION',
  'EXPIRED',
]);

export const channelSchema = z.object({
  id: z.uuid(),
  provider: channelProviderSchema,
  displayName: z.string(),
  status: channelStatusSchema,
  accountName: nullableString,
  accountMask: nullableString,
  connectedAt: z.iso.datetime().nullable(),
  disconnectedAt: z.iso.datetime().nullable(),
  /** Set only when a real provider health check ran. Null means the connection has never been verified. */
  lastHealthCheckAt: z.iso.datetime().nullable(),
  lastError: nullableString,
  /** When the stored token stops working; null = no expiry known. Used to prompt reauthorization. */
  tokenExpiresAt: z.iso.datetime().nullable(),
  /** SUBSCRIBED or FAILED, written only after a real subscribe call to Meta; null = never attempted. */
  webhookStatus: z.enum(['SUBSCRIBED', 'FAILED']).nullable(),
  webhookError: nullableString,
  /** Last time Meta delivered any event for this channel. */
  lastEventAt: z.iso.datetime().nullable(),
  /** Development seed record with no live provider connection. */
  isSample: z.boolean(),
  defaultAssignee: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  defaultTeam: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  conversationCount: z.number().int(),
  openConversations: z.number().int(),
  unreadConversations: z.number().int(),
  lastConversationAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const channelListSchema = z.object({ data: z.array(channelSchema) });

export const channelSummarySchema = z.object({
  total: z.number().int(),
  connected: z.number().int(),
  needsAttention: z.number().int(),
  disconnected: z.number().int(),
  sample: z.number().int(),
  conversationsLast30Days: z.number().int(),
});

export const channelQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  provider: channelProviderSchema.optional(),
  status: channelStatusSchema.optional(),
  sort: z.enum(['name', 'activity']).default('name'),
});

export const providerInfoSchema = z.object({
  provider: channelProviderSchema,
  label: z.string(),
  /** available = can start a real connection now; unavailable = the integration does not exist in this build. */
  state: z.enum(['available', 'unavailable']),
  /** How the connection is made: Facebook OAuth with Page selection, Embedded Signup, or a pasted Cloud API token. */
  method: z.enum(['oauth', 'embedded_signup', 'manual_token']),
  reason: z.string(),
  requirements: z.array(z.string()),
  connectedCount: z.number().int(),
});
/** Connect a WhatsApp number with a Cloud API access token (Meta Embedded Signup is not built yet). */
export const connectWhatsAppSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/, 'Enter the numeric phone number ID from Meta'),
  accessToken: z.string().trim().min(20).max(1000),
});
export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;
/** One Facebook authorization discovers Pages, Instagram accounts and (optionally) WhatsApp numbers. */
export const metaProductSchema = z.enum(['MESSENGER', 'INSTAGRAM', 'WHATSAPP']);
export const metaStartSchema = z.object({
  /** Which products to ask permissions for; defaults to everything this server is configured for. */
  products: z.array(metaProductSchema).min(1).max(3).optional(),
});
export type MetaStartInput = z.infer<typeof metaStartSchema>;
export const metaStartResultSchema = z.object({ url: z.url() });
/** What was discovered: names and public profile data only, never tokens. */
export const metaSessionSchema = z.object({
  id: z.uuid(),
  expiresAt: z.iso.datetime(),
  candidates: z.array(
    z.object({
      /** Stable key, e.g. MESSENGER:<page id>. */
      key: z.string(),
      provider: channelProviderSchema,
      name: z.string(),
      /** Linked Page / business name / account type. */
      detail: nullableString,
      imageUrl: nullableString,
      /** False when it can't be connected right now; `reason` says why. */
      eligible: z.boolean(),
      reason: nullableString,
      /** Already connected to a workspace, so it can't be chosen again. */
      taken: z.boolean(),
    }),
  ),
  /** Products the user declined permissions for, so the screen can explain empty sections. */
  missingPermissions: z.array(metaProductSchema),
});
export const metaSelectSchema = z.object({
  candidateKeys: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
});
export type MetaSelectInput = z.infer<typeof metaSelectSchema>;
/** Each selected asset is provisioned independently, so one failure never hides the others. */
export const metaProvisionResultSchema = z.object({
  results: z.array(
    z.object({
      key: z.string(),
      provider: channelProviderSchema,
      name: z.string(),
      status: z.enum(['CONNECTED', 'FAILED', 'ACTION_REQUIRED']),
      channelId: nullableString,
      message: nullableString,
    }),
  ),
});
/** WhatsApp Embedded Signup result: the code and ids the Facebook SDK returns in the browser; the token is exchanged on the server. */
export const whatsAppEmbeddedSignupSchema = z.object({
  code: z.string().trim().min(10).max(2000),
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/),
  wabaId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/),
  displayName: z.string().trim().min(1).max(60),
});
export type WhatsAppEmbeddedSignupInput = z.infer<typeof whatsAppEmbeddedSignupSchema>;
export const metaConfigSchema = z.object({
  /** Public identifiers the browser needs for Embedded Signup; never secrets. */
  appId: nullableString,
  graphVersion: z.string(),
  whatsappConfigId: nullableString,
  /** Whether the Facebook authorization also lists existing WhatsApp numbers. */
  whatsappDiscovery: z.boolean(),
  /** Permissions the Facebook dialog will request, each with the reason Torio needs it. */
  permissions: z.array(z.object({ scope: z.string(), reason: z.string() })),
});
export const channelHealthSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string(),
  qualityRating: nullableString,
  displayPhoneNumber: nullableString,
  error: nullableString,
});

export const providerListSchema = z.object({ data: z.array(providerInfoSchema) });

export const updateChannelSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    defaultAssigneeId: z.uuid().nullable().optional(),
    defaultTeamId: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const channelActivitySchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      description: z.string(),
      actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export * from './brain-imports';
