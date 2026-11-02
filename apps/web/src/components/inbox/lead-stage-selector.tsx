'use client';

import { useFunnels, useFunnelStages, useUpdateContactStage } from '@/hooks/useFunnels';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface LeadStageSelectorProps {
  contactId: string;
  currentStage?: string;
}

export function LeadStageSelector({ contactId, currentStage }: LeadStageSelectorProps) {
  const { data: funnels, isLoading: funnelsLoading } = useFunnels();
  const firstFunnelId = funnels?.[0]?.id ?? null;
  const { data: stages, isLoading: stagesLoading } = useFunnelStages(firstFunnelId);
  const updateStage = useUpdateContactStage();

  if (funnelsLoading || stagesLoading) {
    return <Skeleton className="h-8 w-full rounded-md" />;
  }

  return (
    <Select
      value={currentStage ?? ''}
      onValueChange={(stageId) => updateStage.mutate({ contactId, stageId })}
      disabled={updateStage.isPending}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Set stage" />
      </SelectTrigger>
      <SelectContent>
        {(stages ?? []).map((stage) => (
          <SelectItem key={stage.id} value={stage.id} className="text-xs">
            {stage.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
