'use client';

import { Fragment } from 'react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useFunnels } from '@/hooks/useFunnels';
import { useAllFunnelStages } from '@/hooks/useContacts';
import { cn } from '@/lib/utils';
import type { FunnelStage } from '@/services/funnels.service';

interface Props {
  value?: string;
  onValueChange: (stageId: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Stage picker for one contact. Lists every funnel of the organization,
 * grouped by funnel when there is more than one, so the current stage is
 * always shown no matter which funnel the contact is in.
 */
export function StageSelect({ value, onValueChange, disabled, className }: Props) {
  const { data: funnels = [], isLoading: funnelsLoading } = useFunnels();
  const { data: stages = [], isLoading: stagesLoading } = useAllFunnelStages();

  if (funnelsLoading || stagesLoading) return <Skeleton className={cn('h-8 w-full rounded-md', className)} />;
  if (stages.length === 0) return <p className="text-sm text-muted">No stages configured</p>;

  const groups = funnels
    .map((funnel) => ({
      funnel,
      stages: stages
        .filter((s: FunnelStage) => s.funnel_id === funnel.id)
        .sort((a, b) => a.position - b.position),
    }))
    .filter((group) => group.stages.length > 0);
  const grouped = groups.length > 1;

  return (
    <Select value={value ?? ''} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label="Funnel stage" className={cn('h-8 text-xs', className)}>
        <SelectValue placeholder="Set stage" />
      </SelectTrigger>
      <SelectContent>
        {groups.map(({ funnel, stages: funnelStages }, index) => (
          <Fragment key={funnel.id}>
            {grouped && index > 0 && <SelectSeparator />}
            <SelectGroup>
              {grouped && <SelectLabel>{funnel.name}</SelectLabel>}
              {funnelStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id} className="text-xs">
                  {stage.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}
