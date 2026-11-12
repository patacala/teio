'use client';

import { useEffect, useState } from 'react';
import { useAvailability } from '@/hooks/useAppointments';
import { cn } from '@/lib/utils';
import { formatZonedTime, localDate } from '@/lib/timezone';

interface Props {
  calendarId: string;
  timeZone: string;
  durationMinutes: number;
  /** Selected start instant (ISO) or null. */
  value: string | null;
  onChange: (startsAt: string) => void;
  /** The booking being moved: its own time does not count as busy. */
  excludeAppointmentId?: string;
}

/** Free times of one day on the calendar, from the availability endpoint. */
export function SlotPicker({ calendarId, timeZone, durationMinutes, value, onChange, excludeAppointmentId }: Props) {
  const [date, setDate] = useState(() => localDate(value ? new Date(value) : new Date(), timeZone));

  useEffect(() => {
    if (value) setDate(localDate(new Date(value), timeZone));
  }, [value, timeZone]);

  const { data: slots = [], isLoading } = useAvailability({
    from: date,
    to: date,
    calendar_id: calendarId,
    duration_minutes: durationMinutes,
    ...(excludeAppointmentId ? { exclude_appointment_id: excludeAppointmentId } : {}),
  });

  return (
    <div className="flex flex-col gap-2">
      <input
        type="date"
        aria-label="Day"
        value={date}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        className="w-full rounded-md border border-subtle bg-surface-raised text-primary px-3 py-2 text-sm"
      />
      {isLoading ? (
        <p className="text-xs text-muted">Loading free times…</p>
      ) : slots.length === 0 ? (
        <p className="text-xs text-muted">No free times that day.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Free times">
          {slots.map((slot) => {
            const selected = value === slot.starts_at;
            return (
              <button
                key={slot.starts_at}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(slot.starts_at)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  selected ? 'border-accent bg-olive-dark text-accent' : 'border-subtle text-primary hover:border-strong',
                )}
              >
                {formatZonedTime(slot.starts_at, timeZone)}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted">Times in {timeZone}</p>
    </div>
  );
}
