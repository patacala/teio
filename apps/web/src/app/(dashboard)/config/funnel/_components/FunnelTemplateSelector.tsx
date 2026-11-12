'use client';

import { GitBranch, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFunnelTemplates, useApplyFunnelTemplate, useCreateFunnel } from '@/hooks/useFunnels';
import type { FunnelTemplate } from '@/services/funnels.service';
import { toast } from '@/hooks/useToast';
import { stageColor } from './stageColors';

const CATEGORY_LABELS: Record<string, string> = {
  generic: 'Generic',
  sales: 'Sales',
  agency: 'Agency',
  real_estate: 'Real Estate',
  local_services: 'Local Services',
  ecommerce: 'Ecommerce',
};

interface Props {
  onCreated: (funnelId: string) => void;
}

export function FunnelTemplateSelector({ onCreated }: Props) {
  const { data: templates = [], isLoading } = useFunnelTemplates();
  const applyTemplate = useApplyFunnelTemplate();
  const createFunnel = useCreateFunnel();
  const busy = applyTemplate.isPending || createFunnel.isPending;

  const handleApply = async (template: FunnelTemplate) => {
    try {
      const result = await applyTemplate.mutateAsync(template.id);
      onCreated(result.funnel.id);
    } catch {
      toast({ title: 'Failed to apply template', variant: 'error' });
    }
  };

  const handleEmpty = async () => {
    try {
      const funnel = await createFunnel.mutateAsync({ name: 'My Funnel' });
      onCreated(funnel.id);
    } catch {
      toast({ title: 'Failed to create funnel', variant: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="icon-tile w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <GitBranch className="h-5 w-5 text-accent" />
        </div>
        <h2 className="text-lg font-semibold text-primary">Choose a template to get started</h2>
        <p className="text-sm text-secondary mt-1">Select a predefined template or start with a blank funnel.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-card" />)
          : templates.map((template) => {
              const applying = applyTemplate.isPending && applyTemplate.variables === template.id;
              const stages = [...template.stages].sort((a, b) => a.position - b.position);
              return (
                <Card key={template.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-primary">{template.name}</p>
                    <Badge variant="neutral" className="shrink-0">
                      {CATEGORY_LABELS[template.category] ?? template.category}
                    </Badge>
                  </div>
                  {template.description && <p className="text-xs text-secondary -mt-2">{template.description}</p>}
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1" aria-hidden>
                      {stages.map((s) => (
                        <span key={s.id} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageColor(s.color) }} />
                      ))}
                    </div>
                    <span className="text-xs text-muted">{stages.length} stages</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed line-clamp-2">
                    {stages.map((s) => s.name).join(' → ')}
                  </p>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => handleApply(template)} className="w-full mt-auto">
                    {applying ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…
                      </>
                    ) : (
                      'Use template'
                    )}
                  </Button>
                </Card>
              );
            })}
      </div>

      {!isLoading && templates.length === 0 && (
        <p className="text-center text-xs text-muted">No templates available.</p>
      )}

      <div className="text-center">
        <Button variant="ghost" size="sm" onClick={handleEmpty} disabled={busy} className="text-accent">
          {createFunnel.isPending ? 'Creating…' : 'Start with a blank funnel'}
        </Button>
      </div>
    </div>
  );
}
