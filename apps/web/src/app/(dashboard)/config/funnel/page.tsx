'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFunnels, useCreateFunnel, useFunnelStages } from '@/hooks/useFunnels';
import { toast } from '@/hooks/useToast';
import { FunnelTemplateSelector } from './_components/FunnelTemplateSelector';
import { StageListView } from './_components/StageListView';
import { FunnelKanbanView } from './_components/FunnelKanbanView';

type View = 'list' | 'kanban';

export default function ConfigFunnelPage() {
  const { data: funnels, isLoading: funnelsLoading } = useFunnels();
  const createFunnel = useCreateFunnel();
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [view, setView] = useState<View>('kanban');
  const [createOpen, setCreateOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState('');

  const { data: stages = [] } = useFunnelStages(selectedFunnelId);

  // Auto-select first funnel when data loads
  useEffect(() => {
    if (funnels && funnels.length > 0 && !selectedFunnelId) {
      setSelectedFunnelId(funnels[0].id);
    }
  }, [funnels, selectedFunnelId]);

  const handleCreateFunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFunnelName.trim()) return;
    try {
      const funnel = await createFunnel.mutateAsync({ name: newFunnelName });
      setSelectedFunnelId(funnel.id);
      setCreateOpen(false);
      setNewFunnelName('');
    } catch {
      toast({ title: 'Failed to create funnel', variant: 'error' });
    }
  };

  if (funnelsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Empty state — show template selector
  if (!funnels?.length) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Funnel</h1>
          <p className="text-xs text-gray-500 mt-0.5">Define and manage your sales pipelines.</p>
        </div>
        <FunnelTemplateSelector onCreated={setSelectedFunnelId} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Funnel</h1>
          <p className="text-xs text-gray-500 mt-0.5">Define and manage your sales pipelines.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Funnel selector */}
          <select
            value={selectedFunnelId ?? ''}
            onChange={(e) => setSelectedFunnelId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-panel text-sm px-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {/* New funnel */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> New funnel
          </Button>
        </div>
      </div>

      {/* View toggle — prominent row above content */}
      {selectedFunnelId && (
        <div className="flex items-center gap-1 border-b border-border pb-4">
          <button
            onClick={() => setView('kanban')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'kanban'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'list'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            List
          </button>
        </div>
      )}

      {/* Content */}
      {selectedFunnelId && (
        view === 'list' ? (
          <StageListView funnelId={selectedFunnelId} />
        ) : (
          <FunnelKanbanView stages={stages} />
        )
      )}

      {/* Create Funnel Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New funnel</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateFunnel} className="space-y-4 mt-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <Input
                required
                value={newFunnelName}
                onChange={(e) => setNewFunnelName(e.target.value)}
                placeholder="e.g. Sales Q2, Main Pipeline…"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createFunnel.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {createFunnel.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
