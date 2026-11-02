import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { USAGE_METRICS, type PlanDef, type UsageMetric } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { PLANS, type PriceIds } from './plans';

export type PlanStatus = 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
export interface CatalogPlan extends PlanDef {
  status: PlanStatus;
  aiCredits: number | null;
  priceIdMonth: string | null;
  priceIdYear: string | null;
}

type Row = Prisma.PlanDefinitionGetPayload<object>;
export function toCatalogPlan(r: Row): CatalogPlan {
  const raw = (r.limits ?? {}) as Record<string, number | null>;
  return {
    key: r.key,
    name: r.name,
    description: r.description,
    rank: r.rank,
    recommended: r.recommended,
    currency: r.currency,
    monthlyMinor: r.monthlyMinor,
    yearlyMinor: r.yearlyMinor,
    placeholderPricing: r.placeholderPricing,
    limits: Object.fromEntries(USAGE_METRICS.map((m) => [m, raw[m] ?? null])) as Record<
      UsageMetric,
      number | null
    >,
    features: r.features,
    status: r.status,
    aiCredits: r.aiCredits,
    priceIdMonth: r.priceIdMonth,
    priceIdYear: r.priceIdYear,
  };
}

/** The plan catalog lives in the database so platform admins can manage it; the code catalog only seeds it. */
@Injectable()
export class PlansService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seed();
    } catch {
      // Database not reachable at boot (e.g. unit tests with fakes): plans load lazily later.
    }
  }

  async seed() {
    if ((await this.prisma.client.planDefinition.count()) > 0) return;
    await this.prisma.client.planDefinition.createMany({
      data: PLANS.map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        rank: p.rank,
        recommended: p.recommended,
        currency: p.currency,
        monthlyMinor: p.monthlyMinor,
        yearlyMinor: p.yearlyMinor,
        placeholderPricing: p.placeholderPricing,
        limits: p.limits as Prisma.InputJsonValue,
        features: p.features,
      })),
      skipDuplicates: true,
    });
  }

  async all(): Promise<CatalogPlan[]> {
    await this.seed();
    return (await this.prisma.client.planDefinition.findMany({ orderBy: { rank: 'asc' } })).map(
      toCatalogPlan,
    );
  }
  async active() {
    return (await this.all()).filter((p) => p.status === 'ACTIVE');
  }
  async get(key: string) {
    return (await this.all()).find((p) => p.key === key);
  }
  /** The lowest-rank active plan is the built-in default for workspaces without a subscription. */
  async free() {
    const all = await this.all();
    return all.find((p) => p.key === 'free') ?? all.sort((a, b) => a.rank - b.rank)[0]!;
  }

  /** Provider price id for a plan: the admin-configured one, else the environment mapping. */
  priceIdFor(p: CatalogPlan, interval: 'MONTH' | 'YEAR', env: PriceIds): string | undefined {
    return (
      (interval === 'YEAR' ? p.priceIdYear : p.priceIdMonth) ??
      env[p.key]?.[interval === 'YEAR' ? 'year' : 'month'] ??
      undefined
    );
  }
  async fromPriceId(
    priceId: string,
    env: PriceIds,
  ): Promise<{ plan: CatalogPlan; interval: 'MONTH' | 'YEAR' } | null> {
    for (const p of await this.all()) {
      if (this.priceIdFor(p, 'MONTH', env) === priceId) return { plan: p, interval: 'MONTH' };
      if (this.priceIdFor(p, 'YEAR', env) === priceId) return { plan: p, interval: 'YEAR' };
    }
    return null;
  }
}

/** What a subscriber is entitled to: the plan as it was when they subscribed, not as it is today. */
export function snapshotOf(p: CatalogPlan) {
  return {
    name: p.name,
    description: p.description,
    limits: p.limits,
    features: p.features,
    aiCredits: p.aiCredits,
    monthlyMinor: p.monthlyMinor,
    yearlyMinor: p.yearlyMinor,
    currency: p.currency,
    placeholderPricing: p.placeholderPricing,
  };
}
export function effectivePlan(
  catalog: CatalogPlan | undefined,
  snapshot: unknown,
  key: string,
): CatalogPlan | undefined {
  const s = snapshot as Partial<ReturnType<typeof snapshotOf>> | null;
  if (!s) return catalog;
  const base: CatalogPlan = catalog ?? {
    key,
    name: s.name ?? key,
    description: s.description ?? '',
    rank: 1,
    recommended: false,
    // Snapshots written before currency was recorded came from the USD placeholder catalog; never re-read them as BDT.
    currency: s.currency ?? 'USD',
    monthlyMinor: s.monthlyMinor ?? 0,
    yearlyMinor: s.yearlyMinor ?? 0,
    placeholderPricing: s.placeholderPricing ?? true,
    limits: s.limits as CatalogPlan['limits'],
    features: s.features ?? [],
    status: 'ARCHIVED',
    aiCredits: s.aiCredits ?? null,
    priceIdMonth: null,
    priceIdYear: null,
  };
  return {
    ...base,
    name: s.name ?? base.name,
    description: s.description ?? base.description,
    limits: (s.limits as CatalogPlan['limits']) ?? base.limits,
    features: s.features ?? base.features,
    aiCredits: s.aiCredits === undefined ? base.aiCredits : s.aiCredits,
    monthlyMinor: s.monthlyMinor ?? base.monthlyMinor,
    yearlyMinor: s.yearlyMinor ?? base.yearlyMinor,
    currency: s.currency ?? base.currency,
    placeholderPricing: s.placeholderPricing ?? base.placeholderPricing,
  };
}
