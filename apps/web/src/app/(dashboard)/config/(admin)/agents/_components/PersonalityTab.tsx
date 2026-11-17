'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { LinesField } from './LinesField';
import { ChipMultiSelect } from './ChipMultiSelect';
import { Input } from '@/components/ui/input';
import { useUpdatePersonality } from '@/hooks/useAIAgents';
import { toast } from '@/hooks/useToast';
import type { Personality } from '@/services/ai-agents.service';

const EMPTY: Personality = {
  brand_traits: [],
  brand_tone: '',
  brand_instructions: [],
  voice_traits: [],
  voice_tone: '',
  voice_instructions: [],
};

// One picker drives both brand_traits and voice_traits — a non-technical
// user thinks "how should my agent sound", not "brand vs voice traits",
// which is an internal distinction (chat prompt vs voice-call prompt).
const TONE_OPTIONS = [
  'Professional', 'Warm', 'Direct', 'Enthusiastic', 'Formal',
  'Casual', 'Calm', 'Empathetic', 'Confident', 'Playful',
];

export function PersonalityTab({ personality }: { personality: Personality | null }) {
  const [form, setForm] = useState<Personality>(personality ?? EMPTY);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const update = useUpdatePersonality();

  useEffect(() => setForm(personality ?? EMPTY), [personality]);

  // Shared trait picker: same selection feeds brand_traits and voice_traits,
  // and derives both tone strings, unless the user has diverged them in
  // Advanced (detected by traits differing between the two).
  const sharedTraits = form.brand_traits;

  const handleTraitsChange = (traits: string[]) => {
    setForm((f) => ({
      ...f,
      brand_traits: traits,
      voice_traits: traits,
      brand_tone: traits.join(', '),
      voice_tone: traits.join(', '),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      toast({ title: 'Personality saved', variant: 'default' });
    } catch {
      toast({ title: 'Failed to save personality', variant: 'error' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">
          How should your agent sound?
        </label>
        <ChipMultiSelect
          options={TONE_OPTIONS}
          value={sharedTraits}
          onChange={handleTraitsChange}
        />
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-secondary hover:text-primary">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          Advanced — split chat vs. phone voice
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <p className="text-[11px] text-muted">
            By default the same tone applies to chat and phone calls. Override either one below if
            they should differ.
          </p>
          <div>
            <label className="block text-xs font-medium text-primary mb-1.5">Chat tone</label>
            <Input
              value={form.brand_tone}
              onChange={(e) => setForm((f) => ({ ...f, brand_tone: e.target.value }))}
            />
          </div>
          <LinesField
            label="Chat instructions"
            value={form.brand_instructions}
            onChange={(v) => setForm((f) => ({ ...f, brand_instructions: v }))}
          />
          <div>
            <label className="block text-xs font-medium text-primary mb-1.5">Phone voice tone</label>
            <Input
              value={form.voice_tone}
              onChange={(e) => setForm((f) => ({ ...f, voice_tone: e.target.value }))}
            />
          </div>
          <LinesField
            label="Phone voice instructions"
            value={form.voice_instructions}
            onChange={(v) => setForm((f) => ({ ...f, voice_instructions: v }))}
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
