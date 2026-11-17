'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';
import { useConfigureFromBrief } from '@/hooks/useAIAgents';
import { toast } from '@/hooks/useToast';
import type { BriefResult } from '@/services/ai-agents.service';

const PLACEHOLDER = `Describe your business and how you want the agent to sell.

Example: "We're Audi Miami South, a premium dealership. Our assistant should be warm but professional, understand what the customer needs before pushing a model, handle price objections by focusing on value and total cost of ownership, and always try to book a test drive. Never say 'cheap' or 'discount'."`;

/**
 * Primary, non-technical way to configure the agent: paste a plain-language
 * brief, ProSales' extractor turns it into identity/personality/rules/
 * strategies (persisted), and we show a read-only summary of what it became.
 * The expert tabs stay available for fine edits afterwards.
 */
export function BriefTab() {
  const [brief, setBrief] = useState('');
  const [result, setResult] = useState<BriefResult | null>(null);
  const generate = useConfigureFromBrief();

  const handleGenerate = async () => {
    if (!brief.trim()) return;
    try {
      const res = await generate.mutateAsync(brief.trim());
      setResult(res);
      toast({ title: 'Agent configured from your brief', variant: 'default' });
    } catch {
      toast({ title: 'Failed to generate configuration', variant: 'error' });
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">
          Describe your business and selling style
        </label>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={10}
        />
        <p className="text-xs text-muted mt-1.5">
          This generates the full configuration automatically. You can fine-tune
          anything in the other tabs afterwards.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleGenerate}
          disabled={generate.isPending || !brief.trim()}
          className="bg-accent hover:bg-accent-hover text-on-accent gap-1.5"
        >
          <Sparkles className="h-4 w-4" />
          {generate.isPending ? 'Generating…' : 'Generate configuration'}
        </Button>
      </div>

      {result && <BriefSummary result={result} />}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={i}
          className="rounded-md bg-surface-raised px-2 py-0.5 text-xs text-primary"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-secondary">{title}</h4>
      {children}
    </div>
  );
}

/** Read-only recap so the user sees what their brief turned into. */
function BriefSummary({ result }: { result: BriefResult }) {
  const { identity, personality, rules, strategies } = result;
  return (
    <div className="rounded-xl border border-subtle bg-surface-raised/60 p-4 space-y-4">
      <p className="text-xs text-secondary">
        Here&apos;s what your brief was turned into — this is now live. Edit any part
        in the tabs above.
      </p>

      <Section title="Identity">
        <p className="text-sm font-medium text-primary">{identity.name}</p>
        {identity.description && (
          <p className="text-xs text-secondary">{identity.description}</p>
        )}
        <Chips items={identity.principles} />
      </Section>

      <Section title="Personality">
        <p className="text-xs text-secondary">Tone: {personality.brand_tone}</p>
        <Chips items={personality.brand_traits} />
      </Section>

      {rules?.length > 0 && (
        <Section title={`Rules (${rules.length})`}>
          <ul className="text-xs text-secondary space-y-0.5">
            {rules.map((r, i) => (
              <li key={i}>
                {r.intent ? `When ${r.intent} → ` : ''}
                {r.action_type}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {strategies?.length > 0 && (
        <Section title={`Strategies (${strategies.length})`}>
          <ul className="text-xs text-secondary space-y-0.5">
            {strategies.map((s, i) => (
              <li key={i}>
                <span className="font-medium text-primary">{s.name}</span>
                {s.description ? ` — ${s.description}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
