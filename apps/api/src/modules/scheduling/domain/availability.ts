import {
  addDays,
  daysBetween,
  isDateOnly,
  localDate,
  localMinutes,
  weekdayOf,
  zonedTimeToUtc,
} from './timezone';

export const MAX_AVAILABILITY_DAYS = 62;

/** A calendar's booking rules, normalized from the work_schedules row. */
export interface ScheduleRules {
  timezone: string;
  workDays: number[];
  startMinutes: number;
  endMinutes: number;
  slotMinutes: number;
  bufferMinutes: number;
  blockedDates: Set<string>;
  isActive: boolean;
  /** Bookings must start at least this long after now. */
  minNoticeMinutes: number;
  /** Bookings must start within this many days from now (null = no limit). */
  maxAdvanceDays: number | null;
}

export interface ScheduleLike {
  timezone: string;
  work_days: unknown[] | null;
  start_time: unknown;
  end_time: unknown;
  slot_duration_minutes: unknown;
  buffer_minutes: unknown;
  blocked_dates: unknown[] | null;
  is_active?: boolean | null;
  min_notice_minutes?: unknown;
  max_advance_days?: unknown;
}

export interface BusyInterval {
  id?: string;
  start: Date;
  end: Date;
}

export interface Slot {
  starts_at: string;
  ends_at: string;
}

export type BookingViolation =
  | 'invalid_time_range'
  | 'calendar_inactive'
  | 'in_past'
  | 'non_working_day'
  | 'blocked_date'
  | 'outside_working_hours'
  | 'too_soon'
  | 'too_far'
  | 'conflict';

/** Postgres TIME may come back as 'HH:MM' or 'HH:MM:SS'. */
export function parseTimeToMinutes(value: unknown): number {
  const [h, m] = String(value ?? '00:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Postgres DATE[] may come back as Date objects or 'YYYY-MM-DD' strings. */
function normalizeDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function toScheduleRules(schedule: ScheduleLike): ScheduleRules {
  return {
    timezone: schedule.timezone || 'UTC',
    workDays: (schedule.work_days ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    startMinutes: parseTimeToMinutes(schedule.start_time),
    endMinutes: parseTimeToMinutes(schedule.end_time),
    slotMinutes: Math.max(5, Number(schedule.slot_duration_minutes) || 30),
    bufferMinutes: Math.max(0, Number(schedule.buffer_minutes) || 0),
    blockedDates: new Set((schedule.blocked_dates ?? []).map(normalizeDate)),
    isActive: schedule.is_active !== false,
    minNoticeMinutes: Math.max(0, Number(schedule.min_notice_minutes) || 0),
    maxAdvanceDays:
      schedule.max_advance_days === null || schedule.max_advance_days === undefined || schedule.max_advance_days === ''
        ? null
        : Math.max(1, Number(schedule.max_advance_days) || 1),
  };
}

function overlapsBusy(start: number, end: number, busy: BusyInterval[], bufferMs: number, excludeId?: string): boolean {
  return busy.some(
    (b) =>
      (excludeId === undefined || b.id !== excludeId) &&
      start < b.end.getTime() + bufferMs &&
      end > b.start.getTime() - bufferMs,
  );
}

/**
 * Converts a from/to query value to a local calendar date. Plain dates are
 * taken as-is; full timestamps are read on the calendar's wall clock.
 */
export function toLocalDate(value: string, timeZone: string): string | null {
  if (isDateOnly(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return localDate(instant, timeZone);
}

/** The window in which a booking may start: [now + notice, now + horizon]. */
function bookingWindow(rules: ScheduleRules, now: Date): { earliest: number; latest: number } {
  return {
    earliest: now.getTime() + rules.minNoticeMinutes * 60_000,
    latest: rules.maxAdvanceDays === null ? Number.POSITIVE_INFINITY : now.getTime() + rules.maxAdvanceDays * 86_400_000,
  };
}

/**
 * Bookable slots between two local dates (inclusive). Slots start on the
 * calendar's grid (slot size), last `durationMinutes`, stay inside working
 * hours, skip blocked dates and local times removed by DST, respect the
 * minimum notice and booking horizon, and keep `bufferMinutes` away from every
 * busy interval.
 */
export function generateSlots(
  rules: ScheduleRules,
  params: { fromDate: string; toDate: string; durationMinutes: number; busy: BusyInterval[]; now: Date },
): Slot[] {
  if (!rules.isActive) return [];
  const { fromDate, toDate, durationMinutes, busy, now } = params;
  const bufferMs = rules.bufferMinutes * 60_000;
  const { earliest, latest } = bookingWindow(rules, now);
  const slots: Slot[] = [];
  const days = daysBetween(fromDate, toDate);

  for (let i = 0; i <= days; i++) {
    const date = addDays(fromDate, i);
    if (!rules.workDays.includes(weekdayOf(date)) || rules.blockedDates.has(date)) continue;

    for (let minute = rules.startMinutes; minute + durationMinutes <= rules.endMinutes; minute += rules.slotMinutes) {
      const start = zonedTimeToUtc(date, minute, rules.timezone);
      if (!start) continue;
      const startMs = start.getTime();
      const endMs = startMs + durationMinutes * 60_000;
      if (startMs < earliest || startMs > latest) continue;
      if (overlapsBusy(startMs, endMs, busy, bufferMs)) continue;
      slots.push({ starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString() });
    }
  }
  return slots;
}

/** Every rule a booking at [start, end) breaks, read on the calendar's wall clock. */
export function checkBookingWindow(rules: ScheduleRules, start: Date, end: Date, now: Date): BookingViolation[] {
  if (!(end.getTime() > start.getTime())) return ['invalid_time_range'];
  const violations: BookingViolation[] = [];
  if (!rules.isActive) violations.push('calendar_inactive');
  const { earliest, latest } = bookingWindow(rules, now);
  if (start.getTime() < now.getTime() - 60_000) violations.push('in_past');
  else if (start.getTime() < earliest - 60_000) violations.push('too_soon');
  if (start.getTime() > latest) violations.push('too_far');

  const startDate = localDate(start, rules.timezone);
  const endDate = localDate(end, rules.timezone);
  const startMin = localMinutes(start, rules.timezone);
  const endMin = localMinutes(end, rules.timezone);
  const endsAtMidnight = endMin === 0 && endDate === addDays(startDate, 1);

  if (!rules.workDays.includes(weekdayOf(startDate))) violations.push('non_working_day');
  if (rules.blockedDates.has(startDate)) violations.push('blocked_date');

  const sameDay = endDate === startDate || endsAtMidnight;
  const effectiveEnd = endsAtMidnight ? 24 * 60 : endMin;
  if (!sameDay || startMin < rules.startMinutes || effectiveEnd > rules.endMinutes) {
    violations.push('outside_working_hours');
  }
  return violations;
}

/** True when [start, end) is closer than the calendar buffer to a busy interval. */
export function hasConflict(
  rules: ScheduleRules,
  start: Date,
  end: Date,
  busy: BusyInterval[],
  excludeId?: string,
): boolean {
  return overlapsBusy(start.getTime(), end.getTime(), busy, rules.bufferMinutes * 60_000, excludeId);
}
