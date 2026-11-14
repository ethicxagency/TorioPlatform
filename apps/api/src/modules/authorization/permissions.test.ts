import {
  assignableRoles,
  canManageMember,
  normalizeRolePermissions,
  OWNER_ONLY_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSIONS,
  ROLE_TEMPLATES,
} from '@torio/types';
import { describe, expect, it } from 'vitest';
import { effectivePermissions, roleHasPermission } from './permissions';

describe('role permissions', () => {
  it('owner holds every permission', () => {
    for (const p of PERMISSIONS) expect(roleHasPermission('OWNER', p)).toBe(true);
  });

  it('admin cannot delete the workspace', () => {
    expect(roleHasPermission('ADMIN', 'workspace:delete')).toBe(false);
    expect(roleHasPermission('ADMIN', 'members:manage')).toBe(true);
  });

  it('agent is limited to reading and replying', () => {
    expect(roleHasPermission('AGENT', 'conversations:reply')).toBe(true);
    expect(roleHasPermission('AGENT', 'members:manage')).toBe(false);
    expect(roleHasPermission('AGENT', 'workspace:update')).toBe(false);
    expect(roleHasPermission('AGENT', 'audit:read')).toBe(false);
    expect(roleHasPermission('AGENT', 'savedreplies:manage')).toBe(false);
    expect(roleHasPermission('AGENT', 'conversations:manage')).toBe(true);
    expect(roleHasPermission('AGENT', 'leads:write')).toBe(true);
    expect(roleHasPermission('AGENT', 'leads:delete')).toBe(false);
  });
});

describe('role management policy', () => {
  it('owners assign admin/agent, admins assign agent only, agents nothing', () => {
    expect(assignableRoles('OWNER')).toEqual(['ADMIN', 'AGENT']);
    expect(assignableRoles('ADMIN')).toEqual(['AGENT']);
    expect(assignableRoles('AGENT')).toEqual([]);
  });
  it('nobody can manage the owner; admins cannot manage admins', () => {
    expect(canManageMember('OWNER', 'OWNER')).toBe(false);
    expect(canManageMember('ADMIN', 'OWNER')).toBe(false);
    expect(canManageMember('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageMember('ADMIN', 'AGENT')).toBe(true);
    expect(canManageMember('OWNER', 'ADMIN')).toBe(true);
    expect(canManageMember('AGENT', 'AGENT')).toBe(false);
  });
});

describe('custom role permissions', () => {
  it('admin and agent keep exactly what they had; roles:manage is the owner’s alone', () => {
    expect(roleHasPermission('OWNER', 'roles:manage')).toBe(true);
    expect(roleHasPermission('ADMIN', 'roles:manage')).toBe(false);
    expect(roleHasPermission('AGENT', 'roles:manage')).toBe(false);
    const admin = PERMISSIONS.filter((p) => roleHasPermission('ADMIN', p));
    expect(admin).toHaveLength(PERMISSIONS.length - 3); // workspace:delete, billing:manage, roles:manage
  });

  it('a custom role replaces the system role’s permissions, a plain member keeps theirs, the owner is never reduced', () => {
    const custom = effectivePermissions('AGENT', ['leads:read']);
    expect([...custom].sort()).toEqual(['leads:read', 'workspace:read']);
    expect(custom.has('conversations:reply')).toBe(false); // nothing is inherited from the old role
    expect(effectivePermissions('AGENT', null).has('conversations:reply')).toBe(true);
    expect(effectivePermissions('OWNER', ['leads:read']).size).toBe(PERMISSIONS.length);
  });

  it('a stored role can never carry an owner-only or unknown permission, whatever the database holds', () => {
    const got = effectivePermissions('AGENT', [
      'workspace:delete',
      'roles:manage',
      'made:up',
      'leads:read',
    ]);
    expect([...got].sort()).toEqual(['leads:read', 'workspace:read']);
    expect(normalizeRolePermissions(['roles:manage'])).toEqual(['workspace:read']);
  });

  it('every enforced permission is listed once in the catalogue, and nothing else is', () => {
    const listed = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    expect([...listed].sort()).toEqual([...PERMISSIONS].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('every template is made only of real, grantable permissions and includes the baseline', () => {
    for (const t of ROLE_TEMPLATES) {
      for (const p of t.permissions) {
        expect(PERMISSIONS).toContain(p);
        expect(OWNER_ONLY_PERMISSIONS).not.toContain(p);
      }
      expect(t.permissions).toContain('workspace:read');
    }
    const read = ROLE_TEMPLATES.find((t) => t.key === 'read_only')!.permissions;
    expect(read.filter((p) => !p.endsWith(':read'))).toEqual([]); // read only really is read only
    const admin = ROLE_TEMPLATES.find((t) => t.key === 'workspace_administrator')!.permissions;
    expect(admin).not.toContain('workspace:delete');
    expect(admin).not.toContain('roles:manage');
  });
});
