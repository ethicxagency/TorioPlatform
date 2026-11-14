import {
  normalizeRolePermissions,
  ROLE_PERMISSIONS,
  type Permission,
  type WorkspaceRole,
} from '@torio/types';

export { ROLE_PERMISSIONS, roleHasPermission } from '@torio/types';

/**
 * What a member may do: their custom role's stored list when they have one (cleaned, so a key that no longer exists or can
 * never be granted is ignored), else their system role's. The Owner is always the full system role.
 */
export function effectivePermissions(
  role: WorkspaceRole,
  customPermissions: readonly string[] | null | undefined,
): ReadonlySet<Permission> {
  if (role === 'OWNER' || !customPermissions) return ROLE_PERMISSIONS[role];
  return new Set(normalizeRolePermissions(customPermissions));
}
