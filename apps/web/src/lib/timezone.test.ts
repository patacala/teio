import { describe, expect, it } from 'vitest';
import { formatZonedTime, fromZonedInputValue, listTimeZones, localDate, toZonedInputValue, zonedTimeToUtc } from './timezone';

describe('calendar time zone helpers', () => {
  it('reads and writes datetime-local values on the calendar wall clock', () => {
    expect(fromZonedInputValue('2026-03-23T09:00', 'America/Mexico_City')?.toISOString()).toBe('2026-03-23T15:00:00.000Z');
    expect(toZonedInputValue('2026-03-23T15:00:00.000Z', 'America/Mexico_City')).toBe('2026-03-23T09:00');
    expect(toZonedInputValue('2026-03-23T00:30:00.000Z', 'Asia/Tokyo')).toBe('2026-03-23T09:30');
    expect(formatZonedTime('2026-03-23T15:00:00.000Z', 'America/Mexico_City')).toBe('09:00');
  });

  it('handles DST and invalid input', () => {
    expect(zonedTimeToUtc('2026-03-08', 150, 'America/New_York')).toBeNull();
    expect(fromZonedInputValue('nope', 'UTC')).toBeNull();
    expect(localDate(new Date('2026-03-23T20:00:00Z'), 'Asia/Tokyo')).toBe('2026-03-24');
  });

  it('lists IANA zones for pickers', () => {
    const zones = listTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('America/Mexico_City');
  });
});
