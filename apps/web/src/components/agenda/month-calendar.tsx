'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/services/scheduling.service';

const DAYS_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  appointments: Appointment[];
  month: Date;
  onMonthChange: (d: Date) => void;
  onDayClick: (d: Date) => void;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// Mon=0, Sun=6
function dayOfWeekMon(d: Date) {
  return (d.getDay() + 6) % 7;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const statusColors: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  scheduled: 'bg-warning/15 text-warning',
  confirmed: 'bg-olive-dark text-accent',
  completed: 'bg-success/15 text-success',
  cancelled: 'bg-danger/15 text-danger line-through',
  no_show: 'bg-surface-raised text-secondary',
};

export function MonthCalendar({ appointments, month, onMonthChange, onDayClick }: Props) {
  const today = new Date();
  const firstDay = startOfMonth(month);
  const totalDays = daysInMonth(month);
  const leadingBlanks = dayOfWeekMon(firstDay);

  const prevMonth = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const nextMonth = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1));

  const cells: (Date | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  // Pad to complete grid (multiple of 7)
  while (cells.length % 7 !== 0) cells.push(null);

  const apptsByDay = (day: Date) =>
    appointments.filter((a) => sameDay(new Date(a.starts_at), day));

  return (
    <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
        <span className="text-sm font-medium text-primary capitalize">
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-subtle">
        {DAYS_HEADER.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const isLastCol = (idx + 1) % 7 === 0;
          if (!day) {
            return <div key={`blank-${idx}`} className={cn('min-h-[90px] border-b border-subtle bg-surface-raised/50', !isLastCol && 'border-r')} />;
          }
          const dayAppts = apptsByDay(day);
          const isToday = sameDay(day, today);
          const isCurrentMonth = day.getMonth() === month.getMonth();
          const visible = dayAppts.slice(0, 3);
          const overflow = dayAppts.length - 3;

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'min-h-[90px] p-1 border-b border-subtle cursor-pointer hover:bg-olive-dark/30 transition-colors',
                !isLastCol && 'border-r',
                !isCurrentMonth && 'bg-surface-raised/50',
              )}
              onClick={() => onDayClick(day)}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1',
                  isToday
                    ? 'bg-accent text-on-accent'
                    : isCurrentMonth
                    ? 'text-primary'
                    : 'text-muted',
                )}
              >
                {day.getDate()}
              </span>
              <div className="space-y-0.5">
                {visible.map((appt) => (
                  <div
                    key={appt.id}
                    className={cn(
                      'truncate rounded-sm px-1 py-0.5 text-[10px] font-medium leading-tight',
                      statusColors[appt.status] ?? statusColors.scheduled,
                    )}
                    title={appt.title}
                  >
                    {appt.title}
                  </div>
                ))}
                {overflow > 0 && (
                  <p className="text-[10px] text-accent font-medium">+{overflow} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
