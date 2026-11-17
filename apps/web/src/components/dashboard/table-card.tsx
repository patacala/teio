import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TableCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Search box, filters… shown next to the title. */
  toolbar?: React.ReactNode;
  /** Extra row under the header (e.g. filter chips). */
  filters?: React.ReactNode;
  isLoading: boolean;
  isError: boolean;
  errorText: string;
  onRetry: () => void;
  isEmpty: boolean;
  empty: { title: string; hint?: string };
  /** Pagination, shown under the table. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  loadingRows?: number;
}

/** A titled table with its loading, error (with retry) and empty states. */
export function TableCard({
  icon, title, subtitle, toolbar, filters, isLoading, isError, errorText, onRetry, isEmpty, empty, footer, children, className,
  loadingRows = 5,
}: TableCardProps) {
  return (
    <section aria-label={title} className={cn('overflow-hidden rounded-xl border border-subtle bg-surface shadow-xs', className)}>
      <div className="flex flex-col gap-3 border-b border-subtle px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-olive-dark text-accent [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-primary">{title}</h2>
            {subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}
          </div>
        </div>
        {toolbar}
      </div>
      {filters && <div className="border-b border-subtle px-5 py-3">{filters}</div>}

      {isLoading ? (
        <div className="space-y-3 px-5 py-6" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
          {Array.from({ length: loadingRows }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-raised" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-center">
          <p className="text-sm text-secondary">{errorText}</p>
          <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
          <p className="text-sm text-secondary">{empty.title}</p>
          {empty.hint && <p className="mt-0.5 text-[11px] text-muted">{empty.hint}</p>}
        </div>
      ) : (
        <>
          <div className="relative overflow-x-auto">{children}</div>
          {footer}
        </>
      )}
    </section>
  );
}
