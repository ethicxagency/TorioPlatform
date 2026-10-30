import type { WorkspaceRole } from '@torio/types';

export interface AuthUser {
  id: string;
  sessionId: string;
}

export interface WorkspaceMembershipContext {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
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
