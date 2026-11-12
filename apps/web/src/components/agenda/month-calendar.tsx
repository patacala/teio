'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays, daysBetween, localDate, weekdayOf } from '@/lib/timezone';
import type { AgendaItem } from '@/services/scheduling.service';
import { needsOutcome } from './appointment-status';

const DAYS_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  appointments: AgendaItem[];
  /** First local date of the month (YYYY-MM-01) in the calendar's time zone. */
  month: string;
  timeZone: string;
  onPrev: () => void;
  onNext: () => void;
  onDayClick: (date: string) => void;
}

const statusColors: Record<string, string> = {
  held: 'bg-warning/15 text-warning',
  pending: 'bg-warning/15 text-warning',
  scheduled: 'bg-warning/15 text-warning',
  confirmed: 'bg-olive-dark text-accent',
  completed: 'bg-success/15 text-success',
  cancelled: 'bg-danger/15 text-danger line-through',
  no_show: 'bg-surface-raised text-secondary',
  awaiting_user: 'bg-danger/15 text-danger',
  failed: 'bg-danger/15 text-danger',
};

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return addDays(next, -1);
}

export function MonthCalendar({ appointments, month, timeZone, onPrev, onNext, onDayClick }: Props) {
  const today = localDate(new Date(), timeZone);
  const last = lastDayOfMonth(month);
  const leadingBlanks = (weekdayOf(month) + 6) % 7;
  const totalDays = daysBetween(month, last) + 1;

  const cells: (string | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => addDays(month, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<string, AgendaItem[]>();
  for (const item of appointments) {
    const day = localDate(new Date(item.starts_at), timeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }

  const label = new Date(`${month}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
        <span className="text-sm font-medium text-primary capitalize">
          {label} <span className="text-xs font-normal text-muted">· {timeZone}</span>
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onPrev} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onNext} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-subtle">
        {DAYS_HEADER.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const isLastCol = (idx + 1) % 7 === 0;
          if (!day) {
            return (
              <div key={`blank-${idx}`} className={cn('min-h-[90px] border-b border-subtle bg-surface-raised/50', !isLastCol && 'border-r')} />
            );
          }
          const items = byDay.get(day) ?? [];
          const visible = items.slice(0, 3);
          const overflow = items.length - visible.length;
          return (
            <div
              key={day}
              data-testid={`month-day-${day}`}
              className={cn(
                'min-h-[90px] p-1 border-b border-subtle cursor-pointer hover:bg-olive-dark/30 transition-colors',
                !isLastCol && 'border-r',
              )}
              onClick={() => onDayClick(day)}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1',
                  day === today ? 'bg-accent text-on-accent' : 'text-primary',
                )}
              >
                {Number(day.slice(8))}
              </span>
              <div className="space-y-0.5">
                {visible.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'truncate rounded-sm px-1 py-0.5 text-[10px] font-medium leading-tight',
                      needsOutcome(item) ? 'bg-danger/15 text-danger' : statusColors[item.status] ?? statusColors.scheduled,
                    )}
                    title={item.title}
                  >
                    {item.title}
                  </div>
                ))}
                {overflow > 0 && <p className="text-[10px] text-accent font-medium">+{overflow} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
