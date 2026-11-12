'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  schedulingService,
  type AppointmentListParams,
  type CreateAppointmentBody,
  type UpdateAppointmentBody,
  type RescheduleAppointmentBody,
  type UpdateWorkScheduleBody,
  type AvailabilityParams,
  type CreateCalendarBody,
  type UpdateCalendarBody,
} from '@/services/scheduling.service';

export function useAppointments(params: AppointmentListParams | null) {
  return useQuery({
    queryKey: ['appointments', params],
    queryFn: () => schedulingService.getAppointments(params ?? undefined),
    enabled: params !== null,
    staleTime: 30_000,
  });
}

export function useAppointment(id: string | null) {
  return useQuery({
    queryKey: ['appointments', id],
    queryFn: () => schedulingService.getAppointment(id!),
    enabled: !!id,
  });
}

export function useAppointmentMetrics(calendarId?: string | null) {
  return useQuery({
    queryKey: ['appointment-metrics', calendarId ?? null],
    queryFn: () => schedulingService.getMetrics(calendarId ?? undefined),
    enabled: !!calendarId,
    staleTime: 60_000,
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAppointmentBody) => schedulingService.createAppointment(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-metrics'] });
    },
  });
}

function useInvalidateAgenda() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['appointment-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['availability'] });
  };
}

export function useUpdateAppointment() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAppointmentBody }) =>
      schedulingService.updateAppointment(id, body),
    onSuccess: invalidate,
  });
}

export function useConfirmAppointment() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (id: string) => schedulingService.confirmAppointment(id),
    onSuccess: invalidate,
  });
}

export function useCancelAppointment() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: 'staff' | 'contact' }) =>
      schedulingService.cancelAppointment(id, reason),
    onSuccess: invalidate,
  });
}

export function useMarkNoShow() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (id: string) => schedulingService.markNoShow(id),
    onSuccess: invalidate,
  });
}

export function useResendConfirmation() {
  return useMutation({
    mutationFn: (id: string) => schedulingService.resendConfirmation(id),
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => schedulingService.deleteAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-metrics'] });
    },
  });
}

export function useCompleteAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => schedulingService.completeAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-metrics'] });
    },
  });
}

export function useRescheduleAppointment() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RescheduleAppointmentBody }) =>
      schedulingService.rescheduleAppointment(id, body),
    onSuccess: invalidate,
  });
}

export function useAvailability(params: AvailabilityParams | null, enabled = true) {
  return useQuery({
    queryKey: ['availability', params],
    queryFn: () => schedulingService.getAvailability(params!),
    enabled: enabled && !!params,
    staleTime: 30_000,
  });
}

// ── Calendar hooks ────────────────────────────────────────────────────────────

export function useCalendars() {
  return useQuery({
    queryKey: ['calendars'],
    queryFn: () => schedulingService.listCalendars(),
    staleTime: 5 * 60_000,
  });
}

export function useCalendar(id: string | null) {
  return useQuery({
    queryKey: ['calendar', id],
    queryFn: () => schedulingService.getCalendar(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useCreateCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCalendarBody) => schedulingService.createCalendar(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
    },
  });
}

export function useUpdateCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCalendarBody }) =>
      schedulingService.updateCalendar(id, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      queryClient.invalidateQueries({ queryKey: ['calendar', id] });
    },
  });
}

export function useUpdateCalendarConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWorkScheduleBody }) =>
      schedulingService.updateCalendarConfig(id, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      queryClient.invalidateQueries({ queryKey: ['calendar', id] });
    },
  });
}

export function useDeleteCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo?: string }) => schedulingService.deleteCalendar(id, moveTo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}
