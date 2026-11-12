'use client';

import { useState } from 'react';
import type { FunnelStage } from '@/services/funnels.service';
import { useStageContacts } from '@/hooks/useContacts';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { KanbanContactCard } from './KanbanContactCard';
import { stageColor } from './stageColors';

interface Props {
  stage: FunnelStage;
  onDragStart: (contactId: string) => void;
  onDrop: (stageId: string) => void;
}

export const COLUMN_LIMIT = 50;

export function KanbanColumn({ stage, onDragStart, onDrop }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { data, isLoading } = useStageContacts(stage.id, COLUMN_LIMIT);
  const contacts = data?.items ?? [];
  const total = data?.meta.total ?? contacts.length;
  const hidden = total - contacts.length;

  return (
    <section
      aria-label={stage.name}
      className="flex flex-col shrink-0 w-72"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={() => {
        setIsDragOver(false);
        onDrop(stage.id);
      }}
    >
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stageColor(stage.color) }} />
        <h3 className="text-xs font-semibold text-primary flex-1 truncate">{stage.name}</h3>
        {isLoading ? (
          <Skeleton className="h-4 w-6 rounded-full" />
        ) : (
          <span className="text-[11px] font-medium text-secondary bg-surface-raised border border-subtle rounded-full px-1.5">
            {total}
          </span>
        )}
      </div>

      <div
        className={cn(
          'flex-1 min-h-24 rounded-card border p-1.5 space-y-1.5 transition-colors',
          isDragOver ? 'border-accent/30 bg-olive-dark' : 'border-dashed border-subtle bg-surface-raised/60',
        )}
      >
        {isLoading ? (
          <>
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </>
        ) : contacts.length === 0 ? (
          <p className="text-[11px] text-muted text-center pt-4">No contacts</p>
        ) : (
          contacts.map((contact) => (
            <KanbanContactCard key={contact.id} contact={contact} onDragStart={onDragStart} />
          ))
        )}
        {hidden > 0 && (
          <p className="text-[11px] text-muted text-center py-1.5">
            {hidden} more in this stage — see the List view
          </p>
        )}
      </div>
    </section>
  );
}
