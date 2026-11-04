'use client';

import { useState, useMemo } from 'react';
import { Repeat } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/useToast';
import { useSequenceTemplates } from '@/hooks/useSequenceTemplates';
import { useMyOrganization, useUpdateSequenceSettings } from '@/hooks/useOrganizations';
import type { SequenceTemplate } from '@/services/automation.service';
import { SequenceTemplateCard } from './_components/SequenceTemplateCard';
import { SequenceStepEditor } from './_components/SequenceStepEditor';
import { SEQUENCE_TYPE_LABELS } from '@/components/sequences/sequence-constants';

export default function ConfigSequencesPage() {
  const { data: templates, isLoading } = useSequenceTemplates();
  const { data: org } = useMyOrganization();
  const updateSettings = useUpdateSequenceSettings();
  const [editing, setEditing] = useState<SequenceTemplate | null>(null);

  const sequencesEnabled = org?.settings?.sequences_enabled !== false;

  const handleToggleSequences = async (enabled: boolean) => {
    try {
      await updateSettings.mutateAsync(enabled);
      toast({
        title: enabled ? 'Sequences enabled' : 'Sequences disabled',
        description: enabled
          ? 'Automatic sequences will be created as usual.'
          : 'No new automatic sequences will be created.',
      });
    } catch {
      toast({
        variant: 'error',
        title: 'Error',
        description: 'Could not update the settings.',
      });
    }
  };

  // Grouped by sequence_type — the axis templates are selected on when a
  // sequence is created (not the channel, which is resolved per step)
  const grouped = useMemo(() => {
    const map = new Map<string, SequenceTemplate[]>();
    for (const t of templates ?? []) {
      const list = map.get(t.sequence_type) ?? [];
      list.push(t);
      map.set(t.sequence_type, list);
    }
    return Array.from(map.entries());
  }, [templates]);

  // Keep the drawer bound to fresh data after a save
  const editingTemplate = editing
    ? (templates ?? []).find((t) => t.id === editing.id) ?? editing
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Follow-up Sequences</h1>
          <p className="mt-0.5 text-xs text-secondary">
            Define what to do, and on which channel, at each attempt when a contact stops replying. The channel is resolved when the step runs, based on what the contact has available.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-primary">
              {sequencesEnabled ? 'Enabled' : 'Disabled'}
            </p>
            <p className="text-xs text-secondary">
              {sequencesEnabled ? 'Created automatically' : 'No new ones will be created'}
            </p>
          </div>
          <Switch
            checked={sequencesEnabled}
            onCheckedChange={handleToggleSequences}
            disabled={updateSettings.isPending}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : !templates?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-subtle py-24 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-olive-dark">
            <Repeat className="h-6 w-6 text-accent" />
          </div>
          <h3 className="text-sm font-medium text-primary">No sequences configured</h3>
          <p className="mt-1 text-xs text-secondary">
            Run the sequences migration to load the default templates.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([type, items]) => (
            <section key={type}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {SEQUENCE_TYPE_LABELS[type] ?? type}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
                  <SequenceTemplateCard
                    key={t.id}
                    template={t}
                    onEdit={() => setEditing(t)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <SequenceStepEditor
        template={editingTemplate}
        open={!!editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
