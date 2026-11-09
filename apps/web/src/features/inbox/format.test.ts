import { describe, expect, it } from 'vitest';
import { SNOOZE_OPTIONS } from './constants';
import {
  badgeCount,
  dayLabel,
  fmtAgo,
  fmtWait,
  initialsOf,
  renderTemplate,
  waitTone,
} from './format';

describe('inbox format helpers', () => {
  it('initials', () => {
    expect(initialsOf('Tanvir Hasan')).toBe('TH');
    expect(initialsOf('')).toBe('?');
  });
  it('wait and ago formatting', () => {
    expect(fmtWait(14)).toBe('14m');
    expect(fmtWait(125)).toBe('2h 5m');
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(fmtAgo('2026-10-29T11:46:00Z', now)).toBe('14m');
    expect(fmtAgo('2026-10-28T11:00:00Z', now)).toBe('Yesterday');
  });
  it('badge counts cap at 99+ and hide at zero', () => {
    expect([0, 4, 28, 99, 100, 245, undefined].map(badgeCount)).toEqual([
      null,
      '4',
      '28',
      '99',
      '99+',
      '99+',
      null,
    ]);
  });
  it('wait tone thresholds', () => {
    expect([waitTone(10), waitTone(30), waitTone(120)]).toEqual(['neutral', 'warning', 'danger']);
  });
  it('day labels', () => {
    const now = new Date(2026, 9, 29, 12);
    expect(dayLabel(new Date(2026, 9, 29, 1).toISOString(), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 28, 23).toISOString(), now)).toBe('Yesterday');
  });
  it('template variables are replaced, unknown ones are left alone', () => {
    expect(renderTemplate('Hi {name}, {other}', { name: 'Tanvir Hasan' })).toBe(
      'Hi Tanvir, {other}',
    );
  });
  it('snooze options always resolve to the future', () => {
    const now = new Date(2026, 9, 29, 23, 30);
    for (const o of SNOOZE_OPTIONS) expect(o.until(now).getTime()).toBeGreaterThan(now.getTime());
  });
});
