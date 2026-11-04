'use client';

import { useRef, useState } from 'react';
import { Plus, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { KnowledgeMetricsCards } from './KnowledgeMetricsCards';
import { KnowledgeFilters, type KnowledgeFiltersState } from './KnowledgeFilters';
import { KnowledgeGrid } from './KnowledgeGrid';
import { KnowledgeEditor } from './KnowledgeEditor';
import {
  useKnowledgeMetrics,
  useKnowledgeEntries,
  useCreateKnowledgeEntry,
  useUpdateKnowledgeEntry,
  useDeleteKnowledgeEntry,
  useToggleKnowledgeEntry,
  useReindexKnowledge,
  useUploadKnowledgeFile,
} from '@/hooks/useKnowledge';
import type {
  KnowledgeEntry,
  CreateKnowledgeEntryBody,
  UpdateKnowledgeEntryBody,
} from '@/services/knowledge.service';

/** Global to the org — see crm-integration-2026-09 memory: one agent per
 * org for now, so there's no per-agent scoping to worry about here. If a
 * second (specialized) agent gets added later, this needs an agent_type
 * filter both here and in ProSales' KnowledgeDocumentModel.
 *
 * Every write here mirrors into ProSales' real knowledge store server-side
 * (see apps/api/src/modules/knowledge/knowledge.service.ts) — content
 * created here actually reaches the agent, not just this list.
 */
export function KnowledgeTab() {
  const [filters, setFilters] = useState<KnowledgeFiltersState>({ search: '', category: '', status: '' });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);

  const params = {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const { data: metrics, isLoading: metricsLoading } = useKnowledgeMetrics();
  const { data: entriesResponse, isLoading: entriesLoading } = useKnowledgeEntries(params);

  const createEntry = useCreateKnowledgeEntry();
  const updateEntry = useUpdateKnowledgeEntry();
  const deleteEntry = useDeleteKnowledgeEntry();
  const toggleEntry = useToggleKnowledgeEntry();
  const reindex = useReindexKnowledge();
  const uploadFile = useUploadKnowledgeFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSaving = createEntry.isPending || updateEntry.isPending;

  const handleNew = () => {
    setEditingEntry(null);
    setEditorOpen(true);
  };

  const handleEdit = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setEditorOpen(true);
  };

  const handleSave = async (data: CreateKnowledgeEntryBody | UpdateKnowledgeEntryBody) => {
    try {
      if (editingEntry) {
        await updateEntry.mutateAsync({ id: editingEntry.id, body: data as UpdateKnowledgeEntryBody });
        toast({ title: 'Entry updated', variant: 'default' });
      } else {
        await createEntry.mutateAsync(data as CreateKnowledgeEntryBody);
        toast({ title: 'Entry created', variant: 'default' });
      }
      setEditorOpen(false);
      setEditingEntry(null);
    } catch {
      toast({ title: 'Failed to save entry', variant: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEntry.mutateAsync(id);
      toast({ title: 'Entry deleted', variant: 'default' });
    } catch {
      toast({ title: 'Failed to delete entry', variant: 'error' });
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleEntry.mutateAsync(id);
    } catch {
      toast({ title: 'Failed to update status', variant: 'error' });
    }
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      await uploadFile.mutateAsync({ file });
      toast({ title: `"${file.name}" uploaded`, variant: 'default' });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to upload file',
        variant: 'error',
      });
    }
  };

  const handleReindex = async () => {
    try {
      const result = await reindex.mutateAsync();
      const firstFailure = result.failures?.[0];
      toast({
        title: firstFailure
          ? `Reindex: ${result.reindexed} synced, ${result.failed} failed — ${firstFailure.title}: ${firstFailure.error}`
          : `Reindex complete — ${result.reindexed} synced`,
        variant: result.failed ? 'warning' : 'default',
      });
    } catch {
      toast({ title: 'Reindex failed', variant: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="min-w-0 text-xs text-secondary">
          Applies to all agents in your organization (not exclusive to this one).
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReindex} disabled={reindex.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reindex.isPending ? 'animate-spin' : ''}`} />
            Reindex
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.docx"
            className="hidden"
            onChange={handleFilePicked}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadFile.isPending}
          >
            <Upload className={`h-3.5 w-3.5 mr-1.5 ${uploadFile.isPending ? 'animate-pulse' : ''}`} />
            {uploadFile.isPending ? 'Uploading…' : 'Upload file'}
          </Button>
          <Button size="sm" onClick={handleNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Entry
          </Button>
        </div>
      </div>

      <KnowledgeMetricsCards metrics={metrics} loading={metricsLoading} />

      <KnowledgeFilters filters={filters} onChange={setFilters} />

      <KnowledgeGrid
        entries={entriesResponse?.items}
        loading={entriesLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggle={handleToggle}
      />

      <KnowledgeEditor
        open={editorOpen}
        entry={editingEntry}
        onOpenChange={setEditorOpen}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
}
