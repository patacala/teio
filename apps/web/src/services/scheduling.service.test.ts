import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { schedulingService } from './scheduling.service';
import { ApiError } from '@/lib/auth-client';

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
        name: 'updateAppointment sends descriptive fields only',
        call: () => schedulingService.updateAppointment('apt-1', { title: 'Follow-up visit', notes: 'Client asked' }),
        method: 'patch',
        path: '/appointments/apt-1',
        body: { title: 'Follow-up visit', notes: 'Client asked' },
      },
      {
        name: 'confirmAppointment',
        call: () => schedulingService.confirmAppointment('apt-1'),
        method: 'post',
        path: '/appointments/apt-1/confirm',
        body: {},
      },
      {
        name: 'cancelAppointment defaults to a staff cancellation',
        call: () => schedulingService.cancelAppointment('apt-1'),
        method: 'post',
        path: '/appointments/apt-1/cancel',
        body: { reason: 'staff' },
      },
      {
        name: 'markNoShow',
        call: () => schedulingService.markNoShow('apt-1'),
        method: 'post',
        path: '/appointments/apt-1/no-show',
        body: {},
      },
      {
        name: 'resendConfirmation',
        call: () => schedulingService.resendConfirmation('apt-1'),
        method: 'post',
        path: '/appointments/apt-1/resend-confirmation',
        body: {},
      },
      {
        name: 'getAppointments for bookings needing an outcome',
        call: () => schedulingService.getAppointments({ calendar_id: 'cal-1', needs_outcome: true }),
        method: 'get',
        path: '/appointments',
        query: { calendar_id: 'cal-1', needs_outcome: 'true' },
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
        name: 'rescheduleAppointment with a new duration and an admin override',
        call: () =>
          schedulingService.rescheduleAppointment('apt-1', {
            starts_at: '2026-03-21T16:00:00Z',
            duration_minutes: 45,
            override: { reason: 'VIP' },
          }),
        method: 'post',
        path: '/appointments/apt-1/reschedule',
        body: { starts_at: '2026-03-21T16:00:00Z', duration_minutes: 45, override: { reason: 'VIP' } },
      },
    ]);
  });

  describe('availability', () => {
    itCallsEndpoints([
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
        call: () => schedulingService.updateCalendarConfig('cal-1', { slot_duration_minutes: 60, buffer_minutes: 15, hold_minutes: 90 }),
        method: 'put',
        path: '/calendars/cal-1/config',
        body: { slot_duration_minutes: 60, buffer_minutes: 15, hold_minutes: 90 },
      },
      { name: 'deleteCalendar', call: () => schedulingService.deleteCalendar('cal-1'), method: 'delete', path: '/calendars/cal-1' },
      {
        name: 'deleteCalendar moving past appointments',
        call: () => schedulingService.deleteCalendar('cal-1', 'cal-2'),
        method: 'delete',
        path: '/calendars/cal-1',
        query: { move_to: 'cal-2' },
      },
    ]);
  });

  it('rejects with the API message and code when the slot is taken', async () => {
    mockApi('post', '/appointments', {
      status: 409,
      message: 'That time overlaps another booking on this calendar',
      errors: { code: 'SLOT_NOT_AVAILABLE', violations: ['conflict'] },
    });

    const error = await schedulingService
      .createAppointment({
        contact_id: 'c-1',
        calendar_id: 'cal-1',
        title: 'Consultation',
        duration_minutes: 30,
        starts_at: '2026-03-20T15:00:00Z',
      })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'That time overlaps another booking on this calendar',
      status: 409,
      code: 'SLOT_NOT_AVAILABLE',
      errors: { violations: ['conflict'] },
    });
  });
});
