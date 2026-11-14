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
  'roles:manage',
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
  ADMIN: new Set(
    PERMISSIONS.filter(
      (p) => p !== 'workspace:delete' && p !== 'billing:manage' && p !== 'roles:manage',
    ),
  ),
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

/** Permissions that only the Owner holds and that a custom role can never carry, so nobody can be raised to them through a role. */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = ['workspace:delete', 'roles:manage'];
/** Every role can at least see the workspace it belongs to; the API adds this to any custom role. */
export const BASELINE_PERMISSIONS: readonly Permission[] = ['workspace:read'];

export interface PermissionInfo {
  key: Permission;
  label: string;
  description: string;
  /** Shown with a warning in the role builder. */
  sensitive?: boolean;
}
export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionInfo[];
}

/**
 * Every permission the API really enforces, grouped for display. A capability the API does not enforce is not listed here:
 * a switch that does nothing would be a lie. (See docs/ROLES.md for what is not separately enforceable yet.)
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'workspace',
    label: 'Workspace',
    permissions: [
      {
        key: 'workspace:read',
        label: 'View workspace',
        description: 'See the workspace and its basic details. Every role has this.',
      },
      {
        key: 'workspace:update',
        label: 'Edit workspace settings',
        description: 'Change business information, logo and regional settings.',
        sensitive: true,
      },
      {
        key: 'workspace:delete',
        label: 'Delete workspace',
        description: 'Permanently delete the workspace. Owner only.',
        sensitive: true,
      },
    ],
  },
  {
    key: 'members',
    label: 'Members & Teams',
    permissions: [
      {
        key: 'members:read',
        label: 'View members',
        description: 'See members, teams and invitations.',
      },
      {
        key: 'members:manage',
        label: 'Invite and manage members',
        description:
          'Invite people, manage teams, and change or suspend members within your own authority.',
        sensitive: true,
      },
      {
        key: 'roles:manage',
        label: 'Manage roles and permissions',
        description: 'Create, edit and delete custom roles. Owner only.',
        sensitive: true,
      },
    ],
  },
  {
    key: 'inbox',
    label: 'Inbox & Conversations',
    permissions: [
      {
        key: 'conversations:read',
        label: 'View conversations',
        description: 'Open the Inbox and read conversations.',
      },
      {
        key: 'conversations:reply',
        label: 'Reply to customers',
        description: 'Send replies and use AI Assist drafts.',
      },
      {
        key: 'conversations:manage',
        label: 'Assign, snooze and resolve',
        description: 'Change a conversation’s assignee, status, priority and tags.',
      },
      {
        key: 'savedreplies:manage',
        label: 'Manage saved replies',
        description: 'Create, edit and delete saved replies for the workspace.',
      },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    permissions: [
      {
        key: 'customers:read',
        label: 'View customers',
        description: 'See customer profiles and history.',
      },
      {
        key: 'customers:update',
        label: 'Create and edit customers',
        description: 'Add customers and change their details, tags and notes.',
      },
      {
        key: 'customers:delete',
        label: 'Delete customers',
        description: 'Permanently delete customer records.',
        sensitive: true,
      },
    ],
  },
  {
    key: 'leads',
    label: 'Leads',
    permissions: [
      { key: 'leads:read', label: 'View leads', description: 'See the lead list and pipeline.' },
      {
        key: 'leads:write',
        label: 'Create and edit leads',
        description: 'Add leads and move them through the pipeline.',
      },
      {
        key: 'leads:delete',
        label: 'Delete leads',
        description: 'Permanently delete leads.',
        sensitive: true,
      },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    permissions: [
      {
        key: 'orders:read',
        label: 'View orders',
        description: 'See orders, invoices and shipping details.',
      },
      {
        key: 'orders:write',
        label: 'Create and update orders',
        description: 'Create orders, change their status and manage fulfilment.',
      },
      {
        key: 'orders:payments',
        label: 'Record payments',
        description: 'Record, change or remove order payments.',
        sensitive: true,
      },
    ],
  },
  {
    key: 'channels',
    label: 'Channels',
    permissions: [
      {
        key: 'channels:read',
        label: 'View channels',
        description: 'See connected channels and their health.',
      },
      {
        key: 'channels:manage',
        label: 'Connect and manage channels',
        description: 'Connect, reconnect, edit and disconnect channels.',
        sensitive: true,
      },
    ],
  },
  {
    key: 'automation',
    label: 'Automation',
    permissions: [
      {
        key: 'automation:read',
        label: 'View automations',
        description: 'See automations and their run history.',
      },
      {
        key: 'automation:write',
        label: 'Create, edit and test automations',
        description: 'Build and test automations without turning them on.',
      },
      {
        key: 'automation:activate',
        label: 'Activate, delete and retry',
        description: 'Turn automations on or off, delete them, and retry failed runs.',
        sensitive: true,
      },
    ],
  },
  {
    key: 'brain',
    label: 'Brain & AI',
    permissions: [
      {
        key: 'brain:read',
        label: 'View Brain',
        description: 'See the business knowledge Torio uses to answer customers.',
      },
      {
        key: 'brain:write',
        label: 'Edit Brain',
        description: 'Change products, policies and answers.',
      },
    ],
  },
  {
    key: 'billing',
    label: 'Billing & Subscription',
    permissions: [
      {
        key: 'billing:read',
        label: 'View billing, invoices and usage',
        description: 'See the plan, invoices and usage.',
      },
      {
        key: 'billing:manage',
        label: 'Change plan and payment methods',
        description: 'Change the subscription, payment methods and billing details.',
        sensitive: true,
      },
    ],
  },
  {
    key: 'audit',
    label: 'Audit',
    permissions: [
      {
        key: 'audit:read',
        label: 'View audit history',
        description: 'See who changed what in the workspace.',
        sensitive: true,
      },
    ],
  },
];

export interface RoleTemplate {
  key: string;
  label: string;
  description: string;
  permissions: Permission[];
}

/**
 * Starting points for a custom role. A template is only a list of the real permission keys above: choosing one fills the
 * builder, the owner can change it, and what is saved is the permission list, never the template.
 */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'workspace_administrator',
    label: 'Workspace Administrator',
    description:
      'Runs day-to-day operations: members, channels, settings and all business data. No workspace deletion, billing changes or role management.',
    permissions: [
      'workspace:read',
      'workspace:update',
      'members:read',
      'members:manage',
      'conversations:read',
      'conversations:reply',
      'conversations:manage',
      'savedreplies:manage',
      'customers:read',
      'customers:update',
      'customers:delete',
      'leads:read',
      'leads:write',
      'leads:delete',
      'orders:read',
      'orders:write',
      'orders:payments',
      'channels:read',
      'channels:manage',
      'automation:read',
      'automation:write',
      'automation:activate',
      'brain:read',
      'brain:write',
      'billing:read',
      'audit:read',
    ],
  },
  {
    key: 'operations_manager',
    label: 'Operations Manager',
    description: 'Keeps orders and customers moving, and watches the Inbox and channels.',
    permissions: [
      'workspace:read',
      'members:read',
      'conversations:read',
      'conversations:manage',
      'customers:read',
      'customers:update',
      'orders:read',
      'orders:write',
      'orders:payments',
      'channels:read',
      'automation:read',
      'brain:read',
    ],
  },
  {
    key: 'customer_support',
    label: 'Customer Support',
    description:
      'Answers customers: read, reply, assign and resolve conversations and edit customer details. No billing, members or settings.',
    permissions: [
      'workspace:read',
      'members:read',
      'conversations:read',
      'conversations:reply',
      'conversations:manage',
      'customers:read',
      'customers:update',
      'leads:read',
      'brain:read',
    ],
  },
  {
    key: 'sales_manager',
    label: 'Sales Manager',
    description:
      'Owns leads and customer records, assigns conversations and handles orders. No billing or workspace administration.',
    permissions: [
      'workspace:read',
      'members:read',
      'leads:read',
      'leads:write',
      'leads:delete',
      'customers:read',
      'customers:update',
      'conversations:read',
      'conversations:reply',
      'conversations:manage',
      'orders:read',
      'orders:write',
    ],
  },
  {
    key: 'sales_agent',
    label: 'Sales Representative',
    description:
      'Works leads and talks to customers. Sees all leads, since per-owner visibility is not enforced. No member, billing or settings access.',
    permissions: [
      'workspace:read',
      'leads:read',
      'leads:write',
      'customers:read',
      'conversations:read',
      'conversations:reply',
      'orders:read',
    ],
  },
  {
    key: 'read_only',
    label: 'Read Only',
    description:
      'Can look at conversations, customers, leads and orders. Cannot create, edit, delete or manage anything.',
    permissions: [
      'workspace:read',
      'conversations:read',
      'customers:read',
      'leads:read',
      'orders:read',
    ],
  },
  {
    key: 'custom',
    label: 'Custom Setup',
    description: 'Start with nothing and choose every permission yourself.',
    permissions: ['workspace:read'],
  },
];

/** Keeps only real, grantable permission keys, adds the baseline, and returns them in catalogue order. */
export const normalizeRolePermissions = (keys: readonly string[]): Permission[] => {
  const want = new Set<string>([...keys, ...BASELINE_PERMISSIONS]);
  return PERMISSIONS.filter((p) => want.has(p) && !OWNER_ONLY_PERMISSIONS.includes(p));
};
