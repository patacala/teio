'use client';

import { useId } from 'react';
import type { PlanLimitMetric } from '@crm/shared';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatLimit, type LimitDraft, type LimitMode } from './limit-metrics';

interface LimitFieldProps {
  metric: PlanLimitMetric;
  label: string;
  monthly: boolean;
  draft: LimitDraft;
  onChange: (draft: LimitDraft) => void;
  /** When set, the field can inherit this default value. */
  defaultValue?: number;
  usage?: number;
  error?: string;
}

export function LimitField({ metric, label, monthly, draft, onChange, defaultValue, usage, error }: LimitFieldProps) {
  const id = `${useId()}-${metric}`;
  const canInherit = defaultValue !== undefined;

  return (
    <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_11rem_8rem] sm:items-center">
      <div>
        <label htmlFor={draft.mode === 'custom' ? id : `${id}-mode`} className="text-xs font-medium text-primary">
          {label}
          {monthly && (
            <>
              {' '}
              <span className="font-normal text-muted">/ month</span>
            </>
          )}
        </label>
        {usage !== undefined && (
          <p className="text-[11px] text-muted">Used: {usage.toLocaleString('en-US')}</p>
        )}
      </div>
      <Select value={draft.mode} onValueChange={(mode) => onChange({ ...draft, mode: mode as LimitMode })}>
        <SelectTrigger id={`${id}-mode`} aria-label={`${label} limit type`} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {canInherit && <SelectItem value="default">Default ({formatLimit(defaultValue)})</SelectItem>}
          <SelectItem value="custom">Limited</SelectItem>
          <SelectItem value="unlimited">Unlimited</SelectItem>
        </SelectContent>
      </Select>
      <div>
        {draft.mode === 'custom' ? (
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={draft.value}
            onChange={(e) => onChange({ ...draft, value: e.target.value })}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            className="h-9"
          />
        ) : draft.mode === 'unlimited' ? (
          <span className="block px-1 text-xs text-muted">No limit</span>
        ) : null}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[11px] text-danger sm:col-span-3">
          {error}
        </p>
      )}
    </div>
  );
}
