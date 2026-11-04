import type { CSSProperties } from 'react';

export const CHART_COLORS = {
  lime: 'var(--color-chart-lime)',
  purple: 'var(--color-chart-purple)',
  cyan: 'var(--color-chart-cyan)',
  pink: 'var(--color-chart-pink)',
  yellow: 'var(--color-chart-yellow)',
} as const;

export const CHART_SERIES = [
  CHART_COLORS.lime,
  CHART_COLORS.pink,
  CHART_COLORS.cyan,
  CHART_COLORS.yellow,
  CHART_COLORS.purple,
];

export const CHART_MUTED = 'var(--color-surface-pressed)';
export const CHART_SEGMENT_STROKE = 'var(--color-surface)';

export const chartTooltipStyle: CSSProperties = {
  backgroundColor: 'var(--color-surface-overlay)',
  border: '1px solid var(--border-color-strong)',
  borderRadius: '10px',
  boxShadow: 'var(--shadow-menu)',
  color: 'var(--text-color-primary)',
  fontSize: '12px',
  padding: '8px 10px',
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: 'var(--text-color-secondary)',
  marginBottom: 4,
};

export const chartTooltipItemStyle: CSSProperties = {
  color: 'var(--text-color-primary)',
  padding: 0,
};

export const chartTooltipCursor = { stroke: 'var(--border-color-strong)', strokeWidth: 1 };

export const chartAxisProps = {
  stroke: 'transparent',
  tick: { fontSize: 10, fill: 'var(--text-color-muted)' },
  tickLine: false,
  axisLine: false,
} as const;

export const chartGridProps = {
  stroke: 'rgb(255 255 255 / 6%)',
  strokeDasharray: '0',
  vertical: false,
} as const;
