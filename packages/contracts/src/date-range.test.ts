import { describe, expect, it } from 'vitest';
import {
  addDays,
  analyticsQuerySchema,
  comparisonRange,
  daysBetween,
  daysFromCivil,
  civilFromDays,
  formatRange,
  granularityFor,
  listBuckets,
  parseIso,
  percentChange,
  PRESETS,
  rangeBounds,
  resolvePreset,
  startOfDayUtc,
  todayIn,
  validateRange,
  weekdayMon0,
  type PresetKey,
} from './date-range';

const T = (s: string) => parseIso(s)!;
const preset = (k: Exclude<PresetKey, 'custom'>, today: string) => resolvePreset(k, T(today));

describe('civil date arithmetic', () => {
  it('round-trips and rejects impossible dates', () => {
    for (const s of ['1970-01-01', '2000-02-29', '2026-10-30', '2100-03-01']) {
      expect(civilFromDays(daysFromCivil(T(s)))).toEqual(T(s));
    }
    expect(parseIso('2026-02-30')).toBeNull();
    expect(parseIso('2027-02-29')).toBeNull();
    expect(parseIso('2028-02-29')).not.toBeNull();
    expect(parseIso('2100-02-29')).toBeNull(); // century non-leap
    expect(parseIso('2000-02-29')).not.toBeNull(); // 400-year leap
    expect(parseIso('26-1-1')).toBeNull();
    expect(parseIso('2026-13-01')).toBeNull();
  });
  it('adds days across month and year boundaries', () => {
    expect(addDays(T('2026-12-31'), 1)).toEqual(T('2027-01-01'));
    expect(addDays(T('2027-01-01'), -1)).toEqual(T('2026-12-31'));
    expect(addDays(T('2028-02-28'), 1)).toEqual(T('2028-02-29'));
    expect(addDays(T('2027-02-28'), 1)).toEqual(T('2027-03-01'));
    expect(daysBetween(T('2028-02-01'), T('2028-02-29'))).toBe(29);
  });
  it('knows weekdays (Monday = 0)', () => {
    expect(weekdayMon0(T('2026-10-26'))).toBe(0);
    expect(weekdayMon0(T('2026-10-30'))).toBe(4);
    expect(weekdayMon0(T('2026-11-01'))).toBe(6);
  });
});

describe('presets (today = 2026-10-30, a Friday)', () => {
  const t = '2026-10-30';
  it('quick select rolls back inclusive of today', () => {
    expect(preset('today', t)).toEqual({ from: '2026-10-30', to: '2026-10-30' });
    expect(preset('yesterday', t)).toEqual({ from: '2026-10-29', to: '2026-10-29' });
    expect(preset('last_7_days', t)).toEqual({ from: '2026-10-24', to: '2026-10-30' });
    expect(preset('last_14_days', t)).toEqual({ from: '2026-10-17', to: '2026-10-30' });
    expect(preset('last_30_days', t)).toEqual({ from: '2026-10-01', to: '2026-10-30' });
    expect(preset('last_90_days', t)).toEqual({ from: '2026-08-02', to: '2026-10-30' });
    for (const [k, n] of [
      ['last_7_days', 7],
      ['last_14_days', 14],
      ['last_30_days', 30],
      ['last_90_days', 90],
    ] as const) {
      const r = preset(k, t);
      expect(daysBetween(T(r.from), T(r.to))).toBe(n);
    }
  });
  it('calendar periods are not rolling periods', () => {
    expect(preset('this_month', t)).toEqual({ from: '2026-10-01', to: '2026-10-30' });
    expect(preset('last_month', t)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(preset('this_quarter', t)).toEqual({ from: '2026-10-01', to: '2026-10-30' });
    expect(preset('last_quarter', t)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(preset('this_year', t)).toEqual({ from: '2026-01-01', to: '2026-10-30' });
    expect(preset('last_year', t)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
  it('handles year and quarter boundaries', () => {
    expect(preset('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(preset('last_quarter', '2026-01-15')).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    expect(preset('last_7_days', '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' });
    expect(preset('yesterday', '2026-01-01')).toEqual({ from: '2025-12-31', to: '2025-12-31' });
    expect(preset('this_quarter', '2026-06-30')).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(preset('last_quarter', '2026-12-31')).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(preset('this_year', '2026-01-01')).toEqual({ from: '2026-01-01', to: '2026-01-01' });
  });
  it('handles leap-year months', () => {
    expect(preset('last_month', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(preset('last_month', '2027-03-10')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(preset('yesterday', '2028-03-01')).toEqual({ from: '2028-02-29', to: '2028-02-29' });
  });
  it('handles leap years', () => {
    expect(preset('this_year', '2028-12-31')).toEqual({ from: '2028-01-01', to: '2028-12-31' });
    expect(
      daysBetween(
        T(preset('last_year', '2029-05-05').from),
        T(preset('last_year', '2029-05-05').to),
      ),
    ).toBe(366); // 2028
  });
  it('covers every preset in the picker', () => {
    expect(PRESETS.map((p) => p.key)).toEqual([
      'today',
      'yesterday',
      'last_7_days',
      'last_14_days',
      'last_30_days',
      'last_90_days',
      'this_month',
      'last_month',
      'this_quarter',
      'last_quarter',
      'this_year',
      'last_year',
      'custom',
    ]);
    expect([...new Set(PRESETS.map((p) => p.group))]).toEqual([
      'Quick select',
      'Monthly',
      'Yearly',
      'Custom',
    ]);
  });
});

describe('reporting time zone', () => {
  const now = new Date('2026-10-30T20:00:00Z');
  it('"today" depends on the reporting zone, not the machine', () => {
    expect(todayIn('UTC', now)).toEqual(T('2026-10-30'));
    expect(todayIn('Asia/Dhaka', now)).toEqual(T('2026-10-31')); // UTC+6 has already rolled over
    expect(todayIn('America/Los_Angeles', now)).toEqual(T('2026-10-30'));
    expect(todayIn('Pacific/Kiritimati', now)).toEqual(T('2026-10-31')); // UTC+14
    expect(todayIn('Pacific/Pago_Pago', new Date('2026-10-30T05:00:00Z'))).toEqual(T('2026-10-29')); // UTC-11
  });
  it('day boundaries are local midnight expressed in UTC', () => {
    expect(startOfDayUtc(T('2026-10-31'), 'Asia/Dhaka').toISOString()).toBe(
      '2026-10-30T18:00:00.000Z',
    );
    expect(startOfDayUtc(T('2026-10-30'), 'UTC').toISOString()).toBe('2026-10-30T00:00:00.000Z');
    expect(startOfDayUtc(T('2026-07-01'), 'America/New_York').toISOString()).toBe(
      '2026-07-01T04:00:00.000Z',
    ); // EDT
    expect(startOfDayUtc(T('2026-12-01'), 'America/New_York').toISOString()).toBe(
      '2026-12-01T05:00:00.000Z',
    ); // EST
    expect(startOfDayUtc(T('2026-10-31'), 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-30T18:30:00.000Z',
    ); // half-hour zone
  });
  it('daylight-saving days are 23 and 25 hours long, and the range is inclusive', () => {
    const hours = (day: string) => {
      const b = rangeBounds({ from: day, to: day }, 'America/New_York');
      return (b.endExclusive.getTime() - b.start.getTime()) / 3_600_000;
    };
    expect(hours('2026-03-08')).toBe(23); // spring forward
    expect(hours('2026-11-01')).toBe(25); // fall back
    expect(hours('2026-06-15')).toBe(24);
    const week = rangeBounds({ from: '2026-11-01', to: '2026-11-07' }, 'America/New_York');
    expect((week.endExclusive.getTime() - week.start.getTime()) / 3_600_000).toBe(7 * 24 + 1);
    // a record at 23:30 local on the last day is inside; at 00:00 the next day is outside
    const b = rangeBounds({ from: '2026-10-31', to: '2026-10-31' }, 'Asia/Dhaka');
    expect(
      new Date('2026-10-31T17:59:59Z') < b.endExclusive &&
        new Date('2026-10-31T17:59:59Z') >= b.start,
    ).toBe(true);
    expect(new Date('2026-10-31T18:00:00Z') < b.endExclusive).toBe(false);
  });
  it('rejects unknown zones', async () => {
    const { isValidTimeZone } = await import('./date-range');
    expect(isValidTimeZone('Asia/Dhaka')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('custom range validation', () => {
  const today = T('2026-10-30');
  it('accepts valid inclusive ranges, including a single day and today', () => {
    expect(validateRange({ from: '2026-10-01', to: '2026-10-30' }, today)).toBeNull();
    expect(validateRange({ from: '2026-10-30', to: '2026-10-30' }, today)).toBeNull();
    expect(validateRange({ from: '2024-02-29', to: '2024-03-01' }, today)).toBeNull();
  });
  it('rejects reversed, future, impossible and oversized ranges with a clear message', () => {
    expect(validateRange({ from: '2026-10-10', to: '2026-10-09' }, today)).toMatch(
      /start date can.t be after/,
    );
    expect(validateRange({ from: '2026-10-01', to: '2026-10-31' }, today)).toMatch(
      /can.t be in the future/,
    );
    expect(validateRange({ from: '2026-02-30', to: '2026-03-01' }, today)).toMatch(/valid dates/);
    expect(validateRange({ from: '2020-01-01', to: '2026-10-30' }, today)).toMatch(/two years/);
  });
});

describe('comparison ranges', () => {
  it('previous period is the same number of days immediately before', () => {
    expect(comparisonRange({ from: '2026-10-24', to: '2026-10-30' }, 'previous_period')).toEqual({
      from: '2026-10-17',
      to: '2026-10-23',
    });
    expect(comparisonRange({ from: '2026-03-01', to: '2026-03-31' }, 'previous_period')).toEqual({
      from: '2026-01-29',
      to: '2026-02-28',
    });
    expect(comparisonRange({ from: '2026-01-01', to: '2026-01-01' }, 'previous_period')).toEqual({
      from: '2025-12-31',
      to: '2025-12-31',
    });
    expect(comparisonRange({ from: '2028-03-01', to: '2028-03-07' }, 'previous_period')).toEqual({
      from: '2028-02-23',
      to: '2028-02-29',
    });
  });
  it('previous year shifts both ends one year back and clamps Feb 29', () => {
    expect(comparisonRange({ from: '2026-10-01', to: '2026-10-30' }, 'previous_year')).toEqual({
      from: '2025-10-01',
      to: '2025-10-30',
    });
    expect(comparisonRange({ from: '2028-02-01', to: '2028-02-29' }, 'previous_year')).toEqual({
      from: '2027-02-01',
      to: '2027-02-28',
    });
    expect(comparisonRange({ from: '2029-02-01', to: '2029-02-28' }, 'previous_year')).toEqual({
      from: '2028-02-01',
      to: '2028-02-28',
    });
    expect(comparisonRange({ from: '2026-10-01', to: '2026-10-30' }, 'none')).toBeNull();
  });
  it('percent change is rounded to one decimal and null when there is nothing to compare against', () => {
    expect(percentChange(118.5, 100)).toBe(18.5);
    expect(percentChange(95.8, 100)).toBe(-4.2);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(0, 50)).toBe(-100);
    expect(percentChange(1, 3)).toBe(-66.7);
  });
});

describe('chart buckets', () => {
  it('chooses a granularity from the range length', () => {
    expect(granularityFor(1)).toBe('day');
    expect(granularityFor(31)).toBe('day');
    expect(granularityFor(32)).toBe('week');
    expect(granularityFor(183)).toBe('week');
    expect(granularityFor(184)).toBe('month');
  });
  it('lists contiguous day, Monday-start week and month buckets', () => {
    expect(listBuckets({ from: '2026-10-29', to: '2026-11-02' }, 'day')).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(listBuckets({ from: '2026-10-28', to: '2026-11-09' }, 'week')).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ]);
    expect(listBuckets({ from: '2026-11-15', to: '2027-02-10' }, 'month')).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
    expect(listBuckets({ from: '2028-02-27', to: '2028-03-01' }, 'day')).toHaveLength(4); // includes Feb 29
  });
});

describe('formatting and query contract', () => {
  it('formats compact range labels', () => {
    expect(formatRange({ from: '2026-10-30', to: '2026-10-30' })).toBe('30 Oct 2026');
    expect(formatRange({ from: '2026-10-01', to: '2026-10-29' })).toBe('1–29 Oct 2026');
    expect(formatRange({ from: '2026-09-30', to: '2026-10-29' })).toBe('30 Sep – 29 Oct 2026');
    expect(formatRange({ from: '2025-12-28', to: '2026-01-03' })).toBe('28 Dec 2025 – 3 Jan 2026');
  });
  it('validates the analytics query on the server', () => {
    expect(analyticsQuerySchema.parse({ from: '2026-10-01', to: '2026-10-30' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-30',
      compare: 'none',
    });
    expect(analyticsQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-30' }).success).toBe(
      false,
    );
    expect(analyticsQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(
      false,
    );
    expect(analyticsQuerySchema.safeParse({ from: 'yesterday', to: 'today' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ from: '2020-01-01', to: '2026-10-30' }).success).toBe(
      false,
    );
    expect(
      analyticsQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-30', compare: 'last_week' })
        .success,
    ).toBe(false);
  });
});
