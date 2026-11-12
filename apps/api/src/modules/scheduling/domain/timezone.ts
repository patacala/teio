/**
 * Wall-clock ↔ instant conversion for IANA time zones using only Intl, so
 * calendar rules ("Mon–Fri 09:00–18:00 in America/Mexico_City") are applied in
 * the calendar's own zone, including daylight-saving changes.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' of the instant as seen on a wall clock in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight of the instant in `timeZone`. */
export function localMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (whole seconds). */
export function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function isDateOnly(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** 0 = Sunday … 6 = Saturday for a calendar date (time-zone independent). */
export function weekdayOf(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  const a = DATE_RE.exec(from);
  const b = DATE_RE.exec(to);
  if (!a || !b) throw new RangeError(`Invalid date range: ${from}..${to}`);
  const ms =
    Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) -
    Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  return Math.round(ms / 86_400_000);
}

/**
 * The instant at which a wall clock in `timeZone` shows `date` + `minutes`.
 * Returns null when that local time does not exist (skipped by a DST change).
 * For a repeated local time (DST fall-back) the first occurrence is returned.
 */
export function zonedTimeToUtc(date: string, minutes: number, timeZone: string): Date | null {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Math.floor(minutes / 60), minutes % 60);

  const candidates = new Set<number>();
  for (const probe of [wall - 14 * 3_600_000, wall, wall + 14 * 3_600_000]) {
    candidates.add(wall - offsetMs(new Date(probe), timeZone));
  }
  const matches = [...candidates]
    .filter((t) => localDate(new Date(t), timeZone) === date && localMinutes(new Date(t), timeZone) === minutes)
    .sort((x, y) => x - y);
  return matches.length ? new Date(matches[0]) : null;
}
