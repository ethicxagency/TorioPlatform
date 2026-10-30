import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER } from './data';
import { niceMax, num, smooth } from './format';
import { buildDashboardModel, buildOrderDetail, buildSearchItems, type ModelInput } from './model';

const base: ModelInput = {
  range: '30d',
  channel: 'all',
  metric: 'conv',
  demoState: 'Populated',
  refreshing: false,
  brainOk: true,
  messengerConnected: true,
  mobile: false,
  contentWidth: 1200,
  order: DEFAULT_ORDER,
  hidden: {},
};

describe('format helpers', () => {
  it('formats numbers with Indian grouping', () => expect(num(1284000)).toBe('12,84,000'));
  it('niceMax rounds up to a friendly axis max', () => expect(niceMax(1234)).toBe(1500));
  it('smooth returns empty for no points', () => expect(smooth([])).toBe(''));
});

describe('buildDashboardModel', () => {
  it('populates four KPIs and eight widgets', () => {
    const m = buildDashboardModel(base);
    expect(m.kpis.map((k) => k.label)).toEqual([
      'Conversations',
      'Leads generated',
      'Orders generated',
      'Revenue',
    ]);
    expect(m.kpis[0]!.value).toBe('1,284');
    expect(m.widgets).toHaveLength(8);
    expect(m.widgets.every((w) => w.show)).toBe(true);
  });

  it('pairs widgets into 12-column rows on wide layouts', () => {
    const m = buildDashboardModel(base);
    expect(m.widgets.slice(0, 2).map((w) => w.span)).toEqual([8, 4]);
    expect(m.widgets.every((w) => w.span <= 12)).toBe(true);
  });

  it('stacks widgets on narrow layouts', () => {
    const m = buildDashboardModel({ ...base, contentWidth: 800 });
    expect(m.widgets.every((w) => w.span === 12)).toBe(true);
  });

  it('shows empty states for a new workspace', () => {
    const m = buildDashboardModel({ ...base, demoState: 'Empty (new workspace)' });
    expect(m.kpis[0]!.value).toBe('—');
    expect(m.widgets.every((w) => w.empty)).toBe(true);
  });

  it('flags error only on overview and channels', () => {
    const m = buildDashboardModel({ ...base, demoState: 'Error' });
    expect(m.widgets.filter((w) => w.error).map((w) => w.k)).toEqual(['overview', 'channels']);
  });

  it('treats a disconnected Messenger as an empty channel view', () => {
    const m = buildDashboardModel({ ...base, channel: 'facebook', messengerConnected: false });
    expect(m.empty).toBe(true);
  });

  it('respects hidden widgets', () => {
    const m = buildDashboardModel({ ...base, hidden: { funnel: true, team: true } });
    expect(m.widgets).toHaveLength(6);
  });
});

describe('order detail & search', () => {
  it('returns a timeline for delivered orders', () => {
    const d = buildOrderDetail('#ORD-10342')!;
    expect(d.timeline.at(-1)!.text).toBe('Delivered');
    expect(buildOrderDetail('nope')).toBeNull();
  });
  it('flags pending orders as needing confirmation', () => {
    expect(buildOrderDetail('#ORD-10351')!.needsConfirm).toBe(true);
  });
  it('defaults search to waiting conversations and filters by query', () => {
    expect(buildSearchItems('').heading).toBe('Waiting for a reply');
    expect(buildSearchItems('ORD-10351').items[0]).toMatchObject({ kind: 'order' });
    expect(buildSearchItems('zzzz').items).toHaveLength(0);
  });
});
