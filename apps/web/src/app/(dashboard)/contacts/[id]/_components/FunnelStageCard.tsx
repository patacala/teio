'use client';

import { GitBranch } from 'lucide-react';
import { StageSelect } from '@/components/funnel/stage-select';
import { useUpdateContactStage } from '@/hooks/useContacts';
import { toast } from '@/hooks/useToast';
import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
}

export function FunnelStageCard({ contact }: Props) {
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
    <div className="bg-surface border border-subtle rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-primary">Funnel Stage</h3>
      </div>
      <StageSelect
        value={contact.lead_stage}
        onValueChange={handleChange}
        disabled={updateStage.isPending}
        className="text-sm"
      />
    </div>
  );
}
