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
    if (!window.confirm('Cancel the automatic follow-up for this contact?')) return;
    try {
      await cancel.mutateAsync(active.id);
      toast({ title: 'Follow-up cancelled' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const currentStep = steps?.find((s) => s.position === active?.current_attempt);
  const StepIcon = currentStep ? actionMeta(currentStep.action).icon : Repeat;

  return (
    <div className="rounded-xl border border-subtle bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Repeat className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-primary">Follow-up</h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : !active ? (
        <p className="text-sm text-muted">No active follow-up</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-primary">
              {SEQUENCE_TYPE_LABELS[active.sequence_type] ?? active.sequence_type}
            </p>
            <p className="mt-0.5 text-xs text-secondary">
              Step {active.current_attempt} of {active.max_attempts}
            </p>
          </div>

          {/* Progress */}
          <div className="flex gap-1">
            {Array.from({ length: active.max_attempts }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  i < active.current_attempt ? 'bg-accent' : 'bg-surface-hover'
                }`}
              />
            ))}
          </div>

          {currentStep && (
            <div className="flex items-start gap-2 rounded-lg bg-surface-raised px-3 py-2">
              <StepIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary">
                  Next action: {actionMeta(currentStep.action).label}
                </p>
                <p className="mt-0.5 text-xs text-secondary">
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
            className="gap-1.5 text-danger hover:bg-danger/10 hover:text-danger"
          >
            {cancel.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cancel follow-up
          </Button>
        </div>
      )}
    </div>
  );
}
