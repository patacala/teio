'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkSchedule, useUpdateWorkSchedule } from '@/hooks/useAppointments';
import { toast } from '@/hooks/useToast';

interface WorkScheduleDrawerProps {
  open: boolean;
  onClose: () => void;
}

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

export function WorkScheduleDrawer({ open, onClose }: WorkScheduleDrawerProps) {
  const { data: schedule, isLoading } = useWorkSchedule();
  const updateMutation = useUpdateWorkSchedule();

  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [timezone, setTimezone] = useState('UTC');
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState('');

  // Populate form when data loads
  useEffect(() => {
    if (!schedule) return;
    setWorkDays(schedule.work_days.map(Number));
    setStartTime(schedule.start_time.slice(0, 5));
    setEndTime(schedule.end_time.slice(0, 5));
    setSlotDuration(schedule.slot_duration_minutes);
    setBuffer(schedule.buffer_minutes);
    setTimezone(schedule.timezone);
    setBlockedDates(schedule.blocked_dates ?? []);
  }, [schedule]);

  const toggleDay = (day: number) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const addBlockedDate = () => {
    if (!newDate || blockedDates.includes(newDate)) return;
    setBlockedDates((prev) => [...prev, newDate].sort());
    setNewDate('');
  };

  const removeBlockedDate = (date: string) => {
    setBlockedDates((prev) => prev.filter((d) => d !== date));
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        work_days: workDays,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: slotDuration,
        buffer_minutes: buffer,
        timezone,
        blocked_dates: blockedDates,
      });
      toast({ title: 'Schedule saved' });
      onClose();
    } catch {
      toast({ title: 'Error saving schedule', variant: 'error' });
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Configure schedule</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <>
              {/* Work days */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work days
                </label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-md border border-border bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End time
                  </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slot duration
                </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buffer between appointments
                </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="e.g. America/New_York"
                  className="w-full rounded-md border border-border bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Blocked dates */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Blocked dates
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="flex-1 rounded-md border border-border bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addBlockedDate}
                    disabled={!newDate}
                  >
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
                          onClick={() => removeBlockedDate(date)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </>
  );
}
