'use client';

import { useState } from 'react';
import type { FunnelStage } from '@/services/funnels.service';
import { useUpdateContactStage } from '@/hooks/useFunnels';
import { toast } from '@/hooks/useToast';
import { KanbanColumn } from './KanbanColumn';
import { NoStages } from './NoStages';

interface Props {
  stages: FunnelStage[];
  onConfigure: () => void;
}

export function FunnelKanbanView({ stages, onConfigure }: Props) {
  const [draggingContactId, setDraggingContactId] = useState<string | null>(null);
  const updateContactStage = useUpdateContactStage();

  const sorted = [...stages].sort((a, b) => a.position - b.position);

  const handleDrop = (stageId: string) => {
    if (!draggingContactId) return;
    updateContactStage.mutate(
      { contactId: draggingContactId, stageId },
      { onError: () => toast({ title: 'Failed to move contact', variant: 'error' }) },
    );
    setDraggingContactId(null);
  };

  if (sorted.length === 0) return <NoStages onConfigure={onConfigure} />;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-1 min-h-96">
      {sorted.map((stage) => (
        <KanbanColumn
          key={stage.id}
          stage={stage}
          onDragStart={setDraggingContactId}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}
