import { describe, expect, it } from 'vitest';
import { demoTimeLeft } from './billing-labels';

describe('demoTimeLeft', () => {
  const now = new Date(2026, 5, 15, 10, 0); // June 15, 10:00 local time

  it.each([
    [new Date(2026, 5, 15, 23, 59), 'ends today'],
    [new Date(2026, 5, 16, 8, 0), '1 day left'], // less than 24h away, but tomorrow
    [new Date(2026, 5, 20, 9, 59), '5 days left'], // a few minutes short of 5 full days
    [new Date(2026, 5, 22, 10, 0), '7 days left'],
    [new Date(2026, 5, 15, 10, 0), 'ended'],
    [new Date(2026, 5, 14, 12, 0), 'ended'],
  ])('%s → %s', (end, expected) => {
    expect(demoTimeLeft(end.toISOString(), now)).toBe(expected);
  });
});
