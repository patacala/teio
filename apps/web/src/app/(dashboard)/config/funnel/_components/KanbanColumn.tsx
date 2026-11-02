'use client';

import { useState } from 'react';
import type { FunnelStage } from '@/services/funnels.service';
import { useContacts } from '@/hooks/useContacts';
import { KanbanContactCard } from './KanbanContactCard';

interface Props {
  stage: FunnelStage;
  onDragStart: (contactId: string) => void;
  onDrop: (stageId: string) => void;
}

export function KanbanColumn({ stage, onDragStart, onDrop }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { data, isLoading } = useContacts({ stage_id: stage.id, limit: 50 });
  const contacts = data?.items ?? [];

  return (
    <div
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
      {/* Column header */}
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: stage.color ?? '#9CA3AF' }}
        />
        <p className="text-xs font-semibold text-gray-700 flex-1 truncate">{stage.name}</p>
        <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
          {isLoading ? '…' : contacts.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        className={`flex-1 min-h-24 rounded-xl border-2 p-1.5 space-y-1.5 transition-colors ${
          isDragOver
            ? 'border-blue-300 bg-blue-50'
            : 'border-dashed border-gray-200 bg-gray-50'
        }`}
      >
        {isLoading ? (
          <>
            <div className="h-14 rounded-lg border border-border animate-pulse bg-white" />
            <div className="h-14 rounded-lg border border-border animate-pulse bg-white" />
          </>
        ) : contacts.length === 0 ? (
          <p className="text-[10px] text-gray-300 text-center pt-4">No contacts</p>
        ) : (
          contacts.map((contact) => (
            <KanbanContactCard
              key={contact.id}
              contact={contact}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
}
