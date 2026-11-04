'use client';

import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import type { SequenceStepInput } from '@/services/automation.service';
import { ACTIONS, CHANNEL_STRATEGIES, actionMeta } from '@/components/sequences/sequence-constants';

interface Props {
  step: SequenceStepInput;
  index: number;
  total: number;
  disabled?: boolean;
  onChange(patch: Partial<SequenceStepInput>): void;
  onMove(direction: -1 | 1): void;
  onRemove(): void;
}

export function SequenceStepRow({
  step, index, total, disabled, onChange, onMove, onRemove,
}: Props) {
  const Icon = actionMeta(step.action).icon;

  return (
    <div className="rounded-xl border border-subtle bg-surface p-3">
      {/* Header: position + controls */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-olive-dark text-xs font-semibold text-accent">
            {index + 1}
          </span>
          <span className="truncate text-xs font-medium text-secondary">
            {index === 0 ? 'First step' : `Step ${index + 1}`}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
            className="rounded-sm p-1 text-muted transition-colors hover:bg-surface-hover hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Move step up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={disabled || index === total - 1}
            className="rounded-sm p-1 text-muted transition-colors hover:bg-surface-hover hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Move step down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled || total === 1}
            className="rounded-sm p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Delete step"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Action */}
        <div className="min-w-0">
          <label className="mb-1 block text-xs font-medium text-primary">Action</label>
          <Select
            value={step.action}
            onValueChange={(v) => onChange({ action: v })}
            disabled={disabled}
          >
            <SelectTrigger className="bg-surface">
              <div className="flex min-w-0 items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-secondary" />
                <span className="truncate">
                  <SelectValue />
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Channel strategy */}
        <div className="min-w-0">
          <label className="mb-1 block text-xs font-medium text-primary">Channel</label>
          <Select
            value={step.channel_strategy}
            onValueChange={(v) => onChange({ channel_strategy: v })}
            disabled={disabled}
          >
            <SelectTrigger className="bg-surface">
              <span className="min-w-0 truncate">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_STRATEGIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Delay */}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-primary">Wait</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={step.delay_hours}
            disabled={disabled}
            onChange={(e) => onChange({ delay_hours: Math.max(1, Number(e.target.value) || 1) })}
            className="w-20 shrink-0 bg-surface"
          />
          <span className="text-xs text-secondary">
            hours {index === 0 ? 'from the start' : 'after the previous step'}
          </span>
        </div>
      </div>
    </div>
  );
}
