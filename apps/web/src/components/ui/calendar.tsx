'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DateRange {
  from?: Date;
  to?: Date;
}

interface CalendarProps {
  selected: DateRange;
  onSelect: (range: DateRange) => void;
  maxDate?: Date;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isSameDay(a?: Date, b?: Date): boolean {
  return !!a && !!b && a.toDateString() === b.toDateString();
}

export function Calendar({ selected, onSelect, maxDate }: CalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => selected.to ?? selected.from ?? new Date());

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();

  const cells: (Date | null)[] = Array(startWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function handlePick(day: Date) {
    const { from, to } = selected;
    if (!from || to) {
      onSelect({ from: day, to: undefined });
    } else if (day < from) {
      onSelect({ from: day, to: from });
    } else {
      onSelect({ from, to: day });
    }
  }

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-primary"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-primary">
          {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-primary"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[10px] font-medium text-muted text-center">{w}</span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const disabled = maxDate ? day > maxDate : false;
          const isFrom = isSameDay(day, selected.from);
          const isTo = isSameDay(day, selected.to);
          const inRange = !!selected.from && !!selected.to && day > selected.from && day < selected.to;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => handlePick(day)}
              className={cn(
                'h-8 w-8 mx-auto text-xs rounded-lg flex items-center justify-center transition-colors',
                disabled && 'text-muted/50 cursor-not-allowed',
                !disabled && !isFrom && !isTo && !inRange && 'text-secondary hover:bg-surface-hover hover:text-primary',
                inRange && 'bg-olive-dark text-primary',
                (isFrom || isTo) && 'bg-accent text-on-accent font-semibold',
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
