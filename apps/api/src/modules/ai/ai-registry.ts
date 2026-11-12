import { Injectable } from '@nestjs/common';
import { GeminiAdapter } from './providers/gemini.adapter';
import { OpenAIAdapter } from './providers/openai.adapter';
import type { ProviderAdapter } from './providers/types';

/**
 * The adapters Torio can talk to, by key. Tests replace the whole registry with fakes. Adding a provider is adding an adapter
 * here (and its key in the contracts); the orchestrator is written against `ProviderAdapter` only.
 */
@Injectable()
export class AiProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();
  constructor() {
    for (const a of [new OpenAIAdapter(), new GeminiAdapter()]) this.adapters.set(a.key, a);
  }
  register(a: ProviderAdapter) {
    this.adapters.set(a.key, a);
  }
  get(key: string): ProviderAdapter | undefined {
    return this.adapters.get(key);
  }
  keys() {
    return [...this.adapters.keys()];
  }
  name(key: string) {
    return this.adapters.get(key)?.name ?? key;
  }
}
