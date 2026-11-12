'use client';

import { StageSelect } from '@/components/funnel/stage-select';
import { useUpdateContactStage } from '@/hooks/useFunnels';
import { toast } from '@/hooks/useToast';

interface LeadStageSelectorProps {
  contactId: string;
  currentStage?: string;
}

export function LeadStageSelector({ contactId, currentStage }: LeadStageSelectorProps) {
  const updateStage = useUpdateContactStage();

  return (
    <StageSelect
      value={currentStage}
      disabled={updateStage.isPending}
      onValueChange={(stageId) =>
        updateStage.mutate(
          { contactId, stageId },
          { onError: () => toast({ title: 'Failed to update stage', variant: 'error' }) },
        )
      }
    />
  );
}
