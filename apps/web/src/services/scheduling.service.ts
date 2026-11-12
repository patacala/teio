import { authClient } from '@/lib/auth-client';

export interface WorkSchedule {
  id: string;
  organization_id: string;
  name: string;
  type: string;   // 'appointments' | 'follow_up' | 'custom'
  color: string;
  is_active: boolean;
  /** Service charged when booking into an appointments calendar. Null = free. */
  payment_service_id: string | null;
  /** 'appointments' / 'follow_up' for the calendars the system manages. */
  system_key?: string | null;
  /** Minutes a slot stays reserved while the contact pays. */
  hold_minutes?: number;
  /** Reminders before the start, in minutes. */
  reminder_offsets_minutes?: number[];
  /** Staff member this calendar belongs to. */
  owner_user_id?: string | null;
  /** How soon a slot can be booked (minutes). */
  min_notice_minutes?: number;
  /** How far ahead a slot can be booked (days); null = no limit. */
  max_advance_days?: number | null;
  /** Days of free times a contact sees when changing a booking from their link. */
  contact_reschedule_days?: number;
  work_days: number[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  buffer_minutes: number;
  timezone: string;
  blocked_dates: string[];
  created_at: string;
  updated_at: string;
}

export type Calendar = WorkSchedule;

export interface CreateCalendarBody {
  name: string;
  color?: string;
  type?: 'appointments' | 'custom';
}

export interface UpdateCalendarBody {
  name?: string;
  color?: string;
  is_active?: boolean;
  /** Pass null to clear the charge. Only valid for type = 'appointments'. */
  payment_service_id?: string | null;
}

/** Calendar settings; identity fields included so the screen saves everything in one call. */
export interface UpdateWorkScheduleBody {
  name?: string;
  color?: string;
  is_active?: boolean;
  payment_service_id?: string | null;
  owner_user_id?: string | null;
  min_notice_minutes?: number;
  max_advance_days?: number | null;
  contact_reschedule_days?: number;
  reminder_offsets_minutes?: number[];
  work_days?: number[];
  start_time?: string;
  end_time?: string;
  slot_duration_minutes?: number;
  buffer_minutes?: number;
  timezone?: string;
  blocked_dates?: string[];
  hold_minutes?: number;
}

export interface AvailabilitySlot {
  starts_at: string;
  ends_at: string;
}

export interface AvailabilityParams {
  from: string;
  to: string;
  duration_minutes?: number;
  calendar_id?: string;
  /** The booking being moved: its own time does not count as busy. */
  exclude_appointment_id?: string;
}

export interface Appointment {
  id: string;
  contact_id: string;
  contact?: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
  };
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatusValue;
  origin: 'ai' | 'human' | 'webhook' | 'automation';
  assigned_to?: string | null;
  created_by?: string;
  timezone?: string;
  location?: string;
  meeting_url?: string;
  notes?: string;
  calendar_id?: string;
  confirmed_at?: string | null;
  confirmed_via?: 'email_link' | 'sms_link' | 'payment' | 'staff' | 'legacy' | null;
  cancel_reason?: string | null;
  override_at?: string | null;
  override_reason?: string | null;
  hold_expires_at?: string | null;
  payment_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type AppointmentStatusValue = 'held' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

/**
 * One row of the agenda: a booking, or a follow-up step shown on the
 * follow-up calendar (steps have an `action` and end 15 minutes after they are due).
 */
export interface AgendaItem extends Omit<Appointment, 'status'> {
  kind: 'booking' | 'step';
  status: string;
  action?: string;
  executor?: string;
  channel_strategy?: string;
  message_content?: string;
}

export interface AppointmentMetrics {
  today_count: number;
  week_count: number;
  pending_count: number;
  completed_count: number;
  needs_outcome_count?: number;
}

export interface AppointmentListParams {
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
  offset?: number;
  /** Defaults to 'desc' server-side; calendar grids pass 'asc'. */
  sort?: 'asc' | 'desc';
  cursor?: string;
  calendar_id?: string;
  contact_id?: string;
  /** Ended bookings nobody marked completed / no-show. */
  needs_outcome?: boolean;
}

export interface AppointmentPage {
  items: Appointment[];
  meta: { total: number; limit: number; offset: number };
}

export interface CreateAppointmentBody {
  contact_id: string;
  title: string;
  duration_minutes: number;
  starts_at: string;
  description?: string;
  timezone?: string;
  location?: string;
  meeting_url?: string;
  assigned_to?: string;
  calendar_id: string;
  /** Admins only: book outside the calendar rules (reason is kept). */
  override?: { reason: string };
  /** Book on a charging calendar without asking for payment. */
  waive_payment?: boolean;
}

/** Descriptive fields only; time changes go through reschedule. */
export interface UpdateAppointmentBody {
  title?: string;
  description?: string;
  location?: string;
  meeting_url?: string;
  notes?: string;
}

export interface RescheduleAppointmentBody {
  starts_at: string;
  duration_minutes?: number;
  override?: { reason: string };
}

export const schedulingService = {
  getAppointments: (params?: AppointmentListParams) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.calendar_id) qs.set('calendar_id', params.calendar_id);
    if (params?.contact_id) qs.set('contact_id', params.contact_id);
    if (params?.needs_outcome) qs.set('needs_outcome', 'true');
    return authClient.get<AppointmentPage>(`/appointments?${qs.toString()}`);
  },

  getAppointment: (id: string) =>
    authClient.get<Appointment>(`/appointments/${id}`),

  getMetrics: (calendarId?: string) => {
    const qs = calendarId ? `?calendar_id=${calendarId}` : '';
    return authClient.get<AppointmentMetrics>(`/appointments/metrics${qs}`);
  },

  createAppointment: (body: CreateAppointmentBody) =>
    authClient.post<Appointment>('/appointments', body),

  updateAppointment: (id: string, body: UpdateAppointmentBody) =>
    authClient.patch<Appointment>(`/appointments/${id}`, body),

  deleteAppointment: (id: string) =>
    authClient.delete<void>(`/appointments/${id}`),

  completeAppointment: (id: string) =>
    authClient.post<Appointment>(`/appointments/${id}/complete`, {}),

  confirmAppointment: (id: string) =>
    authClient.post<Appointment>(`/appointments/${id}/confirm`, {}),

  cancelAppointment: (id: string, reason: 'staff' | 'contact' = 'staff') =>
    authClient.post<Appointment>(`/appointments/${id}/cancel`, { reason }),

  markNoShow: (id: string) =>
    authClient.post<Appointment>(`/appointments/${id}/no-show`, {}),

  resendConfirmation: (id: string) =>
    authClient.post<Appointment>(`/appointments/${id}/resend-confirmation`, {}),

  rescheduleAppointment: (id: string, body: RescheduleAppointmentBody) =>
    authClient.post<Appointment>(`/appointments/${id}/reschedule`, body),

  getAvailability: (params: AvailabilityParams) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.duration_minutes) qs.set('duration_minutes', String(params.duration_minutes));
    if (params.calendar_id) qs.set('calendar_id', params.calendar_id);
    if (params.exclude_appointment_id) qs.set('exclude_appointment_id', params.exclude_appointment_id);
    return authClient.get<AvailabilitySlot[]>(`/appointments/availability?${qs.toString()}`);
  },

  // ── Calendar CRUD ──────────────────────────────────────────────────────────

  listCalendars: () =>
    authClient.get<Calendar[]>('/calendars'),

  createCalendar: (body: CreateCalendarBody) =>
    authClient.post<Calendar>('/calendars', body),

  getCalendar: (id: string) =>
    authClient.get<Calendar>(`/calendars/${id}`),

  updateCalendar: (id: string, body: UpdateCalendarBody) =>
    authClient.patch<Calendar>(`/calendars/${id}`, body),

  updateCalendarConfig: (id: string, body: UpdateWorkScheduleBody) =>
    authClient.put<Calendar>(`/calendars/${id}/config`, body),

  deleteCalendar: (id: string, moveTo?: string) =>
    authClient.delete<void>(`/calendars/${id}${moveTo ? `?move_to=${moveTo}` : ''}`),
};
