'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { toast } from '@/hooks/useToast';
import {
  useCreateSystemTemplate,
  useUpdateSystemTemplate,
  useDeleteSystemTemplate,
} from '@/hooks/useCommunications';
import type { CommunicationTemplate } from '@crm/shared';
import { type EventGroup, formatEventLabel } from './template-helpers';

interface EmailTemplateModalProps {
  open: boolean;
  onClose: () => void;
  template?: CommunicationTemplate;
  event?: string;
  eventGroups: EventGroup[];
  onSaved: () => void;
}

export function EmailTemplateModal({
  open,
  onClose,
  template,
  event,
  eventGroups,
  onSaved,
}: EmailTemplateModalProps) {
  const isEdit = !!template;

  const [eventType, setEventType] = useState(event ?? template?.event_type ?? '');
  const [templateId, setTemplateId] = useState(template?.provider_template_id ?? '');
  const [name, setName] = useState(template?.name ?? '');
  const [priority, setPriority] = useState(template?.priority ?? 0);
  const [isActive, setIsActive] = useState(template?.is_active ?? true);

  const createMutation = useCreateSystemTemplate();
  const updateMutation = useUpdateSystemTemplate();
  const deleteMutation = useDeleteSystemTemplate();

  useEffect(() => {
    if (open) {
      setEventType(event ?? template?.event_type ?? '');
      setTemplateId(template?.provider_template_id ?? '');
      setName(template?.name ?? '');
      setPriority(template?.priority ?? 0);
      setIsActive(template?.is_active ?? true);
    }
  }, [open, template, event]);

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async () => {
    if (!eventType || !templateId.trim()) {
      toast({ title: 'Template ID is required', variant: 'error' });
      return;
    }

    const body = {
      event_type: eventType,
      channel_type: 'email' as const,
      provider: 'resend',
      provider_template_id: templateId.trim(),
      name: name.trim() || undefined,
      is_active: isActive,
      priority,
    };

    try {
      if (isEdit && template) {
        await updateMutation.mutateAsync({ id: template.id, body });
      } else {
        await createMutation.mutateAsync(body);
      }
      toast({ title: isEdit ? 'Template updated' : 'Template created' });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!template || !confirm('Delete this template?')) return;
    try {
      await deleteMutation.mutateAsync(template.id);
      toast({ title: 'Template deleted' });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit email template' : 'New email template'}</DialogTitle>
          <DialogDescription>
            Link a Resend Template ID to this event
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-xs font-medium text-primary mb-1.5">Event</label>
            <Select value={eventType} onValueChange={setEventType} disabled={!!event}>
              <SelectTrigger>
                <SelectValue placeholder="Select event..." />
              </SelectTrigger>
              <SelectContent>
                {eventGroups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.events.map((et) => (
                      <SelectItem key={et} value={et}>
                        {formatEventLabel(et)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-1.5">
              Template ID <span className="text-danger">*</span>
            </label>
            <Input
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="re_abc123..."
            />
            <p className="mt-1 text-[11px] text-muted">
              Your template ID in Resend (e.g. re_abc123)
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-1.5">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Descriptive name (optional)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">Priority</label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded-sm border-strong"
                />
                <span className="text-sm text-primary">Active</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t border-subtle mt-4">
          {isEdit && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-danger hover:text-danger hover:bg-danger/10 border-danger/25"
            >
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-accent hover:bg-accent-hover text-on-accent"
          >
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
