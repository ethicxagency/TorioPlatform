import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER } from './data';
import { parseLayout } from './use-dashboard-layout';

describe('parseLayout', () => {
  it('falls back to defaults on null or garbage', () => {
    expect(parseLayout(null).order).toEqual(DEFAULT_ORDER);
    expect(parseLayout('{not json').order).toEqual(DEFAULT_ORDER);
  });
  it('drops unknown widgets and appends new ones', () => {
    const l = parseLayout(
      JSON.stringify({ order: ['team', 'bogus', 'overview'], hidden: { team: true } }),
    );
    expect(l.order.slice(0, 2)).toEqual(['team', 'overview']);
    expect(l.order).toHaveLength(DEFAULT_ORDER.length);
    expect(l.hidden).toEqual({ team: true });
  });
});
