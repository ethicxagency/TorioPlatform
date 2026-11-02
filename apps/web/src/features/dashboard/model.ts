import {
  CH,
  CONVS,
  DEFAULT_ORDER,
  DELTAS,
  IC,
  ORDERS,
  RANGES,
  STATUS,
  TEAM,
  WIDGETS,
  type ChannelKey,
  type DemoState,
  type MetricKey,
  type RangeDef,
  type RangeKey,
  type WidgetKey,
} from './data';
import { bdt, ini, labelsFor, niceMax, num, series, smooth, spark } from './format';

export interface ModelInput {
  range: RangeKey;
  /** Overrides `range` with the dashboard's global selection (real dates), so every widget follows one range. */
  rangeOverride?: RangeDef;
  channel: 'all' | ChannelKey;
  metric: MetricKey;
  demoState: DemoState;
  refreshing: boolean;
  brainOk: boolean;
  messengerConnected: boolean;
  mobile: boolean;
  /** Width of the content area (viewport minus sidebar). */
  contentWidth: number;
  order: WidgetKey[];
  hidden: Partial<Record<WidgetKey, boolean>>;
}

/** Where an action points. Resolved to a route or "coming soon" toast by the UI. */
export type Target = 'inbox' | 'leads' | 'orders' | 'channels' | 'team' | 'brain';

export function buildDashboardModel(i: ModelInput) {
  const { mobile, contentWidth: cw } = i;
  const st = i.demoState;
  const loading = i.refreshing || st === 'Loading';
  const isError = !loading && st === 'Error';
  const isEmptyWs = st === 'Empty (new workspace)';
  const R = i.rangeOverride ?? RANGES.find((r) => r.k === i.range) ?? RANGES[2]!;
  const dl = DELTAS[R.k];
  const chKeys = (i.channel === 'all' ? (Object.keys(CH) as ChannelKey[]) : [i.channel]).filter(
    (k) => k !== 'facebook' || i.messengerConnected,
  );
  const share = chKeys.reduce((a, k) => a + CH[k].share, 0);
  const empty = isEmptyWs || share === 0;
  const sum = (f: (c: (typeof CH)[ChannelKey]) => number) =>
    chKeys.reduce((a, k) => a + f(CH[k]), 0);
  const waiting = sum((c) => c.waiting);
  const today = R.k === 'today';
  const convSeries = series(3, 1284 * R.f * share, R.n, today);
  const convTotal = Math.round(convSeries.reduce((a, b) => a + b, 0));
  const leads = Math.round(186 * R.f * sum((c) => c.leads));
  const orders = Math.round(94 * R.f * sum((c) => c.orders));
  const revenue = Math.round((284500 * R.f * sum((c) => c.orders)) / 500) * 500;

  const kp = (label: string, icon: string, val: string, seed: number) => ({
    label,
    icon,
    value: empty ? '—' : val,
    noData: empty,
    spark: spark(seed),
    sparkValues: series(seed, 100, 12, false),
    showSpark: !empty && !mobile && cw >= 560,
  });
  const kpis = [
    kp('Conversations', IC.msgs, num(convTotal), 3),
    kp('Leads generated', IC.users, num(leads), 5),
    kp('Orders generated', IC.bag, num(orders), 7),
    kp('Revenue', IC.chart, bdt(revenue), 9),
  ];

  // Overview chart
  const mult = { conv: 1, new: 0.46, resolved: 0.89 }[i.metric];
  const vals = convSeries.map((v) => v * mult);
  const prevVals = series(11, (1284 * R.f * share * mult) / (1 + dl[0]! / 100), R.n, today);
  const max = niceMax(Math.max(...vals, ...prevVals) * 1.08);
  const pt = (v: number, idx: number): [number, number] => [
    ((idx + 0.5) / R.n) * 100,
    100 - (v / max) * 100,
  ];
  const pts = vals.map(pt);
  const ppts = prevVals.map(pt);
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  const area = last && first ? line + `L${last[0]},100L${first[0]},100Z` : '';
  const labels = labelsFor(R);
  const step = Math.ceil(R.n / (cw < 700 ? 4 : 7));
  const metricLabel = { conv: 'conversations', new: 'new conversations', resolved: 'resolved' }[
    i.metric
  ];
  const ov = {
    summary: [
      { label: 'Total conversations', value: num(convTotal), color: '#0D253D' },
      { label: 'Resolved', value: num(convTotal * 0.89), color: '#0D253D' },
      { label: 'Waiting for reply', value: num(waiting), color: waiting ? '#A15C00' : '#0D253D' },
    ],
    yTicks: [1, 0.75, 0.5, 0.25, 0].map((f) => ({
      top: 100 - f * 100 + '%',
      label: num(max * f),
      line: f === 0 ? '#E3E8EE' : '#F1F2F4',
    })),
    area,
    line,
    prevLine: smooth(ppts),
    pts,
    vals,
    prevVals,
    labels,
    today,
    xLabels: labels.map((l, idx) => (idx % step === 0 ? l : '')),
    metricLabel,
    metricLabelCap: metricLabel[0]!.toUpperCase() + metricLabel.slice(1),
  };

  // Needs attention
  const tones = {
    danger: ['#C53030', '#FFF1F2', '#C53030'],
    warning: ['#A15C00', '#FFF7E6', '#A15C00'],
    indigo: ['#5B5CE2', '#F0F0FF', '#0D253D'],
    neutral: ['#5A6A82', '#F1F2F4', '#0D253D'],
  } as const;
  const attention = (
    [
      {
        n: sum((c) => c.long),
        title: 'conversations waiting over 2 hours',
        body: 'Oldest: Rakib Hossain on Messenger, 2h 5m',
        action: 'Open Inbox',
        target: 'inbox',
        icon: IC.clock,
        tone: 'danger',
      },
      {
        n: waiting,
        title: 'conversations waiting for a reply',
        body: 'Average wait in queue is 18 min',
        action: 'Open Inbox',
        target: 'inbox',
        icon: IC.reply,
        tone: 'warning',
      },
      {
        n: sum((c) => c.complaints),
        title: 'customer complaints',
        body: 'Damaged-item reports need human review',
        action: 'Review',
        target: 'inbox',
        icon: IC.alert,
        tone: 'danger',
      },
      {
        n: sum((c) => c.hot),
        title: 'high-priority leads need follow-up',
        body: 'Interested, but no reply in the last 24h',
        action: 'View Leads',
        target: 'leads',
        icon: IC.star,
        tone: 'indigo',
      },
      {
        n: sum((c) => c.pending),
        title: 'orders awaiting confirmation',
        body: 'Pending cash-on-delivery orders from today',
        action: 'View Orders',
        target: 'orders',
        icon: IC.bag,
        tone: 'neutral',
      },
    ] as const
  )
    .filter((a) => a.n > 0)
    .map((a) => ({
      ...a,
      count: a.n,
      color: tones[a.tone][0],
      bg: tones[a.tone][1],
      countColor: tones[a.tone][2],
    }));

  // Channels
  const allCh = i.channel === 'all' ? (Object.keys(CH) as ChannelKey[]) : [i.channel];
  const chShareTotal =
    allCh.reduce((a, k) => a + (k === 'facebook' && !i.messengerConnected ? 0 : CH[k].share), 0) ||
    1;
  const channelRows = allCh.map((k) => {
    const c = CH[k];
    const conn = k !== 'facebook' || i.messengerConnected;
    return {
      name: c.name,
      icon:
        k === 'facebook' ? ('MESSENGER' as const) : (k.toUpperCase() as 'WHATSAPP' | 'INSTAGRAM'),
      color: c.color,
      connected: conn,
      conv: num(1284 * R.f * c.share),
      unread: c.unread,
      unreadColor: c.unread ? '#0D253D' : '#66778E',
      resp: c.resp,
      leads: num(186 * R.f * c.leads),
      orders: num(94 * R.f * c.orders),
      share: Math.round((c.share / chShareTotal) * 100) + '%',
    };
  });

  // AI
  const aiF = R.f * share;
  const aiBlocks = [
    {
      label: 'AI-suggested replies',
      value: num(412 * aiF),
      note: 'shown to agents',
      color: '#0D253D',
    },
    {
      label: 'Accepted by agents',
      value: num(318 * aiF),
      note: '77%',
      color: '#0D253D',
    },
    { label: 'Human handoffs', value: num(46 * aiF), note: 'escalated by rules', color: '#0D253D' },
    {
      label: 'Questions to add to Brain',
      value: String(Math.max(1, Math.round(9 * Math.min(1, aiF * 2)))),
      note: 'no answer in knowledge',
      color: '#A15C00',
    },
  ];

  // Conversations & orders
  const convRows = CONVS.filter((c) => chKeys.includes(c.ch))
    .slice(0, 6)
    .map((c) => {
      const sc = STATUS[c.status]!;
      return {
        name: c.name,
        initials: ini(c.name),
        channel: CH[c.ch].name,
        icon:
          c.ch === 'facebook'
            ? ('MESSENGER' as const)
            : (c.ch.toUpperCase() as 'WHATSAPP' | 'INSTAGRAM'),
        color: CH[c.ch].color,
        msg: c.msg,
        status: c.status,
        sColor: sc[0],
        sBg: sc[1],
        agent: c.agent ? ini(c.agent) : '',
        agentTitle: c.agent || 'Unassigned',
        assigned: !!c.agent,
        time: c.time,
      };
    });
  const orderRows = ORDERS.filter((o) =>
    i.channel === 'all'
      ? o.ch !== 'facebook' || i.messengerConnected
      : o.ch === i.channel && chKeys.includes(o.ch),
  ).map((o) => {
    const sc = STATUS[o.status]!;
    return {
      id: o.id,
      customer: o.customer,
      amount: bdt(o.amount),
      status: o.status,
      sColor: sc[0],
      sBg: sc[1],
      color: o.ch ? CH[o.ch].color : '#C9CBD3',
      date: o.date,
    };
  });

  // Funnel
  const fBase = [186, 142, 71, 38].map((v) => Math.round(v * R.f * sum((c) => c.leads)));
  const fD = [dl[1]!, 5.2, -2.4, 3.8];
  const barColors = ['#5B5CE2', '#7677E8', '#9A9BEF', '#C0C1F6'];
  const funnel = ['New leads', 'Contacted', 'Qualified', 'Converted'].map((label, idx) => ({
    label,
    count: num(fBase[idx]!),
    width: Math.max(8, fBase[0] ? (fBase[idx]! / fBase[0]) * 100 : 0) + '%',
    bar: barColors[idx]!,
    textColor: idx < 2 ? '#fff' : '#2E2F8A',
    pct:
      idx === 0
        ? '—'
        : (fBase[idx - 1] ? Math.round((fBase[idx]! / fBase[idx - 1]!) * 100) : 0) + '%',
    delta: (fD[idx]! >= 0 ? '+' : '') + fD[idx]!.toFixed(1) + '%',
    deltaColor: fD[idx]! >= 0 ? '#16803A' : '#C53030',
  }));
  const funnelRate = fBase[0] ? ((fBase[3]! / fBase[0]) * 100).toFixed(1) + '%' : '—';

  // Team
  const tf = R.f * share;
  const maxH = Math.max(...TEAM.map((t) => t.handled));
  const team = TEAM.map((t) => ({
    name: t.name,
    initials: ini(t.name),
    handled: num(t.handled * tf),
    resolved: num(t.resolved * tf),
    frt: t.frt,
    pending: t.pending,
    pendColor: t.pending > 3 ? '#A15C00' : '#0D253D',
    load: Math.round((t.handled / maxH) * 100) + '%',
  }));
  const teamStats = [
    { label: 'Handled', value: num(1284 * tf), color: '#0D253D' },
    { label: 'Avg. first reply', value: '5m 41s', color: '#0D253D' },
    { label: 'Resolved', value: num(1128 * tf), color: '#0D253D' },
    { label: 'Pending assignment', value: '12', color: '#A15C00' },
  ];

  // Widget frames
  const EMPTY: Record<WidgetKey, [string, string, string, Target]> = {
    overview: [
      'No conversations yet',
      'Connect a messaging channel to start receiving customer messages.',
      'Connect channel',
      'channels',
    ],
    attention: [
      'Nothing needs attention',
      'Once customers message you, waiting chats and follow-ups show up here.',
      'Connect channel',
      'channels',
    ],
    channels: [
      'No connected channels',
      'Connect WhatsApp, Instagram or Messenger to see channel performance.',
      'Connect channel',
      'channels',
    ],
    ai: i.brainOk
      ? [
          'No AI activity yet',
          'Suggestions appear in Inbox once customers start messaging.',
          'Open Brain',
          'brain',
        ]
      : [
          'Your Brain setup is incomplete',
          'Add your business knowledge and AI instructions to improve AI-assisted replies.',
          'Configure Brain',
          'brain',
        ],
    conversations: [
      'No conversations yet',
      'Connect a messaging channel to start receiving customer messages.',
      'Connect channel',
      'channels',
    ],
    orders: [
      'No orders yet',
      'Create an order from any Inbox conversation and it will appear here.',
      'Go to Inbox',
      'inbox',
    ],
    funnel: [
      'No leads yet',
      'Leads are created when you qualify a conversation in Inbox.',
      'View Leads',
      'leads',
    ],
    team: [
      'No team activity yet',
      'Invite teammates to share the Inbox workload.',
      'Invite team',
      'team',
    ],
  };
  const ACT: Record<WidgetKey, [string, Target] | null> = {
    overview: ['Open Inbox', 'inbox'],
    attention: null,
    channels: ['Manage channels', 'channels'],
    ai: ['Open Brain', 'brain'],
    conversations: ['View all conversations', 'inbox'],
    orders: ['View all orders', 'orders'],
    funnel: ['View Leads', 'leads'],
    team: ['View Team', 'team'],
  };
  const SKEL: Record<WidgetKey, string> = {
    overview: '220px',
    attention: '200px',
    channels: '150px',
    ai: '150px',
    conversations: '240px',
    orders: '240px',
    funnel: '140px',
    team: '180px',
  };

  const twoCol = cw >= 1060;
  const visible = i.order.filter((k) => !i.hidden[k]).map((k) => WIDGETS.find((w) => w.k === k)!);
  const spans: Partial<Record<WidgetKey, number>> = {};
  if (twoCol) {
    for (let idx = 0; idx < visible.length; idx += 2) {
      const a = visible[idx]!;
      const b = visible[idx + 1];
      if (!b) {
        spans[a.k] = 12;
        break;
      }
      const sa = Math.round((a.w / (a.w + b.w)) * 12);
      spans[a.k] = sa;
      spans[b.k] = 12 - sa;
    }
  }
  const widgets = visible.map((w) => {
    const k = w.k;
    const err = isError && (k === 'overview' || k === 'channels');
    const emp =
      !loading &&
      !err &&
      (empty ||
        (k === 'ai' && !i.brainOk) ||
        (k === 'channels' && i.channel === 'facebook' && !i.messengerConnected));
    const e = EMPTY[k];
    const a = ACT[k];
    return {
      k,
      label: w.l,
      sub: w.sub,
      span: twoCol ? (spans[k] ?? 12) : 12,
      icon: w.icon,
      loading,
      error: err,
      empty: emp,
      show: !loading && !err && !emp,
      skelH: SKEL[k],
      emptyTitle: e[0],
      emptyBody: e[1],
      emptyAction: e[2],
      emptyTarget: e[3],
      action: !emp && a ? { label: a[0], target: a[1] } : null,
    };
  });

  return {
    loading,
    isError,
    empty,
    rangeDef: R,
    prevLabel: R.prev,
    kpis,
    ov,
    attention,
    channelRows,
    aiBlocks,
    convRows,
    orderRows,
    funnel,
    funnelRate,
    team,
    teamStats,
    widgets,
    waiting,
    order: i.order.length ? i.order : DEFAULT_ORDER,
  };
}

export type DashboardModel = ReturnType<typeof buildDashboardModel>;
export type WidgetModel = DashboardModel['widgets'][number];

export function buildOrderDetail(orderId: string | null) {
  const o = ORDERS.find((x) => x.id === orderId);
  if (!o) return null;
  const sc = STATUS[o.status]!;
  const tl: { text: string; time: string; dot: string }[] = [
    { text: 'Order created from conversation', time: o.date, dot: '#5B5CE2' },
  ];
  if (o.status !== 'Pending' && o.status !== 'Cancelled')
    tl.push({ text: 'Confirmed with customer', time: o.date, dot: '#5B5CE2' });
  if (['Processing', 'Shipped', 'Delivered'].includes(o.status))
    tl.push({ text: 'Packed for dispatch', time: '', dot: '#2563EB' });
  if (['Shipped', 'Delivered'].includes(o.status))
    tl.push({ text: 'Handed to courier', time: '', dot: '#0E7490' });
  if (o.status === 'Delivered') tl.push({ text: 'Delivered', time: '', dot: '#16803A' });
  if (o.status === 'Cancelled')
    tl.push({ text: 'Cancelled by customer', time: '', dot: '#C53030' });
  return {
    id: o.id,
    customer: o.customer,
    initials: ini(o.customer),
    amount: bdt(o.amount),
    status: o.status,
    sColor: sc[0],
    sBg: sc[1],
    date: o.date,
    color: o.ch ? CH[o.ch].color : '#C9CBD3',
    channel: o.ch ? CH[o.ch].name : 'Source not tracked',
    items: o.items.map(([name, qty, price]) => ({ name, qty, price: bdt(qty * price) })),
    delivery: bdt(o.delivery),
    payment: o.payment,
    timeline: tl,
    needsConfirm: o.status === 'Pending',
  };
}

export function buildSearchItems(q: string) {
  const s = q.trim().toLowerCase();
  const convItem = (c: (typeof CONVS)[number]) => ({
    kind: 'conversation' as const,
    initials: ini(c.name),
    name: c.name,
    sub: `${CH[c.ch].name} · ${c.msg}`,
  });
  const items = s
    ? [
        ...CONVS.filter(
          (c) => c.name.toLowerCase().includes(s) || c.msg.toLowerCase().includes(s),
        ).map(convItem),
        ...ORDERS.filter(
          (x) => x.id.toLowerCase().includes(s) || x.customer.toLowerCase().includes(s),
        ).map((x) => ({
          kind: 'order' as const,
          orderId: x.id,
          initials: '#',
          name: x.id,
          sub: `${x.customer} · ${bdt(x.amount)} · ${x.status}`,
        })),
      ]
    : CONVS.filter((c) => c.status === 'Waiting').map(convItem);
  return { heading: s ? 'Results' : 'Waiting for a reply', items: items.slice(0, 6) };
}
