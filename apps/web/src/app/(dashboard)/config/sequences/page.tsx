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
        title: enabled ? 'Secuencias activadas' : 'Secuencias desactivadas',
        description: enabled
          ? 'Las secuencias automáticas se crearán normalmente.'
          : 'No se crearán nuevas secuencias automáticas.',
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Error',
        description: 'No se pudo actualizar la configuración.',
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
          <h1 className="text-lg font-semibold text-gray-900">Secuencias de seguimiento</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Definí qué hacer y por qué canal en cada intento cuando un contacto deja de responder.
            El canal se resuelve al momento de ejecutar, según lo que tenga disponible el contacto.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">
              {sequencesEnabled ? 'Activadas' : 'Desactivadas'}
            </p>
            <p className="text-xs text-gray-500">
              {sequencesEnabled ? 'Se crearán automáticamente' : 'No se crearán nuevas'}
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
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-24 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
            <Repeat className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-900">Sin secuencias configuradas</h3>
          <p className="mt-1 text-xs text-gray-500">
            Corré la migración de secuencias para cargar las plantillas por defecto.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([type, items]) => (
            <section key={type}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
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
