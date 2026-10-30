export const initialsOf = (n: string | null | undefined) =>
  (n || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const minutesSince = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

export const fmtWait = (m: number) =>
  m < 60
    ? `${m}m`
    : m < 1440
      ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`
      : `${Math.floor(m / 1440)}d`;

export const fmtAgo = (iso: string, now = Date.now()) => {
  const m = minutesSince(iso, now);
  return m < 1
    ? 'now'
    : m < 60
      ? `${m}m`
      : m < 1440
        ? `${Math.floor(m / 60)}h`
        : m < 2880
          ? 'Yesterday'
          : `${Math.floor(m / 1440)}d`;
};

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    weekday: diff < 7 ? 'long' : undefined,
    month: 'short',
    day: 'numeric',
    year: diff < 180 ? undefined : 'numeric',
  });
}

/** Severity of a waiting customer: drives the colour of the SLA chip. */
export const waitTone = (m: number): 'danger' | 'warning' | 'neutral' =>
  m >= 120 ? 'danger' : m >= 30 ? 'warning' : 'neutral';

/** Substitutes supported customer variables into a saved reply. Unknown tokens are left untouched. */
export function renderTemplate(body: string, customer: { name: string }) {
  return body.replace(/\{name\}/g, customer.name.split(' ')[0] ?? '');
}

export const snoozeLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
