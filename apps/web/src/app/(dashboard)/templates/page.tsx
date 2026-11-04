'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/useTemplates';
import { toast } from '@/hooks/useToast';
import type { CreateTemplateBody, MessageTemplate } from '@/services/templates.service';

const CHANNELS = [
  { value: '', label: 'All' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'all', label: 'General' },
];

const CHANNEL_COLORS: Record<string, string> = {
  sms: 'bg-success/10 text-success',
  email: 'bg-olive-dark text-accent',
  whatsapp: 'bg-success/10 text-success',
  all: 'bg-surface-raised text-secondary',
};

const defaultForm: CreateTemplateBody = { name: '', content: '', channel: 'all', variables: [] };

export default function TemplatesPage() {
  const [channel, setChannel] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateTemplateBody>(defaultForm);
  const [variableInput, setVariableInput] = useState('');

  const { data: templates, isLoading } = useTemplates(channel || undefined);
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setVariableInput('');
    setOpen(true);
  };

  const openEdit = (tpl: MessageTemplate) => {
    setEditingId(tpl.id);
    setForm({ name: tpl.name, content: tpl.content, channel: tpl.channel, variables: tpl.variables ?? [] });
    setVariableInput('');
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateTemplate.mutateAsync({ id: editingId, body: form });
        toast({ title: 'Template updated', variant: 'default' });
      } else {
        await createTemplate.mutateAsync(form);
        toast({ title: 'Template created', variant: 'default' });
      }
      setOpen(false);
      setForm(defaultForm);
      setEditingId(null);
      setVariableInput('');
    } catch {
      toast({ title: editingId ? 'Error updating template' : 'Error creating template', variant: 'error' });
    }
  };

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast({ title: 'Template deleted', variant: 'default' });
    } catch {
      toast({ title: 'Error deleting', variant: 'error' });
    }
  };

  const addVariable = () => {
    const v = variableInput.trim();
    if (v && !form.variables?.includes(v)) {
      setForm((f) => ({ ...f, variables: [...(f.variables ?? []), v] }));
      setVariableInput('');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Templates</h1>
          <p className="text-xs text-secondary mt-0.5">
            Message templates for SMS, email and WhatsApp.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="bg-accent hover:bg-accent-hover text-on-accent gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New template
        </Button>
      </div>

      {/* Channel filter */}
      <div className="flex gap-1.5 flex-wrap">
        {CHANNELS.map((ch) => (
          <button
            key={ch.value}
            onClick={() => setChannel(ch.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              channel === ch.value
                ? 'bg-olive-dark text-accent border-accent/25'
                : 'bg-surface text-secondary border-subtle hover:border-strong hover:text-primary'
            }`}
          >
            {ch.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl border border-subtle bg-surface animate-pulse" />
          ))}
        </div>
      ) : !templates?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-subtle py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-olive-dark flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-accent" />
          </div>
          <h3 className="font-medium text-primary text-sm">No templates</h3>
          <p className="text-xs text-secondary mt-1 max-w-xs">
            Create your first template to speed up sending messages.
          </p>
          <Button size="sm" onClick={openCreate} className="mt-4 bg-accent hover:bg-accent-hover text-on-accent gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div key={tpl.id} className="bg-surface border border-subtle rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-primary text-sm truncate">{tpl.name}</h3>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${CHANNEL_COLORS[tpl.channel] ?? 'bg-surface-raised text-secondary'}`}>
                  {tpl.channel}
                </span>
              </div>
              <p className="text-xs text-secondary leading-relaxed flex-1 line-clamp-3">{tpl.content}</p>
              {tpl.variables && tpl.variables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tpl.variables.map((v) => (
                    <Badge key={v} variant="outline" className="text-[10px]">{`{{${v}}}`}</Badge>
                  ))}
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => openEdit(tpl)}
                  className="flex items-center gap-1 text-xs text-muted hover:text-accent-hover transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(tpl.id)}
                  className="flex items-center gap-1 text-xs text-muted hover:text-danger transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit template' : 'New template'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-xs font-medium text-primary mb-1">Name</label>
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="New customer welcome" />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary mb-1">Channel</label>
              <select
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                className="w-full h-9 rounded-lg border border-subtle bg-surface-raised px-3 text-sm text-primary focus:outline-hidden focus:ring-2 focus:ring-accent/40"
              >
                {CHANNELS.filter((c) => c.value).map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-primary mb-1">Content</label>
              <Textarea
                required
                rows={5}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Hi {{name}}, thanks for reaching out…" className="resize-y"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary mb-1">Variables</label>
              <div className="flex gap-2">
                <Input
                  value={variableInput}
                  onChange={(e) => setVariableInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVariable())}
                  placeholder="name, company…"
                />
                <Button type="button" variant="outline" size="sm" onClick={addVariable}>Add</Button>
              </div>
              {form.variables && form.variables.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.variables.map((v) => (
                    <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-raised text-xs text-secondary">
                      {`{{${v}}}`}
                      <button type="button" onClick={() => setForm((f) => ({ ...f, variables: f.variables?.filter((x) => x !== v) }))} className="text-muted hover:text-secondary">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving} className="bg-accent hover:bg-accent-hover text-on-accent">
                {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
