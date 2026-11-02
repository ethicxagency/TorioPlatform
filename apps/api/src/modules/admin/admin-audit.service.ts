import { Injectable } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { PrismaService } from '../../database/prisma.service';

export interface AuditEntry {
  admin?: { id: string; email: string };
  /** Used when no admin is known (failed sign-in attempts). */
  adminEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** The only writer of AdminAuditLog. It inserts; nothing in the application updates or deletes these rows. */
@Injectable()
export class AdminAudit {
  constructor(private readonly prisma: PrismaService) {}

  async log(e: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).adminAuditLog.create({
      data: {
        adminId: e.admin?.id ?? null,
        adminEmail: e.admin?.email ?? e.adminEmail ?? 'unknown',
        action: e.action,
        targetType: e.targetType ?? null,
        targetId: e.targetId ?? null,
        targetLabel: e.targetLabel ?? null,
        reason: e.reason ?? null,
        metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: e.ip ?? null,
      },
    });
  }
}
