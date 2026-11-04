'use client';

import { useState } from 'react';
import type { FunnelStage } from '@/services/funnels.service';
import { useUpdateContactStage } from '@/hooks/useFunnels';
import { KanbanColumn } from './KanbanColumn';

interface Props {
  stages: FunnelStage[];
}

export function FunnelKanbanView({ stages }: Props) {
  const [draggingContactId, setDraggingContactId] = useState<string | null>(null);
  const updateContactStage = useUpdateContactStage();

  const sorted = [...stages].sort((a, b) => a.position - b.position);

  const handleDrop = (stageId: string) => {
    if (!draggingContactId) return;
    updateContactStage.mutate({ contactId: draggingContactId, stageId });
    setDraggingContactId(null);
  };

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
      {sorted.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted">
          Add stages in the list view to use the Kanban board.
        </div>
      )}
    </div>
  );
}
