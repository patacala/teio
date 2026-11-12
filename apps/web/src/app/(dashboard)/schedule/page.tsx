'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Plus } from 'lucide-react';
import { AgendaMetricsCards } from '@/components/agenda/agenda-metrics-cards';
import { AgendaViewSwitcher, type AgendaViewType } from '@/components/agenda/agenda-view-switcher';
import { AppointmentsTable } from '@/components/agenda/appointments-table';
import { WeekCalendar } from '@/components/agenda/week-calendar';
import { MonthCalendar, lastDayOfMonth } from '@/components/agenda/month-calendar';
import { AppointmentDrawer } from '@/components/agenda/appointment-drawer';
import { CalendarSidebar } from '@/components/agenda/calendar-sidebar';
import {
  useAppointmentMetrics,
  useCalendars,
  useCancelAppointment,
  useCompleteAppointment,
  useConfirmAppointment,
  useDeleteAppointment,
  useMarkNoShow,
  useResendConfirmation,
} from '@/hooks/useAppointments';
import { useCancelFollowUp, useCompleteFollowUp, useDeleteFollowUp } from '@/hooks/useAutomation';
import { useAgenda } from '@/hooks/useAgenda';
import { useCurrentUser } from '@/hooks/useTeam';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { addDays, localDate, weekdayOf, zonedTimeToUtc } from '@/lib/timezone';
import type { AgendaItem } from '@/services/scheduling.service';

const PAGE_SIZE = 25;

function parseTime(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const [h, m] = value.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Monday of the week containing `date` (local dates). */
function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

function startOf(date: string, timeZone: string): string {
  return (zonedTimeToUtc(date, 0, timeZone) ?? new Date(`${date}T00:00:00Z`)).toISOString();
}

export default function SchedulePage() {
  const [view, setView] = useState<AgendaViewType>('list');
  const [page, setPage] = useState(1);
  const [needsOutcomeOnly, setNeedsOutcomeOnly] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [initialStart, setInitialStart] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  const { data: calendars = [] } = useCalendars();
  const calendar = calendars.find((c) => c.id === selectedCalendarId) ?? null;
  const timeZone = calendar?.timezone ?? 'UTC';
  const isFollowUp = calendar?.type === 'follow_up';
  const today = localDate(new Date(), timeZone);
  const currentWeek = weekStart ?? mondayOf(today);
  const currentMonth = month ?? `${today.slice(0, 7)}-01`;

  const { data: metrics } = useAppointmentMetrics(isFollowUp ? null : selectedCalendarId);
  const needsOutcomeCount = metrics?.needs_outcome_count ?? 0;

  const query = useMemo(() => {
    if (!calendar) return null;
    if (view === 'list') {
      // Follow-up steps stay on the calendar for the life of the sequence.
      const from = startOf(addDays(today, needsOutcomeOnly ? -365 : isFollowUp ? -365 : -30), timeZone);
      const to = startOf(addDays(today, 91), timeZone);
      return {
        calendar,
        from,
        to,
        sort: 'desc' as const,
        page: { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
        needsOutcome: needsOutcomeOnly && !isFollowUp,
      };
    }
    if (view === 'week') {
      return { calendar, from: startOf(currentWeek, timeZone), to: startOf(addDays(currentWeek, 7), timeZone), sort: 'asc' as const };
    }
    return {
      calendar,
      from: startOf(currentMonth, timeZone),
      to: startOf(addDays(lastDayOfMonth(currentMonth), 1), timeZone),
      sort: 'asc' as const,
    };
  }, [calendar, view, today, timeZone, isFollowUp, page, needsOutcomeOnly, currentWeek, currentMonth]);

  const { data, isLoading } = useAgenda(query);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const completeBooking = useCompleteAppointment();
  const deleteBooking = useDeleteAppointment();
  const confirmBooking = useConfirmAppointment();
  const cancelBooking = useCancelAppointment();
  const noShowBooking = useMarkNoShow();
  const resendBooking = useResendConfirmation();
  const completeStep = useCompleteFollowUp();
  const skipStep = useCancelFollowUp();
  const deleteStep = useDeleteFollowUp();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast({ title: success });
    } catch (err) {
      toast({ title: (err as Error)?.message || 'Action failed', variant: 'error' });
    }
  };

  const isStep = (item: AgendaItem) => item.kind === 'step';
  const handleComplete = (item: AgendaItem) =>
    runAction(
      () => (isStep(item) ? completeStep.mutateAsync(item.id) : completeBooking.mutateAsync(item.id)),
      isStep(item) ? 'Follow-up marked as done' : 'Appointment marked as completed',
    );
  const handleDelete = (item: AgendaItem) =>
    runAction(
      () => (isStep(item) ? deleteStep.mutateAsync(item.id) : deleteBooking.mutateAsync(item.id)),
      isStep(item) ? 'Follow-up deleted' : 'Appointment deleted',
    );
  const handleCancel = (item: AgendaItem) =>
    runAction(
      () => (isStep(item) ? skipStep.mutateAsync(item.id) : cancelBooking.mutateAsync({ id: item.id })),
      isStep(item) ? 'Follow-up skipped' : 'Appointment cancelled',
    );
  const handleConfirm = (item: AgendaItem) => runAction(() => confirmBooking.mutateAsync(item.id), 'Appointment confirmed');
  const handleNoShow = (item: AgendaItem) => runAction(() => noShowBooking.mutateAsync(item.id), 'Marked as no-show');
  const handleResend = (item: AgendaItem) =>
    runAction(() => resendBooking.mutateAsync(item.id), 'Confirmation link sent again');

  const openCreate = (start: string | null = null) => {
    setEditing(null);
    setInitialStart(start);
    setDrawerOpen(true);
  };

  const openEdit = (item: AgendaItem) => {
    setEditing(item);
    setInitialStart(null);
    setDrawerOpen(true);
  };

  const workingHours = calendar
    ? {
        workDays: calendar.work_days.map(Number),
        startMinutes: parseTime(calendar.start_time, 9 * 60),
        endMinutes: parseTime(calendar.end_time, 18 * 60),
      }
    : undefined;

  return (
    <div className="flex min-h-0 flex-col md:h-full md:flex-row">
      <aside className="shrink-0 border-b border-subtle flex flex-col md:w-[200px] md:border-b-0 md:border-r">
        <CalendarSidebar
          selectedId={selectedCalendarId}
          onChange={(id) => {
            setPage(1);
            setNeedsOutcomeOnly(false);
            setWeekStart(null);
            setMonth(null);
            setSelectedCalendarId(id);
          }}
        />
      </aside>

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="shrink-0 flex flex-col gap-6 p-4 pb-0 md:p-6 md:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-primary">Schedule</h1>
              <p className="text-sm text-secondary mt-0.5">
                {isFollowUp ? 'Automated follow-ups and tasks for your team.' : 'Appointments with your contacts.'}
                {calendar && <span className="text-muted"> Times in {timeZone}.</span>}
              </p>
            </div>
            <Button onClick={() => openCreate()} className="shrink-0">
              <Plus className="h-4 w-4 mr-1.5" />
              {isFollowUp ? 'New follow-up' : 'New appointment'}
            </Button>
          </div>

          <AgendaMetricsCards calendarId={selectedCalendarId} isFollowUp={isFollowUp} />

          <div className="flex flex-wrap items-center gap-4">
            <AgendaViewSwitcher
              view={view}
              onChange={(next) => {
                setPage(1);
                setView(next);
              }}
            />
            {!isFollowUp && (needsOutcomeCount > 0 || needsOutcomeOnly) && (
              <button
                type="button"
                onClick={() => {
                  setNeedsOutcomeOnly((v) => !v);
                  setView('list');
                  setPage(1);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  needsOutcomeOnly
                    ? 'border-danger bg-danger/15 text-danger'
                    : 'border-danger/40 text-danger hover:bg-danger/10',
                )}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Needs outcome ({needsOutcomeCount})
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 p-4 pt-4 md:p-6 md:pt-4">
          {view === 'list' && (
            <AppointmentsTable
              appointments={items}
              timeZone={timeZone}
              isLoading={isLoading}
              onEdit={openEdit}
              onComplete={handleComplete}
              onDelete={handleDelete}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              onNoShow={handleNoShow}
              onResend={handleResend}
              canDelete={isAdmin}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          )}

          {view === 'week' && (
            <WeekCalendar
              appointments={items}
              days={Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i))}
              timeZone={timeZone}
              workingHours={isFollowUp ? undefined : workingHours}
              onPrev={() => setWeekStart(addDays(currentWeek, -7))}
              onNext={() => setWeekStart(addDays(currentWeek, 7))}
              onAppointmentClick={openEdit}
              onSlotClick={(start) => openCreate(start)}
            />
          )}

          {view === 'month' && (
            <MonthCalendar
              appointments={items}
              month={currentMonth}
              timeZone={timeZone}
              onPrev={() => setMonth(`${addDays(currentMonth, -1).slice(0, 7)}-01`)}
              onNext={() => setMonth(addDays(lastDayOfMonth(currentMonth), 1))}
              onDayClick={(day) => {
                setWeekStart(mondayOf(day));
                setView('week');
              }}
            />
          )}
        </div>

        <AppointmentDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          appointment={editing}
          calendarId={selectedCalendarId}
          initialStart={initialStart}
        />
      </div>
    </div>
  );
}
