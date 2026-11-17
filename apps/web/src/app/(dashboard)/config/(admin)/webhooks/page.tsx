'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Zap, List, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWebhooks, useDeleteWebhook, useTestWebhook } from '@/hooks/useWebhooks';
import { toast } from '@/hooks/useToast';
import type { Webhook } from '@/services/webhooks.service';
import { WebhookEditor } from './_components/WebhookEditor';
import { WebhookLogsDrawer } from './_components/WebhookLogsDrawer';

const MAX_EVENT_PILLS = 3;

export default function ConfigWebhooksPage() {
  const { data: webhooks, isLoading } = useWebhooks();
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [logsWebhookId, setLogsWebhookId] = useState<string | null>(null);
  const [logsWebhookName, setLogsWebhookName] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingWebhook(null);
    setEditorOpen(true);
  };

  const openEdit = (w: Webhook) => {
    setEditingWebhook(w);
    setEditorOpen(true);
  };

  const openLogs = (w: Webhook) => {
    setLogsWebhookId(w.id);
    setLogsWebhookName(w.name);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook.mutateAsync(id);
      toast({ title: 'Webhook deleted', variant: 'default' });
    } catch {
      toast({ title: 'Error deleting', variant: 'error' });
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testWebhook.mutateAsync(id);
      if (result.success) {
        toast({ title: `Test succeeded — HTTP ${result.status_code}`, variant: 'default' });
      } else {
        toast({ title: `Test failed — ${result.error ?? `HTTP ${result.status_code}`}`, variant: 'error' });
      }
    } catch {
      toast({ title: 'Error sending test', variant: 'error' });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Webhooks</h1>
          <p className="text-xs text-secondary mt-0.5">
            Configure events to integrate the CRM with external systems.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 bg-accent hover:bg-accent-hover text-on-accent">
          <Plus className="h-3.5 w-3.5" /> Create webhook
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 max-w-5xl">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-subtle animate-pulse bg-surface" />
          ))}
        </div>
      ) : !webhooks?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-subtle py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-olive-dark flex items-center justify-center mb-3">
            <Zap className="h-6 w-6 text-accent" />
          </div>
          <h3 className="font-medium text-primary text-sm">No webhooks</h3>
          <p className="text-xs text-secondary mt-1">Connect your external system to CRM events.</p>
          <Button size="sm" onClick={openCreate} className="mt-4 gap-1.5 bg-accent hover:bg-accent-hover text-on-accent">
            <Plus className="h-3.5 w-3.5" /> Create webhook
          </Button>
        </div>
      ) : (
        <div className="max-w-5xl rounded-xl border border-subtle overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised border-b border-subtle">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-secondary">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-secondary">Events</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-secondary">URL</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-secondary">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle bg-surface">
              {webhooks.map((wh) => {
                const visibleEvents = wh.events.slice(0, MAX_EVENT_PILLS);
                const extraCount = wh.events.length - MAX_EVENT_PILLS;
                const isTesting = testingId === wh.id;

                return (
                  <tr key={wh.id} className="hover:bg-surface-raised transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary">{wh.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {visibleEvents.map((ev) => (
                          <Badge key={ev} variant="outline" className="text-[10px] px-1.5 py-0">
                            {ev}
                          </Badge>
                        ))}
                        {extraCount > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted">
                            +{extraCount} more
                          </Badge>
                        )}
                        {wh.events.length === 0 && (
                          <span className="text-xs text-muted">No events</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-xs text-secondary font-mono truncate block">{wh.url}</span>
                    </td>
                    <td className="px-4 py-3">
                      {wh.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
                          <XCircle className="h-3.5 w-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5 justify-end">
                        <button
                          onClick={() => openEdit(wh)}
                          title="Edit"
                          className="p-1.5 rounded-sm text-muted hover:text-primary hover:bg-surface-hover transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleTest(wh.id)}
                          disabled={isTesting}
                          title="Send test"
                          className="p-1.5 rounded-sm text-muted hover:text-accent-hover hover:bg-olive-dark transition-colors disabled:opacity-40"
                        >
                          {isTesting ? (
                            <span className="h-3.5 w-3.5 block border-2 border-accent/50 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => openLogs(wh)}
                          title="View logs"
                          className="p-1.5 rounded-sm text-muted hover:text-primary hover:bg-surface-hover transition-colors"
                        >
                          <List className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(wh.id)}
                          title="Delete"
                          className="p-1.5 rounded-sm text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WebhookEditor
        open={editorOpen}
        webhook={editingWebhook}
        onClose={() => setEditorOpen(false)}
      />

      <WebhookLogsDrawer
        webhookId={logsWebhookId}
        webhookName={logsWebhookName}
        open={!!logsWebhookId}
        onClose={() => setLogsWebhookId(null)}
      />
    </div>
  );
}
