'use client';

import { useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { demoTimeLeft, formatDemoEnd } from '@/components/billing/billing-labels';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The end of the chosen day, in the admin's time zone. */
export function endOfDay(day: Date): Date {
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Extends from whichever is later: now or the current end. */
export function extendDemo(currentEnd: string | null, days: number, now: Date = new Date()): Date {
  const from = Math.max(now.getTime(), currentEnd ? new Date(currentEnd).getTime() : 0);
  return new Date(from + days * DAY_MS);
}

interface DemoPeriodFieldProps {
  /** ISO end date; null = no end date. */
  endsAt: string | null;
  onChange: (endsAt: string | null) => void;
}

export function DemoPeriodField({ endsAt, onChange }: DemoPeriodFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [lastDate, setLastDate] = useState<string>(endsAt ?? extendDemo(null, 7).toISOString());
  const mode = endsAt === null ? 'forever' : 'date';
  const ended = endsAt !== null && new Date(endsAt).getTime() <= Date.now();

  const setDate = (iso: string) => {
    setLastDate(iso);
    onChange(iso);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_11rem_8rem] sm:items-center">
        <div>
          <label htmlFor={`${id}-mode`} className="text-xs font-medium text-primary">
            Demo ends
          </label>
          <p className={ended ? 'text-[11px] text-danger' : 'text-[11px] text-muted'}>
            {endsAt ? `${formatDemoEnd(endsAt)} · ${demoTimeLeft(endsAt)}` : 'No end date, no payment required'}
          </p>
        </div>
        <Select value={mode} onValueChange={(value) => onChange(value === 'forever' ? null : lastDate)}>
          <SelectTrigger id={`${id}-mode`} aria-label="Demo end type" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">On a date</SelectItem>
            <SelectItem value="forever">Free forever</SelectItem>
          </SelectContent>
        </Select>
        <div>
          {mode === 'date' && endsAt && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="secondary" className="h-9 w-full justify-start" aria-label="Choose the demo end date">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[280px] p-3">
                <Calendar
                  selected={{ from: new Date(endsAt), to: new Date(endsAt) }}
                  onSelect={(range) => {
                    if (!range.from) return;
                    setDate(endOfDay(range.from).toISOString());
                    setOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      {mode === 'date' && (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button size="sm" variant="ghost" onClick={() => setDate(extendDemo(endsAt, 7).toISOString())}>
            Extend 7 days
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDate(extendDemo(endsAt, 30).toISOString())}>
            Extend 30 days
          </Button>
        </div>
      )}
    </div>
  );
}
