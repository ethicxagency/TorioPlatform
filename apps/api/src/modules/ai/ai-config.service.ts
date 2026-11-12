import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  AI_PROVIDER_KEYS,
  aiSettingsSchema,
  DEFAULT_AI_SETTINGS,
  type AiProviderView,
  type AiSettings,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { AiProviderRegistry } from './ai-registry';

const SETTINGS_KEY = 'ai.settings';
const iso = (d: Date | null) => d?.toISOString() ?? null;

export interface UsableProvider {
  id: string;
  key: string;
  name: string;
  defaultModel: string | null;
  /** Enabled models, lowest priority number first. */
  models: {
    id: string;
    modelId: string;
    priority: number;
    maxOutputTokens: number | null;
    temperature: number | null;
    supportsTemperature: boolean;
    inputPriceMicros: number | null;
    outputPriceMicros: number | null;
  }[];
}

/** Reads and writes AI configuration: platform settings, providers and their models. Keys are only decrypted inside `keyOf`. */
@Injectable()
export class AiConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly registry: AiProviderRegistry,
  ) {}

  get encryptionReady() {
    return this.crypto.configured;
  }

  async settings(): Promise<AiSettings> {
    const row = await this.prisma.client.platformSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    const stored = (row?.value ?? {}) as Partial<AiSettings>;
    const merged = {
      ...DEFAULT_AI_SETTINGS,
      ...stored,
      modes: { ...DEFAULT_AI_SETTINGS.modes, ...stored.modes },
      weights: { ...DEFAULT_AI_SETTINGS.weights, ...stored.weights },
    };
    const parsed = aiSettingsSchema.safeParse(merged);
    return parsed.success ? parsed.data : DEFAULT_AI_SETTINGS;
  }

  async saveSettings(next: AiSettings) {
    const v = aiSettingsSchema.parse(next);
    await this.prisma.client.platformSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: v },
      update: { value: v },
    });
    return v;
  }

  /** One row per adapter, created on first use. */
  async ensureProviders() {
    const db = this.prisma.client;
    for (const key of AI_PROVIDER_KEYS) {
      if (!this.registry.get(key)) continue;
      await db.aiProvider.upsert({
        where: { key },
        create: { key, name: this.registry.name(key) },
        update: {},
      });
    }
  }

  async views(): Promise<AiProviderView[]> {
    await this.ensureProviders();
    const rows = await this.prisma.client.aiProvider.findMany({
      include: { models: { orderBy: [{ priority: 'asc' }, { modelId: 'asc' }] } },
      orderBy: { key: 'asc' },
    });
    return rows.map((p) => ({
      key: p.key as AiProviderView['key'],
      name: p.name,
      enabled: p.enabled,
      hasKey: !!p.keyCiphertext,
      keyMask: p.keyLast4 ? `••••••••${p.keyLast4}` : null,
      keyUpdatedAt: iso(p.keyUpdatedAt),
      defaultModel: p.defaultModel,
      health: p.health as AiProviderView['health'],
      lastCheckedAt: iso(p.lastCheckedAt),
      lastSuccessAt: iso(p.lastSuccessAt),
      lastErrorCategory: p.lastErrorCategory,
      updatedAt: iso(p.updatedAt),
      models: p.models.map((m) => ({
        id: m.id,
        modelId: m.modelId,
        label: m.label,
        enabled: m.enabled,
        priority: m.priority,
        maxOutputTokens: m.maxOutputTokens,
        temperature: m.temperature,
        supportsTemperature: m.supportsTemperature,
        inputPriceMicros: m.inputPriceMicros,
        outputPriceMicros: m.outputPriceMicros,
      })),
    }));
  }

  /** Providers that can serve a request right now: enabled, with a key and at least one enabled model. */
  async usable(): Promise<UsableProvider[]> {
    const rows = await this.prisma.client.aiProvider.findMany({
      where: { enabled: true, keyCiphertext: { not: null } },
      include: {
        models: { where: { enabled: true }, orderBy: [{ priority: 'asc' }, { modelId: 'asc' }] },
      },
      orderBy: { key: 'asc' },
    });
    return rows
      .filter((p) => p.models.length > 0 && this.registry.get(p.key))
      .map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        defaultModel: p.defaultModel,
        models: p.models.map((m) => ({
          id: m.id,
          modelId: m.modelId,
          priority: m.priority,
          maxOutputTokens: m.maxOutputTokens,
          temperature: m.temperature,
          supportsTemperature: m.supportsTemperature,
          inputPriceMicros: m.inputPriceMicros,
          outputPriceMicros: m.outputPriceMicros,
        })),
      }));
  }

  /** The decrypted key, for server-side use only. Never returned from any endpoint or written to a log. */
  async keyOf(providerKey: string): Promise<string> {
    const p = await this.prisma.client.aiProvider.findUnique({
      where: { key: providerKey },
      select: { keyCiphertext: true },
    });
    if (!p?.keyCiphertext) throw new ServiceUnavailableException('This provider has no key');
    return this.crypto.decrypt(p.keyCiphertext);
  }

  encryptKey(plain: string) {
    if (!this.crypto.configured)
      throw new ServiceUnavailableException(
        'CHANNEL_ENCRYPTION_KEY is not configured, so keys cannot be stored safely.',
      );
    return this.crypto.encrypt(plain);
  }

  async recordHealth(providerKey: string, ok: boolean, category: string | null) {
    const now = new Date();
    await this.prisma.client.aiProvider.updateMany({
      where: { key: providerKey },
      data: ok
        ? { health: 'HEALTHY', lastCheckedAt: now, lastSuccessAt: now, lastErrorCategory: null }
        : {
            health: category === 'auth' ? 'DOWN' : 'DEGRADED',
            lastCheckedAt: now,
            lastErrorCategory: category,
          },
    });
  }
}
