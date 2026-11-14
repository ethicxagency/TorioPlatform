import type { Permission, WorkspaceRole } from '@torio/types';

export interface AuthUser {
  id: string;
  sessionId: string;
}

export interface WorkspaceMembershipContext {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  /** Set when the member has a custom role; their `permissions` then come from it, not from `role`. */
  customRoleId: string | null;
  /** What this member may do right now: the custom role's list, else their system role's. Read it, never recompute it. */
  permissions: ReadonlySet<Permission>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      membership?: WorkspaceMembershipContext;
    }
  }
}

export {};
