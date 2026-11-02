import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Permission } from '@torio/types';
import { PrismaService } from '../../database/prisma.service';
import type { WorkspaceMembershipContext } from '../../common/types';
import { roleHasPermission } from './permissions';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Membership row plus the platform-level state that can lock a member out (suspended user or workspace). */
  private async load(userId: string, workspaceId: string) {
    const m = await this.prisma.client.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        role: true,
        status: true,
        user: { select: { status: true } },
        workspace: { select: { status: true } },
      },
    });
    // Suspended members are treated as non-members everywhere (404), so access stops immediately.
    if (!m || m.status === 'SUSPENDED') return null;
    return {
      ctx: {
        id: m.id,
        workspaceId: m.workspaceId,
        userId: m.userId,
        role: m.role,
      } as WorkspaceMembershipContext,
      userDisabled: m.user?.status === 'DISABLED',
      workspaceSuspended: m.workspace?.status === 'SUSPENDED',
    };
  }

  async getMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembershipContext | null> {
    const m = await this.load(userId, workspaceId);
    // A platform-suspended customer or workspace has no usable membership (realtime rooms etc. close as well).
    return !m || m.userDisabled || m.workspaceSuspended ? null : m.ctx;
  }

  /**
   * Verifies the user belongs to the workspace and holds the permission.
   * Non-members get 404 so workspace existence is not disclosed. Platform suspension is evaluated on every
   * request, so it takes effect immediately rather than when a token expires.
   */
  async assertPermission(
    userId: string,
    workspaceId: string,
    permission: Permission,
  ): Promise<WorkspaceMembershipContext> {
    const m = await this.load(userId, workspaceId);
    if (!m || m.userDisabled) throw new NotFoundException('Workspace not found');
    if (m.workspaceSuspended)
      throw new ForbiddenException('This workspace is suspended. Please contact Torio support.');
    if (!roleHasPermission(m.ctx.role, permission)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return m.ctx;
  }
}
