import { durationMs, nextBusinessTime, nextOccurrence, nextWallTime, wallTimeToUtc } from './automation-time';

const MX = 'America/Mexico_City'; // UTC-6, no DST
const NY = 'America/New_York'; // DST: 2026-03-08 (spring forward), 2026-11-01 (fall back)
const at = (iso: string) => new Date(iso);

describe('nextOccurrence', () => {
  it('daily: later today, else tomorrow, in the schedule time zone', () => {
    expect(nextOccurrence({ frequency: 'daily', time: '09:00' }, MX, at('2026-03-20T14:00:00Z'))?.toISOString()).toBe('2026-03-20T15:00:00.000Z');
    expect(nextOccurrence({ frequency: 'daily', time: '09:00' }, MX, at('2026-03-20T15:00:00Z'))?.toISOString()).toBe('2026-03-21T15:00:00.000Z');
  });

  it('weekly: the next listed weekday (Monday and Thursday)', () => {
    // 2026-03-20 is a Friday
    expect(nextOccurrence({ frequency: 'weekly', time: '08:30', days_of_week: [1, 4] }, MX, at('2026-03-20T12:00:00Z'))?.toISOString()).toBe(
      '2026-03-23T14:30:00.000Z',
    );
    expect(nextOccurrence({ frequency: 'weekly', time: '08:30', days_of_week: [] }, MX, at('2026-03-20T12:00:00Z'))).toBeNull();
  });

  it('monthly: short months use their last day', () => {
    expect(nextOccurrence({ frequency: 'monthly', time: '10:00', day_of_month: 31 }, 'UTC', at('2026-02-01T00:00:00Z'))?.toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
    expect(nextOccurrence({ frequency: 'monthly', time: '10:00', day_of_month: 31 }, 'UTC', at('2026-02-28T10:00:00Z'))?.toISOString()).toBe(
      '2026-03-31T10:00:00.000Z',
    );
    expect(nextOccurrence({ frequency: 'monthly', time: '10:00', day_of_month: 15 }, 'UTC', at('2026-12-20T00:00:00Z'))?.toISOString()).toBe(
      '2027-01-15T10:00:00.000Z',
    );
  });

  it('once: fires a single time, never in the past', () => {
    const spec = { frequency: 'once' as const, time: '18:00', date: '2026-04-01' };
    expect(nextOccurrence(spec, MX, at('2026-03-20T00:00:00Z'))?.toISOString()).toBe('2026-04-02T00:00:00.000Z');
    expect(nextOccurrence(spec, MX, at('2026-04-02T00:00:00Z'))).toBeNull();
  });

  it('follows daylight-saving changes', () => {
    // 09:00 New York is 14:00Z before the change and 13:00Z after it.
    expect(nextOccurrence({ frequency: 'daily', time: '09:00' }, NY, at('2026-03-07T15:00:00Z'))?.toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(nextOccurrence({ frequency: 'daily', time: '09:00' }, NY, at('2026-10-31T14:00:00Z'))?.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('a time skipped by the spring-forward gap runs right after the gap', () => {
    // 02:30 does not exist in New York on 2026-03-08: run at 03:00 local (07:00Z).
    expect(wallTimeToUtc('2026-03-08', 150, NY).toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  it('rejects invalid specs', () => {
    expect(nextOccurrence({ frequency: 'daily', time: '25:00' }, MX, at('2026-03-20T00:00:00Z'))).toBeNull();
    expect(nextOccurrence({ frequency: 'monthly', time: '10:00', day_of_month: 0 }, MX, at('2026-03-20T00:00:00Z'))).toBeNull();
    expect(nextOccurrence({ frequency: 'once', time: '10:00' }, MX, at('2026-03-20T00:00:00Z'))).toBeNull();
  });
});

describe('business hours', () => {
  const hours = { work_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00', timezone: MX };

  it('keeps a time inside business hours', () => {
    expect(nextBusinessTime(at('2026-03-20T17:00:00Z'), hours).toISOString()).toBe('2026-03-20T17:00:00.000Z'); // Fri 11:00
  });

  it('moves an early-morning time to today at opening', () => {
    expect(nextBusinessTime(at('2026-03-20T12:00:00Z'), hours).toISOString()).toBe('2026-03-20T15:00:00.000Z'); // Fri 06:00 → 09:00
  });

  it('moves an evening or weekend time to the next working day at opening', () => {
    expect(nextBusinessTime(at('2026-03-21T01:00:00Z'), hours).toISOString()).toBe('2026-03-23T15:00:00.000Z'); // Fri 19:00 → Mon 09:00
    expect(nextBusinessTime(at('2026-03-22T18:00:00Z'), hours).toISOString()).toBe('2026-03-23T15:00:00.000Z'); // Sun → Mon
  });

  it('accepts calendar hours stored with seconds (PostgreSQL time columns)', () => {
    const stored = { ...hours, start_time: '09:00:00', end_time: '18:00:00' };
    expect(nextBusinessTime(at('2026-03-20T12:00:00Z'), stored).toISOString()).toBe('2026-03-20T15:00:00.000Z');
  });

  it('leaves the time alone when the calendar has no usable hours', () => {
    expect(nextBusinessTime(at('2026-03-22T18:00:00Z'), { ...hours, work_days: [] }).toISOString()).toBe('2026-03-22T18:00:00.000Z');
  });
});

describe('waits', () => {
  it('converts durations', () => {
    expect(durationMs({ amount: 2, unit: 'hours' })).toBe(7_200_000);
    expect(durationMs({ amount: 1, unit: 'days' })).toBe(86_400_000);
    expect(durationMs({ amount: -5, unit: 'minutes' })).toBe(0);
  });

  it('waits until a time of day, on given days', () => {
    expect(nextWallTime('10:00', [1], MX, at('2026-03-20T12:00:00Z'))?.toISOString()).toBe('2026-03-23T16:00:00.000Z');
    expect(nextWallTime('10:00', undefined, MX, at('2026-03-20T12:00:00Z'))?.toISOString()).toBe('2026-03-20T16:00:00.000Z');
  });
});
