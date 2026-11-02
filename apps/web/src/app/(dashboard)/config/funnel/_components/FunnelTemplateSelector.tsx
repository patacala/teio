'use client';

import { GitBranch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFunnelTemplates, useApplyFunnelTemplate, useCreateFunnel } from '@/hooks/useFunnels';
import { funnelsService, type FunnelTemplate } from '@/services/funnels.service';
import { toast } from '@/hooks/useToast';

const CATEGORY_LABELS: Record<string, string> = {
  generic: 'Generic',
  agency: 'Agency',
  real_estate: 'Real Estate',
  local_services: 'Local Services',
  ecommerce: 'Ecommerce',
};

// Fallback templates shown when DB migration hasn't been run yet
const FALLBACK_TEMPLATES: FunnelTemplate[] = [
  {
    id: '__generic',
    name: 'Generic Funnel',
    description: 'Standard sales pipeline for any industry',
    category: 'generic',
    stages: [
      { id: '1', name: 'New', position: 0, color: '#3B82F6' },
      { id: '2', name: 'Contacted', position: 1, color: '#8B5CF6' },
      { id: '3', name: 'Qualified', position: 2, color: '#6366F1' },
      { id: '4', name: 'Interested', position: 3, color: '#F59E0B' },
      { id: '5', name: 'Proposal Sent', position: 4, color: '#EC4899' },
      { id: '6', name: 'Negotiation', position: 5, color: '#14B8A6' },
      { id: '7', name: 'Won', position: 6, color: '#10B981' },
      { id: '8', name: 'Lost', position: 7, color: '#EF4444' },
    ],
  },
  {
    id: '__agency',
    name: 'Agency Funnel',
    description: 'Optimized for marketing and creative agencies',
    category: 'agency',
    stages: [
      { id: '1', name: 'New Lead', position: 0, color: '#3B82F6' },
      { id: '2', name: 'Initial Contact', position: 1, color: '#8B5CF6' },
      { id: '3', name: 'Diagnosis', position: 2, color: '#6366F1' },
      { id: '4', name: 'Proposal Sent', position: 3, color: '#F59E0B' },
      { id: '5', name: 'Follow Up', position: 4, color: '#EC4899' },
      { id: '6', name: 'Negotiation', position: 5, color: '#14B8A6' },
      { id: '7', name: 'Client Won', position: 6, color: '#10B981' },
      { id: '8', name: 'Client Lost', position: 7, color: '#EF4444' },
    ],
  },
  {
    id: '__real_estate',
    name: 'Real Estate Funnel',
    description: 'Pipeline for property sales and leasing',
    category: 'real_estate',
    stages: [
      { id: '1', name: 'New Lead', position: 0, color: '#3B82F6' },
      { id: '2', name: 'Initial Contact', position: 1, color: '#8B5CF6' },
      { id: '3', name: 'Property Recommended', position: 2, color: '#6366F1' },
      { id: '4', name: 'Visit Scheduled', position: 3, color: '#F59E0B' },
      { id: '5', name: 'Offer Sent', position: 4, color: '#EC4899' },
      { id: '6', name: 'Negotiation', position: 5, color: '#14B8A6' },
      { id: '7', name: 'Property Sold', position: 6, color: '#10B981' },
      { id: '8', name: 'Lead Lost', position: 7, color: '#EF4444' },
    ],
  },
  {
    id: '__local_services',
    name: 'Local Services Funnel',
    description: 'For local service businesses',
    category: 'local_services',
    stages: [
      { id: '1', name: 'New Lead', position: 0, color: '#3B82F6' },
      { id: '2', name: 'Initial Consultation', position: 1, color: '#8B5CF6' },
      { id: '3', name: 'Quote Sent', position: 2, color: '#6366F1' },
      { id: '4', name: 'Appointment Scheduled', position: 3, color: '#F59E0B' },
      { id: '5', name: 'Service Completed', position: 4, color: '#14B8A6' },
      { id: '6', name: 'Returning Customer', position: 5, color: '#10B981' },
      { id: '7', name: 'Lead Lost', position: 6, color: '#EF4444' },
    ],
  },
  {
    id: '__ecommerce',
    name: 'Ecommerce Funnel',
    description: 'For online stores and product-based businesses',
    category: 'ecommerce',
    stages: [
      { id: '1', name: 'New Lead', position: 0, color: '#3B82F6' },
      { id: '2', name: 'Product Interest', position: 1, color: '#8B5CF6' },
      { id: '3', name: 'Cart Started', position: 2, color: '#6366F1' },
      { id: '4', name: 'Purchase Completed', position: 3, color: '#10B981' },
      { id: '5', name: 'Potential Rebuy', position: 4, color: '#F59E0B' },
      { id: '6', name: 'Customer Lost', position: 5, color: '#EF4444' },
    ],
  },
];

interface Props {
  onCreated: (funnelId: string) => void;
}

export function FunnelTemplateSelector({ onCreated }: Props) {
  const { data: apiTemplates, isLoading } = useFunnelTemplates();
  const applyTemplate = useApplyFunnelTemplate();
  const createFunnel = useCreateFunnel();

  // Use API templates if available and non-empty, otherwise fall back to hardcoded
  const templates = apiTemplates && apiTemplates.length > 0 ? apiTemplates : FALLBACK_TEMPLATES;
  const usingFallback = !apiTemplates || apiTemplates.length === 0;

  const handleApply = async (template: FunnelTemplate) => {
    try {
      if (!usingFallback) {
        // Use API apply endpoint (migration ran, templates in DB)
        const result = await applyTemplate.mutateAsync(template.id);
        onCreated(result.funnel.id);
      } else {
        // Fallback: create funnel + stages directly via service
        const funnel = await createFunnel.mutateAsync({ name: template.name });
        const sorted = [...template.stages].sort((a, b) => a.position - b.position);
        for (const s of sorted) {
          await funnelsService.createFunnelStage(funnel.id, {
            name: s.name,
            color: s.color,
            position: s.position,
          });
        }
        onCreated(funnel.id);
      }
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <GitBranch className="h-6 w-6 text-blue-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Choose a template to get started</h2>
        <p className="text-sm text-gray-500 mt-1">
          Select a predefined template or start with a blank funnel.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {templates.map((template) => {
          const isPending =
            (applyTemplate.isPending && applyTemplate.variables === template.id) ||
            (createFunnel.isPending);
          const sortedStages = [...template.stages].sort((a, b) => a.position - b.position);
          return (
            <div
              key={template.id}
              className="bg-panel border border-border rounded-xl p-4 flex flex-col gap-3 relative"
            >
              <span className="absolute top-3 right-3 text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {CATEGORY_LABELS[template.category] ?? template.category}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 pr-16">{template.name}</p>
                {template.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{sortedStages.length} stages</span>
                <div className="flex gap-1">
                  {sortedStages.slice(0, 5).map((s) => (
                    <div
                      key={s.id}
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: s.color ?? '#9CA3AF' }}
                      title={s.name}
                    />
                  ))}
                  {sortedStages.length > 5 && (
                    <span className="text-[10px] text-gray-400">+{sortedStages.length - 5}</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                disabled={applyTemplate.isPending || createFunnel.isPending}
                onClick={() => handleApply(template)}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full mt-auto"
              >
                {isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Applying…</>
                ) : (
                  'Use template'
                )}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <button
          onClick={handleEmpty}
          disabled={createFunnel.isPending || applyTemplate.isPending}
          className="text-sm text-blue-600 hover:underline disabled:opacity-50"
        >
          {createFunnel.isPending ? 'Creating…' : 'Start with a blank funnel'}
        </button>
      </div>
    </div>
  );
}

