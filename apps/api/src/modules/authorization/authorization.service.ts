import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Permission } from '@torio/types';
import { PrismaService } from '../../database/prisma.service';
import type { WorkspaceMembershipContext } from '../../common/types';
import { roleHasPermission } from './permissions';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembershipContext | null> {
    const m = await this.prisma.client.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true, workspaceId: true, userId: true, role: true, status: true },
    });
    // Suspended members are treated as non-members everywhere (404), so access stops immediately.
    if (!m || m.status === 'SUSPENDED') return null;
    return { id: m.id, workspaceId: m.workspaceId, userId: m.userId, role: m.role };
  }

  /**
   * Verifies the user belongs to the workspace and holds the permission.
   * Non-members get 404 so workspace existence is not disclosed.
   */
  async assertPermission(
    userId: string,
    workspaceId: string,
    permission: Permission,
  ): Promise<WorkspaceMembershipContext> {
    const membership = await this.getMembership(userId, workspaceId);
    if (!membership) throw new NotFoundException('Workspace not found');
    if (!roleHasPermission(membership.role, permission)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return membership;
  }
}
