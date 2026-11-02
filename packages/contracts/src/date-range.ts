import { z } from 'zod';

/**
 * Dashboard date ranges. Everything here is pure and shared by the API (which is authoritative) and the web app
 * (which only previews). Ranges are inclusive calendar dates in an explicit IANA reporting time zone, so results never
 * depend on the browser's zone or the server's. Calendar arithmetic is done on civil dates (no Date objects), which
 * keeps month ends, leap years and daylight-saving days exact.
 */

export interface CivilDate {
  y: number;
  m: number;
  d: number;
}
export interface DateRange {
  /** Inclusive start, `YYYY-MM-DD` in the reporting time zone. */
  from: string;
  /** Inclusive end, `YYYY-MM-DD` in the reporting time zone. */
  to: string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const toIso = (c: CivilDate) => `${pad(c.y, 4)}-${pad(c.m)}-${pad(c.d)}`;

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) =>
  [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;

/** Strict `YYYY-MM-DD` parser: rejects impossible dates such as 2026-02-30. */
export function parseIso(s: string): CivilDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const c = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (c.m < 1 || c.m > 12 || c.d < 1 || c.d > daysInMonth(c.y, c.m)) return null;
  return c;
}

/** Days since 1970-01-01 for a civil date (proleptic Gregorian). */
export function daysFromCivil({ y, m, d }: CivilDate): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
export function civilFromDays(n: number): CivilDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}
export const addDays = (c: CivilDate, n: number) => civilFromDays(daysFromCivil(c) + n);
/** Inclusive number of calendar days. */
export const daysBetween = (from: CivilDate, to: CivilDate) =>
  daysFromCivil(to) - daysFromCivil(from) + 1;
/** 0 = Monday … 6 = Sunday. */
export const weekdayMon0 = (c: CivilDate) => (((daysFromCivil(c) + 3) % 7) + 7) % 7;

// ---------- time zones ----------

export const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
export const DEFAULT_REPORTING_TZ = 'UTC';

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string, ms: number) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms)))
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}
/** Today's calendar date in the given time zone. */
export function todayIn(tz: string, now: Date = new Date()): CivilDate {
  const p = parts(tz, now.getTime());
  return { y: p.year, m: p.month, d: p.day };
}
/** Offset of the zone from UTC at an instant, in milliseconds (local − UTC). */
function offsetMs(tz: string, ms: number) {
  const p = parts(tz, ms);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
  );
}
/** The UTC instant at which a civil date begins (00:00 local) in the zone, correct across DST changes. */
export function startOfDayUtc(c: CivilDate, tz: string): Date {
  const guess = Date.UTC(c.y, c.m - 1, c.d, 0, 0, 0);
  let t = guess - offsetMs(tz, guess);
  const second = guess - offsetMs(tz, t);
  if (second !== t) t = second;
  return new Date(t);
}
/** Half-open UTC bounds covering the inclusive date range: `[start, endExclusive)`. */
export function rangeBounds(r: DateRange, tz: string): { start: Date; endExclusive: Date } {
  const from = parseIso(r.from)!;
  const to = parseIso(r.to)!;
  return { start: startOfDayUtc(from, tz), endExclusive: startOfDayUtc(addDays(to, 1), tz) };
}

// ---------- presets ----------

export const PRESET_GROUPS = ['Quick select', 'Monthly', 'Yearly', 'Custom'] as const;
export const PRESETS = [
  { key: 'today', label: 'Today', group: 'Quick select' },
  { key: 'yesterday', label: 'Yesterday', group: 'Quick select' },
  { key: 'last_7_days', label: 'Last 7 Days', group: 'Quick select' },
  { key: 'last_14_days', label: 'Last 14 Days', group: 'Quick select' },
  { key: 'last_30_days', label: 'Last 30 Days', group: 'Quick select' },
  { key: 'last_90_days', label: 'Last 90 Days', group: 'Quick select' },
  { key: 'this_month', label: 'This Month', group: 'Monthly' },
  { key: 'last_month', label: 'Last Month', group: 'Monthly' },
  { key: 'this_quarter', label: 'This Quarter', group: 'Monthly' },
  { key: 'last_quarter', label: 'Last Quarter', group: 'Monthly' },
  { key: 'this_year', label: 'This Year', group: 'Yearly' },
  { key: 'last_year', label: 'Last Year', group: 'Yearly' },
  { key: 'custom', label: 'Custom Range', group: 'Custom' },
] as const;
export type PresetKey = (typeof PRESETS)[number]['key'];
export const DEFAULT_PRESET: PresetKey = 'last_30_days';
export const isPresetKey = (k: string): k is PresetKey => PRESETS.some((p) => p.key === k);

/**
 * Resolves a preset to inclusive dates, "today" being today in the reporting zone. Rolling presets ("Last N Days")
 * end today and include it; calendar presets (month, quarter, year) start on the period's first day.
 */
export function resolvePreset(key: Exclude<PresetKey, 'custom'>, today: CivilDate): DateRange {
  const rolling = (n: number): DateRange => ({
    from: toIso(addDays(today, -(n - 1))),
    to: toIso(today),
  });
  const quarterStartMonth = (m: number) => Math.floor((m - 1) / 3) * 3 + 1;
  switch (key) {
    case 'today':
      return { from: toIso(today), to: toIso(today) };
    case 'yesterday': {
      const y = toIso(addDays(today, -1));
      return { from: y, to: y };
    }
    case 'last_7_days':
      return rolling(7);
    case 'last_14_days':
      return rolling(14);
    case 'last_30_days':
      return rolling(30);
    case 'last_90_days':
      return rolling(90);
    case 'this_month':
      return { from: toIso({ ...today, d: 1 }), to: toIso(today) };
    case 'last_month': {
      const end = addDays({ ...today, d: 1 }, -1);
      return { from: toIso({ ...end, d: 1 }), to: toIso(end) };
    }
    case 'this_quarter':
      return { from: toIso({ y: today.y, m: quarterStartMonth(today.m), d: 1 }), to: toIso(today) };
    case 'last_quarter': {
      const prevEnd = addDays({ y: today.y, m: quarterStartMonth(today.m), d: 1 }, -1);
      return {
        from: toIso({ y: prevEnd.y, m: quarterStartMonth(prevEnd.m), d: 1 }),
        to: toIso(prevEnd),
      };
    }
    case 'this_year':
      return { from: toIso({ y: today.y, m: 1, d: 1 }), to: toIso(today) };
    case 'last_year':
      return {
        from: toIso({ y: today.y - 1, m: 1, d: 1 }),
        to: toIso({ y: today.y - 1, m: 12, d: 31 }),
      };
  }
}

export const MAX_RANGE_DAYS = 731;

/** Why a custom range can't be used, or null when it is valid. */
export function validateRange(r: DateRange, today: CivilDate): string | null {
  const from = parseIso(r.from);
  const to = parseIso(r.to);
  if (!from || !to) return 'Enter valid dates.';
  if (daysFromCivil(from) > daysFromCivil(to)) return 'The start date can’t be after the end date.';
  if (daysFromCivil(to) > daysFromCivil(today)) return 'The end date can’t be in the future.';
  if (daysBetween(from, to) > MAX_RANGE_DAYS) return 'Choose a range of two years or less.';
  return null;
}

// ---------- comparison ----------

export const COMPARE_MODES = ['none', 'previous_period', 'previous_year'] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];
export const COMPARE_LABEL: Record<CompareMode, string> = {
  none: 'No comparison',
  previous_period: 'Previous period',
  previous_year: 'Previous year',
};

/** The comparison range for a selected range, or null for `none`. */
export function comparisonRange(r: DateRange, mode: CompareMode): DateRange | null {
  if (mode === 'none') return null;
  const from = parseIso(r.from)!;
  const to = parseIso(r.to)!;
  if (mode === 'previous_period') {
    const n = daysBetween(from, to);
    return { from: toIso(addDays(from, -n)), to: toIso(addDays(from, -1)) };
  }
  const shift = (c: CivilDate): CivilDate => ({
    y: c.y - 1,
    m: c.m,
    d: Math.min(c.d, daysInMonth(c.y - 1, c.m)),
  });
  return { from: toIso(shift(from)), to: toIso(shift(to)) };
}

/**
 * Percentage change from `previous` to `current`, or null when it would mislead (no previous value to compare
 * against, so the relative change is undefined).
 */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

// ---------- buckets for charts ----------

export type Granularity = 'day' | 'week' | 'month';
export function granularityFor(days: number): Granularity {
  return days <= 31 ? 'day' : days <= 183 ? 'week' : 'month';
}
/** Groupings that make sense for a range of this many days; the default (`granularityFor`) is always included. */
export function granularityOptions(days: number): Granularity[] {
  if (days <= 14) return ['day'];
  if (days <= 62) return ['day', 'week'];
  return ['week', 'month'];
}
export function bucketStart(c: CivilDate, g: Granularity): CivilDate {
  if (g === 'day') return c;
  if (g === 'week') return addDays(c, -weekdayMon0(c));
  return { y: c.y, m: c.m, d: 1 };
}
/** Bucket start dates (ISO) covering the range, in order. Week buckets start on Monday. */
export function listBuckets(r: DateRange, g: Granularity): string[] {
  const from = parseIso(r.from)!;
  const to = parseIso(r.to)!;
  const out: string[] = [];
  let cur = bucketStart(from, g);
  const end = daysFromCivil(to);
  while (daysFromCivil(cur) <= end) {
    out.push(toIso(cur));
    cur =
      g === 'day'
        ? addDays(cur, 1)
        : g === 'week'
          ? addDays(cur, 7)
          : cur.m === 12
            ? { y: cur.y + 1, m: 1, d: 1 }
            : { y: cur.y, m: cur.m + 1, d: 1 };
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `1–29 Oct 2026`, `30 Sep – 29 Oct 2026`, or with both years when they differ. */
export function formatRange(r: DateRange): string {
  const f = parseIso(r.from)!;
  const t = parseIso(r.to)!;
  if (r.from === r.to) return `${t.d} ${MONTHS[t.m - 1]} ${t.y}`;
  if (f.y === t.y && f.m === t.m) return `${f.d}–${t.d} ${MONTHS[t.m - 1]} ${t.y}`;
  if (f.y === t.y) return `${f.d} ${MONTHS[f.m - 1]} – ${t.d} ${MONTHS[t.m - 1]} ${t.y}`;
  return `${f.d} ${MONTHS[f.m - 1]} ${f.y} – ${t.d} ${MONTHS[t.m - 1]} ${t.y}`;
}

// ---------- API query ----------

const isoDate = z.string().refine((v) => parseIso(v) !== null, 'Use a real date as YYYY-MM-DD');
export const analyticsQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    compare: z.enum(COMPARE_MODES).default('none'),
    /** Limits conversation, lead, order, revenue and customer figures to one messaging channel. */
    channel: z.enum(['WHATSAPP', 'INSTAGRAM', 'MESSENGER']).optional(),
    /** Chart grouping; must be one of `granularityOptions` for the range. Defaults to `granularityFor`. */
    granularity: z.enum(['day', 'week', 'month']).optional(),
  })
  .superRefine((v, ctx) => {
    if (parseIso(v.from) && parseIso(v.to)) {
      const f = daysFromCivil(parseIso(v.from)!);
      const t = daysFromCivil(parseIso(v.to)!);
      if (v.granularity && f <= t && !granularityOptions(t - f + 1).includes(v.granularity))
        ctx.addIssue({
          code: 'custom',
          path: ['granularity'],
          message: `“${v.granularity}” grouping isn’t available for this range`,
        });
      if (f > t)
        ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must not be after to' });
      else if (t - f + 1 > MAX_RANGE_DAYS)
        ctx.addIssue({
          code: 'custom',
          path: ['to'],
          message: 'The range can be at most two years',
        });
    }
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

// ---------- analytics response ----------

const money = z.object({ currency: z.string(), amountMinor: z.number().int() });
const totals = z.object({
  revenue: z.array(money),
  orders: z.number().int(),
  newCustomers: z.number().int(),
  customers: z.number().int(),
});
const rangeShape = z.object({ from: z.string(), to: z.string() });
export const dashboardAnalyticsSchema = z.object({
  range: rangeShape,
  timeZone: z.string(),
  granularity: z.enum(['day', 'week', 'month']),
  /** Revenue = payments recorded on non-cancelled orders in the range, per currency. Never summed across currencies. */
  revenue: z.object({
    byCurrency: z.array(money),
    primaryCurrency: z
      .string()
      .describe('Currency shown in the revenue chart, or empty when there is no revenue'),
  }),
  orders: z.object({ total: z.number().int(), cancelled: z.number().int() }),
  customers: z.object({
    total: z.number().int().describe('Customers existing at the end of the range'),
    new: z.number().int(),
  }),
  /** Point-in-time state, deliberately not filtered by the date range. Null when the viewer can't see billing. */
  subscription: z
    .object({
      onFreePlan: z.boolean(),
      planKey: z.string(),
      planName: z.string(),
      status: z.string().describe('A subscription status, or NONE on the free plan'),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
  /**
   * Inbox activity. `total` = conversations with at least one customer or agent message in the range, `new` = started
   * in the range, `resolved` = resolved in the range. `waiting` and `unread` are current state, not range-filtered.
   */
  messaging: z.object({
    total: z.number().int(),
    new: z.number().int(),
    resolved: z.number().int(),
    waiting: z.number().int(),
    unread: z.number().int(),
  }),
  leads: z.object({ total: z.number().int() }),
  /**
   * Each metric split by messaging channel for the whole range, ignoring the channel filter so shares stay meaningful.
   * Conversations use their channel; leads and new customers their source; orders and revenue the conversation they
   * came from (revenue in the primary currency only). `unattributed` is whatever has no channel.
   */
  byChannel: z.object({
    revenue: z.record(z.string(), z.number().int()),
    orders: z.record(z.string(), z.number().int()),
    conversations: z.record(z.string(), z.number().int()),
    leads: z.record(z.string(), z.number().int()),
    newCustomers: z.record(z.string(), z.number().int()),
  }),
  /** Current items that need someone's attention (not range-filtered). Absent kinds are simply not reported. */
  attention: z.object({
    waitingLong: z.object({
      count: z.number().int(),
      thresholdMinutes: z.number().int(),
      oldest: z
        .object({
          conversationId: z.string(),
          customerName: z.string(),
          provider: z.string(),
          waitingSince: z.string(),
        })
        .nullable(),
    }),
    waiting: z.object({
      count: z.number().int(),
      averageWaitMinutes: z.number().int().nullable(),
    }),
    staleLeads: z.object({ count: z.number().int(), idleHours: z.number().int() }),
    pendingOrders: z.object({ count: z.number().int() }),
  }),
  series: z.object({
    buckets: z.array(z.string()),
    conversations: z.array(z.number().int()),
    newConversations: z.array(z.number().int()),
    resolvedConversations: z.array(z.number().int()),
    leads: z.array(z.number().int()),
    revenue: z.array(z.number().int()),
    orders: z.array(z.number().int()),
    newCustomers: z.array(z.number().int()),
    totalCustomers: z.array(z.number().int()),
  }),
  comparison: z
    .object({
      mode: z.enum(['previous_period', 'previous_year']),
      range: rangeShape,
      /** full = the comparison period is entirely covered by data; partial = it starts before data existed; none = it ends before. */
      coverage: z.enum(['full', 'partial', 'none']),
      previous: totals,
      /** Percentage changes; null when undefined (e.g. nothing to compare against). */
      changes: z.object({
        revenue: z
          .number()
          .describe('Percent change, or null-equivalent NaN is never sent')
          .nullable(),
        orders: z.number().nullable(),
        newCustomers: z.number().nullable(),
        customers: z.number().nullable(),
      }),
    })
    .nullable(),
  activity: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['order', 'payment', 'customer', 'lead']),
      title: z.string(),
      at: z.iso.datetime(),
    }),
  ),
  dataSince: z
    .string()
    .describe('Earliest record in this workspace, or null when it is empty')
    .nullable(),
});
