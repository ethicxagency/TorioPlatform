export const MON = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Deterministic pseudo-random so demo charts are stable between renders. */
export const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const bdt = (n: number) => '৳' + Math.round(n).toLocaleString('en-IN');
export const num = (n: number) => Math.round(n).toLocaleString('en-IN');
export const ini = (n: string | null | undefined) =>
  (n || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function series(seed: number, total: number, n: number, today: boolean): number[] {
  const v: number[] = [];
  for (let i = 0; i < n; i++) {
    let b = 1 + 0.22 * Math.sin(i * 0.9 + seed) + 0.3 * (rnd(i, seed) - 0.5);
    if (today) b *= 0.5 + i * 0.18;
    v.push(Math.max(0.15, b));
  }
  const s = v.reduce((a, b) => a + b, 0) || 1;
  return v.map((x) => (x * total) / s);
}

export function niceMax(m: number): number {
  if (m <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const c = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((c) => c * p >= m) ?? 10;
  return c * p;
}

// Rounded so server (Node) and browser Math.sin results serialise identically (no hydration mismatch).
const r2 = (n: number) => Math.round(n * 100) / 100;

export function smooth(pts: [number, number][]): string {
  const first = pts[0];
  if (!first) return '';
  let d = `M${r2(first[0])},${r2(first[1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const mx = (x0 + x1) / 2;
    d += `C${r2(mx)},${r2(y0)} ${r2(mx)},${r2(y1)} ${r2(x1)},${r2(y1)}`;
  }
  return d;
}

export function spark(seed: number, n = 12): string {
  const v = series(seed, 100, n, false);
  const mx = Math.max(...v);
  const mn = Math.min(...v);
  return smooth(
    v.map((y, i): [number, number] => [
      (i / (v.length - 1)) * 100,
      90 - ((y - mn) / (mx - mn || 1)) * 80,
    ]),
  );
}

export function labelsFor(r: { k: string; n: number }): string[] {
  if (r.k === 'today') return ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM'];
  const end = r.k === 'custom' ? new Date(2026, 9, 15) : new Date(2026, 9, 29);
  return Array.from({ length: r.n }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (r.n - 1 - i));
    return d.getDate() + ' ' + MON[d.getMonth()];
  });
}
