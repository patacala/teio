'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { LinesField } from './LinesField';
import { ChipMultiSelect } from './ChipMultiSelect';
import { useUpdateIdentity } from '@/hooks/useAIAgents';
import { toast } from '@/hooks/useToast';
import type { Identity } from '@/services/ai-agents.service';

const EMPTY: Identity = {
  name: '',
  description: '',
  communication_style: 'consultive',
  compliance_notes: '',
  principles: [],
  beliefs: [],
  values: [],
  words_never_use: [],
  words_prefer: [],
};

// Preset options for the "what matters most" chip picker — maps to
// `principles`, the only identity field the pipeline's prompt actually
// reads (see engines/personality/engine.py) alongside `beliefs`. Kept to
// one list so a non-technical user never has to know that distinction
// exists.
const PRIORITY_OPTIONS = [
  'Honesty over closing the sale',
  'Understand needs before recommending',
  'Build long-term relationships',
  'Resolve problems quickly',
  'Escalate when unsure',
  'Patience with frustrated customers',
  'Never overpromise',
  'Respect the customer\'s time',
  'Follow up proactively',
  'Confidentiality and discretion',
];

export function IdentityTab({ identity }: { identity: Identity | null }) {
  const [form, setForm] = useState<Identity>(identity ?? EMPTY);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const update = useUpdateIdentity();

  useEffect(() => setForm(identity ?? EMPTY), [identity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      toast({ title: 'Identity saved', variant: 'default' });
    } catch {
      toast({ title: 'Failed to save identity', variant: 'error' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">Name</label>
        <Input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Audi Miami South Sales Assistant"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">
          Short description <span className="text-muted font-normal">(optional)</span>
        </label>
        <Input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="What does this agent do, in one line?"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">
          What matters most when talking to customers?
        </label>
        <ChipMultiSelect
          options={PRIORITY_OPTIONS}
          value={form.principles}
          onChange={(v) => setForm((f) => ({ ...f, principles: v }))}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">
          Words or phrases it should never say <span className="text-muted font-normal">(optional)</span>
        </label>
        <LinesField
          label=""
          value={form.words_never_use}
          onChange={(v) => setForm((f) => ({ ...f, words_never_use: v }))}
          placeholder="e.g. guaranteed, free, discount…"
        />
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-secondary hover:text-primary">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          Advanced
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <div>
            <label className="block text-xs font-medium text-primary mb-1.5">Communication style</label>
            <Input
              value={form.communication_style}
              onChange={(e) => setForm((f) => ({ ...f, communication_style: e.target.value }))}
              placeholder="consultive"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary mb-1.5">Compliance notes</label>
            <Input
              value={form.compliance_notes}
              onChange={(e) => setForm((f) => ({ ...f, compliance_notes: e.target.value }))}
            />
          </div>
          <LinesField
            label="Beliefs"
            value={form.beliefs}
            onChange={(v) => setForm((f) => ({ ...f, beliefs: v }))}
          />
          <LinesField
            label="Values"
            value={form.values}
            onChange={(v) => setForm((f) => ({ ...f, values: v }))}
          />
          <LinesField
            label="Preferred words"
            value={form.words_prefer}
            onChange={(v) => setForm((f) => ({ ...f, words_prefer: v }))}
          />
        </CollapsibleContent>
      </Collapsible>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={update.isPending}
          className="bg-accent hover:bg-accent-hover text-on-accent"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
