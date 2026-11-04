'use client';

import { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Appointment } from '@/services/scheduling.service';

const CELL_HEIGHT = 48; // px per hour
const START_HOUR = 0;
const END_HOUR = 24;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  appointments: Appointment[];
  weekStart: Date;
  onWeekChange: (d: Date) => void;
  onAppointmentClick: (appt: Appointment) => void;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDayHeader(d: Date) {
  return String(d.getDate()).padStart(2, '0');
}

function formatMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const statusColors: Record<string, string> = {
  pending: 'bg-warning/15 border-warning/50 text-warning',
  scheduled: 'bg-warning/15 border-warning/50 text-warning',
  confirmed: 'bg-olive-dark border-accent/50 text-accent',
  completed: 'bg-success/15 border-success/50 text-success',
  cancelled: 'bg-danger/15 border-danger/50 text-danger',
  no_show: 'bg-surface-raised border-strong text-secondary',
};

export function WeekCalendar({ appointments, weekStart, onWeekChange, onAppointmentClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = getWeekDays(weekStart);
  const today = new Date();

  // Auto-scroll to 7 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * CELL_HEIGHT;
    }
  }, []);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    onWeekChange(d);
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    onWeekChange(d);
  };

  return (
    <div className="rounded-xl border border-subtle bg-surface overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
        <span className="text-sm font-medium text-primary capitalize">
          {formatMonthYear(weekStart)}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-auto flex-1 min-h-0">
        <div className="flex">
          {/* Hour labels */}
          <div className="w-14 shrink-0 border-r border-subtle">
            <div className="h-10 border-b border-subtle" />
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex items-start justify-end pr-2 text-[10px] text-muted"
                style={{ height: CELL_HEIGHT }}
              >
                <span className="-mt-2">{h % 12 || 12}:00 {h >= 12 ? 'PM' : 'AM'}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 grid grid-cols-7">
            {days.map((day, di) => {
              const isToday = sameDay(day, today);
              const dayAppts = appointments.filter((a) => sameDay(new Date(a.starts_at), day));

              return (
                <div key={di} className="relative border-r border-subtle last:border-r-0">
                  {/* Day header */}
                  <div
                    className={`h-10 flex flex-col items-center justify-center border-b border-subtle text-xs ${
                      isToday ? 'bg-olive-dark' : ''
                    }`}
                  >
                    <span className="text-muted">{DAYS[di]}</span>
                    <span
                      className={`font-semibold ${isToday ? 'text-accent' : 'text-primary'}`}
                    >
                      {formatDayHeader(day)}
                    </span>
                  </div>

                  {/* Hour grid rows */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="border-b border-dashed border-subtle"
                      style={{ height: CELL_HEIGHT }}
                    />
                  ))}

                  {/* Appointments */}
                  {dayAppts.map((appt) => {
                    const start = new Date(appt.starts_at);
                    const startHour = start.getHours();
                    const startMin = start.getMinutes();
                    const durationMin = Math.round(
                      (new Date(appt.ends_at).getTime() - start.getTime()) / 60_000,
                    );
                    const top = (startHour - START_HOUR + startMin / 60) * CELL_HEIGHT + 40; // +40 for header
                    const height = Math.max((durationMin / 60) * CELL_HEIGHT, 24);
                    const colorClass = statusColors[appt.status] ?? statusColors.scheduled;
                    const contactName = appt.contact
                      ? `${appt.contact.first_name}`
                      : '';

                    return (
                      <button
                        key={appt.id}
                        onClick={() => onAppointmentClick(appt)}
                        className={`absolute left-0.5 right-0.5 rounded-sm border-l-2 px-1 py-0.5 text-left overflow-hidden ${colorClass}`}
                        style={{ top, height }}
                      >
                        <p className="text-[10px] font-medium leading-tight truncate">{appt.title}</p>
                        {contactName && (
                          <p className="text-[9px] leading-tight truncate opacity-70">{contactName}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
