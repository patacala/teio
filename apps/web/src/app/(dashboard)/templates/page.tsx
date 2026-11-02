'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/useTemplates';
import { toast } from '@/hooks/useToast';
import type { CreateTemplateBody, MessageTemplate } from '@/services/templates.service';

const CHANNELS = [
  { value: '', label: 'Todos' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'all', label: 'General' },
];

const CHANNEL_COLORS: Record<string, string> = {
  sms: 'bg-green-50 text-green-700',
  email: 'bg-blue-50 text-blue-700',
  whatsapp: 'bg-emerald-50 text-emerald-700',
  all: 'bg-gray-100 text-gray-600',
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
        toast({ title: 'Plantilla actualizada', variant: 'default' });
      } else {
        await createTemplate.mutateAsync(form);
        toast({ title: 'Plantilla creada', variant: 'default' });
      }
      setOpen(false);
      setForm(defaultForm);
      setEditingId(null);
      setVariableInput('');
    } catch {
      toast({ title: editingId ? 'Error al actualizar plantilla' : 'Error al crear plantilla', variant: 'error' });
    }
  };

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast({ title: 'Plantilla eliminada', variant: 'default' });
    } catch {
      toast({ title: 'Error al eliminar', variant: 'error' });
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
          <h1 className="text-lg font-semibold text-gray-900">Plantillas</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Plantillas de mensajes para SMS, email y WhatsApp.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Nueva plantilla
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
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-border hover:border-gray-300'
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
            <div key={i} className="h-36 rounded-xl border border-border bg-panel animate-pulse" />
          ))}
        </div>
      ) : !templates?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="font-medium text-gray-900 text-sm">Sin plantillas</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">
            Crea tu primera plantilla para agilizar el envío de mensajes.
          </p>
          <Button size="sm" onClick={openCreate} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nueva plantilla
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div key={tpl.id} className="bg-panel border border-border rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-gray-900 text-sm truncate">{tpl.name}</h3>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${CHANNEL_COLORS[tpl.channel] ?? 'bg-gray-100 text-gray-600'}`}>
                  {tpl.channel}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed flex-1 line-clamp-3">{tpl.content}</p>
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
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(tpl.id)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors"
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
            <DialogTitle>{editingId ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Bienvenida nuevo cliente" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Canal</label>
              <select
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                className="w-full h-9 rounded-lg border border-border bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CHANNELS.filter((c) => c.value).map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contenido</label>
              <textarea
                required
                rows={5}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Hola {{nombre}}, gracias por contactarnos…"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Variables</label>
              <div className="flex gap-2">
                <Input
                  value={variableInput}
                  onChange={(e) => setVariableInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVariable())}
                  placeholder="nombre, empresa…"
                />
                <Button type="button" variant="outline" size="sm" onClick={addVariable}>Añadir</Button>
              </div>
              {form.variables && form.variables.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.variables.map((v) => (
                    <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">
                      {`{{${v}}}`}
                      <button type="button" onClick={() => setForm((f) => ({ ...f, variables: f.variables?.filter((x) => x !== v) }))} className="text-gray-400 hover:text-gray-600">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear plantilla'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
