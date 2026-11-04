'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { Calendar } from '@/services/scheduling.service';

interface CalendarFilterBarProps {
  calendars: Calendar[];
  selectedId: string | null;
  isLoading: boolean;
  onChange: (id: string | null) => void;
}

export function CalendarFilterBar({
  calendars,
  selectedId,
  isLoading,
  onChange,
}: CalendarFilterBarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Skeleton className="h-7 w-12 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onChange(null)}
        className={[
          'rounded-full px-3 py-1 text-sm font-medium border transition-colors',
          selectedId === null
            ? 'bg-olive-dark text-accent border-accent/25'
            : 'bg-surface text-secondary border-subtle hover:border-strong hover:text-primary',
        ].join(' ')}
      >
        All
      </button>

      {calendars.map((cal) => (
        <button
          key={cal.id}
          onClick={() => onChange(cal.id)}
          className={[
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-colors',
            selectedId === cal.id
              ? 'bg-olive-dark text-accent border-accent/25'
              : 'bg-surface text-secondary border-subtle hover:border-strong hover:text-primary',
          ].join(' ')}
        >
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: cal.color }}
          />
          {cal.name}
        </button>
      ))}
    </div>
  );
}
