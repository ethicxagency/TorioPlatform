import { cn } from '@/lib/utils';
import { ROLE_INFO, type Role } from '../types';

const STYLE: Record<Role, string> = {
  OWNER: 'bg-[#F0F0FF] text-[#4F50D1]',
  ADMIN: 'bg-[#EFF6FF] text-[#2563EB]',
  AGENT: 'bg-[#EDF1F5] text-[#5A6A82]',
};

export function RoleBadge({
  role,
  name,
  className,
}: {
  role: Role;
  /** A custom role's name, shown instead of the system role it is based on. */
  name?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
        name ? 'bg-[#F0F0FF] text-[#4F50D1]' : STYLE[role],
        className,
      )}
    >
      {name ?? ROLE_INFO[role].label}
    </span>
  );
}

export function StatusBadge({ status }: { status: 'ACTIVE' | 'SUSPENDED' }) {
  return status === 'ACTIVE' ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
      Suspended
    </span>
  );
}
