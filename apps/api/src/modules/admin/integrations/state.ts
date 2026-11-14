import type { IntegrationKey, IntegrationStatus } from '@torio/contracts';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../../../database/prisma.service';
import { INTEGRATIONS } from './definitions';

export type Val = string | boolean | null;
export interface Stored {
  values: Record<string, Val>;
  /** Encrypted with the same AES-256-GCM service as channel tokens. Never returned, never logged. */
  secrets: Record<string, string>;
  /** Bumped whenever a secret changes, so "tested" can be tied to exactly this credential without decrypting it. */
  secretVersions: Record<string, number>;
  enabled: boolean;
  verification?: {
    status: 'VERIFIED' | 'FAILED';
    at: string;
    fingerprint: string;
    error: string | null;
  };
  lastSuccessAt?: string;
  lastTestedAt?: string;
  extra?: Record<string, string | number | boolean | null>;
  updatedAt?: string;
}

export const settingKey = (k: IntegrationKey) => `integration.${k}`;

export async function loadStored(prisma: PrismaService, key: IntegrationKey): Promise<Stored> {
  const row = await prisma.client.platformSetting.findUnique({ where: { key: settingKey(key) } });
  const v = (row?.value ?? {}) as Partial<Stored>;
  return {
    values: v.values ?? {},
    secrets: v.secrets ?? {},
    secretVersions: v.secretVersions ?? {},
    enabled: v.enabled ?? false,
    verification: v.verification,
    lastSuccessAt: v.lastSuccessAt,
    lastTestedAt: v.lastTestedAt,
    extra: v.extra,
    updatedAt: row?.updatedAt.toISOString(),
  };
}

/** What the provider is asked with. A boolean switch (e.g. turning browser tracking on) is not part of it. */
export function fingerprintOf(key: IntegrationKey, s: Stored): string {
  const d = INTEGRATIONS[key];
  const vals = Object.fromEntries(
    d.fields.filter((f) => f.kind !== 'boolean').map((f) => [f.key, s.values[f.key] ?? null]),
  );
  return createHash('sha256')
    .update(JSON.stringify({ vals, sv: s.secretVersions }))
    .digest('hex');
}

export function problemsOf(key: IntegrationKey, s: Stored): string[] {
  const d = INTEGRATIONS[key];
  return [
    ...d.fields
      .filter((f) => f.required && !(s.values[f.key] ?? f.default))
      .map((f) => `${f.label} is required`),
    ...d.secrets
      .filter((x) => x.required && !s.secrets[x.key])
      .map((x) => `${x.label} is required`),
  ];
}

export function statusOf(key: IntegrationKey, s: Stored): IntegrationStatus {
  if (problemsOf(key, s).length) return 'NOT_CONFIGURED';
  const v = s.verification;
  return v && v.fingerprint === fingerprintOf(key, s) ? v.status : 'UNVERIFIED';
}

/** On and verified: the only state in which the platform actually uses an integration. */
export const isLive = (key: IntegrationKey, s: Stored) =>
  s.enabled && statusOf(key, s) === 'VERIFIED';
