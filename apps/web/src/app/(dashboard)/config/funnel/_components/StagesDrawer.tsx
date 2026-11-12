'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useFunnelStages,
  useCreateFunnelStage,
  useUpdateFunnelStage,
  useDeleteFunnelStage,
  useReorderFunnelStages,
} from '@/hooks/useFunnels';
import { useStageContacts } from '@/hooks/useContacts';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { Funnel, FunnelStage, StageType } from '@/services/funnels.service';
import { DEFAULT_STAGE_COLOR, STAGE_PALETTE, stageColor } from './stageColors';

/** Vocabulary FunnelRulesService matches on — see apps/api funnel-rules.service.ts. */
const STAGE_TYPES: { value: StageType; label: string }[] = [
  { value: 'custom', label: 'Custom (no automation)' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'appointment_scheduled', label: 'Appointment scheduled' },
  { value: 'appointment_confirmed', label: 'Appointment confirmed' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'won', label: 'Won (terminal)' },
  { value: 'lost', label: 'Lost (terminal)' },
];

const TERMINAL_TYPES = new Set<StageType>(['won', 'lost']);

const stageTypeLabel = (type?: StageType) => STAGE_TYPES.find((t) => t.value === type)?.label ?? type;

interface StageDraft {
  name: string;
  color: string;
  stage_type: StageType;
}

const EMPTY_DRAFT: StageDraft = { name: '', color: DEFAULT_STAGE_COLOR, stage_type: 'custom' };

interface Props {
  funnel: Funnel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StagesDrawer({ funnel, open, onOpenChange }: Props) {
  const { data: stages = [], isLoading } = useFunnelStages(funnel.id);
  const createStage = useCreateFunnelStage(funnel.id);
  const reorderStages = useReorderFunnelStages(funnel.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FunnelStage | null>(null);
  const [addDraft, setAddDraft] = useState<StageDraft>(EMPTY_DRAFT);

  const sorted = [...stages].sort((a, b) => a.position - b.position);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const order = [...sorted];
    [order[index], order[target]] = [order[target], order[index]];
    reorderStages.mutate(order.map((s) => s.id), {
      onError: () => toast({ title: 'Failed to reorder stages', variant: 'error' }),
    });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addDraft.name.trim()) return;
    try {
      await createStage.mutateAsync({
        ...addDraft,
        name: addDraft.name.trim(),
        is_terminal: TERMINAL_TYPES.has(addDraft.stage_type),
      });
      setAddDraft(EMPTY_DRAFT);
    } catch {
      toast({ title: 'Failed to create stage', variant: 'error' });
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-w-md overflow-y-auto"
        onOpenAutoFocus={(e) => {
          // Focus the panel, not the first icon button (which would pop its tooltip).
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        <TooltipProvider delayDuration={200}>
          <DrawerHeader>
            <DrawerTitle>Configure funnel</DrawerTitle>
            <p className="text-xs text-muted">
              Stages of <span className="text-secondary">{funnel.name}</span>. Contacts move through them in this order.
            </p>
          </DrawerHeader>

          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Stages</h3>
          <div className="space-y-2">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
              : sorted.map((stage, index) =>
                  editingId === stage.id ? (
                    <StageEditor
                      key={stage.id}
                      funnelId={funnel.id}
                      stage={stage}
                      onDone={() => setEditingId(null)}
                    />
                  ) : (
                    <Card key={stage.id} variant="inset" className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                      <span className="w-5 text-center text-[11px] font-semibold text-muted">{index + 1}</span>
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: stageColor(stage.color) }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-primary truncate">{stage.name}</p>
                        {stage.stage_type && stage.stage_type !== 'custom' && (
                          <Badge variant={stage.is_terminal ? 'neutral' : 'secondary'} className="mt-0.5 normal-case">
                            {stageTypeLabel(stage.stage_type)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center">
                        <IconAction
                          label={`Move ${stage.name} up`}
                          tooltip="Move up"
                          disabled={index === 0 || reorderStages.isPending}
                          onClick={() => move(index, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </IconAction>
                        <IconAction
                          label={`Move ${stage.name} down`}
                          tooltip="Move down"
                          disabled={index === sorted.length - 1 || reorderStages.isPending}
                          onClick={() => move(index, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </IconAction>
                        <IconAction label={`Edit ${stage.name}`} tooltip="Edit" onClick={() => setEditingId(stage.id)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label={`Delete ${stage.name}`}
                          tooltip="Delete"
                          className="hover:text-danger"
                          onClick={() => setDeleting(stage)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconAction>
                      </div>
                    </Card>
                  ),
                )}
          </div>

          <form onSubmit={handleAdd} className="mt-4 space-y-3 rounded-xl border border-dashed border-subtle p-3">
            <p className="text-xs font-medium text-secondary">Add a stage</p>
            <StageFields draft={addDraft} onChange={setAddDraft} namePlaceholder="New stage name…" />
            <Button type="submit" size="sm" className="w-full" disabled={createStage.isPending || !addDraft.name.trim()}>
              <Plus className="h-3.5 w-3.5" />
              {createStage.isPending ? 'Adding…' : 'Add stage'}
            </Button>
          </form>
        </TooltipProvider>

        {deleting && (
          <DeleteStageDialog funnelId={funnel.id} stage={deleting} onClose={() => setDeleting(null)} />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function IconAction({
  label, tooltip, className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn('h-8 w-8 text-muted', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function StageFields({
  draft, onChange, namePlaceholder,
}: { draft: StageDraft; onChange: (draft: StageDraft) => void; namePlaceholder?: string }) {
  return (
    <>
      <Input
        aria-label="Stage name"
        value={draft.name}
        placeholder={namePlaceholder}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        className="h-9 text-sm"
      />
      <Select value={draft.stage_type} onValueChange={(value) => onChange({ ...draft, stage_type: value as StageType })}>
        <SelectTrigger aria-label="Stage type" className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value} className="text-xs">
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div role="radiogroup" aria-label="Stage color" className="flex flex-wrap gap-1.5">
        {STAGE_PALETTE.map((option) => {
          const selected = stageColor(draft.color) === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              onClick={() => onChange({ ...draft, color: option.value })}
              className={cn(
                'h-6 w-6 rounded-full transition-transform hover:scale-110 outline-hidden ring-offset-2 ring-offset-surface focus-visible:ring-2 focus-visible:ring-accent/60',
                selected && 'ring-2 ring-primary',
              )}
              style={{ backgroundColor: option.value }}
            />
          );
        })}
      </div>
    </>
  );
}

function StageEditor({ funnelId, stage, onDone }: { funnelId: string; stage: FunnelStage; onDone: () => void }) {
  const updateStage = useUpdateFunnelStage(funnelId);
  const [draft, setDraft] = useState<StageDraft>({
    name: stage.name,
    color: stageColor(stage.color),
    stage_type: stage.stage_type ?? 'custom',
  });

  const save = async () => {
    if (!draft.name.trim()) return;
    try {
      await updateStage.mutateAsync({
        stageId: stage.id,
        body: { ...draft, name: draft.name.trim(), is_terminal: TERMINAL_TYPES.has(draft.stage_type) },
      });
      onDone();
    } catch {
      toast({ title: 'Failed to save stage', variant: 'error' });
    }
  };

  return (
    <Card variant="inset" className="space-y-3 rounded-xl p-3">
      <StageFields draft={draft} onChange={setDraft} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={updateStage.isPending || !draft.name.trim()}>
          {updateStage.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  );
}

function DeleteStageDialog({ funnelId, stage, onClose }: { funnelId: string; stage: FunnelStage; onClose: () => void }) {
  const deleteStage = useDeleteFunnelStage(funnelId);
  const { data, isLoading } = useStageContacts(stage.id, 1);
  const count = data?.meta.total ?? 0;

  const confirm = async () => {
    try {
      await deleteStage.mutateAsync(stage.id);
      onClose();
    } catch {
      toast({ title: 'Failed to delete stage', variant: 'error' });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{stage.name}”?</DialogTitle>
          <DialogDescription>
            {isLoading
              ? 'Checking contacts in this stage…'
              : count > 0
                ? `${count} ${count === 1 ? 'contact is' : 'contacts are'} in this stage. They will no longer appear in the funnel until moved to another stage.`
                : 'No contacts are in this stage.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={deleteStage.isPending || isLoading}>
            {deleteStage.isPending ? 'Deleting…' : 'Delete stage'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
