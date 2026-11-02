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
}

export interface UpdateCalendarBody {
  name?: string;
  color?: string;
  is_active?: boolean;
  /** Pass null to clear the charge. Only valid for type = 'appointments'. */
  payment_service_id?: string | null;
}

export interface UpdateWorkScheduleBody {
  work_days?: number[];
  start_time?: string;
  end_time?: string;
  slot_duration_minutes?: number;
  buffer_minutes?: number;
  timezone?: string;
  blocked_dates?: string[];
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
  status: 'pending' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  origin: 'ai' | 'human' | 'webhook';
  created_by?: string;
  timezone?: string;
  location?: string;
  meeting_url?: string;
  notes?: string;
  calendar_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AppointmentMetrics {
  today_count: number;
  week_count: number;
  pending_count: number;
  completed_count: number;
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
  origin?: string;
  calendar_id?: string;
  action?: string;
  executor?: string;
  channel_strategy?: string;
  message_content?: string;
}

export interface UpdateAppointmentBody {
  title?: string;
  description?: string;
  starts_at?: string;
  duration_minutes?: number;
  status?: string;
  location?: string;
  meeting_url?: string;
  notes?: string;
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

  rescheduleAppointment: (id: string, newStartTime: string) =>
    authClient.post<Appointment>(`/appointments/${id}/reschedule`, { new_start_time: newStartTime }),

  getWorkSchedule: () =>
    authClient.get<WorkSchedule>('/appointments/config'),

  updateWorkSchedule: (body: UpdateWorkScheduleBody) =>
    authClient.put<WorkSchedule>('/appointments/config', body),

  getAvailability: (params: AvailabilityParams) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.duration_minutes) qs.set('duration_minutes', String(params.duration_minutes));
    if (params.calendar_id) qs.set('calendar_id', params.calendar_id);
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

  deleteCalendar: (id: string) =>
    authClient.delete<void>(`/calendars/${id}`),
};
