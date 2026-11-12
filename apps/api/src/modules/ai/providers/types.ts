import type { AiErrorCategory } from '@torio/contracts';

/**
 * A provider failure reduced to a safe category. The provider's own message is never kept: it can echo parts of a request or a
 * key, so it must not reach logs, the database or a customer.
 */
export class AiProviderError extends Error {
  constructor(
    readonly category: AiErrorCategory,
    readonly retryable: boolean,
  ) {
    super(`AI provider error: ${category}`);
    this.name = 'AiProviderError';
  }
}

export interface GenerateInput {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  /** Only set for models that accept it. */
  temperature?: number;
  timeoutMs: number;
}
export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}
export interface DiscoveredModel {
  modelId: string;
  label: string;
  supportsTemperature: boolean;
}

/** One adapter per provider. The orchestration engine only ever talks to this interface. */
export interface ProviderAdapter {
  readonly key: string;
  readonly name: string;
  /** Lists the models the key can use. Doubles as the connection test. */
  listModels(apiKey: string, timeoutMs: number): Promise<DiscoveredModel[]>;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/** Maps an SDK error (status code, abort, network) to a category. Reads only structural fields, never the message text. */
export function classifyError(e: unknown): AiProviderError {
  if (e instanceof AiProviderError) return e;
  const x = e as { status?: number; code?: string; name?: string } | null;
  const status = typeof x?.status === 'number' ? x.status : undefined;
  const name = x?.name ?? '';
  if (/Timeout|Abort/i.test(name) || x?.code === 'ETIMEDOUT' || status === 408)
    return new AiProviderError('timeout', true);
  if (status === 401 || status === 403) return new AiProviderError('auth', false);
  if (status === 429) return new AiProviderError('rate_limit', true);
  if (status === 400 || status === 404 || status === 422)
    return new AiProviderError('bad_request', false);
  if (
    (status !== undefined && status >= 500) ||
    /Connection|Network/i.test(name) ||
    x?.code === 'ECONNRESET'
  )
    return new AiProviderError('unavailable', true);
  return new AiProviderError('unknown', false);
}
