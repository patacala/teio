'use client';

import { useState, useEffect, useMemo } from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ContactAutocomplete } from './contact-autocomplete';
import { SlotPicker } from './slot-picker';
import {
  useCreateAppointment,
  useUpdateAppointment,
  useRescheduleAppointment,
  useCalendars,
} from '@/hooks/useAppointments';
import { useCreateFollowUp, useUpdateFollowUp } from '@/hooks/useAutomation';
import { useAutomations, useEnrollInAutomation } from '@/hooks/useAutomations';
import { useCreatePayment } from '@/hooks/usePayments';
import { usePermissions } from '@/hooks/usePermissions';
import { ApiError } from '@/lib/auth-client';
import { fromZonedInputValue, toZonedInputValue } from '@/lib/timezone';
import { toast } from '@/hooks/useToast';
import type { AgendaItem } from '@/services/scheduling.service';

const DURATIONS = [15, 30, 45, 60, 90, 120];

const ACTION_OPTIONS = [
  { value: 'send_message', label: 'Send message' },
  { value: 'send_email', label: 'Send email' },
  { value: 'notify_agent', label: 'Notify agent' },
  { value: 'create_task', label: 'Create task' },
  { value: 'call', label: 'Call' },
];

const EXECUTOR_OPTIONS = [
  { value: 'system', label: 'System (auto)' },
  { value: 'user', label: 'A person (task)' },
];

const CHANNEL_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'whatsapp_only', label: 'WhatsApp' },
  { value: 'sms_only', label: 'SMS' },
  { value: 'email_only', label: 'Email' },
];

const VIOLATION_LABELS: Record<string, string> = {
  conflict: 'overlaps another booking',
  outside_working_hours: 'outside working hours',
  non_working_day: 'not a working day',
  blocked_date: 'blocked date',
  in_past: 'in the past',
  too_soon: 'too soon (minimum notice)',
  too_far: 'too far ahead',
  calendar_inactive: 'calendar is inactive',
};

interface Props {
  open: boolean;
  onClose: () => void;
  appointment?: AgendaItem | null;
  calendarId?: string | null;
  /** Start chosen by clicking the week grid. */
  initialStart?: string | null;
}

function durationOf(item: AgendaItem) {
  return Math.round((new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()) / 60_000);
}

function slotErrorMessage(err: ApiError): string {
  const violations = (err.errors?.violations as string[] | undefined) ?? [];
  const reasons = violations.map((v) => VIOLATION_LABELS[v] ?? v).join(', ');
  return reasons ? `That time is not available: ${reasons}` : err.message;
}

export function AppointmentDrawer({ open, onClose, appointment, calendarId, initialStart }: Props) {
  const isEdit = !!appointment;
  const editingStep = appointment?.kind === 'step';
  const [contactId, setContactId] = useState('');
  const [contactLabel, setContactLabel] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [action, setAction] = useState('');
  const [executor, setExecutor] = useState('system');
  const [channelStrategy, setChannelStrategy] = useState('auto');
  const [messageContent, setMessageContent] = useState('');
  const [automationId, setAutomationId] = useState('');
  const [enrollMode, setEnrollMode] = useState(false);
  const [chargeMode, setChargeMode] = useState<'link' | 'waive'>('link');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const rescheduleMutation = useRescheduleAppointment();
  const paymentMutation = useCreatePayment();
  const enrollMutation = useEnrollInAutomation();
  const createStepMutation = useCreateFollowUp();
  const updateStepMutation = useUpdateFollowUp();
  const { data: calendars } = useCalendars();
  const { data: automations } = useAutomations();
  const { canOverrideCalendarRules: isAdmin } = usePermissions();

  const isLoading = [
    createMutation, updateMutation, rescheduleMutation, paymentMutation,
    enrollMutation, createStepMutation, updateStepMutation,
  ].some((m) => m.isPending);
  const selectedCalendar = calendars?.find((c) => c.id === selectedCalendarId);
  const isFollowUpCalendar = editingStep || (!isEdit && selectedCalendar?.type === 'follow_up');
  const timeZone = selectedCalendar?.timezone ?? appointment?.timezone ?? 'UTC';
  const chargesService = !isEdit && !isFollowUpCalendar ? selectedCalendar?.payment_service_id ?? null : null;
  // Bookings pick from free times; follow-up steps are due at any time.
  const usesPicker = !isFollowUpCalendar && !manualTime && !!selectedCalendarId;
  const durationOptions = useMemo(
    () => (DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b)),
    [duration],
  );

  // Only live automations with the "Added manually" trigger accept a contact from here.
  const manualAutomations = useMemo(
    () => (automations ?? []).filter((a) => a.status === 'active' && a.trigger_keys.includes('manual')),
    [automations],
  );
  const selectedAutomation = manualAutomations.find((a) => a.id === automationId);

  useEffect(() => {
    if (!enrollMode || automationId || !manualAutomations.length) return;
    setAutomationId(manualAutomations[0].id);
  }, [enrollMode, automationId, manualAutomations]);

  useEffect(() => {
    const tz = calendars?.find((c) => c.id === (appointment?.calendar_id ?? calendarId))?.timezone ?? appointment?.timezone ?? 'UTC';
    if (appointment) {
      setContactId(appointment.contact_id);
      setContactLabel(
        appointment.contact ? `${appointment.contact.first_name} ${appointment.contact.last_name ?? ''}`.trim() : '',
      );
      setTitle(appointment.title);
      setDescription(appointment.description ?? '');
      setDuration(durationOf(appointment));
      setSelectedCalendarId(appointment.calendar_id ?? calendarId ?? '');
      setStartsAt(new Date(appointment.starts_at).toISOString());
      setManualTime(appointment.kind === 'step');
      setManualValue(toZonedInputValue(appointment.starts_at, tz));
      setAction(appointment.action ?? '');
      setExecutor(appointment.executor ?? 'system');
      setChannelStrategy(appointment.channel_strategy ?? 'auto');
      setMessageContent(appointment.message_content ?? '');
    } else {
      setContactId('');
      setContactLabel('');
      setTitle('');
      setDescription('');
      setDuration(30);
      setSelectedCalendarId(calendarId ?? '');
      setStartsAt(initialStart ?? null);
      setManualTime(false);
      setManualValue(initialStart ? toZonedInputValue(initialStart, tz) : '');
      setAction('');
      setExecutor('system');
      setChannelStrategy('auto');
      setMessageContent('');
    }
    setAutomationId('');
    setEnrollMode(false);
    setChargeMode('link');
    setOverrideOpen(false);
    setOverrideReason('');
    setPaymentUrl(null);
    // Calendars are read for the time zone only; re-running on their load would wipe the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment, open, calendarId, initialStart]);

  // A new time or calendar gets a fresh availability check.
  useEffect(() => {
    setOverrideOpen(false);
  }, [startsAt, manualValue, duration, selectedCalendarId]);

  const override = overrideOpen && overrideReason.trim() ? { reason: overrideReason.trim() } : undefined;

  /** The chosen start as an ISO instant, read on the calendar's wall clock. */
  const chosenStart = (): string | null => {
    if (usesPicker) return startsAt;
    const instant = manualValue ? fromZonedInputValue(manualValue, timeZone) : null;
    return instant ? instant.toISOString() : null;
  };

  const saveStepEdit = async (item: AgendaItem, start: string) => {
    const input: Record<string, string> = {};
    if (title !== item.title) input.title = title;
    if (description !== (item.description ?? '')) input.description = description;
    if (messageContent !== (item.message_content ?? '')) input.message_content = messageContent;
    if (start !== new Date(item.starts_at).toISOString()) input.due_at = start;
    if (Object.keys(input).length) await updateStepMutation.mutateAsync({ id: item.id, input });
    toast({ title: 'Follow-up updated' });
  };

  const saveBookingEdit = async (item: AgendaItem, start: string) => {
    const timeChanged = start !== new Date(item.starts_at).toISOString() || duration !== durationOf(item);
    if (timeChanged) {
      await rescheduleMutation.mutateAsync({
        id: item.id,
        body: { starts_at: start, duration_minutes: duration, ...(override ? { override } : {}) },
      });
    }
    const details: Record<string, string> = {};
    if (title !== item.title) details.title = title;
    if (description !== (item.description ?? '')) details.description = description;
    if (Object.keys(details).length) await updateMutation.mutateAsync({ id: item.id, body: details });
    toast({ title: timeChanged ? 'Appointment rescheduled' : 'Appointment updated' });
  };

  const requestPayment = async (start: string) => {
    const result = await paymentMutation.mutateAsync({
      contact_id: contactId,
      service_id: chargesService!,
      booking: { calendar_id: selectedCalendarId, title, starts_at: start, duration_minutes: duration },
    });
    setPaymentUrl(result.url);
    void navigator.clipboard?.writeText(result.url).catch(() => undefined);
    toast({ title: 'Payment link created — the slot is held until it is paid' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId) return;
    const start = chosenStart();

    try {
      if (isEdit) {
        if (!start) return;
        if (editingStep) await saveStepEdit(appointment!, start);
        else await saveBookingEdit(appointment!, start);
      } else if (isFollowUpCalendar && enrollMode) {
        if (!selectedAutomation) return;
        // The automation decides what happens and when; it starts right away.
        const { started } = await enrollMutation.mutateAsync({ id: selectedAutomation.id, contactIds: [contactId] });
        if (!started.length) {
          toast({
            title: 'Not added: the contact opted out, is already in this automation, or cannot enter it again',
            variant: 'error',
          });
          return;
        }
        toast({ title: `Added to ${selectedAutomation.name}` });
      } else if (isFollowUpCalendar) {
        if (!start || !action) return;
        await createStepMutation.mutateAsync({
          contact_id: contactId,
          calendar_id: selectedCalendarId,
          action,
          executor,
          due_at: start,
          ...(action === 'send_message' ? { channel_strategy: channelStrategy } : {}),
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          ...(messageContent ? { message_content: messageContent } : {}),
        });
        toast({ title: 'Follow-up scheduled' });
      } else {
        if (!title || !start || !selectedCalendarId) return;
        if (chargesService && chargeMode === 'link') {
          await requestPayment(start);
          return;
        }
        await createMutation.mutateAsync({
          contact_id: contactId,
          title,
          description,
          starts_at: start,
          duration_minutes: duration,
          calendar_id: selectedCalendarId,
          ...(chargesService ? { waive_payment: true } : {}),
          ...(override ? { override } : {}),
        });
        toast({ title: 'Appointment created' });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_NOT_AVAILABLE') {
        // Admins may book anyway with a reason; everyone else picks another time.
        if (isAdmin) setOverrideOpen(true);
        toast({ title: slotErrorMessage(err), variant: 'error' });
        return;
      }
      toast({ title: (err as Error)?.message || 'Error saving appointment', variant: 'error' });
    }
  };

  const heading = editingStep
    ? 'Edit follow-up'
    : isEdit
      ? 'Edit appointment'
      : isFollowUpCalendar
        ? 'New follow-up'
        : 'New appointment';

  const submitLabel = isLoading
    ? 'Saving...'
    : overrideOpen && isAdmin
      ? 'Book anyway'
      : isEdit
        ? 'Save changes'
        : enrollMode
          ? 'Add to automation'
          : isFollowUpCalendar
            ? 'Schedule follow-up'
            : chargesService && chargeMode === 'link'
              ? 'Send payment link'
              : 'Create appointment';

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="flex flex-col overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-primary">{heading}</h2>
          <p className="text-sm text-secondary mt-0.5">
            {isEdit ? 'Update the details.' : 'Fill in the details.'} Times in {timeZone}.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-primary">Contact *</label>
            <ContactAutocomplete
              value={contactId || null}
              label={contactLabel || undefined}
              onChange={(id, label) => { setContactId(id); setContactLabel(label); }}
            />
          </div>

          {!isEdit && calendars && calendars.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">Calendar</label>
              <Select value={selectedCalendarId} onValueChange={(v) => { setSelectedCalendarId(v); setStartsAt(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cal.color }} />
                        {cal.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!enrollMode && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-primary">
                  Title {isFollowUpCalendar ? '' : '*'}
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isFollowUpCalendar ? 'Defaults to the action' : 'e.g. Initial consultation'}
                  required={!isFollowUpCalendar}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-primary">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional notes..."
                  rows={3} className="resize-none"
                />
              </div>
            </>
          )}

          {!isFollowUpCalendar && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">Duration</label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {usesPicker ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">Time *</label>
              <SlotPicker
                calendarId={selectedCalendarId}
                timeZone={timeZone}
                durationMinutes={duration}
                value={startsAt}
                onChange={setStartsAt}
                excludeAppointmentId={isEdit ? appointment?.id : undefined}
              />
              <button
                type="button"
                className="self-start text-xs text-accent hover:underline"
                onClick={() => {
                  setManualTime(true);
                  if (startsAt) setManualValue(toZonedInputValue(startsAt, timeZone));
                }}
              >
                Enter a time manually
              </button>
            </div>
          ) : enrollMode ? null : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">Date & time *</label>
              <Input
                type="datetime-local"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                required
              />
              {!isFollowUpCalendar && (
                <button type="button" className="self-start text-xs text-accent hover:underline" onClick={() => setManualTime(false)}>
                  Pick from free times
                </button>
              )}
            </div>
          )}

          {chargesService && (
            <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-surface-raised p-3">
              <p className="text-sm font-medium text-primary">This calendar charges for bookings</p>
              <label className="flex items-center gap-2 text-sm text-primary">
                <input type="radio" name="chargeMode" checked={chargeMode === 'link'} onChange={() => setChargeMode('link')} />
                Send a payment link (the slot is held until it is paid)
              </label>
              <label className="flex items-center gap-2 text-sm text-primary">
                <input type="radio" name="chargeMode" checked={chargeMode === 'waive'} onChange={() => setChargeMode('waive')} />
                Book without charge
              </label>
              {paymentUrl && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-secondary">Payment link (copied) — send it to the contact:</span>
                  <Input readOnly value={paymentUrl} onFocus={(e) => e.currentTarget.select()} />
                </div>
              )}
            </div>
          )}

          {overrideOpen && isAdmin && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-danger/30 bg-danger/5 p-3">
              <label className="text-sm font-medium text-primary">Reason to book anyway *</label>
              <Input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. VIP patient, extra chair available"
              />
              <p className="text-xs text-secondary">The reason is saved on the appointment.</p>
            </div>
          )}

          {isFollowUpCalendar && !isEdit && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enrollMode"
                checked={enrollMode}
                onChange={(e) => setEnrollMode(e.target.checked)}
                className="rounded-sm border-strong"
              />
              <label htmlFor="enrollMode" className="text-sm font-medium text-primary">
                Add to an automation instead
              </label>
            </div>
          )}

          {isFollowUpCalendar && enrollMode && !isEdit && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">Automation</label>
              {manualAutomations.length ? (
                <Select value={automationId} onValueChange={setAutomationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an automation" />
                  </SelectTrigger>
                  <SelectContent>
                    {manualAutomations.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-lg bg-surface-raised px-3 py-2 text-xs text-secondary">
                  No active automation accepts contacts added by hand. Add the &quot;Added manually&quot; trigger
                  to one in Automation → Automations.
                </p>
              )}
              <p className="text-xs text-muted">
                It starts right away; the automation decides what to send and when, and stops on its own exit rules.
              </p>
            </div>
          )}

          {isFollowUpCalendar && !enrollMode && !isEdit && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-primary">Action *</label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-primary">Executor</label>
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
                {executor === 'user' && (
                  <p className="text-xs text-muted">When it is due, the team is notified and it waits here until marked done.</p>
                )}
              </div>

              {action === 'send_message' && executor === 'system' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-primary">Channel</label>
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
            </>
          )}

          {isFollowUpCalendar && !enrollMode && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">Message (optional)</label>
              <Textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Override the template..."
                rows={3} className="resize-none"
              />
            </div>
          )}

          {editingStep && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-subtle bg-surface-raised p-3 text-sm">
              <span className="text-secondary">Action</span>
              <span className="text-primary">{ACTION_OPTIONS.find((o) => o.value === action)?.label ?? (action || '—')}</span>
              <span className="text-secondary">Executor</span>
              <span className="text-primary">{EXECUTOR_OPTIONS.find((o) => o.value === executor)?.label ?? executor}</span>
              <span className="text-secondary">Status</span>
              <span className="text-primary capitalize">{appointment?.status.replace('_', ' ')}</span>
            </div>
          )}

          {isEdit && !editingStep && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">Origin</label>
              <p className="text-sm text-secondary capitalize">{appointment?.origin ?? 'human'}</p>
            </div>
          )}

          <div className="mt-auto pt-4 flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={
                isLoading ||
                (enrollMode && !selectedAutomation) ||
                (overrideOpen && isAdmin && overrideReason.trim().length < 3) ||
                (usesPicker && !startsAt) ||
                !!paymentUrl
              }
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
