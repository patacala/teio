'use client';

import { useState, useEffect, useMemo } from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ContactAutocomplete } from './contact-autocomplete';
import { useCreateAppointment, useUpdateAppointment, useCalendars } from '@/hooks/useAppointments';
import { useCreateSequence } from '@/hooks/useAutomation';
import { useSequenceTemplates } from '@/hooks/useSequenceTemplates';
import { SequenceTimelinePreview } from '@/components/sequences/SequenceTimelinePreview';
import { SEQUENCE_TYPE_LABELS } from '@/components/sequences/sequence-constants';
import { toast } from '@/hooks/useToast';
import type { Appointment } from '@/services/scheduling.service';

const DURATIONS = [15, 30, 45, 60, 90, 120];

const ACTION_OPTIONS = [
  { value: 'send_message', label: 'Enviar Mensaje' },
  { value: 'send_email', label: 'Enviar Email' },
  { value: 'notify_agent', label: 'Notificar Agente' },
  { value: 'create_task', label: 'Crear Tarea' },
  { value: 'call', label: 'Llamada' },
];

const EXECUTOR_OPTIONS = [
  { value: 'system', label: 'Sistema (auto)' },
  { value: 'user', label: 'Usuario (manual)' },
];

const CHANNEL_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'whatsapp_only', label: 'WhatsApp' },
  { value: 'sms_only', label: 'SMS' },
  { value: 'email_only', label: 'Email' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  calendarId?: string | null;
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDuration(appt: Appointment) {
  const ms = new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime();
  const min = Math.round(ms / 60_000);
  return DURATIONS.includes(min) ? min : 30;
}

export function AppointmentDrawer({ open, onClose, appointment, calendarId }: Props) {
  const isEdit = !!appointment;
  const [contactId, setContactId] = useState('');
  const [contactLabel, setContactLabel] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [action, setAction] = useState('');
  const [executor, setExecutor] = useState('system');
  const [channelStrategy, setChannelStrategy] = useState('auto');
  const [messageContent, setMessageContent] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [useSequence, setUseSequence] = useState(false);

  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const sequenceMutation = useCreateSequence();
  const { data: calendars } = useCalendars();
  const { data: templates } = useSequenceTemplates();

  const isLoading = createMutation.isPending || updateMutation.isPending || sequenceMutation.isPending;
  const selectedCalendar = calendars?.find((c) => c.id === selectedCalendarId);
  const isFollowUpCalendar = selectedCalendar?.type === 'follow_up';

  // Only templates with a cadence can run — an empty one would clone no steps
  const runnableTemplates = useMemo(
    () => (templates ?? []).filter((t) => t.is_active && t.steps?.length),
    [templates],
  );
  const selectedTemplate = runnableTemplates.find((t) => t.id === templateId);

  // Templates load after the drawer opens, so the default is picked here
  // rather than in the reset effect below.
  useEffect(() => {
    if (!useSequence || templateId || !runnableTemplates.length) return;
    setTemplateId(runnableTemplates[0].id);
  }, [useSequence, templateId, runnableTemplates]);

  useEffect(() => {
    if (appointment) {
      setContactId(appointment.contact_id);
      const name = appointment.contact
        ? `${appointment.contact.first_name} ${appointment.contact.last_name ?? ''}`.trim()
        : '';
      setContactLabel(name);
      setTitle(appointment.title);
      setDescription(appointment.description ?? '');
      setStartTime(toDatetimeLocal(appointment.starts_at));
      setDuration(getDuration(appointment));
      setSelectedCalendarId(appointment.calendar_id ?? calendarId ?? '');
      setAction((appointment as any).action ?? '');
      setExecutor((appointment as any).executor ?? 'system');
      setChannelStrategy((appointment as any).channel_strategy ?? 'auto');
      setMessageContent((appointment as any).message_content ?? '');
      setTemplateId('');
      setUseSequence(false);
    } else {
      setContactId('');
      setContactLabel('');
      setTitle('');
      setDescription('');
      setStartTime('');
      setDuration(30);
      setSelectedCalendarId(calendarId ?? '');
      setAction('');
      setExecutor('system');
      setChannelStrategy('auto');
      setMessageContent('');
      setTemplateId('');
      setUseSequence(false);
    }
  }, [appointment, open, calendarId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId) return;

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: appointment!.id,
          body: { title, description, starts_at: new Date(startTime).toISOString(), duration_minutes: duration },
        });
        toast({ title: 'Appointment updated' });
      } else if (isFollowUpCalendar && useSequence) {
        if (!selectedTemplate) return;
        // Creates a sequence instead of a single appointment: the cadence of
        // the chosen template is cloned and drives every attempt.
        await sequenceMutation.mutateAsync({
          contact_id: contactId,
          template_id: selectedTemplate.id,
          sequence_type: selectedTemplate.sequence_type,
          source: 'manual',
          due_at: startTime ? new Date(startTime).toISOString() : undefined,
          message_content: messageContent || undefined,
        });
        toast({ title: 'Secuencia iniciada' });
      } else {
        if (!title || !startTime) return;
        await createMutation.mutateAsync({
          contact_id: contactId,
          title: title || (action ? ACTION_OPTIONS.find((a) => a.value === action)?.label ?? 'Follow-up' : ''),
          description,
          starts_at: new Date(startTime).toISOString(),
          duration_minutes: duration,
          origin: isFollowUpCalendar ? 'automation' : 'human',
          ...(selectedCalendarId ? { calendar_id: selectedCalendarId } : {}),
          ...(isFollowUpCalendar && action ? {
            action,
            executor,
            channel_strategy: channelStrategy,
            message_content: messageContent || undefined,
          } : {}),
        });
        toast({ title: 'Appointment created' });
      }
      onClose();
    } catch (err) {
      // Surfaces the API reason — most often the 409 raised when the contact
      // already has an active sequence.
      toast({
        title: (err as Error)?.message || 'Error saving appointment',
        variant: 'error',
      });
    }
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="flex flex-col overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit appointment' : 'New appointment'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isEdit ? 'Update appointment details.' : 'Fill in the details to create an appointment.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Contact *</label>
            <ContactAutocomplete
              value={contactId || null}
              label={contactLabel || undefined}
              onChange={(id, label) => { setContactId(id); setContactLabel(label); }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              Title {useSequence ? '' : '*'}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={useSequence ? 'Lo define la secuencia' : 'e.g. Initial consultation'}
              // A sequence names its own appointments ("Sequence: <type> #n")
              required={!useSequence}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Date & time *</label>
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Duration</label>
            <Select
              value={String(duration)}
              onValueChange={(v) => setDuration(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {calendars && calendars.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Calendar</label>
              <Select
                value={selectedCalendarId}
                onValueChange={(v) => setSelectedCalendarId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: cal.color }}
                        />
                        {cal.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isFollowUpCalendar && !isEdit && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useSequence"
                checked={useSequence}
                onChange={(e) => setUseSequence(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="useSequence" className="text-sm font-medium text-gray-700">
                Iniciar secuencia automática
              </label>
            </div>
          )}

          {isFollowUpCalendar && useSequence && !isEdit && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Secuencia</label>
                {runnableTemplates.length ? (
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir secuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {runnableTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          <span className="ml-1.5 text-xs text-gray-500">
                            · {SEQUENCE_TYPE_LABELS[t.sequence_type] ?? t.sequence_type}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    No hay secuencias con pasos configurados. Creá una en Configuración → Secuencias.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Mensaje (opcional)</label>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Dejar vacío para mensaje generado por IA"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <p className="text-xs text-gray-400">Solo reemplaza el primer mensaje.</p>
              </div>

              {selectedTemplate && (
                <div className="rounded-lg border border-border bg-surface p-3">
                  <p className="mb-3 text-xs font-medium text-gray-700">
                    Cadencia ({selectedTemplate.steps.length} pasos)
                  </p>
                  <SequenceTimelinePreview
                    steps={[...selectedTemplate.steps].sort((a, b) => a.position - b.position)}
                  />
                  <p className="mt-3 text-xs text-gray-500">
                    El canal de cada paso se resuelve al ejecutar. Se cancela automáticamente si el
                    contacto responde.
                  </p>
                </div>
              )}
            </>
          )}

          {isFollowUpCalendar && !useSequence && !isEdit && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Acción *</label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar acción" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Ejecutor</label>
                <Select value={executor} onValueChange={setExecutor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXECUTOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {action === 'send_message' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Canal</label>
                  <Select value={channelStrategy} onValueChange={setChannelStrategy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNEL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Mensaje (opcional)</label>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Override del template..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </>
          )}

          {isFollowUpCalendar && isEdit && (
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Automation info</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-gray-500">Acción</span>
                <span className="text-gray-900">{ACTION_OPTIONS.find((o) => o.value === action)?.label ?? (action || '—')}</span>
                <span className="text-gray-500">Ejecutor</span>
                <span className="text-gray-900">{EXECUTOR_OPTIONS.find((o) => o.value === executor)?.label ?? executor}</span>
                <span className="text-gray-500">Canal</span>
                <span className="text-gray-900">{CHANNEL_OPTIONS.find((o) => o.value === channelStrategy)?.label ?? channelStrategy}</span>
                <span className="text-gray-500">Origin</span>
                <span className="text-gray-900 capitalize">{appointment?.origin ?? 'human'}</span>
              </div>
              {messageContent && (
                <div>
                  <span className="text-xs text-gray-500">Mensaje</span>
                  <p className="text-sm text-gray-900 mt-0.5">{messageContent}</p>
                </div>
              )}
            </div>
          )}

          {isEdit && !isFollowUpCalendar && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Origin</label>
              <p className="text-sm text-gray-500 capitalize">{appointment?.origin ?? 'human'}</p>
            </div>
          )}

          <div className="mt-auto pt-4 flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isLoading || (useSequence && !selectedTemplate)}
            >
              {isLoading ? 'Saving...' : isEdit ? 'Save changes' : useSequence ? 'Iniciar secuencia' : 'Create appointment'}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
