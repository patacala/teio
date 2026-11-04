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
        toast({ title: 'Webhook updated', variant: 'default' });
      } else {
        await createWebhook.mutateAsync({
          name: draft.name,
          url: draft.url,
          events: draft.events,
          ...(draft.secret ? { secret: draft.secret } : {}),
        });
        toast({ title: 'Webhook created', variant: 'default' });
      }
      onClose();
    } catch {
      toast({ title: 'Error saving webhook', variant: 'error' });
    }
  };

  const isSaving = createWebhook.isPending || updateWebhook.isPending;
  const isEdit = !!webhook;

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-w-md overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Edit webhook' : 'New webhook'}</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-0">
          <div>
            <label className="block text-xs font-medium text-primary mb-1">Name</label>
            <Input
              required
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Slack notifications"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-1">Target URL</label>
            <Input
              required
              type="url"
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder="https://n8n.server/webhook/..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-1">
              Secret <span className="text-muted">(optional)</span>
            </label>
            <Input
              type="password"
              value={draft.secret}
              onChange={(e) => setDraft((d) => ({ ...d, secret: e.target.value }))}
              placeholder={isEdit ? 'Leave empty to keep it unchanged' : 'Leave empty for no HMAC signature'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-2">Events</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_EVENTS.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                    draft.events.includes(ev)
                      ? 'bg-olive-dark text-accent border-accent/20'
                      : 'bg-surface text-secondary border-subtle hover:border-strong'
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
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !draft.name || !draft.url}
            className="bg-accent hover:bg-accent-hover text-on-accent"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
