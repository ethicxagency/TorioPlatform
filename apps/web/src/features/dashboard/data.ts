// Demo data for the dashboard prototype. All numbers are fictional.

export type RangeKey = 'today' | '7d' | '30d' | 'month' | 'custom';
export type ChannelKey = 'whatsapp' | 'instagram' | 'facebook';
export type MetricKey = 'conv' | 'new' | 'resolved';
export type DemoState = 'Populated' | 'Loading' | 'Empty (new workspace)' | 'Error';

export interface RangeDef {
  k: RangeKey;
  l: string;
  f: number;
  n: number;
  label: string;
  prev: string;
}

export const RANGES: RangeDef[] = [
  { k: 'today', l: 'Today', f: 0.045, n: 7, label: 'Today', prev: 'yesterday' },
  { k: '7d', l: 'Last 7 days', f: 0.24, n: 7, label: '23–29 Oct', prev: 'previous 7 days' },
  { k: '30d', l: 'Last 30 days', f: 1, n: 30, label: '30 Sep–29 Oct', prev: 'previous 30 days' },
  {
    k: 'month',
    l: 'This month',
    f: 0.94,
    n: 29,
    label: '1–29 Oct',
    prev: 'same period last month',
  },
  { k: 'custom', l: 'Custom range…', f: 0.5, n: 15, label: '1–15 Oct', prev: 'previous 15 days' },
];

export const DELTAS: Record<RangeKey, number[]> = {
  today: [9.1, 4.2, -6.0, 3.4],
  '7d': [6.3, 11.5, 2.1, 8.9],
  '30d': [12.4, 8.1, -3.2, 6.7],
  month: [10.8, 7.4, -1.9, 5.2],
  custom: [4.5, 2.8, 1.1, 3.0],
};

export interface ChannelDef {
  name: string;
  color: string;
  share: number;
  unread: number;
  waiting: number;
  long: number;
  complaints: number;
  hot: number;
  pending: number;
  resp: string;
  leads: number;
  orders: number;
}

export const CH: Record<ChannelKey, ChannelDef> = {
  whatsapp: {
    name: 'WhatsApp',
    color: '#25D366',
    share: 0.52,
    unread: 9,
    waiting: 6,
    long: 1,
    complaints: 1,
    hot: 3,
    pending: 2,
    resp: '4m 12s',
    leads: 0.55,
    orders: 0.62,
  },
  instagram: {
    name: 'Instagram',
    color: '#E4405F',
    share: 0.3,
    unread: 6,
    waiting: 4,
    long: 1,
    complaints: 1,
    hot: 2,
    pending: 1,
    resp: '7m 40s',
    leads: 0.33,
    orders: 0.29,
  },
  facebook: {
    name: 'Messenger',
    color: '#1877F2',
    share: 0.18,
    unread: 3,
    waiting: 2,
    long: 2,
    complaints: 0,
    hot: 0,
    pending: 0,
    resp: '11m 05s',
    leads: 0.12,
    orders: 0.09,
  },
};

export const IC = {
  msgs: 'M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2zM18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1',
  users:
    'M18 21a8 8 0 0 0-16 0M10 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM22 20c0-3.4-2-6.5-4-8a5 5 0 0 0-.5-8.3',
  bag: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  chart:
    'M12 16v5M16 14v7M20 10v11M22 3l-8.6 8.6a.5.5 0 0 1-.7 0L9.4 8.4a.5.5 0 0 0-.7 0L2 15M4 18v3M8 14v7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  reply: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  alert:
    'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  brain:
    'M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.8 4 4 0 0 0 .6 6.6A4 4 0 1 0 12 18zM12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.8 4 4 0 0 1-.6 6.6A4 4 0 1 1 12 18zM12 5v13',
  plug: 'M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z',
  team: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M12 14.5c3.3 0 6 2.2 6 5.5',
};

export interface NavDef {
  label: string;
  icon: string;
  active?: boolean;
  subs?: boolean;
}

export const NAV: NavDef[] = [
  { label: 'Dashboard', active: true, icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  {
    label: 'Inbox',
    subs: true,
    icon: 'M3 12l2-8h14l2 8M3 12h6a3 3 0 0 0 6 0h6v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  },
  {
    label: 'Leads',
    icon: 'M10 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8zM3 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5M18 5v4M16 7h4',
  },
  {
    label: 'Customers',
    icon: 'M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3 20c0-3.6 2.8-6 6-6s6 2.4 6 6M16 6.4a2.6 2.6 0 0 1 0 5.2M14 15c2.4.3 4 2 4 5',
  },
  { label: 'Orders', icon: 'M4 8l8-4 8 4-8 4-8-4zM4 8v9l8 4 8-4V8M12 12v9' },
  { label: 'Team', icon: IC.team },
  {
    label: 'Channels',
    icon: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM17 7l3-3M4 20l3-3',
  },
  { label: 'Automation', icon: 'M13 2L5 14h6l-2 8 10-12h-6z' },
  { label: 'Brain', icon: IC.brain },
  // Always last in the customer portal navigation.
  {
    label: 'Settings',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v2.5M12 18.5V21M4.2 4.2l1.8 1.8M18 18l1.8 1.8M3 12h2.5M18.5 12H21M4.2 19.8l1.8-1.8M18 6l1.8-1.8',
  },
];

export type WidgetKey =
  'overview' | 'attention' | 'channels' | 'ai' | 'conversations' | 'orders' | 'funnel' | 'team';

export interface WidgetDef {
  k: WidgetKey;
  l: string;
  sub: string;
  w: number;
  icon: string;
}

export const WIDGETS: WidgetDef[] = [
  {
    k: 'overview',
    l: 'Conversation Overview',
    sub: "Understand your team's messaging workload.",
    w: 8,
    icon: IC.msgs,
  },
  { k: 'attention', l: 'Needs Attention', sub: 'What to handle next.', w: 4, icon: IC.alert },
  {
    k: 'channels',
    l: 'Channel Performance',
    sub: 'How each messaging channel is doing.',
    w: 7,
    icon: IC.plug,
  },
  {
    k: 'ai',
    l: 'AI Performance',
    sub: 'How Brain-powered suggestions help your team.',
    w: 5,
    icon: IC.brain,
  },
  {
    k: 'conversations',
    l: 'Recent Conversations',
    sub: 'Latest customer messages.',
    w: 7,
    icon: IC.reply,
  },
  {
    k: 'orders',
    l: 'Recent Orders',
    sub: 'Orders created from conversations.',
    w: 5,
    icon: IC.bag,
  },
  {
    k: 'funnel',
    l: 'Leads & Sales Funnel',
    sub: 'From first message to purchase.',
    w: 6,
    icon: IC.users,
  },
  { k: 'team', l: 'Team Activity', sub: 'Workload and response performance.', w: 6, icon: IC.team },
];

export const DEFAULT_ORDER: WidgetKey[] = WIDGETS.map((w) => w.k);

export type ConvStatus = 'Waiting' | 'Assigned' | 'Resolved';
export const CONVS: {
  name: string;
  ch: ChannelKey;
  msg: string;
  status: ConvStatus;
  agent: string | null;
  time: string;
}[] = [
  {
    name: 'Tanvir Hasan',
    ch: 'whatsapp',
    msg: 'Delivery charge koto?',
    status: 'Waiting',
    agent: 'Rahim Haque',
    time: '4m',
  },
  {
    name: 'Nusrat Jahan',
    ch: 'instagram',
    msg: 'Is this available in black?',
    status: 'Assigned',
    agent: 'Nadia Islam',
    time: '12m',
  },
  {
    name: 'Fahim Ahmed',
    ch: 'facebook',
    msg: 'I want to confirm my order.',
    status: 'Resolved',
    agent: 'Farid Ahmed',
    time: '26m',
  },
  {
    name: 'Ayesha Siddiqua',
    ch: 'instagram',
    msg: 'My vase arrived broken — what do I do now?',
    status: 'Waiting',
    agent: null,
    time: '38m',
  },
  {
    name: 'Shakil Ahmed',
    ch: 'whatsapp',
    msg: '2 pcs লাগবে, cash on delivery হবে?',
    status: 'Assigned',
    agent: 'Rahim Haque',
    time: '1h',
  },
  {
    name: 'Rakib Hossain',
    ch: 'facebook',
    msg: 'Sylhet e ki delivery dey?',
    status: 'Waiting',
    agent: null,
    time: '2h',
  },
  {
    name: 'Mim Rahman',
    ch: 'instagram',
    msg: 'Can I get a discount?',
    status: 'Assigned',
    agent: 'Nadia Islam',
    time: '3h',
  },
];

export type OrderStatus =
  'Pending' | 'Confirmed' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
export interface OrderDef {
  id: string;
  customer: string;
  amount: number;
  status: OrderStatus;
  ch: ChannelKey | null;
  date: string;
  items: [string, number, number][];
  delivery: number;
  payment: string;
}

export const ORDERS: OrderDef[] = [
  {
    id: '#ORD-10351',
    customer: 'Shakil Ahmed',
    amount: 2900,
    status: 'Pending',
    ch: 'whatsapp',
    date: 'Today, 1:12 PM',
    items: [['Nordic Ceramic Vase', 2, 1450]],
    delivery: 60,
    payment: 'Cash on delivery',
  },
  {
    id: '#ORD-10348',
    customer: 'Tanvir Hasan',
    amount: 1510,
    status: 'Confirmed',
    ch: 'whatsapp',
    date: 'Today, 11:40 AM',
    items: [['Nordic Ceramic Vase', 1, 1450]],
    delivery: 60,
    payment: 'Cash on delivery',
  },
  {
    id: '#ORD-10342',
    customer: 'Ayesha Siddiqua',
    amount: 1510,
    status: 'Delivered',
    ch: 'instagram',
    date: 'Yesterday',
    items: [['Nordic Ceramic Vase', 1, 1450]],
    delivery: 60,
    payment: 'bKash',
  },
  {
    id: '#ORD-10339',
    customer: 'Fahim Ahmed',
    amount: 1850,
    status: 'Shipped',
    ch: 'facebook',
    date: 'Yesterday',
    items: [['Linen Cushion Cover', 2, 865]],
    delivery: 120,
    payment: 'Cash on delivery',
  },
  {
    id: '#ORD-10305',
    customer: 'Nusrat Jahan',
    amount: 1050,
    status: 'Processing',
    ch: 'instagram',
    date: '27 Oct',
    items: [['Bamboo Serving Board', 1, 990]],
    delivery: 60,
    payment: 'bKash',
  },
  {
    id: '#ORD-10297',
    customer: 'Mim Rahman',
    amount: 3260,
    status: 'Cancelled',
    ch: null,
    date: '26 Oct',
    items: [['Rattan Storage Basket', 2, 1600]],
    delivery: 60,
    payment: 'Cash on delivery',
  },
];

export const TEAM = [
  { name: 'Farid Ahmed', handled: 297, frt: '6m 25s', resolved: 251, pending: 3 },
  { name: 'Nadia Islam', handled: 368, frt: '5m 10s', resolved: 330, pending: 4 },
  { name: 'Rahim Haque', handled: 412, frt: '3m 50s', resolved: 371, pending: 2 },
  { name: 'Sumon Chowdhury', handled: 207, frt: '8m 02s', resolved: 176, pending: 3 },
];

export const STATUS: Record<string, [string, string]> = {
  Waiting: ['#A15C00', '#FFF7E6'],
  Assigned: ['#4F50D1', '#F0F0FF'],
  Resolved: ['#16803A', '#ECFDF3'],
  Pending: ['#A15C00', '#FFF7E6'],
  Confirmed: ['#4F50D1', '#F0F0FF'],
  Processing: ['#2563EB', '#EFF6FF'],
  Shipped: ['#0E7490', '#ECFEFF'],
  Delivered: ['#16803A', '#ECFDF3'],
  Cancelled: ['#C53030', '#FFF1F2'],
};
