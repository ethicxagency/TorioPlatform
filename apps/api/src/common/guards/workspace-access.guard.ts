import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@torio/types';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthorizationService } from '../../modules/authorization/authorization.service';
import { PERMISSION_KEY } from '../decorators';

const uuid = z.uuid();

/**
 * Enforces tenant isolation. The workspace is taken ONLY from the `:workspaceId`
 * route param (never from body/query), membership is loaded from the database
 * for the authenticated user, and the role must hold the declared permission.
 */
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) return false;
    const parsed = uuid.safeParse(req.params.workspaceId);
    if (!parsed.success) throw new BadRequestException('workspaceId must be a UUID');

    req.membership = await this.authz.assertPermission(req.user.id, parsed.data, permission);
    return true;
  }
}
