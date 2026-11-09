'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface DemoLengthDraft {
  mode: 'days' | 'forever';
  days: string;
}

export function demoLengthDraft(days: number | null): DemoLengthDraft {
  return days === null ? { mode: 'forever', days: '7' } : { mode: 'days', days: String(days) };
}

/** Validated value for the API, or an error message. */
export function demoLengthValue(draft: DemoLengthDraft): { value: number | null; error?: string } {
  if (draft.mode === 'forever') return { value: null };
  const days = Number(draft.days.trim());
  if (!/^\d+$/.test(draft.days.trim()) || days < 1 || days > 365) {
    return { value: null, error: 'Enter a number of days between 1 and 365.' };
  }
  return { value: days };
}

interface DemoLengthFieldProps {
  draft: DemoLengthDraft;
  onChange: (draft: DemoLengthDraft) => void;
  error?: string;
}

export function DemoLengthField({ draft, onChange, error }: DemoLengthFieldProps) {
  const id = useId();
  return (
    <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_11rem_8rem] sm:items-center">
      <div>
        <label htmlFor={draft.mode === 'days' ? id : `${id}-mode`} className="text-xs font-medium text-primary">
          Demo length
        </label>
        <p className="text-[11px] text-muted">Applies to organizations that start a demo from now on.</p>
      </div>
      <Select value={draft.mode} onValueChange={(mode) => onChange({ ...draft, mode: mode as DemoLengthDraft['mode'] })}>
        <SelectTrigger id={`${id}-mode`} aria-label="Demo length type" className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="days">Ends after</SelectItem>
          <SelectItem value="forever">No end date</SelectItem>
        </SelectContent>
      </Select>
      <div>
        {draft.mode === 'days' ? (
          <div className="flex items-center gap-2">
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              value={draft.days}
              onChange={(e) => onChange({ ...draft, days: e.target.value })}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              className="h-9"
            />
            <span className="text-xs text-muted">days</span>
          </div>
        ) : (
          <span className="block px-1 text-xs text-muted">Free forever</span>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[11px] text-danger sm:col-span-3">
          {error}
        </p>
      )}
    </div>
  );
}
