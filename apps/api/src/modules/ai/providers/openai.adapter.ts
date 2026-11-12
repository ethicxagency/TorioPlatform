import OpenAI from 'openai';
import {
  AiProviderError,
  classifyError,
  type DiscoveredModel,
  type GenerateInput,
  type GenerateResult,
  type ProviderAdapter,
} from './types';

/** Models that are not chat/text generators (speech, images, embeddings...) are not offered. */
const NOT_TEXT =
  /(audio|realtime|transcribe|tts|image|embedding|moderation|search|whisper|dall-e|sora|computer-use|codex)/i;
const TEXT = /^(gpt-|o\d|chatgpt-)/i;
/** Reasoning families reject a temperature setting, so it is never sent to them. */
const REASONING = /^(o\d|gpt-5)/i;

export class OpenAIAdapter implements ProviderAdapter {
  readonly key = 'openai';
  readonly name = 'OpenAI';

  private client(apiKey: string, timeout: number) {
    // Retries are owned by the orchestrator (bounded, counted, never duplicated), so the SDK does not retry on its own.
    return new OpenAI({ apiKey, timeout, maxRetries: 0 });
  }

  async listModels(apiKey: string, timeoutMs: number): Promise<DiscoveredModel[]> {
    try {
      const out: DiscoveredModel[] = [];
      for await (const m of this.client(apiKey, timeoutMs).models.list()) {
        if (!TEXT.test(m.id) || NOT_TEXT.test(m.id)) continue;
        out.push({ modelId: m.id, label: m.id, supportsTemperature: !REASONING.test(m.id) });
      }
      return out.sort((a, b) => a.modelId.localeCompare(b.modelId));
    } catch (e) {
      throw classifyError(e);
    }
  }

  async generate(i: GenerateInput): Promise<GenerateResult> {
    try {
      const r = await this.client(i.apiKey, i.timeoutMs).responses.create({
        model: i.model,
        instructions: i.system,
        input: i.prompt,
        max_output_tokens: Math.max(16, i.maxOutputTokens),
        store: false,
        ...(i.temperature !== undefined &&
          !REASONING.test(i.model) && { temperature: i.temperature }),
      });
      const text = (r.output_text ?? '').trim();
      if (!text) throw new AiProviderError('empty', false);
      return {
        text,
        inputTokens: r.usage?.input_tokens ?? 0,
        outputTokens: r.usage?.output_tokens ?? 0,
        cachedTokens: r.usage?.input_tokens_details?.cached_tokens ?? 0,
      };
    } catch (e) {
      throw classifyError(e);
    }
  }
}
