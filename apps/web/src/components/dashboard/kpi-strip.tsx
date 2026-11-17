import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Many headline numbers in one dense card: cells separated by hairlines
 * instead of one tall card each, so the page keeps room for the tables
 * that explain them. Use a number of cells that fills its rows (e.g. 8).
 */
export function KpiStrip({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <section aria-label={label} className={cn('overflow-hidden rounded-card border border-subtle bg-divider', className)}>
      <div className="grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

type Tone = 'default' | 'danger' | 'warning' | 'success';

const TONE: Record<Tone, string> = {
  default: 'text-primary',
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
};

interface KpiStatProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  /** Next to the value, e.g. a <TrendIndicator />. */
  delta?: React.ReactNode;
  /** One or two short lines of context under the value. */
  footer?: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
}

export function KpiStat({ label, value, icon, delta, footer, tone = 'default', loading }: KpiStatProps) {
  return (
    <div className="flex min-w-0 flex-col bg-surface p-4" role="group" aria-label={label}>
      <div className="flex items-center gap-2 text-secondary">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-olive-dark text-accent [&_svg]:h-3.5 [&_svg]:w-3.5">
          {icon}
        </span>
        <p className="truncate text-xs font-medium">{label}</p>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className={cn('text-[22px] font-semibold leading-7 tracking-tight tabular-nums', TONE[tone])}>{value ?? '—'}</p>
            {delta}
          </div>
          {footer && <div className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-muted">{footer}</div>}
        </>
      )}
    </div>
  );
}
