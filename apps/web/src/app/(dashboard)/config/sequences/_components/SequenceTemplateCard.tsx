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
      toast({ title: 'Copy created — you can edit it now' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${template.name}"? Sequences already in progress are not affected.`)) return;
    try {
      await remove.mutateAsync(template.id);
      toast({ title: 'Sequence deleted' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-subtle bg-surface">
      <div className="flex-1 px-4 py-3">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-semibold text-primary">{template.name}</p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
              isPlatform ? 'bg-surface-raised text-secondary' : 'bg-olive-dark text-accent'
            }`}
          >
            {isPlatform ? 'Platform' : 'Custom'}
          </span>
        </div>

        <p className="mt-1 text-xs text-secondary">
          {steps.length} steps · {formatDelay(totalHours)} total
        </p>

        {/* Cadence shape at a glance */}
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {steps.map((s) => {
            const Icon = actionMeta(s.action).icon;
            const isCall = s.action === 'call';
            return (
              <div
                key={s.id}
                title={`Step ${s.position}: ${actionMeta(s.action).label}`}
                className={`flex h-6 w-6 items-center justify-center rounded-md ${
                  isCall ? 'bg-olive-dark text-accent' : 'bg-surface-raised text-secondary'
                }`}
              >
                <Icon className="h-3 w-3" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-0.5 border-t border-subtle px-3 py-1.5">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-secondary transition-colors hover:bg-olive-dark hover:text-accent-hover"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>{isPlatform ? 'View' : 'Edit'}</span>
        </button>

        <button
          onClick={handleDuplicate}
          disabled={duplicate.isPending}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-secondary transition-colors hover:bg-olive-dark hover:text-accent-hover"
        >
          {duplicate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span>Duplicate</span>
        </button>

        {!isPlatform && (
          <button
            onClick={handleDelete}
            disabled={remove.isPending}
            className="ml-auto rounded-sm p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
