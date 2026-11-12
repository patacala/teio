'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { localDate, localMinutes, weekdayOf, zonedTimeToUtc } from '@/lib/timezone';
import type { AgendaItem } from '@/services/scheduling.service';
import { needsOutcome } from './appointment-status';

const CELL_HEIGHT = 48; // px per hour
const HEADER_HEIGHT = 40;
const SNAP_MINUTES = 30;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface WorkingHours {
  workDays: number[];
  startMinutes: number;
  endMinutes: number;
}

interface Props {
  appointments: AgendaItem[];
  /** Seven local dates (YYYY-MM-DD) of the calendar's time zone. */
  days: string[];
  timeZone: string;
  workingHours?: WorkingHours;
  onPrev: () => void;
  onNext: () => void;
  onAppointmentClick: (item: AgendaItem) => void;
  /** Click on free space: the start instant under the pointer (snapped to 30 min). */
  onSlotClick?: (startsAt: string) => void;
}

const statusColors: Record<string, string> = {
  held: 'bg-warning/15 border-warning/50 text-warning',
  pending: 'bg-warning/15 border-warning/50 text-warning',
  scheduled: 'bg-warning/15 border-warning/50 text-warning',
  confirmed: 'bg-olive-dark border-accent/50 text-accent',
  completed: 'bg-success/15 border-success/50 text-success',
  cancelled: 'bg-danger/15 border-danger/50 text-danger line-through',
  no_show: 'bg-surface-raised border-strong text-secondary',
  awaiting_user: 'bg-danger/15 border-danger/50 text-danger',
  failed: 'bg-danger/15 border-danger/50 text-danger',
};

interface Placed {
  item: AgendaItem;
  top: number;
  height: number;
  column: number;
  columns: number;
}

/**
 * Side-by-side layout: items that overlap share the width of their group, so
 * a double booking is visible instead of hidden under the other card.
 */
export function layoutDay(items: AgendaItem[], timeZone: string): Placed[] {
  const blocks = items
    .map((item) => {
      const start = localMinutes(new Date(item.starts_at), timeZone);
      const minutes = Math.max(Math.round((new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()) / 60_000), 1);
      return { item, start, end: Math.min(start + minutes, 24 * 60) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: Placed[] = [];
  let group: Array<(typeof blocks)[number] & { column: number }> = [];
  let groupEnd = -1;
  const flush = () => {
    const columns = Math.max(...group.map((g) => g.column + 1), 1);
    for (const g of group) {
      placed.push({
        item: g.item,
        top: (g.start / 60) * CELL_HEIGHT + HEADER_HEIGHT,
        height: Math.max(((g.end - g.start) / 60) * CELL_HEIGHT, 22),
        column: g.column,
        columns,
      });
    }
    group = [];
  };

  for (const block of blocks) {
    if (group.length && block.start >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const taken = new Set(group.filter((g) => g.end > block.start).map((g) => g.column));
    let column = 0;
    while (taken.has(column)) column++;
    group.push({ ...block, column });
    groupEnd = Math.max(groupEnd, block.end);
  }
  if (group.length) flush();
  return placed;
}

function isWorking(date: string, hour: number, hours?: WorkingHours): boolean {
  if (!hours) return true;
  if (!hours.workDays.includes(weekdayOf(date))) return false;
  const start = hour * 60;
  return start + 60 > hours.startMinutes && start < hours.endMinutes;
}

export function WeekCalendar({
  appointments,
  days,
  timeZone,
  workingHours,
  onPrev,
  onNext,
  onAppointmentClick,
  onSlotClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = localDate(new Date(), timeZone);

  useEffect(() => {
    if (scrollRef.current) {
      const firstHour = workingHours ? Math.floor(workingHours.startMinutes / 60) : 7;
      scrollRef.current.scrollTop = Math.max(firstHour - 1, 0) * CELL_HEIGHT;
    }
  }, [workingHours]);

  const label = new Date(`${days[0]}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const handleColumnClick = (date: string, event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSlotClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top - HEADER_HEIGHT;
    if (y < 0) return;
    const minutes = Math.floor(((y / CELL_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
    const start = zonedTimeToUtc(date, Math.min(minutes, 24 * 60 - SNAP_MINUTES), timeZone);
    if (start) onSlotClick(start.toISOString());
  };

  return (
    <div className="rounded-xl border border-subtle bg-surface overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
        <span className="text-sm font-medium text-primary capitalize">
          {label} <span className="text-xs font-normal text-muted">· {timeZone}</span>
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onPrev} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onNext} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-auto flex-1 min-h-0">
        <div className="flex">
          <div className="w-14 shrink-0 border-r border-subtle">
            <div className="border-b border-subtle" style={{ height: HEADER_HEIGHT }} />
            {HOURS.map((h) => (
              <div key={h} className="flex items-start justify-end pr-2 text-[10px] text-muted" style={{ height: CELL_HEIGHT }}>
                <span className="-mt-2">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7">
            {days.map((date) => {
              const isToday = date === today;
              const placed = layoutDay(
                appointments.filter((a) => localDate(new Date(a.starts_at), timeZone) === date),
                timeZone,
              );
              return (
                <div
                  key={date}
                  data-testid={`day-${date}`}
                  className={cn('relative border-r border-subtle last:border-r-0', onSlotClick && 'cursor-pointer')}
                  onClick={(e) => handleColumnClick(date, e)}
                >
                  <div
                    className={cn(
                      'flex flex-col items-center justify-center border-b border-subtle text-xs',
                      isToday && 'bg-olive-dark',
                    )}
                    style={{ height: HEADER_HEIGHT }}
                  >
                    <span className="text-muted">{DAY_NAMES[weekdayOf(date)]}</span>
                    <span className={cn('font-semibold', isToday ? 'text-accent' : 'text-primary')}>{date.slice(8)}</span>
                  </div>

                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className={cn(
                        'border-b border-dashed border-subtle',
                        !isWorking(date, h, workingHours) && 'bg-surface-raised/60',
                      )}
                      style={{ height: CELL_HEIGHT }}
                    />
                  ))}

                  {placed.map(({ item, top, height, column, columns }) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(item);
                      }}
                      title={item.title}
                      className={cn(
                        'absolute rounded-sm border-l-2 px-1 py-0.5 text-left overflow-hidden',
                        needsOutcome(item)
                          ? 'bg-danger/15 border-danger/50 text-danger'
                          : statusColors[item.status] ?? statusColors.scheduled,
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${(column / columns) * 100}% + 2px)`,
                        width: `calc(${100 / columns}% - 4px)`,
                      }}
                    >
                      <p className="text-[10px] font-medium leading-tight truncate">{item.title}</p>
                      {item.contact && <p className="text-[9px] leading-tight truncate opacity-70">{item.contact.first_name}</p>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
