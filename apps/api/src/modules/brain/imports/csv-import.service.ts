import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CsvCreateInput, FeedPreview } from '@torio/contracts';
import type { Prisma } from '@torio/database';
import { PrismaService } from '../../../database/prisma.service';
import { csvItems, faqMapping, mapFaqs, MAX_CSV_BYTES, type FaqField } from './csv';
import { classify, insertProposals, MAX_RECORDS, previousImports } from './propose';
import { effectiveMapping, mapItems, type FeedMapping } from './xml';

type Req = Pick<CsvCreateInput, 'type' | 'csv' | 'mapping' | 'currency'>;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const notMigrated = (e: unknown) =>
  ['P2021', 'P2022'].includes((e as { code?: string }).code ?? '');

/**
 * Importing a CSV file of products or FAQs. Nothing is fetched: the file is read in the request, checked and mapped like a
 * feed, and its rows become proposals for review in the same queue as every other source. Nothing reaches Brain until the
 * person approves and imports it. Uploading the same file name again compares with what was imported from it before.
 */
@Injectable()
export class CsvImportService {
  constructor(private readonly prisma: PrismaService) {}

  private read(r: Req) {
    if (Buffer.byteLength(r.csv, 'utf8') > MAX_CSV_BYTES)
      throw new BadRequestException('That file is larger than 2.5 MB.');
    const t = csvItems(r.csv);
    if (!t.items.length)
      throw new BadRequestException(
        'No rows were found. The first line must be the column names, followed by at least one row.',
      );
    if (r.type === 'products') {
      const map = effectiveMapping(t.items, (r.mapping ?? {}) as FeedMapping);
      return { t, kind: 'products' as const, map, res: mapItems(t.items, map, r.currency ?? '') };
    }
    const map = faqMapping(t.headers, (r.mapping ?? {}) as Partial<Record<FaqField, string>>);
    return { t, kind: 'faqs' as const, map, res: mapFaqs(t.items, map) };
  }

  preview(r: Req): FeedPreview {
    const x = this.read(r);
    const base = {
      totalItems: x.t.items.length,
      truncated: x.t.truncated,
      tags: x.t.headers,
      mapping: x.map as Record<string, string>,
    };
    if (x.kind === 'products')
      return {
        ...base,
        format: 'csv-products',
        valid: x.res.products.length,
        invalid: x.res.invalid,
        duplicates: x.res.duplicates,
        missingPrice: x.res.missingPrice,
        issues: [
          ...x.res.issues,
          ...(x.t.truncated ? ['Only the first 5,000 rows are read.'] : []),
          ...(!x.map.name ? ['No product name column was found. Choose one in the mapping.'] : []),
        ],
        sample: x.res.products.slice(0, 5).map((p) => ({ data: p.data, warnings: p.warnings })),
      };
    return {
      ...base,
      format: 'csv-faqs',
      valid: x.res.faqs.length,
      invalid: x.res.invalid,
      duplicates: x.res.duplicates,
      missingPrice: 0,
      issues: [
        ...x.res.issues,
        ...(x.t.truncated ? ['Only the first 5,000 rows are read.'] : []),
        ...(!x.map.question || !x.map.answer
          ? ['Choose both a question column and an answer column.']
          : []),
      ],
      sample: x.res.faqs.slice(0, 5).map((f) => ({ data: f.data, warnings: f.warnings })),
    };
  }

  async create(workspaceId: string, userId: string, input: CsvCreateInput): Promise<string> {
    const x = this.read(input);
    if ((x.kind === 'products' ? x.res.products.length : x.res.faqs.length) === 0)
      throw new BadRequestException(
        'Nothing in that file can be imported. Check the column mapping.',
      );
    try {
      const db = this.prisma.client;
      const name = `CSV: ${input.name}`.slice(0, 120);
      const source =
        (await db.importSource.findFirst({ where: { workspaceId, kind: 'MANUAL', name } })) ??
        (await db.importSource.create({
          data: { workspaceId, kind: 'MANUAL', name, createdById: userId },
        }));
      const job = await db.importJob.create({
        data: {
          workspaceId,
          sourceId: source.id,
          kind: 'MANUAL',
          status: 'RUNNING',
          startedAt: new Date(),
          createdById: userId,
          state: {},
        },
      });
      const previous = await previousImports(this.prisma, workspaceId, source.id, job.id);
      const warnings = [...x.res.issues];
      let proposed = 0;
      let unchanged = 0;
      let changed = 0;
      if (x.kind === 'products') {
        const c = classify(x.res.products, previous);
        const kept = c.fresh.slice(0, MAX_RECORDS);
        await insertProposals(this.prisma, workspaceId, job.id, kept, '');
        proposed = kept.length;
        unchanged = c.unchanged;
        changed = kept.filter((p) => p.change === 'changed').length;
        if (c.fresh.length > MAX_RECORDS)
          warnings.push(
            `Only the first ${MAX_RECORDS} new or changed products are proposed this time.`,
          );
      } else {
        // FAQs already imported from a file of this name are left out, matched by question
        const had = new Set<string>();
        const jobs = await db.importJob.findMany({
          where: { workspaceId, sourceId: source.id, id: { not: job.id } },
          select: { id: true },
        });
        if (jobs.length) {
          const prevFaqs = await db.importRecord.findMany({
            where: {
              workspaceId,
              status: 'IMPORTED',
              category: 'faq',
              jobId: { in: jobs.map((j) => j.id) },
            },
          });
          for (const r of prevFaqs) had.add(norm((r.data as Record<string, string>)['q'] ?? ''));
        }
        const fresh = x.res.faqs.filter((f) => !had.has(norm(f.data['q']!)));
        unchanged = x.res.faqs.length - fresh.length;
        const kept = fresh.slice(0, MAX_RECORDS);
        await db.importRecord.createMany({
          data: kept.map((f) => ({
            workspaceId,
            jobId: job.id,
            category: 'faq',
            title: f.data['q']!,
            data: f.data as Prisma.InputJsonValue,
            original: f.data as Prisma.InputJsonValue,
            sourceUrl: null,
            confidence: 80,
            warnings: f.warnings as Prisma.InputJsonValue,
          })),
        });
        proposed = kept.length;
      }
      if (unchanged)
        warnings.push(
          `${unchanged} entr${unchanged === 1 ? 'y is' : 'ies are'} unchanged since the last import of this file and were left out.`,
        );
      if (x.t.truncated) warnings.push('Only the first 5,000 rows were read.');
      await db.importJob.update({
        where: { id: job.id },
        data: {
          status: proposed ? 'NEEDS_REVIEW' : 'COMPLETED',
          finishedAt: new Date(),
          stats: {
            items: x.t.items.length,
            [x.kind]: proposed - changed,
            ...(changed && { changed }),
            unchanged,
            invalid: x.res.invalid,
            duplicates: x.res.duplicates,
          },
          state: { warnings, type: x.kind } as Prisma.InputJsonValue,
        },
      });
      await db.importSource.update({
        where: { id: source.id },
        data: { lastSyncedAt: new Date(), lastError: null },
      });
      await db.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: 'brain.import.csv',
          entityType: 'import_job',
          entityId: job.id,
          metadata: {
            description: `Imported a CSV of ${x.kind} for review (${proposed} proposed)`,
          },
        },
      });
      return job.id;
    } catch (e) {
      if (notMigrated(e))
        throw new ServiceUnavailableException('File import is not set up on this server yet.');
      throw e;
    }
  }
}
