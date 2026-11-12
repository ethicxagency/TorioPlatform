import { GoogleGenAI } from '@google/genai';
import {
  AiProviderError,
  classifyError,
  type DiscoveredModel,
  type GenerateInput,
  type GenerateResult,
  type ProviderAdapter,
} from './types';

export class GeminiAdapter implements ProviderAdapter {
  readonly key = 'gemini';
  readonly name = 'Google Gemini';

  private client(apiKey: string, timeout: number) {
    return new GoogleGenAI({ apiKey, httpOptions: { timeout, retryOptions: { attempts: 1 } } });
  }

  async listModels(apiKey: string, timeoutMs: number): Promise<DiscoveredModel[]> {
    try {
      const out: DiscoveredModel[] = [];
      const pager = await this.client(apiKey, timeoutMs).models.list({ config: { pageSize: 100 } });
      for await (const m of pager) {
        // Only models that can generate text, and that are Gemini (the list also holds embedding and image models).
        if (!m.name || !(m.supportedActions ?? []).includes('generateContent')) continue;
        const id = m.name.replace(/^models\//, '');
        if (!/^gemini-/i.test(id) || /(embedding|image|tts|live|audio|robotics)/i.test(id))
          continue;
        out.push({ modelId: id, label: m.displayName || id, supportsTemperature: true });
      }
      return out.sort((a, b) => a.modelId.localeCompare(b.modelId));
    } catch (e) {
      throw classifyError(e);
    }
  }

  async generate(i: GenerateInput): Promise<GenerateResult> {
    try {
      const r = await this.client(i.apiKey, i.timeoutMs).models.generateContent({
        model: i.model,
        contents: i.prompt,
        config: {
          systemInstruction: i.system,
          maxOutputTokens: i.maxOutputTokens,
          ...(i.temperature !== undefined && { temperature: i.temperature }),
        },
      });
      const text = (r.text ?? '').trim();
      if (!text) throw new AiProviderError('empty', false);
      return {
        text,
        inputTokens: r.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: r.usageMetadata?.candidatesTokenCount ?? 0,
        cachedTokens: r.usageMetadata?.cachedContentTokenCount ?? 0,
      };
    } catch (e) {
      throw classifyError(e);
    }
  }
}
