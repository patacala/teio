import { checkBookingWindow, generateSlots, hasConflict, toLocalDate, toScheduleRules } from './availability';
import { isValidTimeZone, localDate, localMinutes, zonedTimeToUtc } from './timezone';

const weekdays = {
  work_days: [1, 2, 3, 4, 5],
  start_time: '09:00:00',
  end_time: '18:00:00',
  slot_duration_minutes: 60,
  buffer_minutes: 0,
  blocked_dates: [] as string[],
};

const wall = (iso: string, tz: string) => `${localDate(new Date(iso), tz)} ${String(Math.floor(localMinutes(new Date(iso), tz) / 60)).padStart(2, '0')}:${String(localMinutes(new Date(iso), tz) % 60).padStart(2, '0')}`;
const PAST = new Date('2000-01-01T00:00:00Z');

describe('timezone helpers', () => {
  it('converts wall-clock times to instants across DST', () => {
    expect(zonedTimeToUtc('2026-03-23', 9 * 60, 'America/Mexico_City')?.toISOString()).toBe('2026-03-23T15:00:00.000Z');
    expect(zonedTimeToUtc('2026-07-01', 9 * 60, 'America/New_York')?.toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedTimeToUtc('2026-01-05', 9 * 60, 'America/New_York')?.toISOString()).toBe('2026-01-05T14:00:00.000Z');
    expect(zonedTimeToUtc('2026-03-23', 9 * 60, 'Asia/Tokyo')?.toISOString()).toBe('2026-03-23T00:00:00.000Z');
  });

  it('returns null for local times skipped by spring-forward and the first occurrence on fall-back', () => {
    expect(zonedTimeToUtc('2026-03-08', 2 * 60 + 30, 'America/New_York')).toBeNull();
    expect(zonedTimeToUtc('2026-11-01', 60 + 30, 'America/New_York')?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('validates IANA names', () => {
    expect(isValidTimeZone('America/Mexico_City')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mexico City')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('generateSlots', () => {
  it('applies working hours in the calendar time zone (Mexico City)', () => {
    const rules = toScheduleRules({ ...weekdays, timezone: 'America/Mexico_City' });
    const slots = generateSlots(rules, { fromDate: '2026-03-23', toDate: '2026-03-23', durationMinutes: 60, busy: [], now: PAST });
    expect(slots).toHaveLength(9);
    expect(wall(slots[0].starts_at, 'America/Mexico_City')).toBe('2026-03-23 09:00');
    expect(wall(slots[8].starts_at, 'America/Mexico_City')).toBe('2026-03-23 17:00');
  });

  it('uses the local weekday (Tokyo Monday morning is offered)', () => {
    const rules = toScheduleRules({ ...weekdays, timezone: 'Asia/Tokyo' });
    const monday = generateSlots(rules, { fromDate: '2026-03-23', toDate: '2026-03-23', durationMinutes: 60, busy: [], now: PAST });
    expect(monday[0].starts_at).toBe('2026-03-23T00:00:00.000Z');
    const saturday = generateSlots(rules, { fromDate: '2026-03-28', toDate: '2026-03-28', durationMinutes: 60, busy: [], now: PAST });
    expect(saturday).toHaveLength(0);
  });

  it('keeps local hours across a DST change', () => {
    const rules = toScheduleRules({ ...weekdays, work_days: [0, 1], timezone: 'America/New_York' });
    const [sun] = generateSlots(rules, { fromDate: '2026-03-08', toDate: '2026-03-08', durationMinutes: 60, busy: [], now: PAST });
    const [mon] = generateSlots(rules, { fromDate: '2026-03-09', toDate: '2026-03-09', durationMinutes: 60, busy: [], now: PAST });
    expect(wall(sun.starts_at, 'America/New_York')).toBe('2026-03-08 09:00');
    expect(wall(mon.starts_at, 'America/New_York')).toBe('2026-03-09 09:00');
    expect(sun.starts_at).toBe('2026-03-08T13:00:00.000Z');
  });

  it('skips blocked local dates', () => {
    const rules = toScheduleRules({ ...weekdays, timezone: 'Asia/Tokyo', blocked_dates: ['2026-03-24'] });
    const slots = generateSlots(rules, { fromDate: '2026-03-23', toDate: '2026-03-25', durationMinutes: 60, busy: [], now: PAST });
    expect(slots.some((s) => localDate(new Date(s.starts_at), 'Asia/Tokyo') === '2026-03-24')).toBe(false);
    expect(slots).toHaveLength(18);
  });

  it('never offers past slots', () => {
    const rules = toScheduleRules({ ...weekdays, timezone: 'UTC' });
    const now = new Date('2026-03-23T12:30:00Z');
    const slots = generateSlots(rules, { fromDate: '2026-03-23', toDate: '2026-03-23', durationMinutes: 60, busy: [], now });
    expect(slots[0].starts_at).toBe('2026-03-23T13:00:00.000Z');
  });

  it('steps on the calendar grid, not the requested duration', () => {
    const rules = toScheduleRules({ ...weekdays, slot_duration_minutes: 30, timezone: 'UTC' });
    const slots = generateSlots(rules, { fromDate: '2026-03-23', toDate: '2026-03-23', durationMinutes: 45, busy: [], now: PAST });
    expect(slots.slice(0, 3).map((s) => s.starts_at.slice(11, 16))).toEqual(['09:00', '09:30', '10:00']);
    expect(slots.at(-1)?.starts_at.slice(11, 16)).toBe('17:00');
  });

  it('keeps the buffer around busy intervals', () => {
    const rules = toScheduleRules({ ...weekdays, slot_duration_minutes: 30, buffer_minutes: 15, timezone: 'UTC' });
    const busy = [{ start: new Date('2026-03-23T10:00:00Z'), end: new Date('2026-03-23T10:30:00Z') }];
    const starts = generateSlots(rules, { fromDate: '2026-03-23', toDate: '2026-03-23', durationMinutes: 30, busy, now: PAST }).map((s) => s.starts_at.slice(11, 16));
    expect(starts).not.toContain('09:30');
    expect(starts).not.toContain('10:00');
    expect(starts).not.toContain('10:30');
    expect(starts).toContain('09:00');
    expect(starts).toContain('11:00');
  });

  it('returns nothing for an inactive calendar', () => {
    const rules = toScheduleRules({ ...weekdays, timezone: 'UTC', is_active: false });
    expect(generateSlots(rules, { fromDate: '2026-03-23', toDate: '2026-03-23', durationMinutes: 60, busy: [], now: PAST })).toEqual([]);
  });
});

describe('checkBookingWindow', () => {
  const rules = toScheduleRules({ ...weekdays, timezone: 'America/Mexico_City', blocked_dates: ['2026-03-25'] });
  const now = new Date('2026-03-20T00:00:00Z');
  const at = (iso: string, minutes = 60) => [new Date(iso), new Date(new Date(iso).getTime() + minutes * 60_000)] as const;

  it('accepts a booking inside local working hours', () => {
    expect(checkBookingWindow(rules, ...at('2026-03-23T15:00:00Z'), now)).toEqual([]);
    expect(checkBookingWindow(rules, ...at('2026-03-23T23:00:00Z'), now)).toEqual([]);
  });

  it('rejects bookings outside local hours, on weekends, blocked dates or in the past', () => {
    expect(checkBookingWindow(rules, ...at('2026-03-23T09:00:00Z'), now)).toEqual(['outside_working_hours']);
    expect(checkBookingWindow(rules, ...at('2026-03-23T23:30:00Z'), now)).toEqual(['outside_working_hours']);
    expect(checkBookingWindow(rules, ...at('2026-03-21T16:00:00Z'), now)).toEqual(['non_working_day']);
    expect(checkBookingWindow(rules, ...at('2026-03-25T16:00:00Z'), now)).toEqual(['blocked_date']);
    expect(checkBookingWindow(rules, ...at('2026-03-23T15:00:00Z'), new Date('2026-03-24T00:00:00Z'))).toEqual(['in_past']);
    expect(checkBookingWindow(rules, new Date('2026-03-23T15:00:00Z'), new Date('2026-03-23T15:00:00Z'), now)).toEqual(['invalid_time_range']);
  });

  it('detects conflicts with buffer and ignores the appointment being moved', () => {
    const buffered = toScheduleRules({ ...weekdays, buffer_minutes: 10, timezone: 'UTC' });
    const busy = [{ id: 'a', start: new Date('2026-03-23T10:00:00Z'), end: new Date('2026-03-23T11:00:00Z') }];
    expect(hasConflict(buffered, ...at('2026-03-23T11:05:00Z', 30), busy)).toBe(true);
    expect(hasConflict(buffered, ...at('2026-03-23T11:10:00Z', 30), busy)).toBe(false);
    expect(hasConflict(buffered, ...at('2026-03-23T10:30:00Z', 30), busy, 'a')).toBe(false);
  });
});

describe('minimum notice and booking horizon', () => {
  const now = new Date('2026-03-23T12:10:00Z');

  it('hides slots inside the notice period and beyond the horizon', () => {
    const rules = toScheduleRules({ ...weekdays, timezone: 'UTC', min_notice_minutes: 120, max_advance_days: 2 });
    const today = generateSlots(rules, { fromDate: '2026-03-23', toDate: '2026-03-23', durationMinutes: 60, busy: [], now });
    expect(today[0].starts_at).toBe('2026-03-23T15:00:00.000Z');
    const far = generateSlots(rules, { fromDate: '2026-03-26', toDate: '2026-03-26', durationMinutes: 60, busy: [], now });
    expect(far).toEqual([]);
    const edge = generateSlots(rules, { fromDate: '2026-03-25', toDate: '2026-03-25', durationMinutes: 60, busy: [], now });
    expect(edge.at(-1)?.starts_at).toBe('2026-03-25T12:00:00.000Z');
  });

  it('reports too_soon and too_far bookings', () => {
    const rules = toScheduleRules({ ...weekdays, timezone: 'UTC', min_notice_minutes: 120, max_advance_days: 2 });
    const hour = (iso: string) => [new Date(iso), new Date(new Date(iso).getTime() + 3_600_000)] as const;
    expect(checkBookingWindow(rules, ...hour('2026-03-23T13:00:00Z'), now)).toEqual(['too_soon']);
    expect(checkBookingWindow(rules, ...hour('2026-03-23T15:00:00Z'), now)).toEqual([]);
    expect(checkBookingWindow(rules, ...hour('2026-03-26T10:00:00Z'), now)).toEqual(['too_far']);
  });
});

describe('toLocalDate', () => {
  it('reads timestamps on the calendar wall clock', () => {
    expect(toLocalDate('2026-03-23', 'Asia/Tokyo')).toBe('2026-03-23');
    expect(toLocalDate('2026-03-23T20:00:00Z', 'Asia/Tokyo')).toBe('2026-03-24');
    expect(toLocalDate('nope', 'UTC')).toBeNull();
  });
});
