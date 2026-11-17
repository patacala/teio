'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { CHART_COLORS, CHART_SEGMENT_STROKE, chartFrameProps } from '@/lib/chart-theme';

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

interface FunnelPipelineProps {
  steps: FunnelStep[];
  /** Closed outcomes shown under the funnel (e.g. won / lost deals); hidden when both are zero. */
  outcomes?: { won: number; lost: number };
  /** Noun after each count: "12 leads". */
  unit?: string;
  emptyText?: string;
  /**
   * `graphic`: a drawn funnel next to the step cards (needs a wide card).
   * `bars`: one row per step with a centered bar, for narrow columns.
   */
  layout?: 'graphic' | 'bars';
}

const conversionFrom = (steps: FunnelStep[], index: number) => {
  const previous = index > 0 ? steps[index - 1].count : null;
  return previous && previous > 0 ? Math.round((steps[index].count / previous) * 100) : null;
};

/**
 * A funnel drawn to scale, with each step's count and its conversion from
 * the step before.
 */
export function FunnelPipeline({
  steps, outcomes, unit = 'leads', emptyText = 'No funnel data yet', layout = 'graphic',
}: FunnelPipelineProps) {
  const gradientId = `funnelGradient-${useId().replace(/:/g, '')}`;
  const max = Math.max(...steps.map((step) => step.count), 1);

  if (steps.length === 0) {
    return <p className="py-12 text-center text-sm text-muted">{emptyText}</p>;
  }

  if (layout === 'bars') {
    return (
      <ol className="space-y-1.5" aria-label="Funnel steps">
        {steps.map((step, index) => {
          const conversion = conversionFrom(steps, index);
          return (
            <li key={step.key} className="rounded-row border border-white/6 bg-surface-raised px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[13px] font-medium text-primary">{step.label}</p>
                <p className="shrink-0 text-[17px] font-semibold leading-6 tabular-nums text-primary">{step.count}</p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
                <div
                  className="mx-auto h-full rounded-full bg-linear-to-r from-olive/60 via-chart-lime/80 to-olive/60"
                  style={{ width: `${Math.max((step.count / max) * 100, step.count > 0 ? 3 : 0)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {step.count} {unit}
                {conversion != null && (
                  <span className="ml-2 font-medium text-accent">{conversion}% of previous step</span>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    );
  }

  const stageHeight = 56;
  const stageGap = 4;
  const totalHeight = steps.length * stageHeight + (steps.length - 1) * stageGap;
  const won = outcomes?.won ?? 0;
  const lost = outcomes?.lost ?? 0;

  return (
    <div {...chartFrameProps} className={cn('relative', chartFrameProps.className)}>
      <div className="flex items-center gap-6">
        <svg
          viewBox={`0 0 100 ${totalHeight}`}
          preserveAspectRatio="none"
          className="h-auto w-full max-w-md"
          style={{ height: totalHeight }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: CHART_COLORS.lime, stopOpacity: 0.7 }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-olive)', stopOpacity: 0.4 }} />
            </linearGradient>
          </defs>
          {steps.map((step, index) => {
            const y = index * (stageHeight + stageGap);
            const widthTop = Math.max((step.count / max) * 100, 8);
            const nextStep = steps[index + 1];
            const widthBottom = nextStep ? Math.max((nextStep.count / max) * 100, 8) : widthTop;
            const leftTop = (100 - widthTop) / 2;
            const leftBottom = (100 - widthBottom) / 2;

            return (
              <path
                key={step.key}
                d={`M ${leftTop} ${y} 
                    L ${leftTop + widthTop} ${y} 
                    L ${leftBottom + widthBottom} ${y + stageHeight} 
                    L ${leftBottom} ${y + stageHeight} 
                    Z`}
                fill={`url(#${gradientId})`}
                stroke={CHART_SEGMENT_STROKE}
                strokeWidth="0.5"
                className="transition-all duration-300"
              />
            );
          })}
        </svg>

        <div className="flex-1 space-y-1">
          {steps.map((step, index) => {
            const conversion = conversionFrom(steps, index);

            return (
              <div
                key={step.key}
                className="flex h-14 items-center justify-between rounded-row border border-white/6 bg-surface-raised px-4"
              >
                <div>
                  <p className="text-sm font-medium text-primary">{step.label}</p>
                  <p className="text-xs text-muted">
                    {step.count} {unit}
                    {conversion != null && (
                      <span className="ml-2 font-medium text-accent">{conversion}% conversion</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[22px] font-semibold text-primary">{step.count}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(won > 0 || lost > 0) && (
        <div className="mt-4 flex items-center justify-center gap-8 rounded-row border border-white/6 bg-surface-raised py-4">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-success">Won</p>
            <p className="mt-1 text-[22px] font-semibold text-primary">{won}</p>
          </div>
          <div className="h-8 w-px bg-divider" />
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-danger">Lost</p>
            <p className="mt-1 text-[22px] font-semibold text-primary">{lost}</p>
          </div>
        </div>
      )}
    </div>
  );
}
