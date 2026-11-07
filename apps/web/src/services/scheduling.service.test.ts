import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { schedulingService } from './scheduling.service';

describe('schedulingService', () => {
  describe('appointments', () => {
    itCallsEndpoints([
      { name: 'getAppointments without params', call: () => schedulingService.getAppointments(), method: 'get', path: '/appointments' },
      {
        name: 'getAppointments with every filter',
        call: () =>
          schedulingService.getAppointments({
            from: '2026-03-01',
            to: '2026-03-31',
            status: 'confirmed',
            limit: 100,
            offset: 200,
            sort: 'asc',
            cursor: 'cur-1',
            calendar_id: 'cal-1',
          }),
        method: 'get',
        path: '/appointments',
        query: {
          from: '2026-03-01',
          to: '2026-03-31',
          status: 'confirmed',
          limit: '100',
          offset: '200',
          sort: 'asc',
          cursor: 'cur-1',
          calendar_id: 'cal-1',
        },
      },
      { name: 'getAppointment', call: () => schedulingService.getAppointment('apt-1'), method: 'get', path: '/appointments/apt-1' },
      { name: 'getMetrics for all calendars', call: () => schedulingService.getMetrics(), method: 'get', path: '/appointments/metrics' },
      {
        name: 'getMetrics for one calendar',
        call: () => schedulingService.getMetrics('cal-1'),
        method: 'get',
        path: '/appointments/metrics',
        query: { calendar_id: 'cal-1' },
      },
      {
        name: 'createAppointment',
        call: () =>
          schedulingService.createAppointment({
            contact_id: 'c-1',
            title: 'Consultation',
            duration_minutes: 30,
            starts_at: '2026-03-20T15:00:00Z',
            calendar_id: 'cal-1',
          }),
        method: 'post',
        path: '/appointments',
        body: {
          contact_id: 'c-1',
          title: 'Consultation',
          duration_minutes: 30,
          starts_at: '2026-03-20T15:00:00Z',
          calendar_id: 'cal-1',
        },
      },
      {
        name: 'updateAppointment',
        call: () => schedulingService.updateAppointment('apt-1', { status: 'cancelled', notes: 'Client asked' }),
        method: 'patch',
        path: '/appointments/apt-1',
        body: { status: 'cancelled', notes: 'Client asked' },
      },
      { name: 'deleteAppointment', call: () => schedulingService.deleteAppointment('apt-1'), method: 'delete', path: '/appointments/apt-1' },
      {
        name: 'completeAppointment',
        call: () => schedulingService.completeAppointment('apt-1'),
        method: 'post',
        path: '/appointments/apt-1/complete',
        body: {},
      },
      {
        name: 'rescheduleAppointment maps to new_start_time',
        call: () => schedulingService.rescheduleAppointment('apt-1', '2026-03-21T16:00:00Z'),
        method: 'post',
        path: '/appointments/apt-1/reschedule',
        body: { new_start_time: '2026-03-21T16:00:00Z' },
      },
    ]);
  });

  describe('work schedule and availability', () => {
    itCallsEndpoints([
      { name: 'getWorkSchedule', call: () => schedulingService.getWorkSchedule(), method: 'get', path: '/appointments/config' },
      {
        name: 'updateWorkSchedule',
        call: () => schedulingService.updateWorkSchedule({ work_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00' }),
        method: 'put',
        path: '/appointments/config',
        body: { work_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00' },
      },
      {
        name: 'getAvailability with the required range only',
        call: () => schedulingService.getAvailability({ from: '2026-03-20', to: '2026-03-21' }),
        method: 'get',
        path: '/appointments/availability',
        query: { from: '2026-03-20', to: '2026-03-21' },
      },
      {
        name: 'getAvailability for a duration and calendar',
        call: () =>
          schedulingService.getAvailability({ from: '2026-03-20', to: '2026-03-21', duration_minutes: 45, calendar_id: 'cal-1' }),
        method: 'get',
        path: '/appointments/availability',
        query: { from: '2026-03-20', to: '2026-03-21', duration_minutes: '45', calendar_id: 'cal-1' },
      },
    ]);

    it('returns the free slots', async () => {
      const slots = [{ starts_at: '2026-03-20T15:00:00Z', ends_at: '2026-03-20T15:30:00Z' }];
      mockApi('get', '/appointments/availability', { data: slots });

      await expect(schedulingService.getAvailability({ from: '2026-03-20', to: '2026-03-21' })).resolves.toEqual(slots);
    });
  });

  describe('calendars', () => {
    itCallsEndpoints([
      { name: 'listCalendars', call: () => schedulingService.listCalendars(), method: 'get', path: '/calendars' },
      {
        name: 'createCalendar',
        call: () => schedulingService.createCalendar({ name: 'Dr. Ruiz', color: '#c8f169' }),
        method: 'post',
        path: '/calendars',
        body: { name: 'Dr. Ruiz', color: '#c8f169' },
      },
      { name: 'getCalendar', call: () => schedulingService.getCalendar('cal-1'), method: 'get', path: '/calendars/cal-1' },
      {
        name: 'updateCalendar can clear the payment service',
        call: () => schedulingService.updateCalendar('cal-1', { payment_service_id: null }),
        method: 'patch',
        path: '/calendars/cal-1',
        body: { payment_service_id: null },
      },
      {
        name: 'updateCalendarConfig',
        call: () => schedulingService.updateCalendarConfig('cal-1', { slot_duration_minutes: 45, buffer_minutes: 15 }),
        method: 'put',
        path: '/calendars/cal-1/config',
        body: { slot_duration_minutes: 45, buffer_minutes: 15 },
      },
      { name: 'deleteCalendar', call: () => schedulingService.deleteCalendar('cal-1'), method: 'delete', path: '/calendars/cal-1' },
    ]);
  });

  it('rejects with the API message when the slot is taken', async () => {
    mockApi('post', '/appointments', { status: 409, message: 'Time slot is no longer available' });

    await expect(
      schedulingService.createAppointment({ contact_id: 'c-1', title: 'Consultation', duration_minutes: 30, starts_at: '2026-03-20T15:00:00Z' }),
    ).rejects.toThrow('Time slot is no longer available');
  });
});
