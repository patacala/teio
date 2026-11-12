import { http, HttpResponse } from 'msw';
import { API_BASE } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { addDays, localDate, zonedTimeToUtc } from '@/lib/timezone';
import type { Appointment, Calendar } from '@/services/scheduling.service';

/**
 * A small stateful stand-in for the scheduling API, so page tests can run
 * whole user flows (list → edit → pick a time → save → list refreshed). It
 * keeps the rules the UI depends on: free times exclude busy bookings, a staff
 * reschedule of a confirmed booking asks the contact again, overlaps get the
 * API's structured 409.
 */
export interface FakeBackend {
  calendar: Calendar;
  appointments: Appointment[];
  requests: Array<{ method: string; path: string; body: unknown }>;
  /** Local YYYY-MM-DD + HH:MM on the calendar, as an ISO instant. */
  at: (date: string, hhmm: string) => string;
}

const ACTIVE = ['held', 'scheduled', 'confirmed'];

export function fakeSchedulingBackend(timeZone = 'America/Mexico_City'): FakeBackend {
  const calendar: Calendar = {
    id: 'cal-1',
    organization_id: 'org-1',
    name: 'Consultas',
    type: 'appointments',
    color: '#2563EB',
    is_active: true,
    payment_service_id: null,
    system_key: 'appointments',
    work_days: [0, 1, 2, 3, 4, 5, 6],
    start_time: '09:00:00',
    end_time: '18:00:00',
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    timezone: timeZone,
    blocked_dates: [],
    created_at: '',
    updated_at: '',
  };
  const at = (date: string, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (zonedTimeToUtc(date, h * 60 + m, timeZone) as Date).toISOString();
  };
  const backend: FakeBackend = { calendar, appointments: [], requests: [], at };
  const find = (id: string) => backend.appointments.find((a) => a.id === id);
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.text();
    backend.requests.push({ method: request.method, path: url.pathname.replace('/api/v1', ''), body: text ? JSON.parse(text) : undefined });
    return text ? JSON.parse(text) : {};
  };
  const overlaps = (id: string, start: number, end: number) =>
    backend.appointments.some(
      (a) => a.id !== id && ACTIVE.includes(a.status) && start < Date.parse(a.ends_at) && end > Date.parse(a.starts_at),
    );

  server.use(
    http.get(`${API_BASE}/calendars`, () => HttpResponse.json({ data: [calendar] })),
    http.get(`${API_BASE}/automation/sequences/templates`, () => HttpResponse.json({ data: [] })),

    http.get(`${API_BASE}/appointments/metrics`, () => {
      const now = Date.now();
      return HttpResponse.json({
        data: {
          today_count: 0,
          week_count: 0,
          pending_count: backend.appointments.filter((a) => a.status === 'scheduled').length,
          completed_count: backend.appointments.filter((a) => a.status === 'completed').length,
          needs_outcome_count: backend.appointments.filter(
            (a) => ['scheduled', 'confirmed'].includes(a.status) && Date.parse(a.ends_at) < now,
          ).length,
        },
      });
    }),

    http.get(`${API_BASE}/appointments/availability`, ({ request }) => {
      const q = new URL(request.url).searchParams;
      const date = q.get('from')!;
      const duration = Number(q.get('duration_minutes') ?? 30);
      const exclude = q.get('exclude_appointment_id') ?? '';
      const slots = [];
      for (let minute = 9 * 60; minute + duration <= 18 * 60; minute += 30) {
        const start = zonedTimeToUtc(date, minute, timeZone)!.getTime();
        const end = start + duration * 60_000;
        if (!overlaps(exclude, start, end)) {
          slots.push({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() });
        }
      }
      return HttpResponse.json({ data: slots });
    }),

    http.get(`${API_BASE}/appointments`, ({ request }) => {
      const q = new URL(request.url).searchParams;
      let items = backend.appointments.filter((a) => a.calendar_id === (q.get('calendar_id') ?? a.calendar_id));
      if (q.get('from')) items = items.filter((a) => Date.parse(a.starts_at) >= Date.parse(q.get('from')!));
      if (q.get('to')) items = items.filter((a) => Date.parse(a.starts_at) <= Date.parse(q.get('to')!));
      if (q.get('needs_outcome') === 'true') {
        items = items.filter((a) => ['scheduled', 'confirmed'].includes(a.status) && Date.parse(a.ends_at) < Date.now());
      }
      const dir = q.get('sort') === 'asc' ? 1 : -1;
      items = [...items].sort((a, b) => dir * (Date.parse(a.starts_at) - Date.parse(b.starts_at)));
      const offset = Number(q.get('offset') ?? 0);
      const limit = Number(q.get('limit') ?? 50);
      return HttpResponse.json({ data: { items: items.slice(offset, offset + limit), meta: { total: items.length, limit, offset } } });
    }),

    http.post(`${API_BASE}/appointments/:id/reschedule`, async ({ request, params }) => {
      const body = (await record(request)) as { starts_at: string; duration_minutes?: number };
      const appt = find(String(params.id))!;
      const duration = body.duration_minutes ?? (Date.parse(appt.ends_at) - Date.parse(appt.starts_at)) / 60_000;
      const start = Date.parse(body.starts_at);
      if (overlaps(appt.id, start, start + duration * 60_000)) {
        return HttpResponse.json(
          { message: 'That time overlaps another booking on this calendar', errors: { code: 'SLOT_NOT_AVAILABLE', violations: ['conflict'] } },
          { status: 409 },
        );
      }
      appt.starts_at = new Date(start).toISOString();
      appt.ends_at = new Date(start + duration * 60_000).toISOString();
      if (appt.status === 'confirmed') appt.status = 'scheduled';
      return HttpResponse.json({ data: appt });
    }),

    http.patch(`${API_BASE}/appointments/:id`, async ({ request, params }) => {
      const body = (await record(request)) as Partial<Appointment>;
      Object.assign(find(String(params.id))!, body);
      return HttpResponse.json({ data: find(String(params.id)) });
    }),

    http.post(`${API_BASE}/appointments/:id/:action`, async ({ request, params }) => {
      await record(request);
      const appt = find(String(params.id))!;
      const next: Record<string, Appointment['status']> = {
        cancel: 'cancelled',
        complete: 'completed',
        'no-show': 'no_show',
        confirm: 'confirmed',
      };
      appt.status = next[String(params.action)] ?? appt.status;
      return HttpResponse.json({ data: appt });
    }),
  );
  return backend;
}

export function booking(backend: FakeBackend, id: string, start: string, minutes: number, overrides: Partial<Appointment> = {}): Appointment {
  const appt: Appointment = {
    id,
    contact_id: 'c-1',
    contact: { first_name: 'Ana', last_name: 'Pérez' },
    title: id,
    starts_at: start,
    ends_at: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
    status: 'confirmed',
    origin: 'human',
    calendar_id: backend.calendar.id,
    timezone: backend.calendar.timezone,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
  backend.appointments.push(appt);
  return appt;
}

/** Local calendar dates relative to today on the calendar wall clock. */
export function localDay(offsetDays: number, timeZone = 'America/Mexico_City'): string {
  return addDays(localDate(new Date(), timeZone), offsetDays);
}
