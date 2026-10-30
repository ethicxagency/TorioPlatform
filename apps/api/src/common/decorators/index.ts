import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@torio/types';
import type { Request } from 'express';
import type { AuthUser, WorkspaceMembershipContext } from '../types';

export const IS_PUBLIC = 'isPublic';
/** Opts a route out of the global JWT guard. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSION_KEY = 'requiredPermission';
/**
 * Declares the permission required inside the workspace named by the
 * `:workspaceId` route param. Enforced by WorkspaceAccessGuard.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.user) throw new Error('CurrentUser used on a route without authentication');
  return req.user;
});

export const CurrentMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): WorkspaceMembershipContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.membership) throw new Error('CurrentMembership used without WorkspaceAccessGuard');
    return req.membership;
  },
);
