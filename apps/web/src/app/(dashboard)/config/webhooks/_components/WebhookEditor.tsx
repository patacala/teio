'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from '@/components/ui/drawer';
import { useCreateWebhook, useUpdateWebhook } from '@/hooks/useWebhooks';
import { toast } from '@/hooks/useToast';
import type { Webhook } from '@/services/webhooks.service';

const ALL_EVENTS = [
  'message.received',
  'message.sent',
  'contact.created',
  'contact.updated',
  'appointment.created',
  'appointment.updated',
  'funnel.stage.changed',
  'voice.call.started',
  'voice.transcript.received',
  'voice.call.completed',
  'follow_up.due',
  'payment.received',
  'payment.expired',
];

interface Props {
  webhook: Webhook | null;
  open: boolean;
  onClose: () => void;
}

interface DraftState {
  name: string;
  url: string;
  secret: string;
  events: string[];
}

const emptyDraft: DraftState = { name: '', url: '', secret: '', events: [] };

function draftFromWebhook(w: Webhook): DraftState {
  return { name: w.name, url: w.url, secret: '', events: w.events };
}

export function WebhookEditor({ webhook, open, onClose }: Props) {
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();
  const [draft, setDraft] = useState<DraftState>(emptyDraft);

  useEffect(() => {
    setDraft(webhook ? draftFromWebhook(webhook) : emptyDraft);
  }, [webhook, open]);

  const toggleEvent = (ev: string) => {
    setDraft((d) => ({
      ...d,
      events: d.events.includes(ev) ? d.events.filter((e) => e !== ev) : [...d.events, ev],
    }));
  };

  const handleSave = async () => {
    try {
      if (webhook) {
        await updateWebhook.mutateAsync({
          id: webhook.id,
          body: {
            name: draft.name,
            url: draft.url,
            events: draft.events,
            ...(draft.secret ? { secret: draft.secret } : {}),
          },
        });
        toast({ title: 'Webhook actualizado', variant: 'default' });
      } else {
        await createWebhook.mutateAsync({
          name: draft.name,
          url: draft.url,
          events: draft.events,
          ...(draft.secret ? { secret: draft.secret } : {}),
        });
        toast({ title: 'Webhook creado', variant: 'default' });
      }
      onClose();
    } catch {
      toast({ title: 'Error al guardar webhook', variant: 'error' });
    }
  };

  const isSaving = createWebhook.isPending || updateWebhook.isPending;
  const isEdit = !!webhook;

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-w-md overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Editar webhook' : 'Nuevo webhook'}</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-0">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
            <Input
              required
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Notificaciones Slack"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target URL</label>
            <Input
              required
              type="url"
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder="https://n8n.server/webhook/..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Secreto <span className="text-gray-400">(opcional)</span>
            </label>
            <Input
              type="password"
              value={draft.secret}
              onChange={(e) => setDraft((d) => ({ ...d, secret: e.target.value }))}
              placeholder={isEdit ? 'Dejar vacío para no cambiar' : 'Dejar vacío para sin firma HMAC'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Eventos</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_EVENTS.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                    draft.events.includes(ev)
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-border hover:border-gray-300'
                  }`}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DrawerFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !draft.name || !draft.url}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
