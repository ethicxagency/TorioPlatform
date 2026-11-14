'use client';

import { PERMISSION_GROUPS, type Permission } from '@torio/types';
import { Crown, Lock, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoleItem } from '../types';

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions);
export const PERMISSION_TOTAL = ALL_PERMISSIONS.length;

export function RoleMark({
  role,
  size = 36,
}: {
  role: Pick<RoleItem, 'id' | 'kind'>;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[10px]',
        role.id === 'OWNER'
          ? 'bg-primary text-white'
          : role.kind === 'CUSTOM'
            ? 'bg-primary-soft text-primary-hover'
            : 'bg-wash-2 text-muted',
      )}
    >
      {role.id === 'OWNER' ? (
        <Crown size={Math.round(size * 0.5)} />
      ) : role.id === 'ADMIN' ? (
        <ShieldCheck size={Math.round(size * 0.5)} />
      ) : role.id === 'AGENT' ? (
        <UserRound size={Math.round(size * 0.5)} />
      ) : (
        <SlidersHorizontal size={Math.round(size * 0.5)} />
      )}
    </span>
  );
}

/** Per-group "granted / total" for a permission list, for the quiet summary under a role. */
export function groupCounts(perms: readonly string[]) {
  const have = new Set(perms);
  return PERMISSION_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    granted: g.permissions.filter((p) => have.has(p.key)).length,
    total: g.permissions.length,
  }));
}

export const ownerOnly = (p: Permission) => p === 'workspace:delete' || p === 'roles:manage';

export function OwnerOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-wash-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
      <Lock size={10} aria-hidden /> Owner only
    </span>
  );
}
