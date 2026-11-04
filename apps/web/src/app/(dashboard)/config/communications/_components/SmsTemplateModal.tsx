'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/useToast';
import {
  useCreateSystemTemplate,
  useUpdateSystemTemplate,
  useDeleteSystemTemplate,
} from '@/hooks/useCommunications';
import type { CommunicationTemplate } from '@crm/shared';
import { type EventGroup, formatEventLabel } from './template-helpers';
import { SmsPreview } from './SmsPreview';

const VARIABLES = [
  '{{contact_name}}',
  '{{organization_name}}',
  '{{title}}',
  '{{date}}',
  '{{time}}',
  '{{location}}',
  '{{meeting_url}}',
];

const SAMPLE_DATA: Record<string, string> = {
  contact_name: 'Maria Garcia',
  organization_name: 'Mi Empresa',
  title: 'Revision de propuesta',
  date: 'Jueves 10 julio',
  time: '10:00 AM',
  location: 'Google Meet',
  meeting_url: 'https://meet.google.com/abc-defg-hij',
};

interface SmsTemplateModalProps {
  open: boolean;
  onClose: () => void;
  template?: CommunicationTemplate;
  event?: string;
  eventGroups: EventGroup[];
  onSaved: () => void;
}

export function SmsTemplateModal({
  open,
  onClose,
  template,
  event,
  eventGroups,
  onSaved,
}: SmsTemplateModalProps) {
  const isEdit = !!template;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [eventType, setEventType] = useState(event ?? template?.event_type ?? '');
  const [smsBody, setSmsBody] = useState(template?.provider_template_id ?? '');
  const [name, setName] = useState(template?.name ?? '');
  const [priority, setPriority] = useState(template?.priority ?? 0);
  const [isActive, setIsActive] = useState(template?.is_active ?? true);

  const createMutation = useCreateSystemTemplate();
  const updateMutation = useUpdateSystemTemplate();
  const deleteMutation = useDeleteSystemTemplate();

  useEffect(() => {
    if (open) {
      setEventType(event ?? template?.event_type ?? '');
      setSmsBody(template?.provider_template_id ?? '');
      setName(template?.name ?? '');
      setPriority(template?.priority ?? 0);
      setIsActive(template?.is_active ?? true);
    }
  }, [open, template, event]);

  const saving = createMutation.isPending || updateMutation.isPending;

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setSmsBody((prev) => prev + variable);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = smsBody.substring(0, start) + variable + smsBody.substring(end);
    setSmsBody(newText);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + variable.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const renderedPreview = useMemo(() => {
    let text = smsBody;
    for (const [key, value] of Object.entries(SAMPLE_DATA)) {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return text;
  }, [smsBody]);

  const charCount = renderedPreview.length;
  const segments = Math.ceil(charCount / 160) || 1;

  const handleSave = async () => {
    if (!eventType || !smsBody.trim()) {
      toast({ title: 'The SMS text is required', variant: 'error' });
      return;
    }

    const body = {
      event_type: eventType,
      channel_type: 'sms' as const,
      provider: 'telnyx',
      provider_template_id: smsBody.trim(),
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit SMS template' : 'New SMS template'}</DialogTitle>
          <DialogDescription>
            Plain text with variables. Live preview.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 flex-1 min-h-0 overflow-auto mt-2">
          {/* Left column — editor */}
          <div className="flex-1 space-y-4 min-w-0">
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
                SMS text <span className="text-danger">*</span>
              </label>
              <Textarea
                ref={textareaRef}
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                rows={6} className="resize-none text-[13px]"
                placeholder="Hi {{contact_name}}, this is a reminder of your appointment..."
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className={`text-[11px] font-mono ${charCount > 160 ? 'text-warning' : 'text-muted'}`}>
                  {charCount} chars
                </span>
                <span className="text-[10px] text-muted bg-surface-raised px-2 py-0.5 rounded-full">
                  {segments} {segments === 1 ? 'segmento' : 'segmentos'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Variables</label>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-1 rounded-md text-[11px] font-mono bg-olive-dark text-accent border border-accent/20 hover:bg-accent/15 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
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

          {/* Right column — preview */}
          <div className="w-[340px] shrink-0 flex flex-col items-center">
            <p className="text-[11px] font-medium text-secondary mb-3 self-start">Preview</p>
            <SmsPreview message={renderedPreview || 'Write your message...'} orgName={SAMPLE_DATA.organization_name} />
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
