import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  brainConfigSchema,
  changedSections,
  emptyBrainConfig,
  issuesOf,
  type BrainConfig,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';

/**
 * Brain is stored as one validated JSON document per workspace. The same `issuesOf` rules the UI shows are
 * enforced here, so an incomplete configuration can never be saved by bypassing the UI. Saves use optimistic
 * concurrency (`baseVersion`) so two admins cannot silently overwrite each other.
 */
@Injectable()
export class BrainService {
  constructor(private readonly prisma: PrismaService) {}

  private async view(workspaceId: string) {
    const row = await this.prisma.client.brainConfig.findUnique({
      where: { workspaceId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    if (!row) return { config: emptyBrainConfig(), version: 0, updatedAt: null, updatedBy: null };
    // Stored data was validated on write; re-parse so older documents gain new defaults/limits and never leak unexpected keys.
    const parsed = brainConfigSchema.safeParse(row.data);
    return {
      config: parsed.success ? parsed.data : emptyBrainConfig(),
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
    await db.$transaction(async (tx) => {
      if (baseVersion === 0) {
        // Unique workspaceId makes a concurrent first save fail instead of duplicating.
        await tx.brainConfig.create({
          data: { workspaceId, data: config, version: 1, updatedById: userId },
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
    return this.view(workspaceId);
  }
}
