import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cn, formatRelativeTime, formatTime, getInitials } from './utils';

describe('cn', () => {
  it('joins conditional classes and drops falsy values', () => {
    expect(cn('px-2', false && 'hidden', undefined, { 'text-accent': true, 'text-muted': false })).toBe(
      'px-2 text-accent',
    );
  });

  it('lets the last conflicting tailwind class win', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('treats the custom radius tokens as one conflict group', () => {
    expect(cn('rounded-panel', 'rounded-card')).toBe('rounded-card');
    expect(cn('rounded-lg', 'rounded-control')).toBe('rounded-control');
  });

  it('treats the custom shadow tokens as one conflict group', () => {
    expect(cn('shadow-panel', 'shadow-menu')).toBe('shadow-menu');
    expect(cn('shadow-sm', 'shadow-panel')).toBe('shadow-panel');
  });
});

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [59, '0:59'],
    [60, '1:00'],
    [125, '2:05'],
    [3600, '60:00'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected);
  });
});

describe('getInitials', () => {
  it('uses the first letter of the first two words, uppercased', () => {
    expect(getInitials('ada lovelace')).toBe('AL');
  });

  it('caps the result at two letters', () => {
    expect(getInitials('Juan Carlos Perez')).toBe('JC');
  });

  it('handles a single name', () => {
    expect(getInitials('Cher')).toBe('C');
  });

  it('ignores repeated spaces between words', () => {
    expect(getInitials('Ada  Lovelace')).toBe('AL');
  });

  it('returns an empty string for an empty name', () => {
    expect(getInitials('')).toBe('');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-03-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('returns "just now" for less than a minute', () => {
    expect(formatRelativeTime(ago(59_000))).toBe('just now');
  });

  it('returns "just now" for timestamps slightly in the future', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 30_000))).toBe('just now');
  });

  it('returns minutes below one hour', () => {
    expect(formatRelativeTime(ago(MIN))).toBe('1m');
    expect(formatRelativeTime(ago(59 * MIN))).toBe('59m');
  });

  it('returns hours below one day', () => {
    expect(formatRelativeTime(ago(HOUR))).toBe('1h');
    expect(formatRelativeTime(ago(23 * HOUR + 59 * MIN))).toBe('23h');
  });

  it('returns days below one week', () => {
    expect(formatRelativeTime(ago(DAY))).toBe('1d');
    expect(formatRelativeTime(ago(6 * DAY))).toBe('6d');
  });

  it('falls back to the locale date from one week on', () => {
    const date = ago(7 * DAY);
    expect(formatRelativeTime(date)).toBe(date.toLocaleDateString());
  });

  it('accepts ISO strings', () => {
    expect(formatRelativeTime(ago(5 * MIN).toISOString())).toBe('5m');
  });
});
