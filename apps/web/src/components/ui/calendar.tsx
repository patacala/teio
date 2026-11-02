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
          className="p-1 rounded-md hover:bg-gray-100"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4 text-gray-500" />
        </button>
        <span className="text-sm font-medium text-gray-900">
          {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          className="p-1 rounded-md hover:bg-gray-100"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4 text-gray-500" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[10px] font-medium text-gray-400 text-center">{w}</span>
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
                'h-7 w-7 mx-auto text-xs rounded-md flex items-center justify-center transition-colors',
                disabled && 'text-gray-300 cursor-not-allowed',
                !disabled && !isFrom && !isTo && !inRange && 'text-gray-700 hover:bg-gray-100',
                inRange && 'bg-blue-50 text-blue-700',
                (isFrom || isTo) && 'bg-blue-600 text-white font-semibold hover:bg-blue-600',
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
