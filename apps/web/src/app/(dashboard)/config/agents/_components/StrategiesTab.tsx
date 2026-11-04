'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateStrategies } from '@/hooks/useAIAgents';
import { toast } from '@/hooks/useToast';
import type { Strategy, Tactic } from '@/services/ai-agents.service';
import { INTENTS } from './prosales-enums';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';

function newStrategy(): Strategy {
  return {
    strategy_type: '',
    name: '',
    description: '',
    triggers: [],
    priority: 5,
    cooldown_seconds: 0,
    tactics: [],
  };
}

function TacticRow({
  tactic,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  tactic: Tactic;
  onChange: (next: Tactic) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="rounded-lg border border-subtle/60 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={tactic.name}
          onChange={(e) => onChange({ ...tactic, name: e.target.value })}
          placeholder="Tactic name"
          className="text-xs"
        />
        <button onClick={onMoveUp} className="text-muted hover:text-primary" aria-label="Move up">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={onMoveDown} className="text-muted hover:text-primary" aria-label="Move down">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} className="text-muted hover:text-danger" aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <Textarea
        rows={2}
        value={tactic.prompt_instruction}
        onChange={(e) => onChange({ ...tactic, prompt_instruction: e.target.value })}
        placeholder="Instruction for the model when this tactic applies…" className="min-h-0 px-2 py-1.5 text-xs"
      />
    </div>
  );
}

function StrategyCard({
  strategy,
  onChange,
  onDelete,
}: {
  strategy: Strategy;
  onChange: (next: Strategy) => void;
  onDelete: () => void;
}) {
  const triggerIntents = strategy.triggers
    .map((t) => t.intent as string | undefined)
    .filter((v): v is string => !!v);

  const setTriggerIntents = (intents: string[]) =>
    onChange({ ...strategy, triggers: intents.map((intent) => ({ intent })) });

  const setTactics = (tactics: Tactic[]) =>
    onChange({ ...strategy, tactics: tactics.map((t, i) => ({ ...t, position: i })) });

  return (
    <div className="rounded-lg border border-subtle p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Input
          value={strategy.name}
          onChange={(e) => onChange({ ...strategy, name: e.target.value })}
          placeholder="Strategy name"
          className="max-w-xs font-medium"
        />
        <button
          onClick={onDelete}
          className="text-muted hover:text-danger transition-colors"
          aria-label="Delete strategy"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] text-secondary mb-1">strategy_type</label>
          <Input
            value={strategy.strategy_type}
            onChange={(e) => onChange({ ...strategy, strategy_type: e.target.value })}
            placeholder="e.g. acknowledge_and_escalate"
            className="text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] text-secondary mb-1">Priority</label>
          <Input
            type="number"
            value={strategy.priority}
            onChange={(e) => onChange({ ...strategy, priority: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-[11px] text-secondary mb-1">Cooldown (seconds)</label>
          <Input
            type="number"
            value={strategy.cooldown_seconds}
            onChange={(e) =>
              onChange({ ...strategy, cooldown_seconds: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] text-secondary mb-1">Description</label>
        <Input
          value={strategy.description}
          onChange={(e) => onChange({ ...strategy, description: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-[11px] text-secondary mb-1">Fires when the detected intent is…</label>
        <div className="flex flex-wrap gap-1.5 items-center">
          {triggerIntents.map((intent, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[11px] bg-olive-dark text-accent px-2 py-0.5 rounded-full"
            >
              {intent}
              <button
                onClick={() => setTriggerIntents(triggerIntents.filter((_, idx) => idx !== i))}
                className="hover:text-accent-hover"
              >
                ×
              </button>
            </span>
          ))}
          <Select
            value=""
            onValueChange={(v) => {
              if (!triggerIntents.includes(v)) setTriggerIntents([...triggerIntents, v]);
            }}
          >
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue placeholder="+ add" />
            </SelectTrigger>
            <SelectContent>
              {INTENTS.filter((i) => !triggerIntents.includes(i)).map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] text-secondary mb-1.5">
          Tactics (in order — advances one per turn while the same strategy keeps applying)
        </label>
        <div className="space-y-1.5">
          {strategy.tactics.map((tactic, i) => (
            <TacticRow
              key={i}
              tactic={tactic}
              onChange={(next) =>
                setTactics(strategy.tactics.map((t, idx) => (idx === i ? next : t)))
              }
              onDelete={() => setTactics(strategy.tactics.filter((_, idx) => idx !== i))}
              onMoveUp={() => {
                if (i === 0) return;
                const next = [...strategy.tactics];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                setTactics(next);
              }}
              onMoveDown={() => {
                if (i === strategy.tactics.length - 1) return;
                const next = [...strategy.tactics];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                setTactics(next);
              }}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1.5"
          onClick={() =>
            setTactics([
              ...strategy.tactics,
              { name: '', prompt_instruction: '', position: strategy.tactics.length },
            ])
          }
        >
          + Add tactic
        </Button>
      </div>
    </div>
  );
}

export function StrategiesTab({ strategies }: { strategies: Strategy[] }) {
  const [list, setList] = useState<Strategy[]>(strategies);
  const update = useUpdateStrategies();

  useEffect(() => setList(strategies), [strategies]);

  const handleSave = async () => {
    try {
      await update.mutateAsync(list);
      toast({ title: 'Strategies saved', variant: 'default' });
    } catch {
      toast({ title: 'Failed to save strategies', variant: 'error' });
    }
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-xs text-secondary">
        Replaces the agent&apos;s whole strategy set. Each one fires on an intent and advances through
        its tactics while the conversation keeps going that direction.
      </p>

      {list.map((strategy, i) => (
        <StrategyCard
          key={i}
          strategy={strategy}
          onChange={(next) => setList((l) => l.map((s, idx) => (idx === i ? next : s)))}
          onDelete={() => setList((l) => l.filter((_, idx) => idx !== i))}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setList((l) => [...l, newStrategy()])}
      >
        + Add strategy
      </Button>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="bg-accent hover:bg-accent-hover text-on-accent"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
