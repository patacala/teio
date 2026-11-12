import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Calendar } from '@/services/scheduling.service';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { CalendarManagerDrawer } from './calendar-manager-drawer';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ toast }));

const cal = (id: string, name: string): Calendar => ({
  id,
  organization_id: 'org-1',
  name,
  type: 'appointments',
  color: '#2563EB',
  is_active: true,
  payment_service_id: null,
  work_days: [1, 2, 3, 4, 5],
  start_time: '09:00',
  end_time: '18:00',
  slot_duration_minutes: 30,
  buffer_minutes: 0,
  timezone: 'America/Mexico_City',
  blocked_dates: [],
  created_at: '',
  updated_at: '',
});

beforeEach(() => {
  toast.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('CalendarManagerDrawer deletion', () => {
  it('asks where to move past appointments when the API requires it', async () => {
    mockApi('get', '/calendars', { data: [cal('cal-1', 'Room 1'), cal('cal-2', 'Room 2')] });
    const first = mockApi('delete', '/calendars/cal-2', {
      status: 409,
      message: 'Elige a qué calendario mover las 3 cita(s) anteriores',
      errors: { code: 'CALENDAR_MOVE_TARGET_REQUIRED', count: 3 },
    });
    const { wrapper } = createQueryWrapper();
    render(<CalendarManagerDrawer open onClose={vi.fn()} />, { wrapper });
    const user = userEvent.setup();

    const deleteButtons = await screen.findAllByTitle('Delete calendar');
    await user.click(deleteButtons[1]);
    expect(window.confirm).toHaveBeenCalledWith('Delete calendar "Room 2"?');
    await screen.findByText(/has 3 past appointment\(s\)/);
    expect(first).toHaveLength(1);

    const moved = mockApi('delete', '/calendars/cal-2', { status: 204 });
    await user.click(screen.getByRole('button', { name: 'Move and delete' }));
    await waitFor(() => expect(moved).toHaveLength(1));
    expect(moved[0].url.searchParams.get('move_to')).toBe('cal-1');
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: '"Room 2" deleted' }));
  });

  it('shows why a calendar with upcoming bookings cannot be deleted', async () => {
    mockApi('get', '/calendars', { data: [cal('cal-1', 'Room 1'), cal('cal-2', 'Room 2')] });
    mockApi('delete', '/calendars/cal-2', {
      status: 409,
      message: 'Este calendario tiene 2 cita(s) próximas; cancélalas o muévelas antes de eliminarlo',
      errors: { code: 'CALENDAR_HAS_UPCOMING_BOOKINGS', count: 2 },
    });
    const { wrapper } = createQueryWrapper();
    render(<CalendarManagerDrawer open onClose={vi.fn()} />, { wrapper });

    await userEvent.setup().click((await screen.findAllByTitle('Delete calendar'))[1]);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Este calendario tiene 2 cita(s) próximas; cancélalas o muévelas antes de eliminarlo',
        variant: 'error',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Move and delete' })).not.toBeInTheDocument();
  });
});

describe('CalendarManagerDrawer settings', () => {
  it('saves identity, rules, staff member and reminders in one call', async () => {
    const calendarRow = { ...cal('cal-1', 'Room 1'), reminder_offsets_minutes: [1440, 120], min_notice_minutes: 0, max_advance_days: null, owner_user_id: null };
    mockApi('get', '/calendars', { data: [calendarRow] });
    mockApi('get', '/calendars/cal-1', { data: calendarRow });
    mockApi('get', '/payments/services', { data: [] });
    mockApi('get', '/users', {
      data: [{ id: 'u-1', organization_id: 'org-1', email: 'ruiz@x.test', full_name: 'Dra. Ruiz', role: 'agent', is_active: true, created_at: '', updated_at: '' }],
    });
    const saved = mockApi('put', '/calendars/cal-1/config', { data: calendarRow });
    const patched = mockApi('patch', '/calendars/cal-1', { data: calendarRow });
    const { wrapper } = createQueryWrapper();
    render(<CalendarManagerDrawer open onClose={vi.fn()} defaultCalendarId="cal-1" />, { wrapper });
    const user = userEvent.setup();

    const name = await screen.findByLabelText('Name');
    await waitFor(() => expect(name).toHaveValue('Room 1'));
    await user.clear(name);
    await user.type(name, 'Dra. Ruiz');
    const zone = screen.getByLabelText('Time zone');
    await user.clear(zone);
    await user.type(zone, 'America/Bogota');
    await user.type(screen.getByLabelText('Book up to (days ahead)'), '30');
    const contactDays = screen.getByLabelText('Contacts can move their booking up to (days ahead)');
    expect(contactDays).toHaveValue(14);
    await user.clear(contactDays);
    await user.type(contactDays, '21');
    await user.click(screen.getByLabelText('2 hours before'));
    await user.click(screen.getByLabelText('1 hour before'));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].body).toMatchObject({
      name: 'Dra. Ruiz',
      timezone: 'America/Bogota',
      max_advance_days: 30,
      contact_reschedule_days: 21,
      min_notice_minutes: 0,
      owner_user_id: null,
      reminder_offsets_minutes: [1440, 60],
      payment_service_id: null,
    });
    expect(patched).toHaveLength(0);
  });

  it('does not let an unknown time zone be saved', async () => {
    const calendarRow = { ...cal('cal-1', 'Room 1') };
    mockApi('get', '/calendars', { data: [calendarRow] });
    mockApi('get', '/calendars/cal-1', { data: calendarRow });
    mockApi('get', '/payments/services', { data: [] });
    mockApi('get', '/users', { data: [] });
    const { wrapper } = createQueryWrapper();
    render(<CalendarManagerDrawer open onClose={vi.fn()} defaultCalendarId="cal-1" />, { wrapper });
    const user = userEvent.setup();

    const zone = await screen.findByLabelText('Time zone');
    await waitFor(() => expect(zone).toHaveValue('America/Mexico_City'));
    await user.clear(zone);
    await user.type(zone, 'Mexico City');
    expect(screen.getByText('Pick a time zone from the list.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
