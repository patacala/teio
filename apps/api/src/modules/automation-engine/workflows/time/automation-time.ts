import type { Duration, ScheduleSpec } from '@crm/shared';
import { addDays, localDate, localMinutes, weekdayOf, zonedTimeToUtc } from '../../../scheduling/domain/timezone';

/**
 * Wall-clock arithmetic for automations, in the organization's time zone
 * (daylight-saving aware, built on the scheduling module's helpers).
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function parseTime(time: string): number | null {
  const m = TIME_RE.exec(time ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * The instant a wall clock shows `date` + `minutes`. A local time skipped by
 * a DST change (e.g. 02:30 on spring-forward night) becomes the first valid
 * time after the gap, so a schedule never silently skips a day.
 */
export function wallTimeToUtc(date: string, minutes: number, timeZone: string): Date {
  for (let m = minutes; m < 24 * 60; m += 15) {
    const at = zonedTimeToUtc(date, m, timeZone);
    if (at) return at;
  }
  return zonedTimeToUtc(addDays(date, 1), 0, timeZone) ?? new Date(`${addDays(date, 1)}T00:00:00Z`);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The next time a schedule fires strictly after `after`, or null when it
 * never fires again (a past `once`) or the spec is invalid.
 */
export function nextOccurrence(spec: ScheduleSpec, timeZone: string, after: Date): Date | null {
  const minutes = parseTime(spec.time);
  if (minutes === null) return null;
  const today = localDate(after, timeZone);

  switch (spec.frequency) {
    case 'once': {
      if (!spec.date || !/^\d{4}-\d{2}-\d{2}$/.test(spec.date)) return null;
      const at = wallTimeToUtc(spec.date, minutes, timeZone);
      return at > after ? at : null;
    }
    case 'daily': {
      for (let i = 0; i < 3; i++) {
        const at = wallTimeToUtc(addDays(today, i), minutes, timeZone);
        if (at > after) return at;
      }
      return null;
    }
    case 'weekly': {
      const days = new Set((spec.days_of_week ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
      if (!days.size) return null;
      for (let i = 0; i < 15; i++) {
        const date = addDays(today, i);
        if (!days.has(weekdayOf(date))) continue;
        const at = wallTimeToUtc(date, minutes, timeZone);
        if (at > after) return at;
      }
      return null;
    }
    case 'monthly': {
      const dom = spec.day_of_month;
      if (!dom || !Number.isInteger(dom) || dom < 1 || dom > 31) return null;
      let [year, month] = today.split('-').map(Number);
      for (let i = 0; i < 14; i++) {
        // Short months run on their last day ("31st" → Feb 28/29, Apr 30).
        const day = Math.min(dom, daysInMonth(year, month));
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const at = wallTimeToUtc(date, minutes, timeZone);
        if (at > after) return at;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

export function durationMs(duration: Duration | undefined): number {
  if (!duration) return 0;
  const amount = Math.max(0, Number(duration.amount) || 0);
  const unit = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[duration.unit] ?? 0;
  return amount * unit;
}

export interface BusinessHours {
  /** 0 = Sunday … 6 = Saturday. */
  work_days: number[];
  start_time: string;
  end_time: string;
  timezone: string;
}

/**
 * `at` itself when it falls inside business hours, otherwise the start of the
 * next business period. Calendars without usable hours leave `at` as is.
 */
export function nextBusinessTime(at: Date, hours: BusinessHours): Date {
  const start = parseTime(hours.start_time);
  const end = parseTime(hours.end_time);
  const days = new Set(hours.work_days ?? []);
  if (start === null || end === null || start >= end || !days.size) return at;

  const tz = hours.timezone;
  const today = localDate(at, tz);
  const nowMinutes = localMinutes(at, tz);
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i);
    if (!days.has(weekdayOf(date))) continue;
    if (i === 0) {
      if (nowMinutes >= start && nowMinutes < end) return at;
      if (nowMinutes >= end) continue;
    }
    return wallTimeToUtc(date, start, tz);
  }
  return at;
}

/** The next time it is `time` on one of `daysOfWeek` (any day when empty), strictly after `after`. */
export function nextWallTime(time: string, daysOfWeek: number[] | undefined, timeZone: string, after: Date): Date | null {
  const days = daysOfWeek?.length ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  return nextOccurrence({ frequency: 'weekly', time, days_of_week: days }, timeZone, after);
}
