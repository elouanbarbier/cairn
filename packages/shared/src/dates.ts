/** Calendar dates are exchanged as `YYYY-MM-DD` strings, timestamps as ISO 8601 strings. */

const DAY_MS = 86_400_000;

/** Local calendar date of a Date, as `YYYY-MM-DD`. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUTC(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Adds `days` (can be negative) to a `YYYY-MM-DD` date. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(toUTC(isoDate) + days * DAY_MS);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); positive when `to` is later. */
export function diffDays(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

/** Whole days elapsed between two instants, rounded down. */
export function elapsedDays(since: Date | string, now: Date): number {
  const start = typeof since === 'string' ? new Date(since) : since;
  return Math.floor((now.getTime() - start.getTime()) / DAY_MS);
}

/** Parses a `YYYY-MM-DD` date as a local Date at midnight (for display only). */
export function parseISODate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
