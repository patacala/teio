'use client';

import { NODE_CATALOG, NODE_TYPES, type NodeCategory, type NodeType } from '@crm/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { NODE_CATEGORY_LABELS, NODE_ICONS } from '../automation-ui';

const ORDER: NodeCategory[] = ['messaging', 'ai', 'team', 'contact', 'logic'];

interface Props {
  open: boolean;
  onClose(): void;
  onPick(type: NodeType): void;
  /** Why a step cannot go here (null = it can). */
  unavailableReason(type: NodeType): string | null;
}

/** Choose the kind of step to add. Steps that cannot go here are shown disabled, with why. */
export function NodePicker({ open, onClose, onPick, unavailableReason }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a step</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {ORDER.map((category) => (
            <section key={category}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{NODE_CATEGORY_LABELS[category]}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {NODE_TYPES.filter((t) => NODE_CATALOG[t].category === category).map((type) => {
                  const entry = NODE_CATALOG[type];
                  const Icon = NODE_ICONS[type];
                  const reason = unavailableReason(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={!!reason}
                      title={reason ?? undefined}
                      aria-label={reason ? `${entry.label} — ${reason}` : entry.label}
                      onClick={() => onPick(type)}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border border-subtle p-3 text-left transition-colors',
                        reason ? 'cursor-not-allowed opacity-45' : 'hover:border-accent/40 hover:bg-surface-hover',
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-olive-dark text-accent">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-primary">{entry.label}</span>
                        <span className="block text-[11px] text-secondary">{reason ?? entry.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
