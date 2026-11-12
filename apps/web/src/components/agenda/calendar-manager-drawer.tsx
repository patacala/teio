'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Settings2, Trash2, ArrowLeft, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCalendars,
  useCalendar,
  useCreateCalendar,
  useUpdateCalendarConfig,
  useDeleteCalendar,
} from '@/hooks/useAppointments';
import { usePaymentServices } from '@/hooks/usePayments';
import { useTeamMembers } from '@/hooks/useTeam';
import { listTimeZones } from '@/lib/timezone';
import type { UpdateWorkScheduleBody } from '@/services/scheduling.service';
import { toast } from '@/hooks/useToast';
import { ApiError } from '@/lib/auth-client';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SLOT_DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
];

const BUFFER_OPTIONS = [
  { value: 0, label: 'No buffer' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
];

const COLOR_SWATCHES = [
  { value: '#2563EB', label: 'Blue' },
  { value: '#16a34a', label: 'Green' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#db2777', label: 'Pink' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCalendarId?: string;
}

// ── Config view (all settings of one calendar, saved in one call) ───────────

const NOTICE_OPTIONS = [
  { value: 0, label: 'Any future time' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '1 day' },
  { value: 2880, label: '2 days' },
];

const REMINDER_OPTIONS = [
  { value: 10080, label: '1 week before' },
  { value: 2880, label: '2 days before' },
  { value: 1440, label: '1 day before' },
  { value: 120, label: '2 hours before' },
  { value: 60, label: '1 hour before' },
];

const inputClass =
  'w-full rounded-md border border-subtle bg-surface-raised text-primary px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40';

function CalendarConfigView({
  calendarId,
  onBack,
}: {
  calendarId: string;
  onBack: () => void;
}) {
  const { data: calendar, isLoading } = useCalendar(calendarId);
  const updateConfig = useUpdateCalendarConfig();
  const { data: paymentServices = [] } = usePaymentServices();
  const { data: team = [] } = useTeamMembers();
  const timeZones = useMemo(() => listTimeZones(), []);

  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [isActive, setIsActive] = useState(true);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [timezone, setTimezone] = useState('UTC');
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState('');
  const [paymentServiceId, setPaymentServiceId] = useState<string>('none');
  const [holdMinutes, setHoldMinutes] = useState(60);
  const [ownerId, setOwnerId] = useState<string>('none');
  const [minNotice, setMinNotice] = useState(0);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState('');
  const [contactRescheduleDays, setContactRescheduleDays] = useState(14);
  const [reminders, setReminders] = useState<number[]>([1440, 120]);

  useEffect(() => {
    if (!calendar) return;
    setName(calendar.name);
    setColor(calendar.color);
    setIsActive(calendar.is_active);
    setWorkDays(calendar.work_days.map(Number));
    setStartTime(calendar.start_time.slice(0, 5));
    setEndTime(calendar.end_time.slice(0, 5));
    setSlotDuration(calendar.slot_duration_minutes);
    setBuffer(calendar.buffer_minutes);
    setTimezone(calendar.timezone);
    setBlockedDates(calendar.blocked_dates ?? []);
    setPaymentServiceId(calendar.payment_service_id ?? 'none');
    setHoldMinutes(calendar.hold_minutes ?? 60);
    setOwnerId(calendar.owner_user_id ?? 'none');
    setMinNotice(calendar.min_notice_minutes ?? 0);
    setMaxAdvanceDays(calendar.max_advance_days ? String(calendar.max_advance_days) : '');
    setContactRescheduleDays(calendar.contact_reschedule_days ?? 14);
    setReminders(calendar.reminder_offsets_minutes ?? [1440, 120]);
  }, [calendar]);

  const toggleDay = (day: number) =>
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );

  const toggleReminder = (offset: number) =>
    setReminders((prev) => (prev.includes(offset) ? prev.filter((r) => r !== offset) : [...prev, offset]));

  const addBlockedDate = () => {
    if (!newDate || blockedDates.includes(newDate)) return;
    setBlockedDates((prev) => [...prev, newDate].sort());
    setNewDate('');
  };

  const isBooking = calendar?.type !== 'follow_up';
  const charges = calendar?.type === 'appointments' && paymentServiceId !== 'none';

  const handleSave = async () => {
    const advance = maxAdvanceDays.trim() ? Number(maxAdvanceDays) : null;
    try {
      await updateConfig.mutateAsync({
        id: calendarId,
        body: {
          name: name.trim() || calendar?.name,
          color,
          is_active: isActive,
          work_days: workDays,
          start_time: startTime,
          end_time: endTime,
          slot_duration_minutes: slotDuration,
          buffer_minutes: buffer,
          timezone,
          blocked_dates: blockedDates,
          ...(isBooking
            ? {
                owner_user_id: ownerId === 'none' ? null : ownerId,
                min_notice_minutes: minNotice,
                max_advance_days: advance,
                contact_reschedule_days: contactRescheduleDays,
                reminder_offsets_minutes: reminders,
              }
            : {}),
          ...(calendar?.type === 'appointments'
            ? { payment_service_id: paymentServiceId === 'none' ? null : paymentServiceId, ...(charges ? { hold_minutes: holdMinutes } : {}) }
            : {}),
        } satisfies UpdateWorkScheduleBody,
      });
      toast({ title: 'Calendar saved' });
      onBack();
    } catch (err) {
      toast({ title: (err as Error)?.message || 'Error saving calendar', variant: 'error' });
    }
  };

  const activePaymentServices = paymentServices.filter((s) => s.is_active);
  const formatAmount = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (isLoading) {
    return <p className="text-sm text-secondary px-6 py-5">Loading...</p>;
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label htmlFor="cal-name" className="block text-sm font-medium text-primary mb-1">Name</label>
            <input id="cal-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div className="flex gap-1.5 pb-1.5">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                title={swatch.label}
                onClick={() => setColor(swatch.value)}
                className={`w-6 h-6 rounded-full border-2 ${color === swatch.value ? 'border-strong scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: swatch.value }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-primary">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (inactive calendars offer no free times)
        </label>

        <div>
          <label htmlFor="cal-timezone" className="block text-sm font-medium text-primary mb-1">Time zone</label>
          <input
            id="cal-timezone"
            list="cal-timezones"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputClass}
          />
          <datalist id="cal-timezones">
            {timeZones.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          {!timeZones.includes(timezone) && <p className="mt-1 text-xs text-danger">Pick a time zone from the list.</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-primary mb-2">Work days</label>
          <div className="flex gap-2 flex-wrap">
            {DAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  workDays.includes(idx)
                    ? 'bg-olive-dark text-accent border-accent/25'
                    : 'bg-surface text-primary border-subtle hover:border-strong'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="cal-start" className="block text-sm font-medium text-primary mb-1">Start time</label>
            <input id="cal-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="cal-end" className="block text-sm font-medium text-primary mb-1">End time</label>
            <input id="cal-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Slot duration</label>
            <Select value={String(slotDuration)} onValueChange={(v) => setSlotDuration(Number(v))}>
              <SelectTrigger className="w-full bg-surface text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_DURATIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Buffer between appointments</label>
            <Select value={String(buffer)} onValueChange={(v) => setBuffer(Number(v))}>
              <SelectTrigger className="w-full bg-surface text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUFFER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isBooking && (
          <>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Staff member</label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="w-full bg-surface text-primary">
                  <SelectValue placeholder="Nobody in particular" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nobody in particular</SelectItem>
                  {team.filter((m) => m.is_active).map((member) => (
                    <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted">Their bookings never overlap across all of their calendars.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Minimum notice</label>
                <Select value={String(minNotice)} onValueChange={(v) => setMinNotice(Number(v))}>
                  <SelectTrigger className="w-full bg-surface text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTICE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="cal-advance" className="block text-sm font-medium text-primary mb-1">Book up to (days ahead)</label>
                <input
                  id="cal-advance"
                  type="number"
                  min={1}
                  max={730}
                  placeholder="No limit"
                  value={maxAdvanceDays}
                  onChange={(e) => setMaxAdvanceDays(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cal-contact-days" className="block text-sm font-medium text-primary mb-1">
                Contacts can move their booking up to (days ahead)
              </label>
              <input
                id="cal-contact-days"
                type="number"
                min={1}
                max={60}
                value={contactRescheduleDays}
                onChange={(e) => setContactRescheduleDays(Number(e.target.value))}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-muted">Free times shown on the contact&apos;s link when they choose a new time (1–60).</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-2">Reminders to the contact</label>
              <div className="flex flex-wrap gap-2">
                {REMINDER_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-sm text-primary">
                    <input type="checkbox" checked={reminders.includes(opt.value)} onChange={() => toggleReminder(opt.value)} />
                    {opt.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">Unconfirmed appointments get a reminder with the confirm button.</p>
            </div>
          </>
        )}

        {calendar?.type === 'appointments' && (
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Service charged at booking</label>
            <Select value={paymentServiceId} onValueChange={setPaymentServiceId}>
              <SelectTrigger className="w-full bg-surface text-primary">
                <SelectValue placeholder="No charge" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No charge</SelectItem>
                {activePaymentServices.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name} — ${formatAmount(service.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted">
              When the AI books into this calendar, it will request this payment before confirming the appointment.
            </p>
            {charges && (
              <div className="mt-3">
                <label htmlFor="cal-hold" className="block text-sm font-medium text-primary mb-1">Hold the slot while paying (minutes)</label>
                <input
                  id="cal-hold"
                  type="number"
                  min={30}
                  max={1440}
                  value={holdMinutes}
                  onChange={(e) => setHoldMinutes(Number(e.target.value))}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-muted">If the payment does not arrive in time, the slot is released (30–1440).</p>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-primary mb-2">Blocked dates</label>
          <div className="flex gap-2 mb-2">
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
            <Button type="button" variant="outline" size="sm" onClick={addBlockedDate} disabled={!newDate}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {blockedDates.length === 0 ? (
            <p className="text-xs text-muted">No blocked dates</p>
          ) : (
            <ul className="space-y-1">
              {blockedDates.map((date) => (
                <li key={date} className="flex items-center justify-between rounded-md bg-surface-raised px-3 py-1.5 text-sm">
                  <span className="text-primary">{date}</span>
                  <button
                    type="button"
                    onClick={() => setBlockedDates((prev) => prev.filter((d) => d !== date))}
                    className="text-muted hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-subtle flex justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={handleSave}
          disabled={
            updateConfig.isPending ||
            !timeZones.includes(timezone) ||
            !(contactRescheduleDays >= 1 && contactRescheduleDays <= 60)
          }
        >
          {updateConfig.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </>
  );
}

// ── Main CalendarManagerDrawer ────────────────────────────────────────────────

export function CalendarManagerDrawer({ open, onClose, defaultCalendarId }: Props) {
  const { data: calendars = [], isLoading } = useCalendars();
  const createCalendar = useCreateCalendar();
  const deleteCalendar = useDeleteCalendar();

  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563EB');
  const [newType, setNewType] = useState<'appointments' | 'custom'>('appointments');
  const [moveFrom, setMoveFrom] = useState<{ id: string; name: string; count: number } | null>(null);
  const [moveTo, setMoveTo] = useState('');

  useEffect(() => {
    if (defaultCalendarId) {
      setConfiguringId(defaultCalendarId);
    }
  }, [defaultCalendarId]);

  const configuringCalendar = configuringId
    ? calendars.find((c) => c.id === configuringId)
    : null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createCalendar.mutateAsync({ name: newName.trim(), color: newColor, type: newType });
      toast({ title: 'Calendar created' });
      setShowCreateForm(false);
      setNewName('');
      setNewColor('#2563EB');
    } catch {
      toast({ title: 'Error creating calendar', variant: 'error' });
    }
  };

  const handleDelete = async (id: string, name: string, target?: string) => {
    if (!target && !confirm(`Delete calendar "${name}"?`)) return;
    try {
      await deleteCalendar.mutateAsync({ id, moveTo: target });
      toast({ title: `"${name}" deleted` });
      setMoveFrom(null);
      setMoveTo('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CALENDAR_MOVE_TARGET_REQUIRED') {
        // Past appointments must live somewhere: ask where to move them.
        setMoveFrom({ id, name, count: Number(err.errors?.count ?? 0) });
        setMoveTo(calendars.find((c) => c.id !== id)?.id ?? '');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Error deleting calendar';
      toast({ title: msg, variant: 'error' });
    }
  };

  const handleClose = () => {
    setConfiguringId(null);
    setShowCreateForm(false);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={handleClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-surface shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <div className="flex items-center gap-2">
            {configuringId ? (
              <>
                <Calendar className="h-5 w-5 text-secondary" />
                <h2 className="text-base font-semibold text-primary">
                  {configuringCalendar?.name ?? 'Configure calendar'}
                </h2>
              </>
            ) : (
              <>
                <Settings2 className="h-5 w-5 text-secondary" />
                <h2 className="text-base font-semibold text-primary">Calendars</h2>
              </>
            )}
          </div>
          <button onClick={handleClose} className="text-muted hover:text-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Config view */}
        {configuringId ? (
          <CalendarConfigView calendarId={configuringId} onBack={() => setConfiguringId(null)} />
        ) : (
          <>
            {/* List body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {isLoading ? (
                <p className="text-sm text-secondary">Loading calendars...</p>
              ) : (
                <>
                  {calendars.map((cal) => (
                      <div
                        key={cal.id}
                        className="flex items-center gap-3 rounded-xl border border-subtle bg-surface p-4 hover:shadow-xs transition-shadow"
                      >
                        {/* Color indicator */}
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cal.color }}
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">{cal.name}</p>
                          <p className="text-xs text-muted truncate">
                            {cal.type === 'appointments'
                              ? cal.payment_service_id
                                ? 'Charges at booking'
                                : 'Appointments · no charge'
                              : cal.type === 'follow_up'
                                ? 'Follow-up'
                                : cal.type}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setConfiguringId(cal.id)}
                            className="p-1.5 rounded-md text-muted hover:text-accent-hover hover:bg-olive-dark transition-colors"
                            title="Configure schedule"
                          >
                            <Settings2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cal.id, cal.name)}
                            disabled={deleteCalendar.isPending}
                            className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
                            title="Delete calendar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                  ))}

                  {moveFrom && (
                    <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-3">
                      <p className="text-sm text-primary">
                        &quot;{moveFrom.name}&quot; has {moveFrom.count} past appointment(s). Move them to:
                      </p>
                      <Select value={moveTo} onValueChange={setMoveTo}>
                        <SelectTrigger className="w-full bg-surface text-primary">
                          <SelectValue placeholder="Choose a calendar" />
                        </SelectTrigger>
                        <SelectContent>
                          {calendars
                            .filter((c) => c.id !== moveFrom.id)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setMoveFrom(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={!moveTo || deleteCalendar.isPending}
                          onClick={() => handleDelete(moveFrom.id, moveFrom.name, moveTo)}
                        >
                          Move and delete
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Create form */}
                  {showCreateForm ? (
                    <div className="rounded-xl border border-dashed border-accent/30 bg-olive-dark/50 p-4 space-y-3">
                      <Input
                        placeholder="Calendar name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        autoFocus
                        className="bg-surface"
                      />

                      {/* Color swatches */}
                      <div className="flex gap-2">
                        {COLOR_SWATCHES.map((swatch) => (
                          <button
                            key={swatch.value}
                            type="button"
                            title={swatch.label}
                            onClick={() => setNewColor(swatch.value)}
                            className={`w-7 h-7 rounded-full border-2 transition-all ${
                              newColor === swatch.value
                                ? 'border-strong scale-110'
                                : 'border-transparent hover:scale-105'
                            }`}
                            style={{ backgroundColor: swatch.value }}
                          />
                        ))}
                      </div>

                      <Select value={newType} onValueChange={(v) => setNewType(v as 'appointments' | 'custom')}>
                        <SelectTrigger className="w-full bg-surface text-primary" aria-label="Calendar type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="appointments">Appointments (can charge)</SelectItem>
                          <SelectItem value="custom">Other bookings (no charge)</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={handleCreate}
                          disabled={!newName.trim() || createCalendar.isPending}
                          className="flex-1"
                        >
                          {createCalendar.isPending ? 'Creating...' : 'Create'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowCreateForm(false);
                            setNewName('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="w-full flex items-center gap-2 rounded-xl border border-dashed border-subtle px-4 py-3 text-sm text-secondary hover:border-accent/30 hover:text-accent-hover hover:bg-olive-dark/50 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Add calendar
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-subtle flex justify-end">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
