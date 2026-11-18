'use client';

import { useRef, type ReactNode } from 'react';
import { Braces } from 'lucide-react';
import type { Duration, DurationUnit } from '@crm/shared';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { WEEKDAYS, type VariableOption } from '../automation-ui';

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-primary">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Lists the `{{variables}}` a step can use and inserts the chosen one. */
export function VariablePicker({ variables, onPick, disabled }: { variables: VariableOption[]; onPick(path: string): void; disabled?: boolean }) {
  const groups = [...new Set(variables.map((v) => v.group))];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || !variables.length}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-secondary hover:bg-surface-hover hover:text-primary disabled:opacity-40"
          aria-label="Insert a variable"
        >
          <Braces className="h-3 w-3" />
          Variable
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search variables…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No variables.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group} heading={group}>
                {variables
                  .filter((v) => v.group === group)
                  .map((v) => (
                    <CommandItem key={v.path} value={`${v.group} ${v.label} ${v.path}`} onSelect={() => onPick(v.path)}>
                      <div className="min-w-0">
                        <p className="truncate text-xs text-primary">{v.label}</p>
                        <p className="truncate font-mono text-[10px] text-muted">{`{{${v.path}}}`}</p>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** A text (one line or several) that can hold `{{variables}}`, inserted at the cursor. */
export function TemplateField({
  label,
  value,
  onChange,
  variables,
  multiline,
  placeholder,
  hint,
  disabled,
  id,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  variables: VariableOption[];
  multiline?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const insert = (path: string) => {
    const token = `{{${path}}}`;
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const inputId = id ?? `field-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="block text-xs font-medium text-primary">
          {label}
        </label>
        <VariablePicker variables={variables} onPick={insert} disabled={disabled} />
      </div>
      {multiline ? (
        <Textarea id={inputId} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="min-h-[96px] bg-surface" />
      ) : (
        <Input id={inputId} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="bg-surface" />
      )}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

const UNITS: Array<{ value: DurationUnit; label: string }> = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
];

export function DurationInput({ value, onChange, disabled, label }: { value: Duration | undefined; onChange(d: Duration): void; disabled?: boolean; label: string }) {
  const d = value ?? { amount: 1, unit: 'days' as DurationUnit };
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        aria-label={`${label} amount`}
        value={d.amount}
        disabled={disabled}
        onChange={(e) => onChange({ ...d, amount: Math.max(1, Number(e.target.value) || 1) })}
        className="w-24 bg-surface"
      />
      <Select value={d.unit} onValueChange={(unit) => onChange({ ...d, unit: unit as DurationUnit })} disabled={disabled}>
        <SelectTrigger className="w-32 bg-surface" aria-label={`${label} unit`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map((u) => (
            <SelectItem key={u.value} value={u.value}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function WeekdayPicker({ value, onChange, disabled }: { value: number[]; onChange(days: number[]): void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Days of the week">
      {WEEKDAYS.map((day, i) => {
        const on = value.includes(i);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort())}
            className={cn(
              'h-7 w-10 rounded-md border text-[11px] font-medium transition-colors',
              on ? 'border-accent bg-olive-dark text-accent' : 'border-subtle text-secondary hover:bg-surface-hover',
            )}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}

/** A simple select from options; `allowEmpty` adds a "None" choice. */
export function OptionSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  ariaLabel,
}: {
  value: string | undefined;
  onChange(value: string): void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="bg-surface" aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder ?? 'Choose…'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
