import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../admin/admin-auth';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { AiConfigService } from './ai-config.service';
import { AiProviderRegistry } from './ai-registry';
import { AiProviderError } from './providers/types';

// ---- the OpenAI adapter, with the SDK replaced by a mock ----
const openaiState = vi.hoisted(() => ({
  models: [] as { id: string }[],
  create: vi.fn(),
  failList: null as null | { status: number },
}));
vi.mock('openai', () => ({
  default: class {
    models = {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          if (openaiState.failList)
            throw Object.assign(new Error('Incorrect API key sk-secret'), openaiState.failList);
          for (const m of openaiState.models) yield m;
        },
      }),
    };
    responses = { create: openaiState.create };
  },
}));
const geminiState = vi.hoisted(() => ({
  models: [] as Record<string, unknown>[],
  generate: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      list: async () => ({
        async *[Symbol.asyncIterator]() {
          for (const m of geminiState.models) yield m;
        },
      }),
      generateContent: geminiState.generate,
    };
  },
}));

import { GeminiAdapter } from './providers/gemini.adapter';
import { OpenAIAdapter } from './providers/openai.adapter';

describe('OpenAI adapter', () => {
  it('lists only text models, and never sends a temperature to reasoning models', async () => {
    openaiState.models = [
      { id: 'gpt-4o' },
      { id: 'o3-mini' },
      { id: 'gpt-5' },
      { id: 'text-embedding-3-small' },
      { id: 'whisper-1' },
      { id: 'gpt-4o-audio-preview' },
      { id: 'dall-e-3' },
    ];
    const list = await new OpenAIAdapter().listModels('k', 5000);
    expect(list.map((m) => m.modelId)).toEqual(['gpt-4o', 'gpt-5', 'o3-mini']);
    expect(Object.fromEntries(list.map((m) => [m.modelId, m.supportsTemperature]))).toEqual({
      'gpt-4o': true,
      'gpt-5': false,
      'o3-mini': false,
    });
    openaiState.create.mockResolvedValue({
      output_text: ' Hello ',
      usage: { input_tokens: 12, output_tokens: 3, input_tokens_details: { cached_tokens: 4 } },
    });
    const a = new OpenAIAdapter();
    const r = await a.generate({
      apiKey: 'k',
      model: 'gpt-4o',
      system: 's',
      prompt: 'p',
      maxOutputTokens: 100,
      temperature: 0.3,
      timeoutMs: 5000,
    });
    expect(r).toEqual({ text: 'Hello', inputTokens: 12, outputTokens: 3, cachedTokens: 4 });
    expect(openaiState.create.mock.calls[0]![0]).toMatchObject({
      model: 'gpt-4o',
      temperature: 0.3,
      store: false,
    });
    await a.generate({
      apiKey: 'k',
      model: 'gpt-5',
      system: 's',
      prompt: 'p',
      maxOutputTokens: 100,
      temperature: 0.3,
      timeoutMs: 5000,
    });
    expect(openaiState.create.mock.calls[1]![0]).not.toHaveProperty('temperature');
  });
  it('turns provider failures into safe categories, and an empty answer into "empty"', async () => {
    openaiState.failList = { status: 401 };
    const e = await new OpenAIAdapter().listModels('bad', 5000).catch((x) => x);
    expect(e).toBeInstanceOf(AiProviderError);
    expect(e.category).toBe('auth');
    expect(e.message).not.toMatch(/sk-secret/);
    openaiState.failList = null;
    openaiState.create.mockResolvedValue({ output_text: '  ', usage: {} });
    const g = await new OpenAIAdapter()
      .generate({
        apiKey: 'k',
        model: 'gpt-4o',
        system: 's',
        prompt: 'p',
        maxOutputTokens: 50,
        timeoutMs: 1000,
      })
      .catch((x) => x);
    expect(g.category).toBe('empty');
    openaiState.create.mockRejectedValue(Object.assign(new Error('slow down'), { status: 429 }));
    const rl = await new OpenAIAdapter()
      .generate({
        apiKey: 'k',
        model: 'gpt-4o',
        system: 's',
        prompt: 'p',
        maxOutputTokens: 50,
        timeoutMs: 1000,
      })
      .catch((x) => x);
    expect(rl).toMatchObject({ category: 'rate_limit', retryable: true });
  });
});

describe('Gemini adapter', () => {
  it('lists generation-capable Gemini models and maps usage', async () => {
    geminiState.models = [
      {
        name: 'models/gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        supportedActions: ['generateContent'],
      },
      {
        name: 'models/text-embedding-004',
        displayName: 'Embedding',
        supportedActions: ['embedContent'],
      },
      {
        name: 'models/gemini-2.5-flash-image',
        displayName: 'Image',
        supportedActions: ['generateContent'],
      },
      { name: 'models/gemma-3', displayName: 'Gemma', supportedActions: ['generateContent'] },
    ];
    const a = new GeminiAdapter();
    expect((await a.listModels('k', 5000)).map((m) => m.modelId)).toEqual(['gemini-2.5-flash']);
    geminiState.generate.mockResolvedValue({
      text: ' Hi there ',
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 8, cachedContentTokenCount: 2 },
    });
    const r = await a.generate({
      apiKey: 'k',
      model: 'gemini-2.5-flash',
      system: 's',
      prompt: 'p',
      maxOutputTokens: 200,
      timeoutMs: 5000,
    });
    expect(r).toEqual({ text: 'Hi there', inputTokens: 30, outputTokens: 8, cachedTokens: 2 });
    expect(geminiState.generate.mock.calls[0]![0].config).toMatchObject({
      systemInstruction: 's',
      maxOutputTokens: 200,
    });
    geminiState.generate.mockResolvedValue({ text: '', usageMetadata: {} });
    expect(
      await a
        .generate({
          apiKey: 'k',
          model: 'm',
          system: 's',
          prompt: 'p',
          maxOutputTokens: 10,
          timeoutMs: 1000,
        })
        .catch((x) => x.category),
    ).toBe('empty');
    geminiState.generate.mockRejectedValue(Object.assign(new Error('x'), { status: 503 }));
    expect(
      await a
        .generate({
          apiKey: 'k',
          model: 'm',
          system: 's',
          prompt: 'p',
          maxOutputTokens: 10,
          timeoutMs: 1000,
        })
        .catch((x) => x.category),
    ).toBe('unavailable');
  });
});

describe('registry', () => {
  it('ships OpenAI and Gemini adapters', () => {
    expect(new AiProviderRegistry().keys().sort()).toEqual(['gemini', 'openai']);
  });
});

// ---- credentials ----
const cryptoWith = (key?: string) =>
  new ChannelCryptoService({ CHANNEL_ENCRYPTION_KEY: key } as never);
describe('credential storage', () => {
  it('encrypts keys at rest, decrypts only server-side, and shows a mask with the last four characters', async () => {
    const crypto = cryptoWith('a-long-test-encryption-key-of-32-chars!!');
    const sealed = crypto.encrypt('sk-live-1234567890abcdef');
    expect(sealed).not.toContain('sk-live');
    const rows = [
      {
        key: 'openai',
        name: 'OpenAI',
        enabled: true,
        keyCiphertext: sealed,
        keyLast4: 'cdef',
        keyUpdatedAt: new Date(),
        defaultModel: 'gpt-4o',
        health: 'HEALTHY',
        lastCheckedAt: null,
        lastSuccessAt: null,
        lastErrorCategory: null,
        updatedAt: new Date(),
        models: [],
      },
    ];
    const prisma = {
      client: {
        aiProvider: {
          upsert: async () => undefined,
          findMany: async () => rows,
          findUnique: async () => rows[0],
        },
      },
    };
    const svc = new AiConfigService(prisma as never, crypto, new AiProviderRegistry());
    const view = (await svc.views())[0]!;
    expect(view.hasKey).toBe(true);
    expect(view.keyMask).toBe('••••••••cdef');
    expect(JSON.stringify(view)).not.toMatch(/sk-live|keyCiphertext|v1\./);
    expect(await svc.keyOf('openai')).toBe('sk-live-1234567890abcdef');
  });
  it('refuses to store a key when no encryption key is configured', () => {
    const svc = new AiConfigService({} as never, cryptoWith(undefined), new AiProviderRegistry());
    expect(svc.encryptionReady).toBe(false);
    expect(() => svc.encryptKey('sk-whatever-1234567890')).toThrow(/not configured/);
  });
});

describe('admin access', () => {
  it('rejects a request without an admin session', async () => {
    const guard = new AdminGuard({
      client: { adminSession: { findUnique: async () => null } },
    } as never);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, method: 'GET' }) }),
    } as never;
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
