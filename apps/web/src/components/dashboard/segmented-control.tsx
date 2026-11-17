import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Shown after the label, e.g. how many rows the filter has. */
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A row of mutually exclusive filter buttons (same look as the dashboard range selector). */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className }: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex max-w-full items-center gap-0.5 overflow-x-auto rounded-control border border-subtle bg-surface p-1 [scrollbar-width:none]', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors',
              active ? 'border-accent/12 bg-olive-dark text-primary' : 'border-transparent text-secondary hover:text-primary',
            )}
          >
            {option.label}
            {/* the space keeps label and count apart in the accessible name ("Paying 42") */}
            {option.count !== undefined && ' '}
            {option.count !== undefined && (
              <span className={cn('tabular-nums', active ? 'text-accent' : 'text-muted')}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
