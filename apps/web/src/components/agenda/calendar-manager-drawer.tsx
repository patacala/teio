'use client';

import { useState, useEffect } from 'react';
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
  useUpdateCalendar,
  useUpdateCalendarConfig,
  useDeleteCalendar,
} from '@/hooks/useAppointments';
import { usePaymentServices } from '@/hooks/usePayments';
import type { UpdateWorkScheduleBody } from '@/services/scheduling.service';
import { toast } from '@/hooks/useToast';

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

// ── Config view (schedule settings for a specific calendar) ──────────────────

function CalendarConfigView({
  calendarId,
  onBack,
}: {
  calendarId: string;
  onBack: () => void;
}) {
  const { data: calendar, isLoading } = useCalendar(calendarId);
  const updateConfig = useUpdateCalendarConfig();
  const updateCalendar = useUpdateCalendar();
  const { data: paymentServices = [] } = usePaymentServices();

  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [timezone, setTimezone] = useState('UTC');
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState('');
  const [paymentServiceId, setPaymentServiceId] = useState<string>('none');

  useEffect(() => {
    if (!calendar) return;
    setWorkDays(calendar.work_days.map(Number));
    setStartTime(calendar.start_time.slice(0, 5));
    setEndTime(calendar.end_time.slice(0, 5));
    setSlotDuration(calendar.slot_duration_minutes);
    setBuffer(calendar.buffer_minutes);
    setTimezone(calendar.timezone);
    setBlockedDates(calendar.blocked_dates ?? []);
    setPaymentServiceId(calendar.payment_service_id ?? 'none');
  }, [calendar]);

  const toggleDay = (day: number) =>
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );

  const addBlockedDate = () => {
    if (!newDate || blockedDates.includes(newDate)) return;
    setBlockedDates((prev) => [...prev, newDate].sort());
    setNewDate('');
  };

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({
        id: calendarId,
        body: {
          work_days: workDays,
          start_time: startTime,
          end_time: endTime,
          slot_duration_minutes: slotDuration,
          buffer_minutes: buffer,
          timezone,
          blocked_dates: blockedDates,
        } satisfies UpdateWorkScheduleBody,
      });
      if (calendar?.type === 'appointments') {
        await updateCalendar.mutateAsync({
          id: calendarId,
          body: {
            payment_service_id: paymentServiceId === 'none' ? null : paymentServiceId,
          },
        });
      }
      toast({ title: 'Schedule saved' });
      onBack();
    } catch {
      toast({ title: 'Error saving schedule', variant: 'error' });
    }
  };

  const activePaymentServices = paymentServices.filter((s) => s.is_active);
  const formatAmount = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (isLoading) {
    return <p className="text-sm text-gray-500 px-6 py-5">Loading...</p>;
  }

  return (
    <>
      {/* Config body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Work days */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Work days</label>
          <div className="flex gap-2 flex-wrap">
            {DAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  workDays.includes(idx)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-border hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Work hours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-md border border-border bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-md border border-border bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        {/* Slot duration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slot duration</label>
          <Select value={String(slotDuration)} onValueChange={(v) => setSlotDuration(Number(v))}>
            <SelectTrigger className="w-full bg-white text-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLOT_DURATIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Buffer */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Buffer between appointments</label>
          <Select value={String(buffer)} onValueChange={(v) => setBuffer(Number(v))}>
            <SelectTrigger className="w-full bg-white text-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUFFER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. America/New_York"
            className="w-full rounded-md border border-border bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {/* Payment service — only for real appointment calendars */}
        {calendar?.type === 'appointments' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Servicio a cobrar al agendar
            </label>
            <Select value={paymentServiceId} onValueChange={setPaymentServiceId}>
              <SelectTrigger className="w-full bg-white text-gray-900">
                <SelectValue placeholder="Sin cobro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin cobro</SelectItem>
                {activePaymentServices.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name} — ${formatAmount(service.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-gray-400">
              Cuando la IA reserve en este calendario, pedirá este pago antes de confirmar la cita.
            </p>
          </div>
        )}

        {/* Blocked dates */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Blocked dates</label>
          <div className="flex gap-2 mb-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="flex-1 rounded-md border border-border bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <Button type="button" variant="outline" size="sm" onClick={addBlockedDate} disabled={!newDate}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {blockedDates.length === 0 ? (
            <p className="text-xs text-gray-400">No blocked dates</p>
          ) : (
            <ul className="space-y-1">
              {blockedDates.map((date) => (
                <li
                  key={date}
                  className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5 text-sm"
                >
                  <span className="text-gray-700">{date}</span>
                  <button
                    type="button"
                    onClick={() => setBlockedDates((prev) => prev.filter((d) => d !== date))}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border flex justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateConfig.isPending || updateCalendar.isPending}
        >
          {updateConfig.isPending || updateCalendar.isPending ? 'Saving...' : 'Save'}
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
      await createCalendar.mutateAsync({ name: newName.trim(), color: newColor });
      toast({ title: 'Calendar created' });
      setShowCreateForm(false);
      setNewName('');
      setNewColor('#2563EB');
    } catch {
      toast({ title: 'Error creating calendar', variant: 'error' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteCalendar.mutateAsync(id);
      toast({ title: `"${name}" deleted` });
    } catch (err) {
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
      <div className="fixed inset-0 bg-black/20 z-40" onClick={handleClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            {configuringId ? (
              <>
                <Calendar className="h-5 w-5 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900">
                  {configuringCalendar?.name ?? 'Configure calendar'}
                </h2>
              </>
            ) : (
              <>
                <Settings2 className="h-5 w-5 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900">Calendars</h2>
              </>
            )}
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
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
                <p className="text-sm text-gray-500">Loading calendars...</p>
              ) : (
                <>
                  {calendars.map((cal) => (
                      <div
                        key={cal.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 hover:shadow-sm transition-shadow"
                      >
                        {/* Color indicator */}
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cal.color }}
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{cal.name}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {cal.type === 'appointments'
                              ? cal.payment_service_id
                                ? 'Cobra al agendar'
                                : 'Citas · sin cobro'
                              : cal.type === 'follow_up'
                                ? 'Follow-up'
                                : cal.type}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setConfiguringId(cal.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Configure schedule"
                          >
                            <Settings2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cal.id, cal.name)}
                            disabled={deleteCalendar.isPending}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Delete calendar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                  ))}

                  {/* Create form */}
                  {showCreateForm ? (
                    <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-4 space-y-3">
                      <Input
                        placeholder="Calendar name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        autoFocus
                        className="bg-white"
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
                                ? 'border-gray-900 scale-110'
                                : 'border-transparent hover:scale-105'
                            }`}
                            style={{ backgroundColor: swatch.value }}
                          />
                        ))}
                      </div>

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
                      className="w-full flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Add calendar
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end">
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
