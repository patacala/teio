'use client';

import { useEffect, useState } from 'react';
import { Columns3, List, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFunnels, useCreateFunnel, useFunnelStages } from '@/hooks/useFunnels';
import { toast } from '@/hooks/useToast';
import { FunnelTemplateSelector } from '@/app/(dashboard)/config/funnel/_components/FunnelTemplateSelector';
import { FunnelKanbanView } from '@/app/(dashboard)/config/funnel/_components/FunnelKanbanView';
import { FunnelListView } from '@/app/(dashboard)/config/funnel/_components/FunnelListView';
import { StagesDrawer } from '@/app/(dashboard)/config/funnel/_components/StagesDrawer';

/** The pipeline board — same kanban/list the old /config/funnel page had, now a tab inside the Inbox. */
export function PipelineView() {
  const { data: funnels, isLoading: funnelsLoading } = useFunnels();
  const createFunnel = useCreateFunnel();
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState('');

  const { data: stages = [] } = useFunnelStages(selectedFunnelId);
  const selectedFunnel = funnels?.find((f) => f.id === selectedFunnelId);

  useEffect(() => {
    if (funnels && funnels.length > 0 && !selectedFunnelId) {
      setSelectedFunnelId(funnels[0].id);
    }
  }, [funnels, selectedFunnelId]);

  const handleCreateFunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFunnelName.trim()) return;
    try {
      const funnel = await createFunnel.mutateAsync({ name: newFunnelName.trim() });
      setSelectedFunnelId(funnel.id);
      setCreateOpen(false);
      setNewFunnelName('');
    } catch {
      toast({ title: 'Failed to create funnel', variant: 'error' });
    }
  };

  if (funnelsLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-72 shrink-0 rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!funnels?.length) {
    return <FunnelTemplateSelector onCreated={setSelectedFunnelId} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-2">
        <Select value={selectedFunnelId ?? undefined} onValueChange={setSelectedFunnelId}>
          <SelectTrigger aria-label="Funnel" className="h-8 w-48 text-sm">
            <SelectValue placeholder="Select a funnel" />
          </SelectTrigger>
          <SelectContent>
            {funnels.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setConfigureOpen(true)} disabled={!selectedFunnel}>
          <Settings2 className="h-3.5 w-3.5" /> Configure
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New funnel
        </Button>
      </div>

      {selectedFunnelId && (
        <Tabs defaultValue="board">
          <TabsList className="mb-3">
            <TabsTrigger value="board">
              <Columns3 className="h-3.5 w-3.5" /> Board
            </TabsTrigger>
            <TabsTrigger value="list">
              <List className="h-3.5 w-3.5" /> List
            </TabsTrigger>
          </TabsList>
          <TabsContent value="board">
            <FunnelKanbanView stages={stages} onConfigure={() => setConfigureOpen(true)} />
          </TabsContent>
          <TabsContent value="list">
            <FunnelListView stages={stages} onConfigure={() => setConfigureOpen(true)} />
          </TabsContent>
        </Tabs>
      )}

      {selectedFunnel && (
        <StagesDrawer funnel={selectedFunnel} open={configureOpen} onOpenChange={setConfigureOpen} />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New funnel</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateFunnel} className="space-y-4 mt-2">
            <div>
              <label htmlFor="new-funnel-name" className="block text-xs font-medium text-primary mb-1">
                Name
              </label>
              <Input
                id="new-funnel-name"
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
              <Button type="submit" disabled={createFunnel.isPending || !newFunnelName.trim()}>
                {createFunnel.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
