import { cn } from '@/lib/utils';

export type AgendaViewType = 'list' | 'week' | 'month';

interface Props {
  view: AgendaViewType;
  onChange: (v: AgendaViewType) => void;
}

const views: { value: AgendaViewType; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function AgendaViewSwitcher({ view, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface p-1">
      {views.map((v) => (
        <button
          key={v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
            view === v.value
              ? 'border-accent/12 bg-olive-dark text-primary'
              : 'border-transparent text-secondary hover:text-primary',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
