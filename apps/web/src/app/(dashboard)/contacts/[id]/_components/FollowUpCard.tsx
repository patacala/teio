'use client';

import { Repeat, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { automationService, type AutomationSequence } from '@/services/automation.service';
import { useSequenceSteps } from '@/hooks/useSequenceTemplates';
import { useCancelSequence } from '@/hooks/useAutomation';
import {
  actionMeta, strategyLabel, SEQUENCE_TYPE_LABELS,
} from '@/components/sequences/sequence-constants';

interface Props {
  contactId: string;
}

/**
 * Automation state for a contact — deliberately separate from FunnelStageCard.
 * The funnel is the commercial pipeline; this is the follow-up execution state.
 * They are orthogonal axes and both belong on the lead.
 */
export function FollowUpCard({ contactId }: Props) {
  const { data: sequences, isLoading } = useQuery({
    queryKey: ['sequences', 'contact', contactId],
    queryFn: () => automationService.listSequences({ contact_id: contactId, status: 'active' }),
    staleTime: 30_000,
  });

  const active: AutomationSequence | undefined = sequences?.items?.[0];
  const { data: steps } = useSequenceSteps(active?.id ?? null);
  const cancel = useCancelSequence();

  const handleCancel = async () => {
    if (!active) return;
    if (!window.confirm('¿Cancelar el seguimiento automático de este contacto?')) return;
    try {
      await cancel.mutateAsync(active.id);
      toast({ title: 'Seguimiento cancelado' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const currentStep = steps?.find((s) => s.position === active?.current_attempt);
  const StepIcon = currentStep ? actionMeta(currentStep.action).icon : Repeat;

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Repeat className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Follow-up</h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando…
        </div>
      ) : !active ? (
        <p className="text-sm text-gray-400">Sin seguimiento activo</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {SEQUENCE_TYPE_LABELS[active.sequence_type] ?? active.sequence_type}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Paso {active.current_attempt} de {active.max_attempts}
            </p>
          </div>

          {/* Progress */}
          <div className="flex gap-1">
            {Array.from({ length: active.max_attempts }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  i < active.current_attempt ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          {currentStep && (
            <div className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2">
              <StepIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900">
                  Próxima acción: {actionMeta(currentStep.action).label}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {strategyLabel(currentStep.channel_strategy)}
                </p>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={cancel.isPending}
            className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {cancel.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cancelar seguimiento
          </Button>
        </div>
      )}
    </div>
  );
}
