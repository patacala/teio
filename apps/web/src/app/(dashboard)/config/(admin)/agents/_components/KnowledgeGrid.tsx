import { Pencil, Power, Trash2, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { KnowledgeEntry } from '@/services/knowledge.service';

interface KnowledgeGridProps {
  entries: KnowledgeEntry[] | undefined;
  loading: boolean;
  onEdit: (entry: KnowledgeEntry) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}

function KnowledgeCard({
  entry,
  onEdit,
  onDelete,
  onToggle,
}: {
  entry: KnowledgeEntry;
  onEdit: (e: KnowledgeEntry) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const preview = entry.content.length > 140
    ? entry.content.slice(0, 140) + '…'
    : entry.content;

  return (
    <div className="min-w-0 overflow-hidden bg-surface border border-subtle rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-primary text-sm truncate">{entry.title}</h3>
        </div>
        <Badge variant={entry.status === 'active' ? 'success' : 'warn'} className="shrink-0">
          {entry.status}
        </Badge>
      </div>

      <span className="inline-flex max-w-full items-center self-start truncate rounded-full bg-olive-dark px-2.5 py-0.5 text-xs font-medium text-accent capitalize">
        {entry.category}
      </span>

      <p className="text-xs text-secondary leading-relaxed flex-1 wrap-break-word wrap-anywhere line-clamp-4">
        {preview}
      </p>

      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-subtle">
        <button
          onClick={() => onEdit(entry)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-sm text-xs text-secondary hover:bg-surface-hover hover:text-primary transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={() => onToggle(entry.id)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-sm text-xs text-secondary hover:bg-surface-hover hover:text-primary transition-colors"
          title={entry.status === 'active' ? 'Deactivate' : 'Activate'}
        >
          <Power className="w-3.5 h-3.5" />
          {entry.status === 'active' ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          className="ml-auto flex items-center gap-1 px-2 py-1.5 rounded-sm text-xs text-muted hover:bg-danger/10 hover:text-danger transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function KnowledgeGrid({ entries, loading, onEdit, onDelete, onToggle }: KnowledgeGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface border border-subtle rounded-xl p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-xl bg-olive-dark flex items-center justify-center mb-3">
          <BookOpen className="w-6 h-6 text-accent" />
        </div>
        <h3 className="font-medium text-primary text-sm">No entries yet</h3>
        <p className="text-xs text-secondary mt-1">Create your first knowledge base entry to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {entries.map((entry) => (
        <KnowledgeCard
          key={entry.id}
          entry={entry}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
