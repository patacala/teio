'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AgendaMetricsCards } from '@/components/agenda/agenda-metrics-cards';
import { AgendaViewSwitcher, type AgendaViewType } from '@/components/agenda/agenda-view-switcher';
import { AppointmentsTable } from '@/components/agenda/appointments-table';
import { WeekCalendar } from '@/components/agenda/week-calendar';
import { MonthCalendar } from '@/components/agenda/month-calendar';
import { AppointmentDrawer } from '@/components/agenda/appointment-drawer';
import { CalendarSidebar } from '@/components/agenda/calendar-sidebar';
import { useAppointments, useCalendars, useCompleteAppointment, useDeleteAppointment } from '@/hooks/useAppointments';
import { toast } from '@/hooks/useToast';
import type { Appointment } from '@/services/scheduling.service';

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

const PAGE_SIZE = 25;

export default function SchedulePage() {
  // Stable reference — computed once on mount so derived query keys never flicker
  const today = useMemo(() => new Date(), []);

  const [view, setView] = useState<AgendaViewType>('list');
  const [page, setPage] = useState(1);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(getMonday(today));
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(today));
  const { data: calendars = [] } = useCalendars();
  const isFollowUpCalendar = calendars.some(
    (calendar) => calendar.id === selectedCalendarId && calendar.type === 'follow_up',
  );

  // Compute date range based on view
  const dateRange = (() => {
    if (view === 'list') {
      // Follow-up steps stay on the calendar for the life of the sequence,
      // including cancelled and failed ones that are older than a month.
      const from = new Date(today);
      from.setDate(from.getDate() - (isFollowUpCalendar ? 365 : 30));
      from.setHours(0, 0, 0, 0);
      const to = new Date(today);
      to.setDate(to.getDate() + 90);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (view === 'week') {
      const to = new Date(weekStart);
      to.setDate(to.getDate() + 7);
      return { from: weekStart.toISOString(), to: to.toISOString() };
    }
    return {
      from: currentMonth.toISOString(),
      to: endOfMonth(currentMonth).toISOString(),
    };
  })();

  // The list is paged newest-first; the week/month grids need every appointment
  // in their window, in chronological order, so they skip paging entirely.
  const { data, isLoading } = useAppointments(
    selectedCalendarId
      ? {
          from: dateRange.from,
          to: dateRange.to,
          calendar_id: selectedCalendarId,
          ...(view === 'list'
            ? { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, sort: 'desc' as const }
            : { limit: 200, sort: 'asc' as const }),
        }
      : null,
  );

  const appointments = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  const completeMutation = useCompleteAppointment();
  const deleteMutation = useDeleteAppointment();

  const openCreate = () => {
    setEditingAppointment(null);
    setDrawerOpen(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditingAppointment(appt);
    setDrawerOpen(true);
  };

  const handleComplete = async (id: string) => {
    try {
      await completeMutation.mutateAsync(id);
      toast({ title: 'Appointment marked as completed' });
    } catch {
      toast({ title: 'Error completing appointment', variant: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: 'Appointment deleted' });
    } catch {
      toast({ title: 'Error deleting appointment', variant: 'error' });
    }
  };

  const handleDayClick = (day: Date) => {
    setWeekStart(getMonday(day));
    setView('week');
  };

  return (
    <div className="flex min-h-0 flex-col md:h-full md:flex-row">
      {/* Left sidebar */}
      <aside className="shrink-0 border-b border-subtle flex flex-col md:w-[200px] md:border-b-0 md:border-r">
        <CalendarSidebar
          selectedId={selectedCalendarId}
          onChange={(id) => {
            setPage(1);
            setSelectedCalendarId(id);
          }}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Fixed header area */}
        <div className="shrink-0 flex flex-col gap-6 p-4 pb-0 md:p-6 md:pb-0">
          {/* Page header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-primary">Schedule</h1>
              <p className="text-sm text-secondary mt-0.5">
                Manage appointments and meetings with your contacts.
              </p>
            </div>
            <Button onClick={openCreate} className="shrink-0">
              <Plus className="h-4 w-4 mr-1.5" />
              New appointment
            </Button>
          </div>

          {/* Metrics */}
          <AgendaMetricsCards calendarId={selectedCalendarId} />

          {/* View switcher */}
          <div className="flex items-center gap-4">
            <AgendaViewSwitcher
              view={view}
              onChange={(next) => {
                setPage(1);
                setView(next);
              }}
            />
          </div>
        </div>

        {/* Scrollable content area — fills remaining height */}
        <div className="flex-1 min-h-0 p-4 pt-4 md:p-6 md:pt-4">
          {view === 'list' && (
            <AppointmentsTable
              appointments={appointments}
              isLoading={isLoading}
              onEdit={openEdit}
              onComplete={handleComplete}
              onDelete={handleDelete}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          )}

          {view === 'week' && (
            <WeekCalendar
              appointments={appointments}
              weekStart={weekStart}
              onWeekChange={setWeekStart}
              onAppointmentClick={openEdit}
            />
          )}

          {view === 'month' && (
            <MonthCalendar
              appointments={appointments}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              onDayClick={handleDayClick}
            />
          )}
        </div>

        {/* Appointment drawer */}
        <AppointmentDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          appointment={editingAppointment}
          calendarId={selectedCalendarId}
        />
      </div>
    </div>
  );
}
