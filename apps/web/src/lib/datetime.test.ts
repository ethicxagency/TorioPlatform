import { afterEach, describe, expect, it } from 'vitest';
import {
  fmtClock,
  fmtDate,
  fmtDateTime,
  setWorkspaceTimeZone,
  zonedDayDiff,
  zonedYmd,
} from './datetime';

afterEach(() => setWorkspaceTimeZone(null));

describe('workspace time zone formatting', () => {
  const instant = '2026-11-10T20:30:00Z'; // stored in UTC, shown per zone

  it('shows the same instant in the workspace zone, not the browser or server zone', () => {
    setWorkspaceTimeZone('Asia/Dhaka');
    expect(fmtClock(instant)).toBe('2:30 AM');
    setWorkspaceTimeZone('Asia/Dubai');
    expect(fmtClock(instant)).toBe('12:30 AM');
    setWorkspaceTimeZone('America/New_York');
    expect(fmtClock(instant)).toBe('3:30 PM');
  });

  it('moves the calendar day across midnight with the zone', () => {
    setWorkspaceTimeZone('UTC');
    expect(zonedYmd(instant)).toEqual({ y: 2026, m: 11, d: 10 });
    setWorkspaceTimeZone('Asia/Dhaka');
    expect(zonedYmd(instant)).toEqual({ y: 2026, m: 11, d: 11 });
    expect(fmtDate(instant)).toBe('Nov 11, 2026');
  });

  it('counts days in the workspace zone and stays correct over a DST change', () => {
    // US clocks go back on 2026-11-01: that Sunday has 25 hours, yet it is still one calendar day.
    expect(zonedDayDiff('2026-11-02T12:00:00Z', '2026-11-01T12:00:00Z', 'America/New_York')).toBe(
      1,
    );
    expect(zonedDayDiff('2026-11-01T04:30:00Z', '2026-10-31T23:30:00Z', 'America/New_York')).toBe(
      1,
    );
  });

  it('formats with an explicit zone and ignores an invalid one', () => {
    expect(fmtDateTime(instant, 'Asia/Dubai')).toBe('Nov 11, 2026, 12:30 AM');
    expect(() => fmtDateTime(instant, 'Not/AZone')).not.toThrow();
  });
});
