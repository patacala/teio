import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendIndicator } from './trend-indicator';

export interface StatCardProps {
  label: string;
  value: string | number | undefined;
  icon: React.ReactNode;
  variant?: 'metric' | 'panel';
  trend?: number;
  suffix?: string;
  loading?: boolean;
  footer?: React.ReactNode;
}

export function StatCard({ label, value, icon, variant = 'panel', trend, suffix, loading, footer }: StatCardProps) {
  return (
    <Card variant={variant} className="flex h-full flex-col p-5">
      <span className="icon-tile">{icon}</span>
      <p className="mt-4 text-xs font-medium text-secondary">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <p className="text-[26px] font-semibold leading-8 tracking-tight text-primary">
            {value ?? '—'}
            {suffix && <span className="ml-1.5 text-base font-medium text-muted">{suffix}</span>}
          </p>
          {trend !== undefined && <TrendIndicator trend={trend} />}
        </div>
      )}
      <div className="mt-auto pt-4">
        <div className="border-t border-subtle pt-3 text-xs text-muted">{!loading && footer}</div>
      </div>
    </Card>
  );
}
