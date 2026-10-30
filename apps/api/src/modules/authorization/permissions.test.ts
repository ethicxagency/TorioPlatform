import { assignableRoles, canManageMember, PERMISSIONS } from '@torio/types';
import { describe, expect, it } from 'vitest';
import { roleHasPermission } from './permissions';

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
