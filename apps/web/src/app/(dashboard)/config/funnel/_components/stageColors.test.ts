import { describe, expect, it } from 'vitest';
import { STAGE_PALETTE, stageColor } from './stageColors';
import { relativeTime } from './contactCardHelpers';

describe('stageColor', () => {
  it('keeps palette colors, case-insensitively', () => {
    for (const { value } of STAGE_PALETTE) {
      expect(stageColor(value)).toBe(value);
      expect(stageColor(value.toUpperCase())).toBe(value);
    }
  });

  it('maps every legacy picker color to a distinct palette color', () => {
    const legacy = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#EF4444', '#14B8A6'];
    const mapped = legacy.map(stageColor);
    const palette = STAGE_PALETTE.map((p) => p.value as string);

    expect(mapped.every((c) => palette.includes(c))).toBe(true);
    expect(new Set(mapped).size).toBe(legacy.length);
  });

  it('snaps any other hex to the nearest palette color', () => {
    expect(stageColor('#ff0000')).toBe('#e87962');
    expect(stageColor('#00ffff')).toBe('#62c5c5');
  });

  it('falls back to a neutral token for missing or invalid colors', () => {
    expect(stageColor(undefined)).toBe('#86897f');
    expect(stageColor('blue')).toBe('#86897f');
  });
});

describe('relativeTime', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('reads in English', () => {
    expect(relativeTime(ago(10_000))).toBe('just now');
    expect(relativeTime(ago(5 * 60_000))).toBe('5m ago');
    expect(relativeTime(ago(3 * 3_600_000))).toBe('3h ago');
    expect(relativeTime(ago(2 * 86_400_000))).toBe('2d ago');
  });
});
