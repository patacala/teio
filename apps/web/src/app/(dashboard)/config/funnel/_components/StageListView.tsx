'use client';

import { useState } from 'react';
import { GripVertical, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useFunnelStages,
  useCreateFunnelStage,
  useUpdateFunnelStage,
  useDeleteFunnelStage,
  useReorderFunnelStages,
} from '@/hooks/useFunnels';
import { toast } from '@/hooks/useToast';
import type { StageType } from '@/services/funnels.service';

const STAGE_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#6366F1', '#EF4444', '#14B8A6',
];

/** Vocabulary FunnelRulesService matches on — see apps/api funnel-rules.service.ts. */
const STAGE_TYPES: { value: string; label: string }[] = [
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

const TERMINAL_TYPES = new Set(['won', 'lost']);

interface ColorPickerProps {
  value: string;
  onChange: (c: string) => void;
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {STAGE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            outline: value === c ? `2px solid ${c}` : 'none',
            outlineOffset: '2px',
          }}
        />
      ))}
    </div>
  );
}

interface Props {
  funnelId: string;
}

export function StageListView({ funnelId }: Props) {
  const { data: stages = [], isLoading } = useFunnelStages(funnelId);
  const createStage = useCreateFunnelStage(funnelId);
  const updateStage = useUpdateFunnelStage(funnelId);
  const deleteStage = useDeleteFunnelStage(funnelId);
  const reorderStages = useReorderFunnelStages(funnelId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; color: string; stage_type: StageType }>({
    name: '', color: STAGE_COLORS[0], stage_type: 'custom',
  });
  const [addForm, setAddForm] = useState<{ name: string; color: string; stage_type: StageType }>({
    name: '', color: STAGE_COLORS[0], stage_type: 'custom',
  });

  const sorted = [...stages].sort((a, b) => a.position - b.position);

  const moveStage = (index: number, direction: -1 | 1) => {
    const newOrder = [...sorted];
    const target = index + direction;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    reorderStages.mutate(newOrder.map((s) => s.id));
  };

  const startEdit = (id: string, name: string, color: string, stageType: StageType) => {
    setEditingId(id);
    setEditForm({ name, color: color ?? STAGE_COLORS[0], stage_type: stageType ?? 'custom' });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: string) => {
    try {
      await updateStage.mutateAsync({
        stageId: id,
        body: {
          name: editForm.name,
          color: editForm.color,
          stage_type: editForm.stage_type,
          is_terminal: TERMINAL_TYPES.has(editForm.stage_type),
        },
      });
      setEditingId(null);
    } catch {
      toast({ title: 'Failed to save stage', variant: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStage.mutateAsync(id);
    } catch {
      toast({ title: 'Failed to delete stage', variant: 'error' });
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    try {
      await createStage.mutateAsync({
        name: addForm.name,
        color: addForm.color,
        stage_type: addForm.stage_type,
        is_terminal: TERMINAL_TYPES.has(addForm.stage_type),
      });
      setAddForm({ name: '', color: STAGE_COLORS[0], stage_type: 'custom' });
    } catch {
      toast({ title: 'Failed to create stage', variant: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 max-w-2xl">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl border border-border animate-pulse bg-panel" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 max-w-2xl">
      {sorted.map((stage, index) => (
        <div key={stage.id} className="bg-panel border border-border rounded-xl px-4 py-3">
          {editingId === stage.id ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-8 text-sm"
                  autoFocus
                />
                <button
                  onClick={() => saveEdit(stage.id)}
                  className="text-green-600 hover:text-green-700"
                  disabled={updateStage.isPending}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ColorPicker value={editForm.color} onChange={(c) => setEditForm((f) => ({ ...f, color: c }))} />
              <select
                value={editForm.stage_type}
                onChange={(e) => setEditForm((f) => ({ ...f, stage_type: e.target.value as StageType }))}
                className="h-8 rounded-md border border-border bg-white px-2 text-xs w-full"
              >
                {STAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: stage.color ?? '#9CA3AF' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-900">{stage.name}</p>
                  {stage.stage_type && stage.stage_type !== 'custom' && (
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        stage.is_terminal ? 'bg-gray-800 text-white' : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {STAGE_TYPES.find((t) => t.value === stage.stage_type)?.label ?? stage.stage_type}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400">Position {index + 1}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveStage(index, -1)}
                  disabled={index === 0 || reorderStages.isPending}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveStage(index, 1)}
                  disabled={index === sorted.length - 1 || reorderStages.isPending}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => startEdit(stage.id, stage.name, stage.color ?? STAGE_COLORS[0], stage.stage_type ?? 'custom')}
                  className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(stage.id)}
                  disabled={deleteStage.isPending}
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-panel border border-dashed border-border rounded-xl px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="New stage name…"
            className="h-8 text-sm flex-1"
          />
          <select
            value={addForm.stage_type}
            onChange={(e) => setAddForm((f) => ({ ...f, stage_type: e.target.value as StageType }))}
            className="h-8 rounded-md border border-border bg-white px-2 text-xs shrink-0"
          >
            {STAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Button
            type="submit"
            size="sm"
            disabled={createStage.isPending || !addForm.name.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
          >
            {createStage.isPending ? '…' : 'Add'}
          </Button>
        </div>
        <ColorPicker value={addForm.color} onChange={(c) => setAddForm((f) => ({ ...f, color: c }))} />
      </form>
    </div>
  );
}
