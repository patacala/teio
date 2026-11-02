'use client';

import { GitBranch } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAllFunnelStages, useUpdateContactStage } from '@/hooks/useContacts';
import { toast } from '@/hooks/useToast';
import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
}

export function FunnelStageCard({ contact }: Props) {
  const { data: stages = [] } = useAllFunnelStages();
  const updateStage = useUpdateContactStage();

  const handleChange = (stageId: string) => {
    updateStage.mutate(
      { contactId: contact.id, stageId },
      {
        onError: () => toast({ title: 'Failed to update stage', variant: 'error' }),
      },
    );
  };

  return (
    <div className="bg-panel border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Funnel Stage</h3>
      </div>
      {stages.length === 0 ? (
        <p className="text-sm text-gray-400">No stages configured</p>
      ) : (
        <Select
          value={contact.lead_stage ?? ''}
          onValueChange={handleChange}
          disabled={updateStage.isPending}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select a stage" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
