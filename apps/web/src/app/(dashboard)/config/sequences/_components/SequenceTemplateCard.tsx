'use client';

import { Settings, Copy, Trash2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { useDuplicateTemplate, useDeleteTemplate } from '@/hooks/useSequenceTemplates';
import type { SequenceTemplate } from '@/services/automation.service';
import { actionMeta, formatDelay } from '@/components/sequences/sequence-constants';

interface Props {
  template: SequenceTemplate;
  onEdit(): void;
}

export function SequenceTemplateCard({ template, onEdit }: Props) {
  const duplicate = useDuplicateTemplate();
  const remove = useDeleteTemplate();

  const isPlatform = !template.organization_id;
  const steps = [...(template.steps ?? [])].sort((a, b) => a.position - b.position);
  const totalHours = steps.reduce((sum, s) => sum + s.delay_hours, 0);

  const handleDuplicate = async () => {
    try {
      await duplicate.mutateAsync({ id: template.id });
      toast({ title: 'Copia creada — ya podés editarla' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar "${template.name}"? Las secuencias en curso no se ven afectadas.`)) return;
    try {
      await remove.mutateAsync(template.id);
      toast({ title: 'Secuencia eliminada' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-panel">
      <div className="flex-1 px-4 py-3">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-semibold text-gray-900">{template.name}</p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
              isPlatform ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'
            }`}
          >
            {isPlatform ? 'Plataforma' : 'Personalizada'}
          </span>
        </div>

        <p className="mt-1 text-xs text-gray-500">
          {steps.length} pasos · {formatDelay(totalHours)} en total
        </p>

        {/* Cadence shape at a glance */}
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {steps.map((s) => {
            const Icon = actionMeta(s.action).icon;
            const isCall = s.action === 'call';
            return (
              <div
                key={s.id}
                title={`Paso ${s.position}: ${actionMeta(s.action).label}`}
                className={`flex h-6 w-6 items-center justify-center rounded-md ${
                  isCall ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <Icon className="h-3 w-3" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-0.5 border-t border-border px-3 py-1.5">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>{isPlatform ? 'Ver' : 'Editar'}</span>
        </button>

        <button
          onClick={handleDuplicate}
          disabled={duplicate.isPending}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          {duplicate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span>Duplicar</span>
        </button>

        {!isPlatform && (
          <button
            onClick={handleDelete}
            disabled={remove.isPending}
            className="ml-auto rounded p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
