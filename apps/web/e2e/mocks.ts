import type { Page } from '@playwright/test';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'agent@test.dev',
  name: 'Farid Ahmed',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

const customer = (id: string, name: string) => ({
  id,
  name,
  phone: '+8801700000001',
  email: `${name.split(' ')[0]!.toLowerCase()}@example.test`,
  handle: null,
  location: 'Dhaka, BD',
  leadStatus: 'NEW',
  tags: ['Hot Lead'],
  notes: '',
  isSample: true,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const conversation = (id: string, name: string, provider: string, unread: number) => ({
  id,
  status: 'OPEN',
  priority: 'NORMAL',
  snoozedUntil: null,
  unreadCount: unread,
  lastMessageAt: iso(10),
  lastMessagePreview: `Hello from ${name}`,
  waitingSince: iso(10),
  channel: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', provider, displayName: provider },
  assignee: null,
  customer: customer(`dddddddd-dddd-4ddd-8ddd-${id.slice(-12)}`, name),
});

const lead = (id: string, name: string, stage: string, score: number, company: string | null) => ({
  id,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@example.test`,
  phone: '+8801700000009',
  company,
  jobTitle: null,
  source: 'WHATSAPP',
  stage,
  owner: null,
  tags: ['sample'],
  dealValue: 12000,
  score,
  notes: '',
  customerId: null,
  conversationId: null,
  lastActivityAt: iso(60),
  createdAt: iso(3000),
});
export const LEADS = [
  lead('99999999-9999-4999-8999-000000000001', 'Nusrat Jahan', 'QUALIFIED', 75, 'Jahan Decor'),
  lead('99999999-9999-4999-8999-000000000002', 'Imran Kabir', 'NEW', 20, null),
];
export const leadRequests: string[] = [];

const cust = (id: string, name: string, status: string) => ({
  id,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@example.test`,
  phone: '+8801700000011',
  handle: null,
  location: null,
  leadStatus: 'NEW',
  tags: ['vip'],
  notes: '',
  isSample: true,
  createdAt: iso(5000),
  company: 'Acme',
  address: null,
  source: 'WHATSAPP',
  status,
  owner: null,
  conversationCount: 1,
  conversationId: '33333333-3333-4333-8333-000000000001',
  lastActivityAt: iso(30),
  updatedAt: iso(30),
});
export const CUSTOMERS = [
  cust('88888888-8888-4888-8888-000000000001', 'Tanvir Hasan', 'ACTIVE'),
  cust('88888888-8888-4888-8888-000000000002', 'Ayesha Siddiqua', 'INACTIVE'),
];
export const customerRequests: string[] = [];

export const MEMBERS = [
  {
    id: 'eeeeeeee-0000-4000-8000-000000000001',
    userId: USER.id,
    role: 'ADMIN',
    status: 'ACTIVE',
    name: USER.name,
    email: USER.email,
    teams: [],
    assignedOpenConversations: 2,
    lastSignInAt: iso(5),
    createdAt: USER.createdAt,
  },
  {
    id: 'eeeeeeee-0000-4000-8000-000000000002',
    userId: 'ffffffff-0000-4000-8000-000000000002',
    role: 'AGENT',
    status: 'ACTIVE',
    name: 'Nadia Islam',
    email: 'nadia@example.test',
    teams: [{ id: 'abababab-0000-4000-8000-000000000001', name: 'Support' }],
    assignedOpenConversations: 1,
    lastSignInAt: null,
    createdAt: USER.createdAt,
  },
];

export const brainState = { version: 3, puts: [] as unknown[] };
const brainConfig = () => ({
  identity: {
    name: 'UrbanNest (test)',
    category: 'Home & Lifestyle',
    website: '',
    country: 'Bangladesh',
    market: '',
    languages: ['Bengali'],
    currency: 'BDT (৳)',
    description: '',
    audience: '',
    positioning: '',
    usp: '',
  },
  products: [
    {
      id: 'p1',
      name: 'Nordic Ceramic Vase',
      category: 'Décor',
      description: '',
      price: '1450',
      variants: '',
      sizes: '',
      colors: 'White, Sage',
      stock: 'In stock',
      benefits: '',
      usage: '',
      limitations: '',
      faqs: '',
    },
  ],
  shipping: {
    providers: ['Pathao'],
    coverage: 'Nationwide',
    feeInside: '60',
    feeOutside: '120',
    timeInside: '1–2 days',
    timeOutside: '3–5 days',
    cod: true,
    payments: ['bKash'],
    freeShip: false,
    threshold: '',
    processing: '',
    tracking: '',
  },
  returns: {
    eligibility: '',
    window: '',
    exchange: '',
    refundTime: '',
    damaged: '',
    wrong: '',
    shippingResp: '',
    proof: '',
    escalation: '',
  },
  voice: {
    tone: 'Friendly',
    language: 'English',
    formality: 3,
    length: 'Balanced',
    emoji: 'None',
    greeting: '',
    terms: '',
    avoid: '',
    examples: '',
  },
  rules: {
    always: '',
    never: '',
    approvalTopics: [],
    escalate: '',
    discount: 'None',
    alternatives: true,
    competitors: false,
    promises: false,
    angry: 'Apologise, acknowledge, then hand off',
    fallback: 'human',
    sensitive: { refund: true, payment: true, complaint: true, delivery: true },
  },
  cfCats: [],
  customFields: [],
  instructions: [],
  logic: [],
  faqs: [
    { id: 'f1', q: 'Do you offer COD?', a: 'Yes, nationwide.', cat: 'Payments', active: true },
  ],
});

const chan = (
  id: string,
  provider: string,
  name: string,
  status: string,
  over: Record<string, unknown> = {},
) => ({
  id,
  provider,
  displayName: name,
  status,
  accountName: `${name} account`,
  accountMask: null,
  connectedAt: iso(9000),
  disconnectedAt: null,
  lastHealthCheckAt: null,
  lastError: null,
  isSample: false,
  defaultAssignee: null,
  defaultTeam: null,
  conversationCount: 4,
  openConversations: 2,
  unreadConversations: 1,
  lastConversationAt: iso(20),
  createdAt: iso(9000),
  ...over,
});
export const channelState = { list: [] as ReturnType<typeof chan>[], patches: [] as unknown[] };
export const resetChannels = () => {
  channelState.list = [
    chan('77777777-7777-4777-8777-000000000001', 'WHATSAPP', 'Sales WhatsApp', 'CONNECTED', {
      isSample: true,
    }),
    chan(
      '77777777-7777-4777-8777-000000000002',
      'INSTAGRAM',
      'Brand Instagram',
      'NEEDS_ATTENTION',
      {
        lastError: 'Authorization expired',
        conversationCount: 0,
        openConversations: 0,
        unreadConversations: 0,
        lastConversationAt: null,
      },
    ),
  ];
  channelState.patches = [];
};
resetChannels();

const ORD = (n: number) => `88888888-8888-4888-8888-0000000000${String(n).padStart(2, '0')}`;
type OrderDetail = ReturnType<typeof order>;
function order(
  n: number,
  name: string,
  over: Partial<Record<string, unknown>> = {},
  items = [{ name: 'Linen sofa', quantity: 1, unitPriceMinor: 40_000 }],
) {
  const subtotal = items.reduce((a, i) => a + i.quantity * i.unitPriceMinor, 0);
  const total = subtotal + 1_000;
  const cust = CUSTOMERS.find((c) => c.name === name) ?? CUSTOMERS[0]!;
  return {
    id: ORD(n),
    number: 1000 + n,
    customer: { id: cust.id, name: cust.name, email: cust.email, phone: cust.phone },
    itemCount: items.reduce((a, i) => a + i.quantity, 0),
    itemSummary: items.map((i) => i.name).join(', '),
    currency: 'USD',
    totalMinor: total,
    paidMinor: 0,
    outstandingMinor: total,
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    fulfillmentStatus: 'UNFULFILLED',
    channel: 'MANUAL',
    conversationId: null,
    isSample: false,
    createdAt: iso(60 * n),
    subtotalMinor: subtotal,
    discountMinor: 0,
    shippingMinor: 1_000,
    taxMinor: 0,
    items: items.map((i, k) => ({
      id: `99999999-9999-4999-8999-${String(n * 10 + k).padStart(12, '0')}`,
      name: i.name,
      sku: null,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor,
      lineTotalMinor: i.quantity * i.unitPriceMinor,
    })),
    payments: [] as unknown[],
    notes: [] as unknown[],
    events: [
      {
        id: `abababab-abab-4bab-8bab-${String(n).padStart(12, '0')}`,
        type: 'created',
        description: 'Order created',
        actor: null,
        createdAt: iso(60 * n),
      },
    ] as {
      id: string;
      type: string;
      description: string;
      actor: { id: string; name: string } | null;
      createdAt: string;
    }[],
    shippingAddress: null,
    shippingMethod: null,
    carrier: null,
    trackingNumber: null,
    trackingUrl: null,
    shippedAt: null,
    cancelledAt: null,
    completedAt: null,
    createdBy: null,
    conversation: null,
    customerConversations: [],
    ...over,
  };
}
export const orderState = {
  list: [] as OrderDetail[],
  created: [] as unknown[],
  statuses: [] as unknown[],
  payments: [] as unknown[],
  bulks: [] as unknown[],
};
export const resetOrders = () => {
  orderState.list = [
    order(1, 'Tanvir Hasan', { status: 'CONFIRMED' }),
    order(2, 'Tanvir Hasan', { isSample: true }, [
      { name: 'Oak table', quantity: 2, unitPriceMinor: 9_500 },
    ]),
    order(3, 'Tanvir Hasan', { status: 'CANCELLED', cancelledAt: iso(5) }),
  ];
  orderState.created = [];
  orderState.statuses = [];
  orderState.payments = [];
  orderState.bulks = [];
};
resetOrders();
const orderListItem = (o: OrderDetail) => {
  const { items, payments, notes, events, ...rest } = o;
  void items;
  void payments;
  void notes;
  void events;
  return {
    id: rest.id,
    number: rest.number,
    customer: rest.customer,
    itemCount: rest.itemCount,
    itemSummary: rest.itemSummary,
    currency: rest.currency,
    totalMinor: rest.totalMinor,
    paidMinor: rest.paidMinor,
    outstandingMinor: rest.outstandingMinor,
    status: rest.status,
    paymentStatus: rest.paymentStatus,
    fulfillmentStatus: rest.fulfillmentStatus,
    channel: rest.channel,
    conversationId: rest.conversationId,
    isSample: rest.isSample,
    createdAt: rest.createdAt,
  };
};

export const settingsState = {
  profile: {} as Record<string, unknown>,
  profilePatches: [] as unknown[],
  passwords: [] as unknown[],
  sessions: [] as { id: string; device: string; current: boolean }[],
  revoked: [] as string[],
  workspace: {} as Record<string, unknown>,
  workspacePatches: [] as unknown[],
};
export const resetSettings = () => {
  settingsState.profile = {
    ...USER,
    phone: null,
    jobTitle: null,
    timeZone: null,
    landingPage: 'dashboard',
  };
  settingsState.profilePatches = [];
  settingsState.passwords = [];
  settingsState.sessions = [
    { id: 'e0e0e0e0-e0e0-4e0e-8e0e-000000000001', device: 'Chrome on macOS', current: true },
    { id: 'e0e0e0e0-e0e0-4e0e-8e0e-000000000002', device: 'Safari on iOS', current: false },
  ];
  settingsState.revoked = [];
  settingsState.workspace = {
    id: WS,
    name: 'UrbanNest',
    slug: 'u',
    description: null,
    defaultCurrency: null,
    contactEmail: null,
    createdAt: USER.createdAt,
  };
  settingsState.workspacePatches = [];
};
resetSettings();

const AUTO = (n: number) => `a1a1a1a1-a1a1-4a1a-8a1a-0000000000${String(n).padStart(2, '0')}`;
type AutoDetail = ReturnType<typeof automation>;
function automation(
  n: number,
  name: string,
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE',
  trigger: string,
  steps: unknown[],
  over: Record<string, unknown> = {},
) {
  return {
    id: AUTO(n),
    name,
    description: '',
    status,
    triggerType: trigger,
    stepCount: steps.length,
    hasUnpublishedChanges: false,
    publishedVersion: status === 'DRAFT' ? 0 : 1,
    runs: status === 'ACTIVE' ? 4 : 0,
    failed: status === 'ACTIVE' ? 1 : 0,
    lastRunAt: status === 'ACTIVE' ? iso(20) : null,
    createdBy: { id: USER.id, name: USER.name },
    updatedAt: iso(60),
    createdAt: iso(600),
    definition: { schemaVersion: 1, trigger: { type: trigger }, steps } as {
      schemaVersion: number;
      trigger: { type: string };
      steps: { id: string; type: string; [k: string]: unknown }[];
    },
    draftRevision: 1,
    issues: [] as { stepId: string | null; message: string }[],
    ...over,
  };
}
export const autoState = {
  list: [] as AutoDetail[],
  patches: [] as unknown[],
  published: [] as string[],
  deactivated: [] as string[],
  created: [] as unknown[],
  deleted: [] as string[],
  tests: [] as unknown[],
  retried: [] as string[],
};
export const resetAutomation = () => {
  autoState.list = [
    automation(1, 'Flag large orders', 'ACTIVE', 'order.created', [
      {
        id: 's1',
        type: 'condition',
        conditions: [{ field: 'order.total', op: 'gt', value: '500' }],
      },
      {
        id: 's2',
        type: 'action',
        action: 'add_order_note',
        config: { text: 'Large order #{{order.number}}' },
      },
    ]),
    automation(
      2,
      'Tag Instagram customers',
      'DRAFT',
      'customer.created',
      [{ id: 's1', type: 'action', action: 'add_customer_tag', config: { tag: '' } }],
      { issues: [{ stepId: 's1', message: 'Add customer tag: tag is required' }] },
    ),
  ];
  autoState.patches = [];
  autoState.published = [];
  autoState.deactivated = [];
  autoState.created = [];
  autoState.deleted = [];
  autoState.tests = [];
  autoState.retried = [];
};
resetAutomation();
const autoListItem = (a: AutoDetail) => {
  const { definition, draftRevision, issues, ...rest } = a;
  void definition;
  void draftRevision;
  void issues;
  return rest;
};
const EXEC = (n: number, status: string, extra: Record<string, unknown> = {}) => ({
  id: `b2b2b2b2-b2b2-4b2b-8b2b-0000000000${String(n).padStart(2, '0')}`,
  automationId: AUTO(1),
  automationName: 'Flag large orders',
  version: 1,
  isTest: false,
  status,
  triggerType: 'order.created',
  entityType: 'order',
  stepCount: 2,
  completedSteps: status === 'SUCCEEDED' ? 2 : 1,
  attempts: status === 'FAILED' ? 1 : 0,
  error: status === 'FAILED' ? 'The order no longer exists' : null,
  startedAt: iso(30),
  finishedAt: iso(30),
  durationMs: 420,
  createdAt: iso(30),
  ...extra,
});

export const CONVS = [
  conversation('33333333-3333-4333-8333-000000000001', 'Tanvir Hasan', 'WHATSAPP', 2),
  conversation('33333333-3333-4333-8333-000000000002', 'Ayesha Siddiqua', 'INSTAGRAM', 0),
];

/** Deterministic API for UI tests: no database needed. Registers before page.goto. */
export async function mockApi(page: Page, opts: { role?: 'OWNER' | 'ADMIN' | 'AGENT' } = {}) {
  const role = opts.role ?? 'AGENT';
  await page.route('http://localhost:4000/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace('/api/v1', '');
    if (req.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:3100',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    const cors = {
      'access-control-allow-origin': 'http://localhost:3100',
      'access-control-allow-credentials': 'true',
    };
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify(body),
      });
    if (p === '/auth/refresh')
      return reply({ accessToken: 'test-token', expiresIn: 900, user: USER });
    if (p === '/auth/logout') return reply({ ok: true });
    if (p === '/users/me/password') {
      const b = req.postDataJSON() as { currentPassword: string };
      settingsState.passwords.push(b);
      if (b.currentPassword === 'wrong')
        return reply(
          {
            error: {
              code: 'BAD_REQUEST',
              message: 'Your current password is incorrect',
              statusCode: 400,
            },
          },
          400,
        );
      return reply({ revoked: 1 });
    }
    if (p === '/users/me/sessions/revoke-others') {
      settingsState.sessions = settingsState.sessions.filter((x) => x.current);
      return reply({ revoked: 1 });
    }
    if (p.startsWith('/users/me/sessions/')) {
      const id = p.split('/').pop()!;
      settingsState.revoked.push(id);
      settingsState.sessions = settingsState.sessions.filter((x) => x.id !== id);
      return reply({ data: settingsState.sessions });
    }
    if (p === '/users/me/sessions')
      return reply({
        data: settingsState.sessions.map((x) => ({
          ...x,
          ipAddress: null,
          createdAt: iso(500),
          lastActiveAt: iso(5),
        })),
      });
    if (p === '/users/me/export')
      return reply({
        exportedAt: iso(0),
        profile: settingsState.profile,
        workspaces: [],
        signedInDevices: [],
      });
    if (p === '/users/me') {
      if (req.method() === 'PATCH') {
        const b = req.postDataJSON() as Record<string, unknown>;
        settingsState.profilePatches.push(b);
        for (const [k, v] of Object.entries(b)) settingsState.profile[k] = v === '' ? null : v;
        return reply(settingsState.profile);
      }
      return reply(settingsState.profile);
    }
    if (p === `/workspaces/${WS}/audit`)
      return reply({
        data: [
          {
            id: 'f1f1f1f1-f1f1-4f1f-8f1f-000000000001',
            action: 'workspace.update',
            description: 'Workspace settings changed: name',
            entityType: 'workspace',
            entityId: WS,
            actor: { id: USER.id, name: USER.name },
            createdAt: iso(3),
          },
        ],
        meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      });
    if (p === `/workspaces/${WS}` && req.method() === 'PATCH') {
      const b = req.postDataJSON() as Record<string, unknown>;
      settingsState.workspacePatches.push(b);
      for (const [k, v] of Object.entries(b)) settingsState.workspace[k] = v === '' ? null : v;
      return reply({ ...settingsState.workspace, role });
    }
    if (p === '/workspaces') return reply([{ ...settingsState.workspace, role }]);
    if (p === `/workspaces/${WS}/conversations`)
      return reply({
        data: CONVS,
        meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
        counts: { open: 2, snoozed: 0, resolved: 0 },
      });
    const one = CONVS.find((c) => p === `/workspaces/${WS}/conversations/${c.id}`);
    if (one) return reply(one);
    if (p.endsWith('/messages'))
      return reply({
        data: [
          {
            id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
            kind: 'INBOUND',
            body: 'Price koto?',
            author: null,
            replyTo: null,
            deliveryStatus: null,
            createdAt: iso(10),
          },
        ],
        meta: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
      });
    if (p === `/workspaces/${WS}/members`)
      return reply({ data: MEMBERS, meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 } });
    if (p === `/workspaces/${WS}/team/summary`)
      return reply({
        totalMembers: 2,
        activeMembers: 2,
        suspendedMembers: 0,
        pendingInvitations: 1,
        unassignedOpenConversations: 3,
      });
    if (p === `/workspaces/${WS}/teams`) return reply({ data: [] });
    if (p === `/workspaces/${WS}/invitations` && req.method() === 'POST') {
      const b = req.postDataJSON() as { email: string; role: string };
      return reply(
        {
          id: 'dddddddd-0000-4000-8000-000000000009',
          email: b.email,
          role: b.role,
          team: null,
          invitedBy: null,
          status: 'PENDING',
          createdAt: iso(0),
          expiresAt: iso(-10000),
          inviteUrl: 'http://localhost:3100/accept-invite?token=TESTTOKEN_TESTTOKEN_TESTTOKEN',
          emailSent: false,
        },
        201,
      );
    }
    if (p === `/workspaces/${WS}/invitations`)
      return reply({
        data: [
          {
            id: 'dddddddd-0000-4000-8000-000000000001',
            email: 'pending@example.test',
            role: 'AGENT',
            team: null,
            invitedBy: { id: USER.id, name: USER.name },
            status: 'PENDING',
            createdAt: iso(100),
            expiresAt: iso(-10000),
          },
        ],
      });
    if (p.startsWith(`/workspaces/${WS}/members/`))
      return p.endsWith('/activity')
        ? reply({ data: [] })
        : reply({
            ...(MEMBERS.find((m) => p.endsWith(m.id)) ?? MEMBERS[1]),
            resolvedLast30Days: 4,
          });
    if (p.endsWith('/saved-replies'))
      return reply([
        {
          id: 'ffffffff-ffff-4fff-8fff-000000000001',
          shortcut: '/thanks',
          title: 'Thank you',
          body: 'Thanks, {name}!',
        },
      ]);
    if (p === `/workspaces/${WS}/leads/summary`)
      return reply({
        total: 2,
        new: 1,
        qualified: 1,
        won: 0,
        lost: 0,
        unassigned: 2,
        conversionRate: null,
        createdLast30Days: 2,
        createdPreviousThirtyDays: 0,
        createdPrevious30Days: 0,
      });
    if (p === `/workspaces/${WS}/leads` && req.method() === 'POST') {
      const body = req.postDataJSON() as { name: string };
      return reply(
        { ...LEADS[0], id: '99999999-9999-4999-8999-000000000003', name: body.name },
        201,
      );
    }
    if (p === `/workspaces/${WS}/leads`) {
      leadRequests.push(url.search);
      return reply({ data: LEADS, meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 } });
    }
    const oneLead = LEADS.find((l) => p === `/workspaces/${WS}/leads/${l.id}`);
    if (oneLead) return reply(oneLead);
    if (p.endsWith('/activities'))
      return reply({
        data: [
          {
            id: 'aaaaaaaa-0000-4000-8000-000000000001',
            type: 'CREATED',
            body: 'Lead created (whatsapp)',
            actor: null,
            createdAt: iso(3000),
          },
        ],
      });
    if (p === `/workspaces/${WS}/customers/summary`)
      return reply({
        total: 2,
        active: 1,
        withConversations: 2,
        createdLast30Days: 0,
        createdPrevious30Days: 0,
      });
    if (p === `/workspaces/${WS}/customers` && req.method() === 'POST') {
      const body = req.postDataJSON() as { name: string };
      return reply(
        { ...CUSTOMERS[0], id: '88888888-8888-4888-8888-000000000003', name: body.name },
        201,
      );
    }
    if (p === `/workspaces/${WS}/customers`) {
      customerRequests.push(url.search);
      return reply({ data: CUSTOMERS, meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 } });
    }
    const oneCust = CUSTOMERS.find((c) => p.startsWith(`/workspaces/${WS}/customers/${c.id}`));
    if (oneCust) {
      if (p.endsWith('/notes')) return reply({ data: [] });
      if (p.endsWith('/activity'))
        return reply({
          data: [
            {
              id: 'created-1',
              type: 'CREATED',
              body: 'Customer record created',
              at: iso(5000),
              conversationId: null,
            },
          ],
        });
      if (p.endsWith('/conversations'))
        return reply({
          data: [
            {
              id: '33333333-3333-4333-8333-000000000001',
              provider: 'WHATSAPP',
              status: 'OPEN',
              preview: 'Hello',
              lastMessageAt: iso(30),
              assignee: null,
            },
          ],
        });
      return reply(oneCust);
    }
    if (p === `/workspaces/${WS}/brain`) {
      if (req.method() === 'PUT') {
        const b = req.postDataJSON() as { config: unknown; baseVersion: number };
        brainState.puts.push(b);
        if (b.baseVersion !== brainState.version)
          return reply(
            {
              error: {
                code: 'CONFLICT',
                message: 'Brain was changed by someone else.',
                statusCode: 409,
              },
            },
            409,
          );
        brainState.version += 1;
        return reply({
          config: b.config,
          version: brainState.version,
          updatedAt: iso(0),
          updatedBy: { id: USER.id, name: USER.name },
        });
      }
      return reply({
        config: brainConfig(),
        version: brainState.version,
        updatedAt: iso(120),
        updatedBy: { id: USER.id, name: USER.name },
      });
    }
    if (p.startsWith(`/workspaces/${WS}/channels`)) {
      const rest = p.slice(`/workspaces/${WS}/channels`.length);
      if (rest === '/summary')
        return reply({
          total: channelState.list.length,
          connected: channelState.list.filter((c) => c.status === 'CONNECTED').length,
          needsAttention: 1,
          disconnected: channelState.list.filter((c) => c.status === 'DISCONNECTED').length,
          sample: 1,
          conversationsLast30Days: 4,
        });
      if (rest === '/providers')
        return reply({
          data: ['WHATSAPP', 'INSTAGRAM', 'MESSENGER'].map((pr) => ({
            provider: pr,
            label:
              pr === 'WHATSAPP'
                ? 'WhatsApp Business'
                : pr === 'INSTAGRAM'
                  ? 'Instagram Messaging'
                  : 'Facebook Messenger',
            state: 'unavailable',
            reason: 'Torio’s connection for this provider isn’t built yet.',
            requirements: ['An account', 'A linked Page'],
            connectedCount: 0,
          })),
        });
      if (rest === '') return reply({ data: channelState.list });
      const [, id, action] = rest.split('/');
      const ch = channelState.list.find((c) => c.id === id);
      if (!ch)
        return reply(
          { error: { code: 'NOT_FOUND', message: 'Channel not found', statusCode: 404 } },
          404,
        );
      if (action === 'activity')
        return reply({
          data: [
            {
              id: 'aaaaaaaa-0000-4000-8000-0000000000aa',
              description: 'Renamed',
              actor: null,
              createdAt: iso(5),
            },
          ],
        });
      if (action === 'disconnect') {
        ch.status = 'DISCONNECTED';
        return reply(ch);
      }
      if (req.method() === 'PATCH') {
        channelState.patches.push(req.postDataJSON());
        Object.assign(ch, req.postDataJSON());
        return reply(ch);
      }
      return reply(ch);
    }
    if (p.startsWith(`/workspaces/${WS}/orders`)) {
      const rest = p.slice(`/workspaces/${WS}/orders`.length);
      const url = new URL(req.url());
      const get = (k: string) => url.searchParams.get(k);
      if (rest === '/summary') {
        const live = orderState.list.filter((o) => o.status !== 'CANCELLED');
        return reply({
          totalOrders: orderState.list.length,
          hasPrevious: !!get('createdFrom'),
          previousTotalOrders: 0,
          revenue: [
            { currency: 'USD', amountMinor: live.reduce((a, o) => a + o.paidMinor, 0) },
          ].filter((r) => r.amountMinor > 0),
          pendingPayments: {
            count: live.filter((o) => o.paymentStatus !== 'PAID').length,
            outstanding: [
              {
                currency: 'USD',
                amountMinor: live.reduce((a, o) => a + o.totalMinor - o.paidMinor, 0),
              },
            ],
          },
          processing: orderState.list.filter((o) => ['CONFIRMED', 'PROCESSING'].includes(o.status))
            .length,
          completed: orderState.list.filter((o) => o.status === 'COMPLETED').length,
          cancelled: orderState.list.filter((o) => o.status === 'CANCELLED').length,
        });
      }
      if (rest === '/bulk') {
        const b = req.postDataJSON() as { ids: string[]; status: string };
        orderState.bulks.push(b);
        const failed: { id: string; number: number; reason: string }[] = [];
        let updated = 0;
        for (const id of b.ids) {
          const o = orderState.list.find((x) => x.id === id)!;
          if (o.status === 'CANCELLED')
            failed.push({ id, number: o.number, reason: 'A cancelled order can’t change status' });
          else {
            o.status = b.status;
            updated++;
          }
        }
        return reply({ updated, failed });
      }
      if (rest === '' && req.method() === 'POST') {
        const b = req.postDataJSON() as {
          customerId: string;
          items: { name: string; quantity: number; unitPriceMinor: number }[];
          shippingMinor: number;
        };
        orderState.created.push(b);
        const cust = CUSTOMERS.find((c) => c.id === b.customerId) ?? CUSTOMERS[0]!;
        const o = order(10 + orderState.created.length, cust.name, {}, b.items);
        orderState.list.unshift(o);
        return reply(o);
      }
      if (rest === '') {
        const q = (get('q') ?? '').toLowerCase();
        const st = get('status')?.split(',');
        const ps = get('paymentStatus')?.split(',');
        let rows = orderState.list.filter(
          (o) =>
            (!q || `${o.number} ${o.customer.name}`.toLowerCase().includes(q)) &&
            (!st || st.includes(o.status)) &&
            (!ps || ps.includes(o.paymentStatus)),
        );
        if (get('sort') === 'total')
          rows = [...rows].sort((a, b) =>
            get('dir') === 'asc' ? a.totalMinor - b.totalMinor : b.totalMinor - a.totalMinor,
          );
        return reply({
          data: rows.map(orderListItem),
          meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
        });
      }
      const [, id, action] = rest.split('/');
      const o = orderState.list.find((x) => x.id === id);
      if (!o)
        return reply(
          { error: { code: 'NOT_FOUND', message: 'Order not found', statusCode: 404 } },
          404,
        );
      if (action === 'status') {
        const b = req.postDataJSON() as { status: string };
        orderState.statuses.push(b);
        o.status = b.status;
        o.events.unshift({
          id: `abababab-abab-4bab-8bab-${String(900 + orderState.statuses.length).padStart(12, '0')}`,
          type: 'status',
          description: `Status changed to ${b.status}`,
          actor: { id: USER.id, name: USER.name },
          createdAt: iso(0),
        });
        return reply(o);
      }
      if (action === 'payments') {
        const b = req.postDataJSON() as { amountMinor: number; method: string };
        orderState.payments.push(b);
        o.paidMinor += b.amountMinor;
        o.outstandingMinor = o.totalMinor - o.paidMinor;
        o.paymentStatus = o.paidMinor >= o.totalMinor ? 'PAID' : 'PARTIALLY_PAID';
        o.payments.unshift({
          id: 'cdcdcdcd-cdcd-4dcd-8dcd-000000000001',
          amountMinor: b.amountMinor,
          method: b.method,
          reference: null,
          note: null,
          paidAt: iso(0),
          recordedBy: { id: USER.id, name: USER.name },
        });
        return reply(o);
      }
      return reply(o);
    }
    if (p.startsWith(`/workspaces/${WS}/automations`)) {
      const rest = p.slice(`/workspaces/${WS}/automations`.length);
      const url = new URL(req.url());
      if (rest === '/summary')
        return reply({
          total: autoState.list.length,
          active: autoState.list.filter((a) => a.status === 'ACTIVE').length,
          draft: autoState.list.filter((a) => a.status === 'DRAFT').length,
          inactive: autoState.list.filter((a) => a.status === 'INACTIVE').length,
          periodDays: 30,
          runs: 4,
          succeeded: 3,
          failed: 1,
        });
      if (rest === '/executions') {
        const st = url.searchParams.get('status')?.split(',');
        const rows = [EXEC(1, 'SUCCEEDED'), EXEC(2, 'FAILED')].filter(
          (e) => !st || st.includes(e.status),
        );
        return reply({
          data: rows,
          meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
        });
      }
      if (rest.startsWith('/executions/')) {
        const parts = rest.split('/');
        if (parts[3] === 'retry') {
          autoState.retried.push(parts[2]!);
          return reply({ ...EXEC(2, 'QUEUED'), context: {}, steps: [], plannedSteps: [] });
        }
        const failed = parts[2]!.endsWith('02');
        return reply({
          ...EXEC(failed ? 2 : 1, failed ? 'FAILED' : 'SUCCEEDED'),
          context: { order: { number: 1001, total: 900 } },
          steps: [
            {
              stepId: 's1',
              type: 'Continue only if 1 condition match',
              status: 'ok',
              message: 'Conditions matched',
              at: iso(30),
            },
            ...(failed
              ? [
                  {
                    stepId: 'failure',
                    type: 'error',
                    status: 'failed',
                    message: 'The order no longer exists',
                    at: iso(30),
                  },
                ]
              : [
                  {
                    stepId: 's2',
                    type: 'Add internal note to order',
                    status: 'ok',
                    message: 'Added an internal note to the order',
                    at: iso(30),
                  },
                ]),
          ],
          plannedSteps: [
            { id: 's1', summary: 'Continue only if 1 condition match' },
            { id: 's2', summary: 'Add internal note to order' },
          ],
        });
      }
      if (rest === '' && req.method() === 'POST') {
        const b = req.postDataJSON() as { name: string; trigger?: string; templateKey?: string };
        autoState.created.push(b);
        const a = automation(
          10 + autoState.created.length,
          b.name,
          'DRAFT',
          b.trigger ?? 'order.created',
          b.templateKey
            ? [{ id: 's1', type: 'action', action: 'add_order_note', config: { text: 'x' } }]
            : [],
        );
        autoState.list.unshift(a);
        return reply(a);
      }
      if (rest === '') {
        const q = (url.searchParams.get('q') ?? '').toLowerCase();
        const st = url.searchParams.get('status')?.split(',');
        const tr = url.searchParams.get('trigger');
        const rows = autoState.list.filter(
          (a) =>
            (!q || a.name.toLowerCase().includes(q)) &&
            (!st || st.includes(a.status)) &&
            (!tr || a.triggerType === tr),
        );
        return reply({
          data: rows.map(autoListItem),
          meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
        });
      }
      const [, id, action] = rest.split('/');
      const a = autoState.list.find((x) => x.id === id);
      if (!a)
        return reply(
          { error: { code: 'NOT_FOUND', message: 'Automation not found', statusCode: 404 } },
          404,
        );
      if (action === 'test') {
        autoState.tests.push(req.postDataJSON());
        return reply({
          execution: {
            ...EXEC(5, 'SUCCEEDED', { isTest: true, automationId: a.id }),
            context: {},
            plannedSteps: [],
            steps: [
              {
                stepId: 's2',
                type: 'Add internal note to order',
                status: 'simulated',
                message: 'Would: Add internal note to order. Nothing was changed.',
                at: iso(0),
              },
            ],
          },
          issues: [],
        });
      }
      if (action === 'publish') {
        if (a.issues.length)
          return reply(
            {
              error: {
                code: 'BAD_REQUEST',
                message: `Fix ${a.issues.length} problem before activating: ${a.issues[0]!.message}`,
                statusCode: 400,
              },
            },
            400,
          );
        autoState.published.push(a.id);
        a.status = 'ACTIVE';
        a.publishedVersion += 1;
        a.hasUnpublishedChanges = false;
        return reply(a);
      }
      if (action === 'deactivate') {
        autoState.deactivated.push(a.id);
        a.status = 'INACTIVE';
        return reply(a);
      }
      if (action === 'duplicate') {
        const c = automation(30, `Copy of ${a.name}`, 'DRAFT', a.triggerType, a.definition.steps);
        autoState.list.unshift(c);
        return reply(c);
      }
      if (req.method() === 'DELETE') {
        autoState.deleted.push(a.id);
        autoState.list = autoState.list.filter((x) => x.id !== a.id);
        return route.fulfill({ status: 204, headers: cors });
      }
      if (req.method() === 'PATCH') {
        const b = req.postDataJSON() as { name?: string; definition?: AutoDetail['definition'] };
        autoState.patches.push(b);
        if (b.name) a.name = b.name;
        if (b.definition) {
          a.definition = b.definition;
          a.stepCount = b.definition.steps.length;
          a.draftRevision += 1;
          a.hasUnpublishedChanges = a.status === 'ACTIVE';
          a.issues = [];
        }
        return reply(a);
      }
      return reply(a);
    }
    if (p.endsWith('/read')) return reply(CONVS[0]);
    return reply({ error: { code: 'NOT_FOUND', message: `unmocked ${p}`, statusCode: 404 } }, 404);
  });
  // Realtime is not part of UI smoke tests.
  await page.route('http://localhost:4000/socket.io/**', (r) => r.abort());
}
