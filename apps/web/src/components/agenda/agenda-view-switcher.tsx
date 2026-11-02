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
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white p-1">
      {views.map((v) => (
        <button
          key={v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === v.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
