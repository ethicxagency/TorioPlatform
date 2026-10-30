/** Formats an ISO timestamp in the user's chosen time zone (falls back to the browser's when unset or invalid). */
export function fmtDateTime(iso: string, timeZone?: string | null): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  try {
    return new Date(iso).toLocaleString('en-US', { ...opts, ...(timeZone && { timeZone }) });
  } catch {
    return new Date(iso).toLocaleString('en-US', opts);
  }
}
