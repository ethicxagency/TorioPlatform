import { BadRequestException, Injectable } from '@nestjs/common';
import type { ProductGroup, ProductReview } from '@torio/contracts';
import type { Prisma } from '@torio/database';
import { PrismaService } from '../../../database/prisma.service';
import { BrainService } from '../brain.service';
import { ScanService } from './scan.service';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** The fields that can disagree between sources, and the Brain product field each is compared with. */
const FIELDS = [
  'price',
  'currency',
  'description',
  'category',
  'stock',
  'colors',
  'sizes',
] as const;
const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: 'Website scan',
  XML_FEED: 'XML feed',
  META_CATALOG: 'Meta Catalog',
  GOOGLE_MERCHANT: 'Google Merchant Center',
  MANUAL: 'Manual',
};
const sameValue = (a: string, b: string) => norm(a) === norm(b);

/**
 * One review queue for products from every source. The same product found by several sources (website, feed, Meta, Google)
 * is shown once, with where each version came from and exactly where they disagree, so the person decides which values to
 * keep. Approving, resolving and importing change nothing in Brain until the import step, and an existing Brain product is
 * never changed unless the person says to update it.
 */
@Injectable()
export class ProductReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly scans: ScanService,
  ) {}

  /** Brain's product as the same plain fields the candidates use ("1500 BDT" becomes price and currency). */
  private brainFields(p: {
    price: string;
    description: string;
    category: string;
    stock: string;
    colors: string;
    sizes: string;
  }) {
    const m = /^\s*([\d.,]+)\s*([A-Za-z]{3})?\s*$/.exec(p.price);
    return {
      price: m ? m[1]!.replace(/,/g, '') : p.price,
      currency: m?.[2]?.toUpperCase() ?? '',
      description: p.description,
      category: p.category,
      stock: p.stock,
      colors: p.colors,
      sizes: p.sizes,
    } as Record<string, string>;
  }

  async list(workspaceId: string): Promise<ProductReview> {
    const db = this.prisma.client;
    const rows = await db.importRecord.findMany({
      where: { workspaceId, category: 'product', status: { in: ['PENDING', 'APPROVED'] } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    const jobs = await db.importJob.findMany({
      where: { workspaceId, id: { in: [...new Set(rows.map((r) => r.jobId))] } },
    });
    const sources = await db.importSource.findMany({
      where: {
        workspaceId,
        id: { in: jobs.map((j) => j.sourceId).filter((x): x is string => !!x) },
      },
    });
    const jobInfo = new Map(
      jobs.map((j) => {
        const src = sources.find((s) => s.id === j.sourceId);
        return [j.id, { kind: j.kind, name: src?.name ?? SOURCE_LABEL[j.kind] ?? j.kind }] as const;
      }),
    );
    const doc = await this.brain.get(workspaceId);
    const brainByName = new Map(doc.config.products.map((p) => [norm(p.name), p]));

    const byKey = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = norm(r.title);
      byKey.set(k, [...(byKey.get(k) ?? []), r]);
    }
    const groups: ProductGroup[] = [];
    for (const [key, list] of byKey) {
      const bp = brainByName.get(key);
      const inBrain = bp ? this.brainFields(bp as never) : null;
      const candidates = list.map((r) => {
        const d = r.data as Record<string, string>;
        const info = jobInfo.get(r.jobId) ?? { kind: 'MANUAL' as const, name: 'Unknown source' };
        return {
          id: r.id,
          jobId: r.jobId,
          source: { kind: info.kind, name: info.name },
          confidence: r.confidence,
          status: r.status as 'PENDING' | 'APPROVED',
          change: (d['change'] as 'new' | 'changed' | undefined) ?? null,
          data: Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'change')),
          warnings: (r.warnings as string[] | null) ?? [],
          createdAt: r.createdAt.toISOString(),
        };
      });
      const conflicts: ProductGroup['conflicts'] = [];
      for (const f of FIELDS) {
        const sides = candidates
          .filter((c) => (c.data[f] ?? '').trim())
          .map((c) => ({
            from: c.id,
            label: `${SOURCE_LABEL[c.source.kind] ?? c.source.kind}: ${c.source.name}`,
            value: c.data[f]!,
          }));
        if (inBrain?.[f]?.trim())
          sides.unshift({ from: 'brain', label: 'Your Brain', value: inBrain[f]! });
        const distinct = new Set(sides.map((x) => norm(x.value)));
        if (distinct.size > 1) conflicts.push({ field: f, values: sides });
      }
      groups.push({ key, name: list[0]!.title, inBrain, candidates, conflicts });
    }
    // Most in need of a decision first: disagreements, then products found by several sources, then the rest.
    groups.sort(
      (a, b) =>
        b.conflicts.length - a.conflicts.length ||
        b.candidates.length - a.candidates.length ||
        a.name.localeCompare(b.name),
    );
    return {
      groups,
      totals: {
        groups: groups.length,
        candidates: rows.length,
        approved: rows.filter((r) => r.status === 'APPROVED').length,
        conflicts: groups.filter((g) => g.conflicts.length).length,
        inBrain: groups.filter((g) => g.inBrain).length,
      },
    };
  }

  /**
   * Settles one product found by several sources: keep one version (optionally taking chosen fields from the others, or
   * leaving a field as Brain has it) and reject the rest. With no winner, Brain's version stays and every candidate is rejected.
   */
  async resolve(
    workspaceId: string,
    body: {
      recordIds: string[];
      winnerId: string | null;
      fields: Partial<Record<string, string>>;
      updateBrain: boolean;
    },
  ) {
    const db = this.prisma.client;
    const rows = await db.importRecord.findMany({
      where: {
        workspaceId,
        id: { in: body.recordIds },
        status: { in: ['PENDING', 'APPROVED'] },
        category: 'product',
      },
    });
    if (rows.length !== new Set(body.recordIds).size)
      throw new BadRequestException(
        'Some of those entries are no longer waiting for review. Reload and try again.',
      );
    if (new Set(rows.map((r) => norm(r.title))).size !== 1)
      throw new BadRequestException('Those entries are not the same product.');
    if (body.winnerId === null) {
      await db.importRecord.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: 'REJECTED' },
      });
      return { resolved: rows.length };
    }
    const winner = rows.find((r) => r.id === body.winnerId);
    if (!winner) throw new BadRequestException('The version to keep must be one of the entries.');
    const data = { ...(winner.data as Record<string, string>) };
    for (const [field, from] of Object.entries(body.fields)) {
      if (!from) continue;
      if (from === 'brain') {
        delete data[field]; // leave Brain's value as it is
        continue;
      }
      const src = rows.find((r) => r.id === from);
      if (!src) throw new BadRequestException(`Unknown source for ${field}.`);
      const v = (src.data as Record<string, string>)[field];
      if (v) data[field] = v;
      else delete data[field];
    }
    // An existing Brain product is only updated when the person asked for it; otherwise the import leaves it alone.
    if (body.updateBrain) data['change'] = 'changed';
    else if (data['change'] === 'changed') delete data['change'];
    await db.importRecord.update({
      where: { id: winner.id },
      data: { data: data as Prisma.InputJsonValue, status: 'APPROVED' },
    });
    const others = rows.filter((r) => r.id !== winner.id).map((r) => r.id);
    if (others.length)
      await db.importRecord.updateMany({
        where: { id: { in: others } },
        data: { status: 'REJECTED' },
      });
    return { resolved: rows.length };
  }

  /** Approves every product that nothing disagrees about: found once, and not already in Brain (or an approved-to-change one). */
  async approveClear(workspaceId: string) {
    const review = await this.list(workspaceId);
    const ids = review.groups
      .filter(
        (g) =>
          g.candidates.length === 1 &&
          g.conflicts.length === 0 &&
          (!g.inBrain || g.candidates[0]!.change === 'changed'),
      )
      .map((g) => g.candidates[0]!.id);
    if (ids.length)
      await this.prisma.client.importRecord.updateMany({
        where: { workspaceId, id: { in: ids }, status: 'PENDING' },
        data: { status: 'APPROVED' },
      });
    return { updated: ids.length };
  }

  /** Imports every approved product, from any source, in one Brain save. */
  importApproved(workspaceId: string, userId: string) {
    return this.scans.importApproved(workspaceId, userId, null, ['product']);
  }
}
