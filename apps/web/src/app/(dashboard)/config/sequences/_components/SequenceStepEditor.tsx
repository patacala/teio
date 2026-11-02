'use client';

import { useState, useEffect } from 'react';
import { Plus, Loader2, Lock } from 'lucide-react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/useToast';
import { useReplaceTemplateSteps, useUpdateTemplate } from '@/hooks/useSequenceTemplates';
import type { SequenceTemplate, SequenceStepInput } from '@/services/automation.service';
import { SequenceStepRow } from './SequenceStepRow';
import { SequenceTimelinePreview } from '@/components/sequences/SequenceTimelinePreview';
import { SEQUENCE_TYPE_LABELS } from '@/components/sequences/sequence-constants';

const NEW_STEP: SequenceStepInput = {
  action: 'send_message',
  channel_strategy: 'auto',
  delay_hours: 24,
};

interface Props {
  template: SequenceTemplate | null;
  open: boolean;
  onClose(): void;
}

export function SequenceStepEditor({ template, open, onClose }: Props) {
  const replaceSteps = useReplaceTemplateSteps();
  const updateTemplate = useUpdateTemplate();

  const [name, setName] = useState('');
  const [steps, setSteps] = useState<SequenceStepInput[]>([]);

  // Platform templates are shared across every org — read-only by design
  const readOnly = !template?.organization_id;

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setSteps(
      [...(template.steps ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          action: s.action,
          channel_strategy: s.channel_strategy,
          delay_hours: s.delay_hours,
          config: s.config,
        })),
    );
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!template) return null;

  const patchStep = (i: number, patch: Partial<SequenceStepInput>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const moveStep = (i: number, direction: -1 | 1) =>
    setSteps((prev) => {
      const target = i + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });

  const removeStep = (i: number) =>
    setSteps((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    try {
      if (name !== template.name) {
        await updateTemplate.mutateAsync({ id: template.id, body: { name } });
      }
      await replaceSteps.mutateAsync({ id: template.id, steps });
      toast({ title: 'Secuencia guardada' });
      onClose();
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const saving = replaceSteps.isPending || updateTemplate.isPending;

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="flex flex-col sm:max-w-lg">
        <DrawerHeader className="shrink-0 pr-8">
          <DrawerTitle>{readOnly ? template.name : 'Editar secuencia'}</DrawerTitle>
          <p className="mt-0.5 text-xs text-gray-500">
            {SEQUENCE_TYPE_LABELS[template.sequence_type] ?? template.sequence_type}
          </p>
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {readOnly && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-gray-50 px-3 py-2.5">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <p className="text-xs text-gray-500">
                Plantilla de la plataforma, compartida por todas las organizaciones.
                Duplicala para obtener una copia editable.
              </p>
            </div>
          )}

          {!readOnly && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Nombre</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" />
            </div>
          )}

          {/* Steps */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              Pasos ({steps.length})
            </label>
            {steps.map((step, i) => (
              <SequenceStepRow
                key={i}
                step={step}
                index={i}
                total={steps.length}
                disabled={readOnly}
                onChange={(patch) => patchStep(i, patch)}
                onMove={(d) => moveStep(i, d)}
                onRemove={() => removeStep(i)}
              />
            ))}

            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSteps((prev) => [...prev, { ...NEW_STEP }])}
                className="w-full gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar paso
              </Button>
            )}
          </div>

          {/* Preview */}
          {steps.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="mb-3 text-xs font-medium text-gray-700">Vista previa</p>
              <SequenceTimelinePreview steps={steps} />
            </div>
          )}
        </div>

        <DrawerFooter className="shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar cambios
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
