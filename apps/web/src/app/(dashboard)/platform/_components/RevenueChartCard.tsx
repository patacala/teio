'use client';

import { TrendingUp } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PlatformRevenueMonth } from '@crm/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney, formatMoneyCompact } from '@/components/dashboard/format';
import { EmptyChart, SectionHeader } from '@/components/dashboard/section-header';
import {
  CHART_COLORS,
  chartAxisProps,
  chartFrameProps,
  chartGridProps,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from '@/lib/chart-theme';

const HEIGHT = 260;

function monthLabel(month: string, withYear = false): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** Cash actually collected each month (bars) against recurring revenue at the end of the month (line). */
export function RevenueChartCard({ months, loading }: { months: PlatformRevenueMonth[] | undefined; loading: boolean }) {
  const hasData = !!months?.some((month) => month.collected > 0 || (month.mrr ?? 0) > 0);
  const collected12 = (months ?? []).reduce((total, month) => total + month.collected, 0);

  return (
    <Card className="h-full overflow-hidden">
      <SectionHeader
        icon={<TrendingUp className="h-4 w-4" />}
        title="Revenue"
        subtitle="Cash collected and MRR, last 12 months"
        action={!loading && hasData && (
          <p className="shrink-0 text-right text-xs text-muted">
            <span className="block text-[15px] font-semibold text-primary">{formatMoney(collected12)}</span>
            collected in 12 months
          </p>
        )}
      />
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="w-full rounded-row" style={{ height: HEIGHT }} />
        ) : !months ? (
          <EmptyChart height={HEIGHT}>Revenue is unavailable right now</EmptyChart>
        ) : !hasData ? (
          <EmptyChart height={HEIGHT}>No revenue yet</EmptyChart>
        ) : (
          <div {...chartFrameProps} role="img" aria-label="Revenue by month: cash collected and MRR">
            <ResponsiveContainer width="100%" height={HEIGHT}>
              <ComposedChart data={months} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="month" {...chartAxisProps} tickFormatter={(m: string) => monthLabel(m)} />
                <YAxis {...chartAxisProps} width={52} tickFormatter={(cents: number) => formatMoneyCompact(cents)} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                  cursor={{ fill: 'var(--color-surface-hover)' }}
                  labelFormatter={(m: string) => monthLabel(m, true)}
                  formatter={(value: number) => formatMoney(value)}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v: string) => <span className="text-xs text-secondary">{v}</span>}
                />
                <Bar dataKey="collected" name="Cash collected" fill={CHART_COLORS.lime} radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Line
                  type="monotone"
                  dataKey="mrr"
                  name="MRR"
                  stroke={CHART_COLORS.purple}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
