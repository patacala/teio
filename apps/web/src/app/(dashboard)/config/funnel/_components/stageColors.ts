/** Stage colors offered by the picker: design-system chart/status tokens (globals.css). */
export const STAGE_PALETTE = [
  { value: '#62c5c5', label: 'Cyan' },
  { value: '#a77be8', label: 'Purple' },
  { value: '#ef7897', label: 'Pink' },
  { value: '#efc32e', label: 'Yellow' },
  { value: '#a8ef43', label: 'Lime' },
  { value: '#647d32', label: 'Olive' },
  { value: '#e87962', label: 'Red' },
  { value: '#b4b5ae', label: 'Gray' },
] as const;

export const DEFAULT_STAGE_COLOR = STAGE_PALETTE[0].value;
const NEUTRAL = '#86897f';

/** Colors stored by the previous picker and the seeded templates, mapped one-to-one. */
const LEGACY_COLORS: Record<string, string> = {
  '#3b82f6': '#62c5c5',
  '#8b5cf6': '#a77be8',
  '#ec4899': '#ef7897',
  '#f59e0b': '#efc32e',
  '#10b981': '#a8ef43',
  '#14b8a6': '#647d32',
  '#ef4444': '#e87962',
  '#6366f1': '#b4b5ae',
};

function rgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Color to render for a stage. Stored colors are kept as-is in the database;
 * anything outside the palette is shown as its legacy mapping or the nearest
 * palette color, so every funnel stays on the design system.
 */
export function stageColor(color?: string | null): string {
  if (!color) return NEUTRAL;
  const key = color.toLowerCase();
  if (STAGE_PALETTE.some((p) => p.value === key)) return key;
  if (LEGACY_COLORS[key]) return LEGACY_COLORS[key];
  const source = rgb(key);
  if (!source) return NEUTRAL;
  let best: string = NEUTRAL;
  let bestDistance = Infinity;
  for (const { value } of STAGE_PALETTE) {
    const target = rgb(value)!;
    const distance = target.reduce((sum, channel, i) => sum + (channel - source[i]) ** 2, 0);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = value;
    }
  }
  return best;
}
