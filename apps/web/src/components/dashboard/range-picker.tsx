'use client';

import { useEffect, useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar, type DateRange } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { CustomDateRange, DashboardRange } from '@/services/analytics.service';
import { formatDateShort, fromISODate, toISODate } from './dates';

export type { CustomDateRange, DashboardRange };

const RANGES: DashboardRange[] = ['7d', '30d', '90d'];

export function RangeSelector({
  value, onChange, isCustom,
}: { value: DashboardRange; onChange: (r: DashboardRange) => void; isCustom: boolean }) {
  return (
    <div className="flex h-9 items-center gap-0.5 rounded-control border border-subtle bg-surface p-1">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          aria-pressed={!isCustom && value === r}
          className={cn(
            'h-full rounded-lg border px-3 text-xs font-medium transition-colors',
            !isCustom && value === r
              ? 'border-accent/12 bg-olive-dark text-primary'
              : 'border-transparent text-secondary hover:text-primary',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export function CustomRangePicker({
  active, onApply, onClear,
}: { active: CustomDateRange | null; onApply: (r: CustomDateRange) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({
    from: active ? fromISODate(active.from) : undefined,
    to: active ? fromISODate(active.to) : undefined,
  });

  // Keep the draft in sync whenever the applied range changes (incl. being cleared elsewhere)
  useEffect(() => {
    setDraft({
      from: active ? fromISODate(active.from) : undefined,
      to: active ? fromISODate(active.to) : undefined,
    });
  }, [active]);

  const canApply = !!draft.from && !!draft.to;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {active ? (
        <div className="flex h-9 items-center gap-0.5 rounded-control border border-accent/15 bg-olive-dark p-1">
          <PopoverTrigger asChild>
            <button className="flex h-full items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent transition-colors hover:bg-white/5">
              <CalendarRange className="h-3.5 w-3.5" />
              {formatDateShort(active.from)} → {formatDateShort(active.to)}
            </button>
          </PopoverTrigger>
          <button
            onClick={() => { onClear(); setOpen(false); }}
            className="rounded-lg p-1 text-accent transition-colors hover:bg-white/5"
            aria-label="Clear custom range"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <PopoverTrigger asChild>
          <button className="flex h-9 items-center gap-1.5 rounded-control border border-subtle bg-surface px-3 text-xs font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary">
            <CalendarRange className="h-3.5 w-3.5" />
            Custom
          </button>
        </PopoverTrigger>
      )}

      <PopoverContent align="end" className="w-[280px] p-3">
        <Calendar selected={draft} onSelect={setDraft} maxDate={new Date()} />
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-subtle">
          <span className="text-xs text-muted">
            {draft.from ? formatDateShort(toISODate(draft.from)) : 'From'}
            {' → '}
            {draft.to ? formatDateShort(toISODate(draft.to)) : 'To'}
          </span>
          <Button
            size="sm"
            onClick={() => {
              if (draft.from && draft.to) {
                onApply({ from: toISODate(draft.from), to: toISODate(draft.to) });
                setOpen(false);
              }
            }}
            disabled={!canApply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
