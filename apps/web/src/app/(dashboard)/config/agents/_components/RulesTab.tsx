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
import { useUpdateRules } from '@/hooks/useAIAgents';
import { toast } from '@/hooks/useToast';
import type { Rule } from '@/services/ai-agents.service';
import { INTENTS, SENTIMENTS, URGENCIES } from './prosales-enums';
import { Trash2 } from 'lucide-react';

// "any" = no filter on that field (null on the wire) — Radix Select can't
// have an empty-string item value, so we use this sentinel and translate.
const ANY = '__any__';

function newRule(): Rule {
  return {
    rule_id: `rule_${Math.random().toString(36).slice(2, 8)}`,
    intent: null,
    sentiment: null,
    urgency: null,
    action_type: '',
    action_params: {},
    priority: 5,
  };
}

function OptionalSelect({
  value,
  options,
  onChange,
}: {
  value: string | null | undefined;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RuleCard({
  rule,
  onChange,
  onDelete,
}: {
  rule: Rule;
  onChange: (next: Rule) => void;
  onDelete: () => void;
}) {
  const [paramsText, setParamsText] = useState(JSON.stringify(rule.action_params, null, 2));
  const [paramsError, setParamsError] = useState<string | null>(null);

  useEffect(() => setParamsText(JSON.stringify(rule.action_params, null, 2)), [rule.action_params]);

  const handleParamsBlur = () => {
    try {
      onChange({ ...rule, action_params: JSON.parse(paramsText) });
      setParamsError(null);
    } catch {
      setParamsError('Invalid JSON — this field was not saved');
    }
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Input
          value={rule.rule_id}
          onChange={(e) => onChange({ ...rule, rule_id: e.target.value })}
          className="max-w-[220px] font-mono text-xs"
        />
        <button
          onClick={onDelete}
          className="text-gray-400 hover:text-red-600 transition-colors"
          aria-label="Delete rule"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Intent</label>
          <OptionalSelect
            value={rule.intent}
            options={INTENTS}
            onChange={(v) => onChange({ ...rule, intent: v })}
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Sentiment</label>
          <OptionalSelect
            value={rule.sentiment}
            options={SENTIMENTS}
            onChange={(v) => onChange({ ...rule, sentiment: v })}
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Urgency</label>
          <OptionalSelect
            value={rule.urgency}
            options={URGENCIES}
            onChange={(v) => onChange({ ...rule, urgency: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Action (action_type)</label>
          <Input
            value={rule.action_type}
            onChange={(e) => onChange({ ...rule, action_type: e.target.value })}
            placeholder="e.g. handle_objection, schedule, empathize…"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Priority</label>
          <Input
            type="number"
            value={rule.priority}
            onChange={(e) => onChange({ ...rule, priority: Number(e.target.value) })}
            className="w-20"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] text-gray-500 mb-1">Action parameters (JSON, optional)</label>
        <textarea
          rows={2}
          value={paramsText}
          onChange={(e) => setParamsText(e.target.value)}
          onBlur={handleParamsBlur}
          className="w-full px-2 py-1.5 text-xs font-mono border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {paramsError && <p className="text-[11px] text-red-600 mt-1">{paramsError}</p>}
      </div>
    </div>
  );
}

export function RulesTab({ rules }: { rules: Rule[] }) {
  const [list, setList] = useState<Rule[]>(rules);
  const update = useUpdateRules();

  useEffect(() => setList(rules), [rules]);

  const handleSave = async () => {
    try {
      await update.mutateAsync(list);
      toast({ title: 'Rules saved', variant: 'default' });
    } catch {
      toast({ title: 'Failed to save rules', variant: 'error' });
    }
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-xs text-gray-500">
        Rules based on the customer message's intent/sentiment/urgency → an action that shapes
        the reply (doesn't call anything external, just guides the model).
      </p>

      {list.map((rule, i) => (
        <RuleCard
          key={i}
          rule={rule}
          onChange={(next) => setList((l) => l.map((r, idx) => (idx === i ? next : r)))}
          onDelete={() => setList((l) => l.filter((_, idx) => idx !== i))}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setList((l) => [...l, newRule()])}
      >
        + Add rule
      </Button>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
