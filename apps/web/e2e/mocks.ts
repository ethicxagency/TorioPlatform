import type { Page } from '@playwright/test';

import { evaluateMaturity, type BrainConfig } from '@torio/contracts';

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
/** Global search requests the UI sent, and a switch to make the endpoint fail. */
export const searchState = { requests: [] as string[], fail: false };

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

export const brainState = {
  version: 3,
  puts: [] as unknown[],
  /** A saved config set by a test; otherwise the default sparse one. */
  config: null as unknown,
};
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
export const channelState = {
  list: [] as ReturnType<typeof chan>[],
  patches: [] as unknown[],
  /** When true the providers endpoint reports Meta as configured on the server. */
  metaConfigured: false,
  starts: [] as unknown[],
  selects: [] as unknown[],
  cancels: [] as string[],
  failKeys: [] as string[],
  checks: [] as string[],
};
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
  channelState.metaConfigured = false;
  channelState.starts = [];
  channelState.selects = [];
  channelState.cancels = [];
  channelState.failKeys = [];
  channelState.checks = [];
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
  updates: [] as unknown[],
  failUpdate: false,
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
  orderState.updates = [];
  orderState.failUpdate = false;
};
resetOrders();
export const orderListItem = (o: OrderDetail) => {
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

/** Multi-store: extra stores beside the main one, which is active until the person switches. */
export const STORE_2 = '22222222-2222-4222-8222-222222222222';
export const storesState = {
  extra: [] as Record<string, unknown>[],
  activeId: WS as string,
  noStores: false,
  created: [] as Record<string, unknown>[],
  switches: [] as string[],
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
    image: null,
    providers: [],
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
    reportingTimeZone: 'Asia/Dhaka',
    defaultCurrency: null,
    contactEmail: null,
    logo: null,
    phone: null,
    industry: null,
    country: null,
    addressLine: null,
    city: null,
    state: null,
    postalCode: null,
    status: 'ACTIVE',
    createdAt: USER.createdAt,
  };
  settingsState.workspacePatches = [];
  storesState.extra = [];
  storesState.activeId = WS;
  storesState.noStores = false;
  storesState.created = [];
  storesState.switches = [];
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

const PLAN = (
  key: string,
  name: string,
  rank: number,
  monthly: number,
  limits: Record<string, number>,
  over: Record<string, unknown> = {},
) => ({
  key,
  name,
  description: `${name} plan`,
  rank,
  recommended: key === 'growth',
  currency: 'BDT',
  monthlyMinor: monthly,
  yearlyMinor: monthly * 10,
  placeholderPricing: rank > 0,
  purchasable: true,
  limits,
  features: [`${name} feature`],
  ...over,
});
const LIM = (m: number, c: number) => ({
  members: m,
  channels: 2,
  contacts: c,
  messages: 5000,
  whatsapp: 500,
  instagram: 500,
  messenger: 500,
});
export const PLANS_MOCK = [
  PLAN(
    'free',
    'Free',
    0,
    0,
    { ...LIM(2, 100), channels: 1, messages: 500 },
    { purchasable: false, placeholderPricing: false },
  ),
  PLAN('starter', 'Starter', 1, 150_000, LIM(5, 2000)),
  PLAN('growth', 'Growth', 2, 450_000, LIM(15, 20000)),
  PLAN('scale', 'Scale', 3, 1_200_000, {
    members: -1,
    channels: -1,
    contacts: -1,
    messages: -1,
    whatsapp: -1,
    instagram: -1,
    messenger: -1,
  }),
];
type Sub = null | {
  planKey: string;
  interval: 'MONTH' | 'YEAR';
  status: string;
  cancelAtPeriodEnd: boolean;
};
export const billingState = {
  configured: true,
  sub: null as Sub,
  failed: false,
  profile: {} as Record<string, string | null>,
  profilePuts: [] as unknown[],
  cards: [] as {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
  }[],
  calls: [] as { path: string; body: unknown }[],
  overMembers: false,
  noInvoices: false,
  invoiceQueries: [] as Record<string, string>[],
};
export const resetBilling = () => {
  billingState.noInvoices = false;
  billingState.invoiceQueries = [];
  billingState.configured = true;
  billingState.sub = null;
  billingState.failed = false;
  billingState.profile = Object.fromEntries(
    [
      'companyName',
      'contactName',
      'billingEmail',
      'phone',
      'country',
      'state',
      'city',
      'addressLine',
      'postalCode',
      'taxId',
    ].map((k) => [k, null]),
  );
  billingState.profilePuts = [];
  billingState.cards = [
    {
      id: 'c3c3c3c3-c3c3-4c3c-8c3c-000000000001',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
      isDefault: true,
    },
    {
      id: 'c3c3c3c3-c3c3-4c3c-8c3c-000000000002',
      brand: 'mastercard',
      last4: '1111',
      expMonth: 3,
      expYear: 2029,
      isDefault: false,
    },
  ];
  billingState.calls = [];
  billingState.overMembers = false;
};
resetBilling();
const INVOICES = [
  {
    id: 'd4d4d4d4-d4d4-4d4d-8d4d-000000000001',
    number: 'INV-0003',
    status: 'FAILED',
    currency: 'USD',
    totalMinor: 4900,
    periodStart: iso(60 * 24 * 5),
    periodEnd: iso(-60 * 24 * 25),
    planKey: 'growth',
    description: 'Growth subscription',
    issuedAt: iso(60 * 24 * 5),
    hostedUrl: null,
    canRetry: true,
  },
  {
    id: 'd4d4d4d4-d4d4-4d4d-8d4d-000000000002',
    number: 'INV-0002',
    status: 'PAID',
    currency: 'USD',
    totalMinor: 4900,
    periodStart: iso(60 * 24 * 35),
    periodEnd: iso(60 * 24 * 5),
    planKey: 'growth',
    description: 'Growth subscription',
    issuedAt: iso(60 * 24 * 35),
    hostedUrl: null,
    canRetry: false,
  },
];

const url2 = (u: string) => new URL(u);
const ADM = (n: number) => `ad0ad0ad-ad0a-4d0a-8d0a-0000000000${String(n).padStart(2, '0')}`;
export const adminState = {
  signedIn: false,
  logins: [] as unknown[],
  posts: [] as { path: string; body: Record<string, unknown> }[],
  patches: [] as { path: string; body: Record<string, unknown> }[],
  customers: [] as {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    status: 'ACTIVE' | 'DISABLED';
    workspaceCount: number;
    planKey: string;
    planName: string;
    subscriptionStatus: string;
    suspendedReason?: string;
  }[],
  plans: [] as Record<string, unknown>[],
};
export const metaAdminState = {
  values: {} as Record<string, unknown>,
  appSecret: false,
  verifyToken: false,
  saves: [] as { patch: Record<string, unknown>; confirm?: boolean }[],
  secrets: [] as { path: string; body: Record<string, unknown> }[],
  tests: [] as string[],
  reencrypts: 0,
};
export const resetMetaAdmin = () => {
  metaAdminState.values = {
    appName: 'Torio',
    appId: '123456789',
    apiVersion: 'v27.0',
    businessId: null,
    appMode: 'DEVELOPMENT',
    appDomain: null,
    websiteUrl: null,
    oauthRedirectUri: 'https://app.example.test/api/v1/channels/meta/callback',
    allowedRedirectUris: ['https://app.example.test/api/v1/channels/meta/callback'],
    oauthStateTtlMinutes: 10,
    allowedDomains: ['app.example.test'],
    successUrl: null,
    failureUrl: null,
    webhookBaseUrl: 'https://app.example.test',
    webhookEnabled: true,
    whatsappConfigId: null,
    discoverWhatsapp: false,
    messengerEnabled: true,
    instagramEnabled: true,
    whatsappEnabled: true,
  };
  metaAdminState.appSecret = true;
  metaAdminState.verifyToken = true;
  metaAdminState.saves = [];
  metaAdminState.secrets = [];
  metaAdminState.tests = [];
  metaAdminState.reencrypts = 0;
};
resetMetaAdmin();
export const resetAdmin = () => {
  resetMetaAdmin();
  adminState.signedIn = false;
  adminState.logins = [];
  adminState.posts = [];
  adminState.patches = [];
  adminState.customers = [
    {
      id: ADM(1),
      name: 'Nadia Rahman',
      email: 'nadia@acme.test',
      createdAt: iso(60 * 24 * 40),
      status: 'ACTIVE',
      workspaceCount: 2,
      planKey: 'growth',
      planName: 'Growth',
      subscriptionStatus: 'ACTIVE',
    },
    {
      id: ADM(2),
      name: 'Karim Hossain',
      email: 'karim@beta.test',
      createdAt: iso(60 * 24 * 3),
      status: 'ACTIVE',
      workspaceCount: 1,
      planKey: 'free',
      planName: 'Free',
      subscriptionStatus: 'NONE',
    },
  ];
  const lim = (m: number) => ({
    members: m,
    channels: 2,
    contacts: 1000,
    messages: 5000,
    whatsapp: 500,
    instagram: 500,
    messenger: 500,
  });
  adminState.plans = [
    {
      key: 'free',
      name: 'Free',
      description: '',
      rank: 0,
      recommended: false,
      currency: 'USD',
      monthlyMinor: 0,
      yearlyMinor: 0,
      placeholderPricing: false,
      limits: lim(2),
      aiCredits: -1,
      features: [],
      priceIdMonth: null,
      priceIdYear: null,
      status: 'ACTIVE',
      subscribers: 0,
    },
    {
      key: 'growth',
      name: 'Growth',
      description: '',
      rank: 2,
      recommended: true,
      currency: 'USD',
      monthlyMinor: 4900,
      yearlyMinor: 49000,
      placeholderPricing: true,
      limits: lim(15),
      aiCredits: 1000,
      features: ['Priority support'],
      priceIdMonth: 'price_g',
      priceIdYear: null,
      status: 'ACTIVE',
      subscribers: 3,
    },
    {
      key: 'legacy',
      name: 'Legacy',
      description: '',
      rank: 1,
      recommended: false,
      currency: 'USD',
      monthlyMinor: 900,
      yearlyMinor: 9000,
      placeholderPricing: false,
      limits: lim(3),
      aiCredits: -1,
      features: [],
      priceIdMonth: null,
      priceIdYear: null,
      status: 'DISABLED',
      subscribers: 0,
    },
  ];
};
resetAdmin();
const ADMIN_USER = {
  id: ADM(90),
  email: 'root@torio.test',
  name: 'Platform Owner',
  role: 'SUPER_ADMIN',
};
const adminSubs = [
  {
    id: ADM(20),
    providerSubscriptionId: 'sub_1NabcDEFghiJKL',
    source: 'PROVIDER',
    customer: { name: 'Nadia Rahman', email: 'nadia@acme.test' },
    workspace: { id: ADM(30), name: 'Acme Store' },
    planKey: 'growth',
    planName: 'Growth',
    interval: 'MONTH',
    amountMinor: 4900,
    currency: 'USD',
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
    startedAt: iso(60 * 24 * 30),
    renewsAt: iso(-60 * 24 * 5),
    grantReason: null,
  },
  {
    id: ADM(21),
    providerSubscriptionId: 'manual_x',
    source: 'MANUAL',
    customer: { name: 'Karim Hossain', email: 'karim@beta.test' },
    workspace: { id: ADM(31), name: 'Beta Shop' },
    planKey: 'growth',
    planName: 'Growth',
    interval: 'YEAR',
    amountMinor: -1,
    currency: null,
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
    startedAt: iso(60 * 24 * 2),
    renewsAt: null,
    grantReason: 'Partner',
  },
];

export const dashboardState = {
  requests: [] as {
    from: string;
    to: string;
    compare: string;
    channel?: string;
    granularity?: string;
  }[],
  /** When true, nothing needs attention (empty state). */
  calm: false,
  /** Responses for this `from` are delayed (ms) to exercise out-of-order responses. */
  delayFrom: '' as string,
  delayMs: 0,
  fail: false,
};
export const resetDashboard = () => {
  dashboardState.requests = [];
  dashboardState.delayFrom = '';
  dashboardState.delayMs = 0;
  dashboardState.fail = false;
  dashboardState.calm = false;
};
function analyticsFor(from: string, to: string, compare: string) {
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((t - f) / 86_400_000) + 1;
  const buckets = Array.from({ length: Math.min(days, 31) }, (_, i) =>
    new Date(f + i * 86_400_000).toISOString().slice(0, 10),
  );
  return {
    range: { from, to },
    timeZone: 'Asia/Dhaka',
    granularity: 'day',
    revenue: {
      byCurrency: [
        { currency: 'USD', amountMinor: days * 10_000 },
        { currency: 'EUR', amountMinor: 500 },
      ],
      primaryCurrency: 'USD',
    },
    orders: { total: days * 2, cancelled: 1 },
    customers: { total: 100 + days, new: days },
    subscription: {
      onFreePlan: false,
      planKey: 'growth',
      planName: 'Growth',
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    },
    messaging: { total: days * 3, new: days, resolved: days * 2, waiting: 4, unread: 6 },
    leads: { total: days + 5 },
    byChannel: {
      revenue: { WHATSAPP: days * 6_000, INSTAGRAM: days * 3_000, unattributed: days * 1_000 },
      orders: { WHATSAPP: days, INSTAGRAM: days },
      conversations: {
        WHATSAPP: days * 2,
        INSTAGRAM: Math.ceil(days / 2),
        MESSENGER: Math.floor(days / 2),
      },
      leads: { WHATSAPP: days, INSTAGRAM: 3, MESSENGER: 2 },
      newCustomers: { WHATSAPP: days },
    },
    attention: dashboardState.calm
      ? {
          waitingLong: { count: 0, thresholdMinutes: 120, oldest: null },
          waiting: { count: 0, averageWaitMinutes: null },
          staleLeads: { count: 0, idleHours: 24 },
          pendingOrders: { count: 0 },
        }
      : {
          waitingLong: {
            count: 2,
            thresholdMinutes: 120,
            oldest: {
              conversationId: 'conv-oldest',
              customerName: 'Rakib Hossain',
              provider: 'MESSENGER',
              waitingSince: new Date(Date.now() - 125 * 60_000).toISOString(),
            },
          },
          waiting: { count: 4, averageWaitMinutes: 18 },
          staleLeads: { count: 5, idleHours: 24 },
          pendingOrders: { count: 3 },
        },
    series: {
      buckets,
      conversations: buckets.map((_, i) => 20 + ((i * 7) % 13)),
      newConversations: buckets.map((_, i) => 5 + (i % 4)),
      resolvedConversations: buckets.map((_, i) => 15 + (i % 6)),
      leads: buckets.map((_, i) => i % 3),
      revenue: buckets.map((_, i) => (i + 1) * 1000),
      orders: buckets.map((_, i) => i % 4),
      newCustomers: buckets.map(() => 1),
      totalCustomers: buckets.map((_, i) => 100 + i),
    },
    comparison:
      compare === 'none'
        ? null
        : {
            mode: compare,
            range: { from: '2025-01-01', to: '2025-01-07' },
            coverage: 'full',
            previous: { revenue: [], orders: 1, newCustomers: 1, customers: 90 },
            changes: { revenue: 18.5, orders: -4.2, newCustomers: 12.3, customers: null },
          },
    activity: [
      {
        id: 'o-1',
        type: 'order',
        title: `Order #1001 created · $${days}.00`,
        at: `${to}T10:00:00.000Z`,
      },
    ],
    dataSince: '2024-01-01T00:00:00.000Z',
  };
}

export const CONVS = [
  conversation('33333333-3333-4333-8333-000000000001', 'Tanvir Hasan', 'WHATSAPP', 2),
  conversation('33333333-3333-4333-8333-000000000002', 'Ayesha Siddiqua', 'INSTAGRAM', 0),
];

/** Deterministic API for UI tests: no database needed. Registers before page.goto. */
/** Inbox bulk requests the UI sent, for assertions. */
export const inboxState = { bulks: [] as Record<string, unknown>[] };

/** Customer authentication mock: what the API would answer, and what the pages sent. */
export const authState = {
  config: { google: true, facebook: true, email: true, registrationOpen: true },
  registers: [] as unknown[],
  logins: [] as unknown[],
  forgots: [] as unknown[],
  resets: [] as unknown[],
  verifies: [] as unknown[],
  resends: 0,
  /** Emails already registered (409 on sign-up). */
  taken: new Set<string>(['taken@test.dev']),
  /** Tokens the reset/verify endpoints accept. */
  goodTokens: new Set<string>(['good-token-0000000000000000000']),
  failLoginWith: null as number | null,
};
/** Super Admin's Customer Authentication (Torio Auth) Meta app. */
export const metaAuthState = {
  values: {
    appName: 'Torio Auth' as string | null,
    appId: '2321020315413901' as string | null,
    apiVersion: 'v27.0',
    appMode: 'LIVE' as 'DEVELOPMENT' | 'LIVE' | null,
    appDomain: 'app.example.test' as string | null,
    websiteUrl: null as string | null,
    customerAuthRedirectUri: null as string | null,
    customerAuthAllowedRedirectUris: [] as string[],
  },
  secret: false,
  saves: [] as unknown[],
  secrets: [] as string[],
  tests: 0,
};
export function resetMetaAuth() {
  metaAuthState.secret = false;
  metaAuthState.saves = [];
  metaAuthState.secrets = [];
  metaAuthState.tests = 0;
}

/** Account deletion pages. */
export const deletionState = {
  requests: [] as unknown[],
  signedIn: [] as unknown[],
  verifies: [] as string[],
  mailConfigured: true,
  goodToken: 'good-deletion-token-000000000000',
};
export function resetDeletion() {
  deletionState.requests = [];
  deletionState.signedIn = [];
  deletionState.verifies = [];
  deletionState.mailConfigured = true;
}

export function resetAuth() {
  authState.config = { google: true, facebook: true, email: true, registrationOpen: true };
  authState.registers = [];
  authState.logins = [];
  authState.forgots = [];
  authState.resets = [];
  authState.verifies = [];
  authState.resends = 0;
  authState.failLoginWith = null;
}

export async function mockApi(
  page: Page,
  opts: { role?: 'OWNER' | 'ADMIN' | 'AGENT'; signedOut?: boolean } = {},
) {
  const role = opts.role ?? 'AGENT';
  let signedOut = !!opts.signedOut;
  // `/` serves the dashboard only to a browser holding the routing cookie the app sets after sign-in (see src/proxy.ts).
  if (!signedOut)
    await page
      .context()
      .addCookies([{ name: 'torio_authed', value: '1', url: 'http://localhost:3100' }]);
  inboxState.bulks = [];
  searchState.requests = [];
  searchState.fail = false;
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
    if (p === '/account-deletion/requests' && req.method() === 'POST') {
      deletionState.requests.push(req.postDataJSON());
      return deletionState.mailConfigured
        ? reply({ verificationSent: true, reference: null, status: null }, 202)
        : reply(
            {
              error: {
                message:
                  'Email delivery isn’t set up for this Torio deployment, so a verification link can’t be sent.',
              },
            },
            503,
          );
    }
    if (p === '/account-deletion/requests/me') {
      const b = req.postDataJSON() as { password?: string };
      deletionState.signedIn.push(b);
      if (b.password && b.password !== 'Correct-pass-1')
        return reply({ error: { message: 'That password is not correct.' } }, 401);
      return b.password
        ? reply({
            verificationSent: false,
            reference: 'TDR-AAAAA-BBBBB-CCCCC-DDDDD',
            status: 'VERIFIED',
          })
        : reply({ verificationSent: true, reference: null, status: null });
    }
    if (p === '/account-deletion/verify') {
      const b = req.postDataJSON() as { token: string };
      deletionState.verifies.push(b.token);
      return b.token === deletionState.goodToken
        ? reply({
            reference: 'TDR-11111-22222-33333-44444',
            status: 'VERIFIED',
            createdAt: iso(5),
            updatedAt: iso(0),
            rejectionReason: null,
          })
        : reply({ error: { message: 'This confirmation link is invalid or has expired.' } }, 400);
    }
    if (p.startsWith('/account-deletion/requests/')) {
      const ref = decodeURIComponent(p.split('/').pop()!);
      return ref === 'TDR-11111-22222-33333-44444'
        ? reply({
            reference: ref,
            status: 'PROCESSING',
            createdAt: iso(60),
            updatedAt: iso(1),
            rejectionReason: null,
          })
        : reply({ error: { message: 'No request with that reference.' } }, 404);
    }
    if (p === '/auth/config') return reply(authState.config);
    if (p === '/auth/login') {
      const b = req.postDataJSON() as { email: string; password: string };
      authState.logins.push(b);
      if (authState.failLoginWith)
        return reply({ error: { message: 'Too many requests' } }, authState.failLoginWith);
      if (b.password !== 'Correct-pass-1')
        return reply({ error: { message: 'Invalid email or password' } }, 401);
      signedOut = false;
      return reply({ accessToken: 'test-token', expiresIn: 900, user: USER });
    }
    if (p === '/auth/register') {
      const b = req.postDataJSON() as { email: string };
      authState.registers.push(b);
      if (authState.taken.has(b.email))
        return reply({ error: { message: 'An account with this email already exists' } }, 409);
      signedOut = false;
      return reply(
        { accessToken: 'test-token', expiresIn: 900, user: { ...USER, emailVerified: false } },
        201,
      );
    }
    if (p === '/auth/forgot-password') {
      authState.forgots.push(req.postDataJSON());
      return reply({ ok: true });
    }
    if (p === '/auth/reset-password') {
      const b = req.postDataJSON() as { token: string };
      authState.resets.push(b);
      return authState.goodTokens.has(b.token)
        ? reply({ reset: true })
        : reply({ error: { message: 'This reset link is invalid or has expired.' } }, 400);
    }
    if (p === '/auth/verify-email') {
      const b = req.postDataJSON() as { token: string };
      authState.verifies.push(b);
      return authState.goodTokens.has(b.token)
        ? reply({ verified: true })
        : reply({ error: { message: 'This verification link is invalid or has expired.' } }, 400);
    }
    if (p === '/auth/resend-verification') {
      authState.resends++;
      return reply({ sent: true, alreadyVerified: false });
    }
    if (p === '/auth/refresh')
      return signedOut
        ? reply({ error: { message: 'Missing refresh token' } }, 401)
        : reply({ accessToken: 'test-token', expiresIn: 900, user: USER });
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
    const storeList = (): Record<string, unknown>[] => {
      const all: Record<string, unknown>[] = storesState.noStores
        ? [...storesState.extra]
        : [{ ...settingsState.workspace, role }, ...storesState.extra];
      const withActive = all.map((w) => ({ ...w, active: w.id === storesState.activeId }));
      if (withActive.length && !withActive.some((w) => w.active)) withActive[0]!.active = true;
      return [...withActive.filter((w) => w.active), ...withActive.filter((w) => !w.active)];
    };
    if (p === '/workspaces' && req.method() === 'POST') {
      const b = req.postDataJSON() as Record<string, unknown>;
      if (b.slug === 'taken-store') return reply({ error: { message: 'taken' } }, 409);
      const created = {
        id: `3333333${storesState.created.length}-3333-4333-8333-333333333333`,
        description: null,
        status: 'ACTIVE',
        logo: null,
        phone: null,
        addressLine: null,
        city: null,
        state: null,
        postalCode: null,
        ...b,
        defaultCurrency: b.defaultCurrency,
        contactEmail: b.contactEmail,
        role: 'OWNER',
        createdAt: USER.createdAt,
      };
      storesState.created.push(b);
      storesState.extra.push(created);
      storesState.noStores = false;
      storesState.activeId = created.id as string;
      return reply({ ...created, active: true }, 201);
    }
    if (p === '/workspaces/active' && req.method() === 'PUT') {
      const { workspaceId } = req.postDataJSON() as { workspaceId: string };
      if (!storeList().some((w) => w.id === workspaceId))
        return reply({ error: { message: 'Store not found' } }, 404);
      storesState.switches.push(workspaceId);
      storesState.activeId = workspaceId;
      return reply(storeList());
    }
    if (p === '/workspaces/slug-check') {
      const slug = url.searchParams.get('slug') ?? '';
      return slug === 'taken-store'
        ? reply({
            slug,
            available: false,
            reason: 'This address is already taken',
            suggestion: 'taken-store-2',
          })
        : reply({ slug, available: true, reason: null, suggestion: null });
    }
    if (p === '/workspaces') return reply(storeList());
    if (p === `/workspaces/${WS}/conversations`)
      return reply({
        data: CONVS,
        meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
        counts: { open: 2, snoozed: 0, resolved: 0 },
        channelCounts: {
          all: CONVS.length,
          ...Object.fromEntries(
            (['WHATSAPP', 'INSTAGRAM', 'MESSENGER'] as const).map((k) => [
              k,
              CONVS.filter((c) => c.channel.provider === k).length,
            ]),
          ),
        },
      });
    if (p === `/workspaces/${WS}/conversations/bulk` && req.method() === 'POST') {
      const b = req.postDataJSON() as { ids: string[] } & Record<string, unknown>;
      inboxState.bulks.push(b);
      // Only ids the "workspace" knows are counted, like the real endpoint.
      return reply({ updated: b.ids.filter((id) => CONVS.some((c) => c.id === id)).length });
    }
    if (p === `/workspaces/${WS}/customers/tags`) return reply({ data: ['Hot Lead', 'vip'] });
    const one = CONVS.find((c) => p === `/workspaces/${WS}/conversations/${c.id}`);
    if (one) return reply(one);
    if (p.endsWith('/retry') && p.includes('/messages/')) return reply({ result: 'sent' });
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
            failureReason: null,
            createdAt: iso(10),
          },
          {
            id: 'eeeeeeee-eeee-4eee-8eee-000000000002',
            kind: 'OUTBOUND',
            body: 'Price 1,250 taka.',
            author: { id: USER.id, name: USER.name },
            replyTo: null,
            deliveryStatus: 'FAILED',
            failureReason: 'Outside the 24-hour window',
            createdAt: iso(5),
          },
        ],
        meta: { page: 1, pageSize: 200, total: 2, totalPages: 1 },
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
    if (p === `/workspaces/${WS}/teams`)
      return reply({
        data: [
          {
            id: 'abababab-0000-4000-8000-000000000001',
            name: 'Support',
            description: 'Answers customer questions',
            lead: { id: 'ffffffff-0000-4000-8000-000000000002', name: 'Nadia Islam' },
            members: [{ userId: 'ffffffff-0000-4000-8000-000000000002', name: 'Nadia Islam' }],
            openConversations: 3,
          },
          {
            id: 'abababab-0000-4000-8000-000000000002',
            name: 'Sales',
            description: '',
            lead: null,
            members: [],
            openConversations: 0,
          },
        ],
      });
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
    if (p === `/workspaces/${WS}/search`) {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      searchState.requests.push(q);
      if (searchState.fail)
        return reply({ error: { code: 'INTERNAL', message: 'boom', statusCode: 500 } }, 500);
      const hit = CONVS.filter((c) => c.customer.name.toLowerCase().includes(q));
      return reply({
        conversations: hit.map((c) => ({
          id: c.id,
          customerName: c.customer.name,
          provider: c.channel.provider,
          preview: c.lastMessagePreview,
          status: c.status,
        })),
        customers: hit.map((c) => ({
          id: c.customer.id,
          name: c.customer.name,
          phone: c.customer.phone,
          email: c.customer.email,
        })),
      });
    }
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
      const forCustomer = url.searchParams.get('customerId');
      const lq = (url.searchParams.get('q') ?? '').toLowerCase();
      const rows = (forCustomer ? LEADS.filter((l) => l.customerId === forCustomer) : LEADS).filter(
        (l) =>
          !lq || [l.name, l.email, l.company].some((v) => (v ?? '').toLowerCase().includes(lq)),
      );
      return reply({
        data: rows,
        meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
      });
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
        brainState.config = b.config;
        return reply({
          config: b.config,
          // The real server evaluates the document it just saved, with the same shared engine.
          maturity: evaluateMaturity(b.config as BrainConfig),
          version: brainState.version,
          updatedAt: iso(0),
          updatedBy: { id: USER.id, name: USER.name },
        });
      }
      const cfg = (brainState.config ?? brainConfig()) as BrainConfig;
      return reply({
        config: cfg,
        maturity: evaluateMaturity(cfg),
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
            state: channelState.metaConfigured ? 'available' : 'unavailable',
            method: pr === 'WHATSAPP' ? 'manual_token' : 'oauth',
            reason: channelState.metaConfigured
              ? 'Authorize with Facebook, then choose the account to connect.'
              : 'Meta isn’t configured on this server.',
            requirements: ['An account', 'A linked Page'],
            connectedCount: 0,
          })),
        });
      if (rest === '/meta/config')
        return reply({
          appId: '1234567890',
          graphVersion: 'v27.0',
          whatsappConfigId: null,
          whatsappDiscovery: true,
          permissions: [
            { scope: 'pages_show_list', reason: 'See which Facebook Pages you manage' },
            {
              scope: 'pages_messaging',
              reason: 'Receive and answer Messenger messages for your Page',
            },
          ],
        });
      if (rest === '/meta/start') {
        channelState.starts.push(req.postDataJSON());
        return reply({
          url: 'https://www.facebook.com/v27.0/dialog/oauth?client_id=1234567890&state=abc',
        });
      }
      if (rest.startsWith('/meta/sessions/')) {
        const sid = rest.split('/')[3];
        if (rest.endsWith('/cancel')) {
          channelState.cancels.push(sid);
          return reply({ ok: true });
        }
        if (rest.endsWith('/select')) {
          const b = req.postDataJSON() as { candidateKeys: string[] };
          channelState.selects.push(b);
          return reply({
            results: b.candidateKeys.map((key) => {
              const [provider, id] = key.split(':');
              const bad = channelState.failKeys.includes(key);
              channelState.failKeys = channelState.failKeys.filter((k) => k !== key); // fails once, then retry works
              return {
                key,
                provider,
                name:
                  id === '111'
                    ? 'Urban Nest Page'
                    : id === '222'
                      ? '@urbannest'
                      : '+880 1711-000001',
                status: bad ? 'FAILED' : 'CONNECTED',
                channelId: bad ? null : `77777777-7777-4777-8777-0000000000${id!.slice(0, 2)}`,
                message: bad ? 'Couldn’t subscribe to messages. Meta rejected the request.' : null,
              };
            }),
          });
        }
        return reply({
          id: sid,
          expiresAt: iso(-10),
          missingPermissions: [],
          candidates: [
            {
              key: 'MESSENGER:111',
              provider: 'MESSENGER',
              name: 'Urban Nest Page',
              detail: 'Page ID 111',
              imageUrl: null,
              eligible: true,
              reason: null,
              taken: false,
            },
            {
              key: 'INSTAGRAM:222',
              provider: 'INSTAGRAM',
              name: '@urbannest',
              detail: 'Professional account · Linked Page: Urban Nest Page',
              imageUrl: null,
              eligible: true,
              reason: null,
              taken: false,
            },
            {
              key: 'MESSENGER:333',
              provider: 'MESSENGER',
              name: 'Old Shop Page',
              detail: 'Page ID 333',
              imageUrl: null,
              eligible: true,
              reason: null,
              taken: true,
            },
            {
              key: 'WHATSAPP:444',
              provider: 'WHATSAPP',
              name: '+880 1711-000001',
              detail: 'Urban Nest · WABA',
              imageUrl: null,
              eligible: true,
              reason: null,
              taken: false,
            },
            {
              key: 'WHATSAPP:555',
              provider: 'WHATSAPP',
              name: '+880 1711-000002',
              detail: null,
              imageUrl: null,
              eligible: false,
              reason:
                'This number isn’t registered for the WhatsApp Cloud API yet. Finish setup with WhatsApp Embedded Signup.',
              taken: false,
            },
          ],
        });
      }
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
      if (action === 'health') {
        channelState.checks.push(ch.id);
        return reply({
          ok: true,
          checkedAt: iso(0),
          qualityRating: null,
          displayPhoneNumber: null,
          error: null,
        });
      }
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
      if (!action && req.method() === 'PATCH') {
        if (orderState.failUpdate)
          return reply(
            {
              error: {
                code: 'CONFLICT',
                message: 'The order changed while you were editing.',
                statusCode: 409,
              },
            },
            409,
          );
        const b = req.postDataJSON() as {
          items?: { name: string; sku?: string; quantity: number; unitPriceMinor: number }[];
          discountMinor?: number;
          shippingMinor?: number;
          taxMinor?: number;
          shippingAddress?: string | null;
          shippingMethod?: string | null;
        };
        orderState.updates.push(b);
        const items =
          b.items?.map((i, n) => ({
            id: `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`,
            name: i.name,
            sku: i.sku ?? null,
            quantity: i.quantity,
            unitPriceMinor: i.unitPriceMinor,
            lineTotalMinor: i.quantity * i.unitPriceMinor,
          })) ?? o.items;
        const discountMinor = b.discountMinor ?? o.discountMinor;
        const shippingMinor = b.shippingMinor ?? o.shippingMinor;
        const taxMinor = b.taxMinor ?? o.taxMinor;
        const subtotalMinor = items.reduce((a, i) => a + i.lineTotalMinor, 0);
        const totalMinor = subtotalMinor - discountMinor + shippingMinor + taxMinor;
        Object.assign(o, {
          items,
          discountMinor,
          shippingMinor,
          taxMinor,
          subtotalMinor,
          totalMinor,
          outstandingMinor: totalMinor - o.paidMinor,
          ...(b.shippingAddress !== undefined && { shippingAddress: b.shippingAddress }),
          ...(b.shippingMethod !== undefined && { shippingMethod: b.shippingMethod }),
        });
        return reply(o);
      }
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
    if (p.startsWith(`/workspaces/${WS}/billing`)) {
      const rest = p.slice(`/workspaces/${WS}/billing`.length);
      const sub = billingState.sub;
      const plan = PLANS_MOCK.find((x) => x.key === (sub?.planKey ?? 'free'))!;
      if (req.method() !== 'GET')
        billingState.calls.push({ path: `${req.method()} ${rest}`, body: req.postDataJSON?.() });
      if (rest === '/overview')
        return reply({
          providerConfigured: billingState.configured,
          provider: billingState.configured ? 'stripe' : null,
          onFreePlan: !sub,
          plan,
          subscription: sub && {
            currentPeriodStart: iso(60 * 24 * 5),
            currentPeriodEnd: iso(-60 * 24 * 25),
            trialEnd: null,
            startedAt: iso(60 * 24 * 60),
            canceledAt: null,
            ...sub,
          },
          actions: !sub
            ? {
                canCheckout: true,
                canChange: false,
                canCancel: false,
                canResume: false,
                canRetryPayment: false,
                access: 'full',
              }
            : sub.status === 'PAST_DUE'
              ? {
                  canCheckout: false,
                  canChange: false,
                  canCancel: true,
                  canResume: false,
                  canRetryPayment: true,
                  access: 'limited',
                }
              : sub.cancelAtPeriodEnd
                ? {
                    canCheckout: false,
                    canChange: false,
                    canCancel: false,
                    canResume: true,
                    access: 'full_until_period_end',
                  }
                : {
                    canCheckout: false,
                    canChange: true,
                    canCancel: true,
                    canResume: false,
                    canRetryPayment: false,
                    access: 'full',
                  },
          nextPayment:
            sub && !sub.cancelAtPeriodEnd
              ? {
                  date: iso(-60 * 24 * 25),
                  amountMinor: plan.monthlyMinor,
                  currency: 'USD',
                  placeholderPricing: true,
                }
              : null,
          hasFailedPayment: billingState.failed || sub?.status === 'PAST_DUE',
          usage: {
            metric: 'members',
            used: 3,
            limit: plan.limits.members as number,
            percent: Math.min(
              100,
              Math.round((3 / Math.max(1, plan.limits.members as number)) * 100),
            ),
          },
          aiCredits: { metered: false },
        });
      if (rest === '/plans') return reply({ data: PLANS_MOCK });
      if (rest === '/usage')
        return reply({
          planKey: plan.key,
          periodStart: iso(60 * 24 * 10),
          periodEnd: iso(-60 * 24 * 20),
          data: [
            ['members', 'Team members', 3, 2],
            ['channels', 'Connected channels', 1, 5],
            ['contacts', 'Contacts', 80, 100],
            ['messages', 'Messages sent (this month)', 10, -1],
          ].map(([metric, label, used, limit]) => {
            const l = limit as number;
            const u = used as number;
            const pct = l < 0 ? 0 : Math.min(100, Math.round((u / l) * 100));
            return {
              metric,
              label,
              used: u,
              limit: l,
              remaining: l < 0 ? -1 : Math.max(0, l - u),
              percent: pct,
              level:
                l < 0
                  ? 'unlimited'
                  : u >= l
                    ? 'reached'
                    : pct >= 90
                      ? 'near'
                      : pct >= 70
                        ? 'approaching'
                        : 'ok',
            };
          }),
          notTracked: ['AI conversations', 'AI credits consumed', 'Storage'],
        });
      if (rest === '/profile') {
        if (req.method() === 'PUT') {
          const b = req.postDataJSON() as Record<string, string>;
          billingState.profilePuts.push(b);
          for (const [k, v] of Object.entries(b))
            billingState.profile[k] = v === '' ? null : k === 'country' ? v.toUpperCase() : v;
        }
        return reply(billingState.profile);
      }
      if (rest === '/payment-methods') return reply({ data: billingState.cards });
      if (rest === '/payment-methods/session')
        return reply({ url: 'http://localhost:3100/billing?result=success&pm=1' });
      if (rest.startsWith('/payment-methods/')) {
        const id = rest.split('/')[2]!;
        if (req.method() === 'DELETE')
          billingState.cards = billingState.cards.filter((c) => c.id !== id);
        else billingState.cards = billingState.cards.map((c) => ({ ...c, isDefault: c.id === id }));
        return reply({ data: billingState.cards });
      }
      if (rest === '/invoices') {
        const sp = url2(req.url()).searchParams;
        const st = sp.get('status');
        const q = (sp.get('q') ?? '').toLowerCase();
        const from = sp.get('from');
        const to = sp.get('to');
        billingState.invoiceQueries.push(Object.fromEntries(sp.entries()));
        const day = (i: { issuedAt: string }) => i.issuedAt.slice(0, 10);
        const rows = (billingState.noInvoices ? [] : INVOICES).filter(
          (i) =>
            (!st || i.status === st) &&
            (!q || `${i.number} ${i.planKey}`.toLowerCase().includes(q)) &&
            (!from || day(i) >= from) &&
            (!to || day(i) <= to),
        );
        const all = billingState.noInvoices ? [] : INVOICES;
        return reply({
          data: rows,
          // whole-history summary, never narrowed by the filters
          summary: {
            total: all.length,
            paid: all.filter((i) => i.status === 'PAID').length,
            outstanding: all.some((i) => i.status === 'FAILED' || i.status === 'PENDING')
              ? [
                  {
                    currency: 'USD',
                    amountMinor: all
                      .filter((i) => i.status === 'FAILED' || i.status === 'PENDING')
                      .reduce((a, i) => a + i.totalMinor, 0),
                  },
                ]
              : [],
          },
          meta: { page: 1, pageSize: 10, total: rows.length, totalPages: 1 },
        });
      }
      if (rest.endsWith('/retry'))
        return reply({ accepted: true, message: 'Payment retry submitted.' });
      if (rest.startsWith('/invoices/')) {
        const i = INVOICES.find((x) => rest.includes(x.id))!;
        return reply({
          ...i,
          subtotalMinor: 4900,
          taxMinor: 0,
          amountPaidMinor: i.status === 'PAID' ? 4900 : 0,
          paymentSummary: i.status === 'PAID' ? 'Card ending 4242' : null,
          lines: [{ description: 'Growth plan', quantity: 1, amountMinor: 4900 }],
          customer: { ...billingState.profile },
          seller: { name: 'Torio', note: 'Legal entity details are not configured yet.' },
        });
      }
      if (rest === '/subscription/preview') {
        const b = req.postDataJSON() as { planKey: string; interval: 'MONTH' | 'YEAR' };
        const t = PLANS_MOCK.find((x) => x.key === b.planKey)!;
        const kind = !sub
          ? 'upgrade'
          : t.key === plan.key
            ? b.interval === sub.interval
              ? 'same'
              : 'interval'
            : t.rank > plan.rank
              ? 'upgrade'
              : 'downgrade';
        return reply({
          kind,
          planKey: t.key,
          interval: b.interval,
          priceMinor: b.interval === 'YEAR' ? t.yearlyMinor : t.monthlyMinor,
          currency: 'USD',
          placeholderPricing: t.rank > 0,
          effective:
            kind === 'upgrade'
              ? 'Takes effect immediately. The provider calculates any prorated charge.'
              : 'The provider applies the change immediately.',
          gained: kind === 'upgrade' ? [`${t.name} feature`] : [],
          lost: kind === 'downgrade' ? [`${plan.name} feature`] : [],
          overages:
            kind === 'downgrade' && billingState.overMembers
              ? [{ metric: 'members', label: 'Team members', used: 8, limit: 5 }]
              : [],
          blockedReason: kind === 'same' ? 'This is already your plan.' : null,
        });
      }
      if (rest === '/subscription/checkout')
        return reply({ url: 'http://localhost:3100/billing?result=success' });
      if (rest === '/subscription/change') {
        const b = req.postDataJSON() as { acknowledgeOverage?: boolean };
        if (billingState.overMembers && !b.acknowledgeOverage)
          return reply(
            {
              error: {
                code: 'CONFLICT',
                message: 'Your current usage exceeds this plan’s limits.',
                statusCode: 409,
              },
            },
            409,
          );
        return reply({
          accepted: true,
          message: 'Plan change submitted. It shows here once the provider confirms it.',
        });
      }
      if (rest === '/subscription/cancel')
        return reply({
          accepted: true,
          message:
            'Cancellation scheduled for the end of the billing period. It shows here once the provider confirms it.',
        });
      if (rest === '/subscription/resume')
        return reply({ accepted: true, message: 'Reactivation submitted.' });
    }
    if (p.startsWith('/admin/')) {
      const rest = p.slice('/admin'.length);
      const method = req.method();
      if (rest === '/auth/login') {
        const b = req.postDataJSON() as { password: string };
        adminState.logins.push(b);
        if (b.password !== 'correct-horse-battery')
          return reply(
            {
              error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid email or password',
                statusCode: 401,
              },
            },
            401,
          );
        adminState.signedIn = true;
        return reply(ADMIN_USER);
      }
      if (rest === '/auth/logout') {
        adminState.signedIn = false;
        return reply({ ok: true });
      }
      if (!adminState.signedIn)
        return reply(
          { error: { code: 'UNAUTHORIZED', message: 'Admin sign-in required', statusCode: 401 } },
          401,
        );
      if (rest === '/auth/me') return reply(ADMIN_USER);
      if (rest.startsWith('/integrations/meta-auth')) {
        const m = rest.slice('/integrations/meta-auth'.length);
        const st = metaAuthState;
        const cb = 'https://app.example.test/api/v1/auth/oauth/facebook/callback';
        const view = () => ({
          values: st.values,
          sources: { appId: 'database' },
          secrets: {
            appSecret: { configured: st.secret, source: st.secret ? 'database' : 'unset' },
          },
          credentialsFrom: st.secret ? 'database' : 'none',
          derived: {
            callbackPath: '/api/v1/auth/oauth/facebook/callback',
            generatedRedirectUri: st.values.customerAuthRedirectUri ?? cb,
            matchesRoute: true,
            registerInMeta: st.values.customerAuthRedirectUri ?? cb,
            scopes: ['public_profile', 'email'],
            suggestedAppId: '2321020315413901',
          },
          status: st.secret ? 'CONFIGURED' : 'INCOMPLETE',
          problems: st.secret
            ? []
            : [
                {
                  field: 'appSecret',
                  message: 'App Secret is required for customers to sign in with Facebook.',
                  severity: 'error',
                },
              ],
          lastLoginAt: null,
          lastTestAt: st.tests ? iso(1) : null,
          lastTestOk: st.tests ? true : null,
          updatedAt: iso(30),
          updatedBy: 'root@torio.test',
        });
        if (m === '/config' && method === 'GET') return reply(view());
        if (m === '/config' && method === 'PUT') {
          const patch = (req.postDataJSON() as { patch: Record<string, unknown> }).patch;
          st.saves.push(patch);
          Object.assign(st.values, patch);
          return reply(view());
        }
        if (m === '/secrets/app-secret') {
          if (method === 'PUT') st.secret = true;
          else st.secret = false;
          st.secrets.push(method);
          return reply(view());
        }
        if (m === '/test') {
          st.tests++;
          return reply({
            ok: true,
            checkedAt: iso(0),
            httpStatus: 200,
            metaCode: null,
            message: 'Meta accepted the App ID and App Secret.',
            resolution: null,
            details: [{ label: 'App name at Meta', value: 'Torio Auth' }],
          });
        }
      }
      if (rest.startsWith('/integrations/meta')) {
        const m = rest.slice('/integrations/meta'.length);
        const st = metaAdminState;
        const view = () => ({
          values: st.values,
          sources: { appId: 'database', oauthRedirectUri: 'database', apiVersion: 'database' },
          secrets: {
            appSecret: { configured: st.appSecret, source: st.appSecret ? 'database' : 'unset' },
            webhookVerifyToken: {
              configured: st.verifyToken,
              source: st.verifyToken ? 'database' : 'unset',
            },
          },
          derived: {
            callbackPath: '/api/v1/channels/meta/callback',
            redirectUriToRegister: st.values.oauthRedirectUri,
            metaWebhookUrl: 'https://app.example.test/api/v1/webhooks/meta',
            whatsappWebhookUrl: 'https://app.example.test/api/v1/webhooks/whatsapp',
          },
          status: 'CONFIGURED',
          problems: [],
          deploymentLevel: [
            { name: 'CHANNEL_ENCRYPTION_KEY', purpose: 'Master key', configured: true },
          ],
          updatedAt: iso(30),
          updatedBy: 'root@torio.test',
        });
        if (m === '/config' && method === 'GET') return reply(view());
        if (m === '/config/preview') {
          const patch = (req.postDataJSON() as { patch: Record<string, unknown> }).patch;
          const changes = Object.keys(patch)
            .filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(st.values[k]))
            .map((field) => ({
              field,
              before: String(st.values[field] ?? '(unset)'),
              after: String(patch[field] ?? '(unset)'),
            }));
          const risky = changes.some((c) => c.field === 'appId');
          const bad = typeof patch.appId === 'string' && !/^\d{6,20}$/.test(patch.appId);
          return reply({
            changes,
            impacts: risky
              ? [
                  {
                    severity: 'danger',
                    message:
                      'Changing the App ID points Torio at a different Meta app; connected channels will likely need to be reconnected.',
                  },
                ]
              : [],
            requiresConfirmation: risky,
            errors: bad
              ? [{ field: 'appId', message: 'The App ID is the numeric id from Meta' }]
              : [],
          });
        }
        if (m === '/config' && method === 'PUT') {
          const b = req.postDataJSON() as { patch: Record<string, unknown>; confirm?: boolean };
          st.saves.push(b);
          Object.assign(st.values, b.patch);
          return reply(view());
        }
        if (m.startsWith('/secrets/')) {
          st.secrets.push({
            path: `${method} ${m}`,
            body: (req.postDataJSON() ?? {}) as Record<string, unknown>,
          });
          if (m.endsWith('/generate')) return reply({ token: 'generated-token-ABCDEF' });
          if (method === 'PUT' && m.includes('app-secret')) st.appSecret = true;
          if (method === 'PUT' && m.includes('verify-token')) st.verifyToken = true;
          return reply(view());
        }
        if (m.startsWith('/test/')) {
          st.tests.push(m.slice(6));
          return reply({
            ok: !m.endsWith('/webhook'),
            checkedAt: iso(0),
            httpStatus: 200,
            metaCode: null,
            message: m.endsWith('/webhook')
              ? 'Meta’s registered webhooks don’t match what Torio serves.'
              : 'Meta accepted the App ID and App Secret.',
            resolution: m.endsWith('/webhook') ? 'Set the callback URL in Meta.' : null,
            details: [{ label: 'API version used', value: 'v27.0' }],
          });
        }
        if (m === '/diagnostics')
          return reply({
            checkedAt: iso(0),
            checks: [
              {
                key: 'credentials',
                label: 'App ID and App Secret',
                status: 'ok',
                detail: 'Configured.',
              },
              {
                key: 'webhookVerify',
                label: 'Webhook verified by Meta',
                status: 'unknown',
                detail: 'Not verified yet.',
              },
            ],
            webhook: {
              lastVerifiedAt: null,
              lastReceivedAt: null,
              processed24h: 4,
              failed24h: 1,
              pending: 0,
              recentErrors: [
                { at: iso(10), provider: 'MESSENGER', error: 'Could not load profile' },
              ],
            },
            products: [
              {
                key: 'LOGIN',
                label: 'Facebook Login for Business',
                enabled: true,
                requiredPermissions: ['pages_show_list'],
                connectedChannels: 0,
                attention: 0,
                appReview: 'unknown',
                warnings: [],
              },
              {
                key: 'MESSENGER',
                label: 'Messenger',
                enabled: true,
                requiredPermissions: ['pages_messaging'],
                connectedChannels: 2,
                attention: 1,
                appReview: 'unknown',
                warnings: [],
              },
            ],
          });
        if (m === '/security' && method === 'GET')
          return reply({
            algorithm: 'AES-256-GCM (per-secret random IV, authenticated)',
            masterKeyConfigured: true,
            previousKeyConfigured: true,
            secretsSealedWith: { current: 3, previous: st.reencrypts ? 0 : 2, unreadable: 0 },
            rotationPending: !st.reencrypts,
            lastKeyRotationAt: null,
            notes: ['The master key is a deployment secret.'],
          });
        if (m === '/security/reencrypt') {
          st.reencrypts++;
          return reply({ reencrypted: 2, alreadyCurrent: 3, failed: 0 });
        }
        if (m.startsWith('/activity'))
          return reply({
            data: [
              {
                id: ADM(90),
                action: 'meta.config.update',
                adminEmail: 'root@torio.test',
                reason: null,
                metadata: { status: 'success', fields: ['appId'] },
                ipAddress: '127.0.0.1',
                createdAt: iso(20),
              },
            ],
            meta: { page: 1, pageSize: 15, total: 1 },
          });
      }
      if (method !== 'GET')
        adminState.posts.push({
          path: `${method} ${rest}`,
          body: (req.postDataJSON() ?? {}) as Record<string, unknown>,
        });
      const url = new URL(req.url());
      const qp = (k: string) => url.searchParams.get(k);
      const pg = (rows: unknown[]) => ({
        data: rows,
        meta: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 },
      });
      if (rest === '/dashboard')
        return reply({
          customers: { total: 2, newLast30Days: 1, suspended: 0 },
          workspaces: { active: 3, suspended: 0 },
          subscriptions: { active: 1, trialing: 0, pastDue: 1 },
          mrr: { byCurrency: [{ currency: 'USD', amountMinor: 4900 }], unpricedSubscriptions: 0 },
          revenue: [
            {
              currency: 'USD',
              months: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(
                (month, i) => ({ month, amountMinor: i * 4900 }),
              ),
            },
          ],
          recentCustomers: adminState.customers.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            createdAt: c.createdAt,
          })),
          recentSubscriptions: [
            {
              id: ADM(20),
              workspace: 'Acme Store',
              planKey: 'growth',
              status: 'ACTIVE',
              createdAt: iso(100),
            },
          ],
          failedPayments: [
            {
              id: ADM(40),
              workspace: 'Gamma Ltd',
              number: 'INV-0009',
              totalMinor: 4900,
              currency: 'USD',
              issuedAt: iso(300),
            },
          ],
        });
      if (rest === '/customers') {
        const q = (qp('q') ?? '').toLowerCase();
        const rows = adminState.customers.filter(
          (c) =>
            (!q || `${c.name} ${c.email}`.toLowerCase().includes(q)) &&
            (!qp('status') || c.status === qp('status')) &&
            (!qp('subscription') || c.subscriptionStatus === qp('subscription')),
        );
        return reply(pg(rows));
      }
      if (rest.startsWith('/customers/')) {
        const [, , id, action] = rest.split('/');
        const c = adminState.customers.find((x) => x.id === id)!;
        if (action === 'suspend') {
          c.status = 'DISABLED';
          c.suspendedReason = (req.postDataJSON() as { reason: string }).reason;
        }
        if (action === 'reactivate') c.status = 'ACTIVE';
        return reply({
          ...c,
          emailVerified: true,
          suspendedAt: c.status === 'DISABLED' ? iso(0) : null,
          suspendedReason: c.status === 'DISABLED' ? (c.suspendedReason ?? null) : null,
          workspaces: [
            {
              id: ADM(30),
              name: 'Acme Store',
              role: 'OWNER',
              status: 'ACTIVE',
              planKey: c.planKey,
              subscriptionStatus: c.subscriptionStatus,
            },
          ],
          invoices: [
            {
              id: ADM(41),
              number: 'INV-0004',
              status: 'PAID',
              totalMinor: 4900,
              currency: 'USD',
              issuedAt: iso(60 * 24 * 3),
              workspace: 'Acme Store',
            },
          ],
          activity: [{ action: 'auth.login', at: iso(60) }],
        });
      }
      if (rest === '/workspaces')
        return reply(
          pg(
            [
              {
                id: ADM(30),
                name: 'Acme Store',
                slug: 'acme',
                owner: { id: ADM(1), name: 'Nadia Rahman', email: 'nadia@acme.test' },
                members: 4,
                channels: 2,
                planKey: 'growth',
                planName: 'Growth',
                subscriptionStatus: 'ACTIVE',
                createdAt: iso(60 * 24 * 40),
                status: 'ACTIVE',
              },
            ].filter((w) => !qp('status') || w.status === qp('status')),
          ),
        );
      if (rest.startsWith('/workspaces/'))
        return reply({
          id: ADM(30),
          name: 'Acme Store',
          slug: 'acme',
          owner: { id: ADM(1), name: 'Nadia Rahman', email: 'nadia@acme.test' },
          members: 4,
          channels: 2,
          planKey: 'growth',
          planName: 'Growth',
          subscriptionStatus: 'ACTIVE',
          createdAt: iso(60 * 24 * 40),
          status: 'ACTIVE',
          suspendedAt: null,
          suspendedReason: null,
          subscription: {
            id: ADM(20),
            interval: 'MONTH',
            source: 'PROVIDER',
            renewsAt: iso(-60 * 24 * 5),
            cancelAtPeriodEnd: false,
          },
        });
      if (rest === '/subscriptions')
        return reply(pg(adminSubs.filter((s) => !qp('status') || s.status === qp('status'))));
      if (rest.startsWith('/subscriptions/')) {
        const sub = adminSubs.find((x) => rest.includes(x.id))!;
        if (rest.endsWith('/cancel'))
          return reply({
            accepted: true,
            pending: sub.source === 'PROVIDER',
            message:
              sub.source === 'PROVIDER'
                ? 'Cancellation requested from the payment provider. It shows here once the provider confirms it.'
                : 'The manually assigned plan was ended.',
          });
        return reply({
          ...sub,
          invoices: [
            {
              id: ADM(41),
              number: 'INV-0004',
              status: 'PAID',
              totalMinor: 4900,
              currency: 'USD',
              issuedAt: iso(60 * 24 * 3),
            },
          ],
          payments: [{ type: 'invoice.paid', outcome: 'processed', at: iso(60 * 24 * 3) }],
        });
      }
      if (rest === '/plans' && method === 'GET') return reply({ data: adminState.plans });
      if (rest === '/plans' && method === 'POST') {
        const b = req.postDataJSON() as Record<string, unknown>;
        const created = {
          ...b,
          aiCredits: (b.aiCredits as number | null) ?? -1,
          limits: Object.fromEntries(
            Object.entries(b.limits as object).map(([k, v]) => [k, v ?? -1]),
          ),
          status: 'DISABLED',
          subscribers: 0,
          placeholderPricing: b.placeholderPricing ?? false,
        };
        adminState.plans.push(created);
        return reply(created);
      }
      if (rest.startsWith('/plans/') && rest.endsWith('/status')) {
        const key = rest.split('/')[2]!;
        const plan = adminState.plans.find((x) => x.key === key)!;
        plan.status = (req.postDataJSON() as { status: string }).status;
        return reply(plan);
      }
      if (rest.startsWith('/plans/') && method === 'PATCH') {
        adminState.patches.push({
          path: rest,
          body: req.postDataJSON() as Record<string, unknown>,
        });
        return reply(adminState.plans.find((x) => x.key === rest.split('/')[2]));
      }
      if (rest === '/activity') {
        const rows =
          qp('source') === 'payments'
            ? [
                {
                  id: ADM(50),
                  at: iso(10),
                  actor: 'Payment provider',
                  action: 'invoice.payment_failed',
                  target: 'Gamma Ltd',
                  reason: null,
                  metadata: { outcome: 'processed' },
                },
              ]
            : [
                {
                  id: ADM(51),
                  at: iso(5),
                  actor: 'root@torio.test',
                  action: 'customer.suspend',
                  target: 'karim@beta.test',
                  reason: 'Fraud review',
                  metadata: null,
                },
                {
                  id: ADM(52),
                  at: iso(30),
                  actor: 'root@torio.test',
                  action: 'admin.login',
                  target: null,
                  reason: null,
                  metadata: null,
                },
              ];
        const q = (qp('q') ?? '').toLowerCase();
        return reply(pg(rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q))));
      }
      if (rest === '/settings')
        return reply({
          branding: { productName: 'Torio', legalName: '', supportEmail: '', invoiceNote: 'n/a' },
          registrationOpen: true,
          paymentProvider: {
            provider: null,
            configured: false,
            webhookSecretSet: false,
            priceIdsConfigured: 0,
            lastWebhookAt: null,
          },
          emailProvider: { configured: false, note: 'No email service is integrated.' },
        });
    }
    if (p === `/workspaces/${WS}/dashboard/analytics`) {
      const u = new URL(req.url());
      const from = u.searchParams.get('from')!;
      const to = u.searchParams.get('to')!;
      const compare = u.searchParams.get('compare') ?? 'none';
      const channel = u.searchParams.get('channel') ?? undefined;
      const granularity = u.searchParams.get('granularity') ?? undefined;
      dashboardState.requests.push({
        from,
        to,
        compare,
        ...(channel && { channel }),
        ...(granularity && { granularity }),
      });
      if (dashboardState.fail)
        return reply({ error: { code: 'INTERNAL', message: 'Boom', statusCode: 500 } }, 500);
      if (dashboardState.delayFrom && from === dashboardState.delayFrom)
        await new Promise((r) => setTimeout(r, dashboardState.delayMs));
      return reply(analyticsFor(from, to, compare));
    }
    if (p.endsWith('/read')) return reply(CONVS[0]);
    return reply({ error: { code: 'NOT_FOUND', message: `unmocked ${p}`, statusCode: 404 } }, 404);
  });
  // Realtime is not part of UI smoke tests.
  await page.route('http://localhost:4000/socket.io/**', (r) => r.abort());
}
