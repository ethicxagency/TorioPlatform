import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  brainConfigSchema,
  changedSections,
  emptyBrainConfig,
  evaluateMaturity,
  issuesOf,
  type BrainConfig,
} from '@torio/contracts';
import type { Prisma } from '@torio/database';
import { PrismaService } from '../../database/prisma.service';

/**
 * Brain is stored as one validated JSON document per workspace. The same `issuesOf` rules the UI shows are
 * enforced here, so an incomplete configuration can never be saved by bypassing the UI. Saves use optimistic
 * concurrency (`baseVersion`) so two admins cannot silently overwrite each other.
 */
@Injectable()
export class BrainService {
  private readonly log = new Logger(BrainService.name);
  constructor(private readonly prisma: PrismaService) {}

  private async view(workspaceId: string) {
    // Explicit columns: the maturity columns are derived data and are never read, so a database that has not yet had the
    // maturity migration still serves Brain (the evaluation is recomputed, which is cheap and deterministic).
    const row = await this.prisma.client.brainConfig.findUnique({
      where: { workspaceId },
      select: {
        data: true,
        version: true,
        updatedAt: true,
        updatedBy: { select: { id: true, name: true } },
      },
    });
    if (!row) {
      const config = emptyBrainConfig();
      return {
        config,
        version: 0,
        updatedAt: null,
        updatedBy: null,
        maturity: evaluateMaturity(config),
      };
    }
    // Stored data was validated on write; re-parse so older documents gain new defaults/limits and never leak unexpected keys.
    const parsed = brainConfigSchema.safeParse(row.data);
    const config = parsed.success ? parsed.data : emptyBrainConfig();
    return {
      config,
      // Always evaluated from the saved document, so it can never describe an older one.
      maturity: evaluateMaturity(config),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  get(workspaceId: string) {
    return this.view(workspaceId);
  }

  async save(workspaceId: string, userId: string, config: BrainConfig, baseVersion: number) {
    const issues = issuesOf(config);
    if (issues.length)
      throw new BadRequestException({
        message: `Fix ${issues.length} issue${issues.length > 1 ? 's' : ''} before saving: ${issues[0]!.text}`,
        issues,
      });
    const db = this.prisma.client;
    const before = await this.view(workspaceId);
    if (before.version !== baseVersion)
      throw new ConflictException(
        'Brain was changed by someone else. Reload to see the latest version before saving.',
      );
    const changed = changedSections(before.config, config);
    // Scored from exactly what is being persisted, in the same write, so the stored evaluation can never describe an
    // older document. It is cheap and deterministic, and it never blocks or fails the save of the knowledge itself.
    const maturity = evaluateMaturity(config);
    const maturityData = {
      maturity: maturity as unknown as Prisma.InputJsonValue,
      maturityAt: new Date(maturity.evaluatedAt),
    };
    await db.$transaction(async (tx) => {
      if (baseVersion === 0) {
        // Unique workspaceId makes a concurrent first save fail instead of duplicating.
        await tx.brainConfig.create({
          data: { workspaceId, data: config, version: 1, updatedById: userId },
          select: { id: true }, // never read the derived maturity columns
        });
      } else {
        const res = await tx.brainConfig.updateMany({
          where: { workspaceId, version: baseVersion },
          data: { data: config, version: baseVersion + 1, updatedById: userId },
        });
        if (res.count !== 1)
          throw new ConflictException(
            'Brain was changed by someone else. Reload to see the latest version before saving.',
          );
      }
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: 'brain.update',
          entityType: 'brain',
          entityId: workspaceId,
          metadata: {
            description: changed.length
              ? `Updated ${changed.join(', ')}`
              : 'Saved Brain (no section changes)',
          },
        },
      });
    });
    // The stored copy of the evaluation is a convenience (it is always recomputed on read). Writing it is best effort, so
    // a database without the maturity columns, or any failure here, can never fail or block saving the knowledge itself.
    try {
      await db.brainConfig.update({
        where: { workspaceId },
        data: maturityData,
        select: { id: true },
      });
    } catch (e) {
      this.log.warn(`Brain maturity could not be stored: ${(e as Error).name}`);
    }
    return this.view(workspaceId);
  }
}
