'use client';

import { useState } from 'react';
import { useCapturedFields, useUpdateCapturedFields } from '@/hooks/useCapturedFields';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface CapturedFieldsListProps {
  contactId: string;
}

export function CapturedFieldsList({ contactId }: CapturedFieldsListProps) {
  const { data, isLoading } = useCapturedFields(contactId);
  const update = useUpdateCapturedFields(contactId);
  const [editing, setEditing] = useState<Record<string, string>>({});

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  const fields = data?.fields ?? {};
  const keys = Object.keys(fields);

  if (keys.length === 0) {
    return <p className="text-xs text-muted">No captured fields yet</p>;
  }

  const handleBlur = (key: string) => {
    const current = editing[key];
    if (current !== undefined && current !== fields[key]) {
      update.mutate({ ...fields, [key]: current });
    }
    setEditing((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div key={key} className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted shrink-0 capitalize">{key.replace(/_/g, ' ')}</span>
          <Input
            className="h-6 text-[11px] px-1.5 border-transparent bg-transparent hover:border-subtle focus:border-subtle text-right"
            value={editing[key] ?? fields[key]}
            onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
            onBlur={() => handleBlur(key)}
          />
        </div>
      ))}
    </div>
  );
}
