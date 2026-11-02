/** Workspace roles. Mirrors the Prisma `WorkspaceRole` enum. */
export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'AGENT'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Permissions are granted to roles in apps/api (authorization module). */
export const PERMISSIONS = [
  'workspace:read',
  'workspace:update',
  'workspace:delete',
  'members:read',
  'members:manage',
  'conversations:read',
  'conversations:reply',
  'conversations:manage',
  'customers:read',
  'customers:update',
  'customers:delete',
  'savedreplies:manage',
  'leads:read',
  'leads:write',
  'leads:delete',
  'brain:read',
  'brain:write',
  'channels:read',
  'channels:manage',
  'orders:read',
  'orders:write',
  'orders:payments',
  'automation:read',
  'automation:write',
  'automation:activate',
  'billing:read',
  'billing:manage',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role -> permission matrix, shared so the API (enforcement) and clients (hiding controls)
 * agree. Clients must never rely on it for authorization; the API re-checks every request.
 */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  OWNER: new Set(PERMISSIONS),
  ADMIN: new Set(PERMISSIONS.filter((p) => p !== 'workspace:delete' && p !== 'billing:manage')),
  AGENT: new Set<Permission>([
    'workspace:read',
    'members:read',
    'conversations:read',
    'conversations:reply',
    'conversations:manage',
    'customers:read',
    'customers:update',
    'leads:read',
    'leads:write',
    'brain:read',
    'channels:read',
    'orders:read',
    'orders:write',
    'automation:read',
  ]),
};

export const roleHasPermission = (role: WorkspaceRole, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].has(permission);

/** Standard error envelope returned by every non-2xx API response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    statusCode: number;
    requestId?: string;
    details?: unknown;
  };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Socket.IO event names shared by API and clients. */
export const SOCKET_EVENTS = {
  workspaceJoin: 'workspace:join',
  workspaceLeave: 'workspace:leave',
  conversationSubscribe: 'conversation:subscribe',
  conversationUnsubscribe: 'conversation:unsubscribe',
  ping: 'system:ping',
  messageCreated: 'message:created',
  conversationUpdated: 'conversation:updated',
  conversationAssigned: 'conversation:assigned',
  conversationRead: 'conversation:read',
  resync: 'system:resync',
} as const;

/** BullMQ queue names shared by producers (API) and consumers (worker). */
export const QUEUES = {
  system: 'system',
  webhooks: 'webhooks',
  notifications: 'notifications',
  automation: 'automation',
  ai: 'ai',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Who may grant/change/remove which role. Shared by the API (enforcement) and the web app (hiding controls).
 * The Owner role is fixed: it cannot be granted, changed or removed (ownership transfer is not implemented).
 * Admins manage Agents only; only Owners manage Admins. This prevents privilege escalation.
 */
export const assignableRoles = (actor: WorkspaceRole): WorkspaceRole[] =>
  actor === 'OWNER' ? ['ADMIN', 'AGENT'] : actor === 'ADMIN' ? ['AGENT'] : [];
export const canManageMember = (actor: WorkspaceRole, target: WorkspaceRole): boolean =>
  target !== 'OWNER' && (actor === 'OWNER' || (actor === 'ADMIN' && target === 'AGENT'));
