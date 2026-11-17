import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Percent change from `previous` to `current`; 100 when starting from zero, 0 when both are zero. */
export function percentChange(current: number, previous: number): number {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? 100 : 0;
}

/** "↑ 12% vs prev period" in green, red when it went down, "No change" otherwise. */
export function TrendIndicator({ trend, comparison = 'vs prev period' }: { trend: number; comparison?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        trend > 0 ? 'text-success' : trend < 0 ? 'text-danger' : 'text-muted',
      )}
    >
      {trend > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : trend < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
      {trend === 0 ? 'No change' : `${Math.abs(trend)}% ${comparison}`}
    </span>
  );
}
