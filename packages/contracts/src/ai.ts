import { z } from 'zod';

/** Adapters Torio ships. Adding a provider means adding an adapter and a key here; the engine itself does not change. */
export const AI_PROVIDER_KEYS = ['openai', 'gemini'] as const;
export type AiProviderKey = (typeof AI_PROVIDER_KEYS)[number];
export const aiProviderKeySchema = z.enum(AI_PROVIDER_KEYS);

/** What an agent can ask for in the Inbox. */
export const AI_MODES = ['auto', 'openai', 'gemini', 'synthesis'] as const;
export type AiMode = (typeof AI_MODES)[number];
export const aiModeSchema = z.enum(AI_MODES);

export const AI_MODE_LABEL: Record<AiMode, string> = {
  auto: 'Auto (Recommended)',
  openai: 'OpenAI',
  gemini: 'Gemini',
  synthesis: 'Multi-AI Synthesis',
};

/** Safe, high-level phases shown while a draft is prepared. No reasoning is exposed. */
export const AI_PHASES = [
  'understanding',
  'consulting',
  'evaluating',
  'preparing',
  'done',
] as const;
export type AiPhase = (typeof AI_PHASES)[number];
export const AI_PHASE_LABEL: Record<AiPhase, string> = {
  understanding: 'Understanding message',
  consulting: 'Consulting AI models',
  evaluating: 'Evaluating responses',
  preparing: 'Preparing final answer',
  done: 'Done',
};

export const AI_ERROR_CATEGORIES = [
  'auth',
  'rate_limit',
  'timeout',
  'unavailable',
  'bad_request',
  'empty',
  'blocked',
  'budget',
  'unknown',
] as const;
export type AiErrorCategory = (typeof AI_ERROR_CATEGORIES)[number];

/** The ways the quality of a candidate answer is scored. Weights are set by the platform owner and normalised. */
export const aiWeightsSchema = z.object({
  relevance: z.number().min(0).max(100),
  knowledge: z.number().min(0).max(100),
  instructions: z.number().min(0).max(100),
  completeness: z.number().min(0).max(100),
  clarity: z.number().min(0).max(100),
  safety: z.number().min(0).max(100),
});
export type AiWeights = z.infer<typeof aiWeightsSchema>;
export const DEFAULT_AI_WEIGHTS: AiWeights = {
  relevance: 25,
  knowledge: 25,
  instructions: 20,
  completeness: 15,
  clarity: 10,
  safety: 5,
};

/** What one plan may do with AI. Plans with no entry use the default, which starts as "not included". */
export const aiPlanLimitSchema = z.object({
  included: z.boolean(),
  /** AI drafts per calendar month (UTC). Null means no request cap for this plan. */
  monthlyRequests: z.number().int().min(0).max(10_000_000).nullable(),
  /** Input plus output tokens per month. Null means no token cap. */
  monthlyTokens: z.number().int().min(0).max(10_000_000_000).nullable(),
  /** May use Multi-AI Synthesis (an advanced, higher-cost feature). */
  multiModel: z.boolean(),
  /** AI requests running at once for one workspace. */
  maxConcurrent: z.number().int().min(1).max(10),
  /** Largest prompt sent for one request, in characters. Older messages are dropped to fit. */
  maxRequestChars: z.number().int().min(2_000).max(200_000),
});
export type AiPlanLimit = z.infer<typeof aiPlanLimitSchema>;
export const DEFAULT_PLAN_LIMIT: AiPlanLimit = {
  included: false,
  monthlyRequests: 0,
  monthlyTokens: null,
  multiModel: false,
  maxConcurrent: 2,
  maxRequestChars: 24_000,
};

/** Spending controls, in USD micro-dollars (1,000,000 = $1). Costs are estimates from the prices entered per model. */
export const aiBudgetsSchema = z.object({
  /** Whole-platform AI spend per month. Null means no budget. */
  monthlyMicros: z.number().int().min(0).nullable(),
  /** Per provider, keyed by provider key. */
  providerMicros: z.record(z.string(), z.number().int().min(0).nullable()),
  /** Per workspace, the same limit for each. */
  workspaceMicros: z.number().int().min(0).nullable(),
  /** Show an alert when spend reaches this share of a budget. */
  alertPercent: z.number().int().min(1).max(100),
  /** At the limit: stop AI (block) or only show the alert (alert). */
  onLimit: z.enum(['block', 'alert']),
});
export type AiBudgets = z.infer<typeof aiBudgetsSchema>;
export const DEFAULT_AI_BUDGETS: AiBudgets = {
  monthlyMicros: null,
  providerMicros: {},
  workspaceMicros: null,
  alertPercent: 80,
  onLimit: 'block',
};

export const aiSettingsSchema = z.object({
  /** Master switch. Off means AI Assist says it is not available. */
  enabled: z.boolean(),
  modes: z.object({ single: z.boolean(), auto: z.boolean(), synthesis: z.boolean() }),
  defaultProvider: aiProviderKeySchema.nullable(),
  /** Which provider writes the final synthesised answer. Null picks the best enabled provider. */
  synthesisProvider: aiProviderKeySchema.nullable(),
  requestTimeoutMs: z.number().int().min(3_000).max(60_000),
  maxRetries: z.number().int().min(0).max(3),
  /** Use another enabled provider when one fails. */
  fallback: z.boolean(),
  maxParallel: z.number().int().min(1).max(4),
  /** Below this internal score a draft is flagged for human review. */
  minQualityScore: z.number().int().min(0).max(100),
  weights: aiWeightsSchema,
  logRetentionDays: z.number().int().min(1).max(365),
  /** Most recent messages sent for context. */
  contextMessages: z.number().int().min(1).max(30),
  planLimits: z.record(z.string(), aiPlanLimitSchema),
  defaultPlanLimit: aiPlanLimitSchema,
  budgets: aiBudgetsSchema,
  /** Requests per minute allowed to one provider. Missing or null means no limit from Torio's side. */
  providerRpm: z.record(z.string(), z.number().int().min(1).max(100_000).nullable()),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;
export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  modes: { single: true, auto: true, synthesis: false },
  defaultProvider: null,
  synthesisProvider: null,
  requestTimeoutMs: 20_000,
  maxRetries: 1,
  fallback: true,
  maxParallel: 2,
  minQualityScore: 55,
  weights: DEFAULT_AI_WEIGHTS,
  logRetentionDays: 90,
  contextMessages: 12,
  planLimits: {},
  defaultPlanLimit: DEFAULT_PLAN_LIMIT,
  budgets: DEFAULT_AI_BUDGETS,
  providerRpm: {},
};
export const updateAiSettingsSchema = aiSettingsSchema.partial().extend({
  modes: aiSettingsSchema.shape.modes.partial().optional(),
  weights: aiWeightsSchema.partial().optional(),
});

export type UpdateAiSettings = z.infer<typeof updateAiSettingsSchema>;

export const aiHealthSchema = z.enum(['UNKNOWN', 'HEALTHY', 'DEGRADED', 'DOWN']);
export const aiModelViewSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  maxOutputTokens: z.number().int().nullable(),
  temperature: z.number().nullable(),
  supportsTemperature: z.boolean(),
  inputPriceMicros: z.number().int().nullable(),
  outputPriceMicros: z.number().int().nullable(),
});
export const aiProviderViewSchema = z.object({
  key: aiProviderKeySchema,
  name: z.string(),
  enabled: z.boolean(),
  /** The key is never returned: only whether one is saved and its last four characters. */
  hasKey: z.boolean(),
  keyMask: z.string().nullable(),
  keyUpdatedAt: z.string().nullable(),
  defaultModel: z.string().nullable(),
  health: aiHealthSchema,
  lastCheckedAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastErrorCategory: z.string().nullable(),
  updatedAt: z.string().nullable(),
  models: z.array(aiModelViewSchema),
});
export type AiProviderView = z.infer<typeof aiProviderViewSchema>;
export const aiProviderListSchema = z.object({
  /** False when CHANNEL_ENCRYPTION_KEY is missing: keys cannot be saved without it. */
  encryptionReady: z.boolean(),
  data: z.array(aiProviderViewSchema),
});

export const setAiKeySchema = z.object({ apiKey: z.string().trim().min(16).max(400) });
export const updateAiProviderSchema = z.object({
  enabled: z.boolean().optional(),
  defaultModel: z.string().min(1).max(120).nullable().optional(),
});
export const updateAiModelSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  maxOutputTokens: z.number().int().min(16).max(65_536).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  inputPriceMicros: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  outputPriceMicros: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
});
export const aiTestResultSchema = z.object({
  ok: z.boolean(),
  health: aiHealthSchema,
  category: z.string().nullable(),
  modelCount: z.number().int(),
  latencyMs: z.number().int(),
});

// ---------- Inbox ----------
export const AI_REFINEMENTS = [
  'shorter',
  'detailed',
  'tone',
  'translate_en',
  'translate_bn',
] as const;
export const aiRefinementSchema = z.enum(AI_REFINEMENTS);

export const aiDraftInputSchema = z.object({
  /** Client-generated; a retry returns the first result and never bills twice. */
  requestId: z.string().uuid(),
  mode: aiModeSchema,
  /** Optional change to apply to the previous draft. */
  refine: aiRefinementSchema.optional(),
  previousDraft: z.string().max(4000).optional(),
});
export const aiDraftSchema = z.object({
  requestId: z.string().uuid(),
  draft: z.string(),
  mode: aiModeSchema,
  /** Strategy that actually ran: single, fallback, synthesis, best_candidate. */
  strategy: z.string(),
  providers: z.array(z.string()),
  durationMs: z.number().int(),
  needsReview: z.boolean(),
  warnings: z.array(z.string()),
  /** Internal heuristic, shown only as a hint. */
  qualityScore: z.number().int().nullable(),
});
export const aiOptionsSchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
  /** This workspace's use of its plan allowance this month. Null limits mean no cap. */
  usage: z
    .object({
      requests: z.number().int(),
      requestLimit: z.number().int().nullable(),
      tokens: z.number().int(),
      tokenLimit: z.number().int().nullable(),
    })
    .nullable(),
  modes: z.array(
    z.object({
      mode: aiModeSchema,
      label: z.string(),
      available: z.boolean(),
      reason: z.string().nullable(),
    }),
  ),
  recommended: aiModeSchema.nullable(),
});
export const aiPhaseSchema = z.object({
  phase: z.enum(AI_PHASES),
  status: z.enum(['running', 'succeeded', 'failed']),
});

// ---------- Admin: usage and logs ----------
export const aiLogQuerySchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
  status: z.enum(['running', 'succeeded', 'failed']).optional(),
  mode: aiModeSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const aiOverviewQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
