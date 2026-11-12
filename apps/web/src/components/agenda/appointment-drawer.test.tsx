import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgendaItem, Calendar } from '@/services/scheduling.service';
import type { SequenceTemplate } from '@/services/automation.service';
import { API_BASE, mockApi } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { createQueryWrapper } from '@/test/query';
import { AppointmentDrawer } from './appointment-drawer';

// Whole user flows (search, pick, save, refetch) through Radix in jsdom: slower than one assertion under a parallel run.
vi.setConfig({ testTimeout: 45_000 });

const { toast, currentUser } = vi.hoisted(() => ({ toast: vi.fn(), currentUser: { role: 'agent' } }));
vi.mock('@/hooks/useToast', () => ({ toast }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: currentUser }) }));

const MX = 'America/Mexico_City';

function calendar(id: string, name: string, type: string, timezone = MX, paymentServiceId: string | null = null): Calendar {
  return {
    id,
    organization_id: 'org-1',
    name,
    type,
    color: '#c8f169',
    is_active: true,
    payment_service_id: paymentServiceId,
    work_days: [1, 2, 3, 4, 5],
    start_time: '09:00',
    end_time: '18:00',
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    timezone,
    blocked_dates: [],
    created_at: '',
    updated_at: '',
  };
}

function sequenceTemplate(id: string, name: string, overrides: Partial<SequenceTemplate> = {}): SequenceTemplate {
  return {
    id,
    organization_id: 'org-1',
    name,
    sequence_type: 'no_response',
    is_active: true,
    steps: [
      { id: `${id}-s1`, template_id: id, position: 1, action: 'send_message', channel_strategy: 'auto', delay_hours: 24 },
      { id: `${id}-s2`, template_id: id, position: 2, action: 'call', channel_strategy: 'voice_only', delay_hours: 48 },
    ],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const contacts = [
  { id: 'c-1', first_name: 'Ana', last_name: 'Pérez', phone: '+5215512345678', created_at: '', updated_at: '' },
  { id: 'c-2', first_name: 'Luis', last_name: 'Gómez', created_at: '', updated_at: '' },
];

/** 09:00 and 09:30 in Mexico City on 2026-03-20. */
const SLOTS = [
  { starts_at: '2026-03-20T15:00:00.000Z', ends_at: '2026-03-20T15:30:00.000Z' },
  { starts_at: '2026-03-20T15:30:00.000Z', ends_at: '2026-03-20T16:00:00.000Z' },
];

function serveAgendaData(templates: SequenceTemplate[] = []) {
  mockApi('get', '/calendars', {
    data: [
      calendar('cal-appt', 'Consultations', 'appointments'),
      calendar('cal-fu', 'Follow-ups', 'follow_up', 'UTC'),
      calendar('cal-paid', 'Paid consultations', 'appointments', MX, 'svc-1'),
    ],
  });
  mockApi('get', '/automation/sequences/templates', { data: templates });
  const availability: URL[] = [];
  server.use(
    http.get(`${API_BASE}/appointments/availability`, ({ request }) => {
      availability.push(new URL(request.url));
      return HttpResponse.json({ data: SLOTS });
    }),
    http.get(`${API_BASE}/contacts`, ({ request }) => {
      const search = new URL(request.url).searchParams.get('search') ?? '';
      const items = contacts.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()));
      return HttpResponse.json({ data: { items, meta: { total: items.length, page: 1, limit: 20, total_pages: 1 } } });
    }),
  );
  return { availability };
}

function renderDrawer(props: { appointment?: AgendaItem | null; calendarId?: string | null; initialStart?: string | null } = {}) {
  const onClose = vi.fn();
  const { wrapper } = createQueryWrapper();
  render(<AppointmentDrawer open onClose={onClose} {...props} />, { wrapper });
  return { onClose, user: userEvent.setup() };
}

/** The control rendered under a form label (labels are not linked via htmlFor). */
function field(label: string) {
  return screen.getByText(label).closest('div')!;
}

const contactPicker = () => within(field('Contact *')).getByRole('combobox');

async function pickContact(user: ReturnType<typeof userEvent.setup>, search: string, name: string) {
  await user.click(contactPicker());
  await user.type(screen.getByPlaceholderText('Search contact...'), search);
  await waitFor(() => {
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(name);
  });
  await user.click(screen.getByRole('option'));
}

async function pickOption(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, option: string) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));
}

async function pickFreeTime(user: ReturnType<typeof userEvent.setup>, label: string) {
  const list = await screen.findByRole('radiogroup', { name: 'Free times' });
  await user.click(within(list).getByRole('radio', { name: label }));
}

async function fillBooking(user: ReturnType<typeof userEvent.setup>) {
  await pickContact(user, 'ana', 'Ana Pérez');
  await user.type(within(field('Title *')).getByRole('textbox'), 'Initial consultation');
  await pickFreeTime(user, '09:00');
}

beforeEach(() => {
  toast.mockReset();
  currentUser.role = 'agent';
});

describe('AppointmentDrawer', () => {
  describe('booking', () => {
    it('books a free time shown on the calendar wall clock', async () => {
      const { availability } = serveAgendaData();
      const created = mockApi('post', '/appointments', { data: { id: 'apt-1' } });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-appt' });

      expect(await screen.findByText(/Times in America\/Mexico_City\./)).toBeInTheDocument();
      await pickContact(user, 'ana', 'Ana Pérez');
      await user.type(within(field('Title *')).getByRole('textbox'), 'Initial consultation');
      await pickOption(user, within(field('Duration')).getByRole('combobox'), '45 min');
      await pickFreeTime(user, '09:30');
      await user.click(screen.getByRole('button', { name: 'Create appointment' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(created[0].body).toEqual({
        contact_id: 'c-1',
        title: 'Initial consultation',
        description: '',
        starts_at: '2026-03-20T15:30:00.000Z',
        duration_minutes: 45,
        calendar_id: 'cal-appt',
      });
      expect(availability.at(-1)?.searchParams.get('duration_minutes')).toBe('45');
      expect(availability.at(-1)?.searchParams.get('calendar_id')).toBe('cal-appt');
      expect(toast).toHaveBeenCalledWith({ title: 'Appointment created' });
    });

    it('reads a manually entered time in the calendar time zone', async () => {
      serveAgendaData();
      const created = mockApi('post', '/appointments', { data: { id: 'apt-1' } });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-appt' });

      await pickContact(user, 'ana', 'Ana Pérez');
      await user.type(within(field('Title *')).getByRole('textbox'), 'Walk-in');
      await user.click(screen.getByRole('button', { name: 'Enter a time manually' }));
      fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: '2026-03-20T12:15' } });
      await user.click(screen.getByRole('button', { name: 'Create appointment' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(created[0].body).toMatchObject({ starts_at: '2026-03-20T18:15:00.000Z' });
    });

    it('starts from the time clicked on the week grid', async () => {
      serveAgendaData();
      const created = mockApi('post', '/appointments', { data: { id: 'apt-1' } });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-appt', initialStart: '2026-03-20T15:00:00.000Z' });

      await pickContact(user, 'ana', 'Ana Pérez');
      await user.type(within(field('Title *')).getByRole('textbox'), 'Initial consultation');
      const list = await screen.findByRole('radiogroup', { name: 'Free times' });
      expect(within(list).getByRole('radio', { name: '09:00' })).toHaveAttribute('aria-checked', 'true');
      await user.click(screen.getByRole('button', { name: 'Create appointment' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(created[0].body).toMatchObject({ starts_at: '2026-03-20T15:00:00.000Z' });
    });

    it('does not submit without a contact or a time', async () => {
      serveAgendaData();
      const created = mockApi('post', '/appointments', { data: { id: 'apt-1' } });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-appt' });

      await user.type(within(field('Title *')).getByRole('textbox'), 'Initial consultation');
      expect(screen.getByRole('button', { name: 'Create appointment' })).toBeDisabled();
      await pickFreeTime(user, '09:00');
      await user.click(screen.getByRole('button', { name: 'Create appointment' }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(created).toHaveLength(0);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('follow-up calendars', () => {
    it('starts a sequence from a runnable template instead of a single step', async () => {
      serveAgendaData([
        sequenceTemplate('tpl-off', 'Paused cadence', { is_active: false }),
        sequenceTemplate('tpl-empty', 'Empty cadence', { steps: [] }),
        sequenceTemplate('tpl-1', 'Lead went quiet'),
      ]);
      const started = mockApi('post', '/automation/sequences', { data: { id: 'seq-1' } });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-appt' });

      expect(screen.queryByLabelText('Start automatic sequence')).not.toBeInTheDocument();
      await screen.findByText('Calendar');
      await pickOption(user, within(field('Calendar')).getByRole('combobox'), 'Follow-ups');
      expect(screen.getByText('Action *')).toBeInTheDocument();

      await user.click(screen.getByLabelText('Start automatic sequence'));

      expect(screen.queryByText('Action *')).not.toBeInTheDocument();
      expect(within(field('Title')).getByRole('textbox')).toHaveAttribute('placeholder', 'Defined by the sequence');
      const templatePicker = within(field('Sequence')).getByRole('combobox');
      await waitFor(() => expect(templatePicker).toHaveTextContent('Lead went quiet'));
      await user.click(templatePicker);
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Lead went quiet· No response']);
      await user.keyboard('{Escape}');
      expect(screen.getByText('Cadence (2 steps)')).toBeInTheDocument();

      await pickContact(user, 'luis', 'Luis Gómez');
      fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: '2026-03-20T15:00' } });
      await user.click(screen.getByRole('button', { name: 'Start sequence' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(started[0].body).toEqual({
        contact_id: 'c-2',
        template_id: 'tpl-1',
        sequence_type: 'no_response',
        source: 'manual',
        due_at: '2026-03-20T15:00:00.000Z',
      });
      expect(toast).toHaveBeenCalledWith({ title: 'Sequence started' });
    });

    it('schedules one step on the follow-up endpoint, for a person when chosen', async () => {
      serveAgendaData();
      const created = mockApi('post', '/automation/follow-ups', { data: { id: 'fu-1' } });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-fu' });

      await pickContact(user, 'ana', 'Ana Pérez');
      await pickOption(user, within(field('Action *')).getByRole('combobox'), 'Call');
      await pickOption(user, within(field('Executor')).getByRole('combobox'), 'A person (task)');
      fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: '2026-03-20T16:00' } });
      await user.click(screen.getByRole('button', { name: 'Schedule follow-up' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(created[0].body).toEqual({
        contact_id: 'c-1',
        calendar_id: 'cal-fu',
        action: 'call',
        executor: 'user',
        due_at: '2026-03-20T16:00:00.000Z',
      });
      expect(toast).toHaveBeenCalledWith({ title: 'Follow-up scheduled' });
    });

    it('blocks starting a sequence when no template has steps', async () => {
      serveAgendaData([sequenceTemplate('tpl-empty', 'Empty cadence', { steps: [] })]);
      const { user } = renderDrawer({ calendarId: 'cal-fu' });

      await user.click(await screen.findByLabelText('Start automatic sequence'));

      expect(screen.getByText(/no sequences with configured steps/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start sequence' })).toBeDisabled();
    });

    it('shows the API reason when the contact already has an active sequence', async () => {
      serveAgendaData([sequenceTemplate('tpl-1', 'Lead went quiet')]);
      mockApi('post', '/automation/sequences', { status: 409, message: 'Contact already has an active sequence' });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-fu' });

      await user.click(await screen.findByLabelText('Start automatic sequence'));
      await pickContact(user, 'ana', 'Ana Pérez');
      fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: '2026-03-20T15:00' } });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Start sequence' })).toBeEnabled());
      await user.click(screen.getByRole('button', { name: 'Start sequence' }));

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith({ title: 'Contact already has an active sequence', variant: 'error' }),
      );
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('editing', () => {
    const booking = (minutes: number): AgendaItem => ({
      kind: 'booking',
      id: 'apt-1',
      contact_id: 'c-1',
      contact: { first_name: 'Ana', last_name: 'Pérez' },
      title: 'Initial consultation',
      description: 'Bring X-rays',
      starts_at: '2026-03-20T15:00:00.000Z',
      ends_at: new Date(new Date('2026-03-20T15:00:00.000Z').getTime() + minutes * 60_000).toISOString(),
      status: 'scheduled',
      origin: 'ai',
      calendar_id: 'cal-appt',
      timezone: MX,
      created_at: '',
      updated_at: '',
    });

    it('saves only the fields that changed and keeps an unusual duration', async () => {
      const { availability } = serveAgendaData();
      const updated = mockApi('patch', '/appointments/apt-1', { data: { id: 'apt-1' } });
      const rescheduled = mockApi('post', '/appointments/apt-1/reschedule', { data: { id: 'apt-1' } });
      const { user, onClose } = renderDrawer({ appointment: booking(50) });

      expect(screen.getByText('Edit appointment')).toBeInTheDocument();
      expect(contactPicker()).toHaveTextContent('Ana Pérez');
      expect(within(field('Duration')).getByRole('combobox')).toHaveTextContent('50 min');
      expect(screen.queryByText('Calendar')).not.toBeInTheDocument();
      expect(field('Origin')).toHaveTextContent('ai');
      await waitFor(() => expect(availability.at(-1)?.searchParams.get('exclude_appointment_id')).toBe('apt-1'));

      const title = within(field('Title *')).getByRole('textbox');
      await user.clear(title);
      await user.type(title, 'Follow-up consultation');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(updated[0].body).toEqual({ title: 'Follow-up consultation' });
      expect(rescheduled).toHaveLength(0);
      expect(toast).toHaveBeenCalledWith({ title: 'Appointment updated' });
    });

    it('moves the booking through reschedule when another free time is picked', async () => {
      serveAgendaData();
      const updated = mockApi('patch', '/appointments/apt-1', { data: { id: 'apt-1' } });
      const rescheduled = mockApi('post', '/appointments/apt-1/reschedule', { data: { id: 'apt-1' } });
      const { user, onClose } = renderDrawer({ appointment: booking(30) });

      await pickFreeTime(user, '09:30');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(rescheduled[0].body).toEqual({ starts_at: '2026-03-20T15:30:00.000Z', duration_minutes: 30 });
      expect(updated).toHaveLength(0);
      expect(toast).toHaveBeenCalledWith({ title: 'Appointment rescheduled' });
    });

    it('edits a follow-up step on the follow-up endpoint', async () => {
      serveAgendaData();
      const updated = mockApi('patch', '/automation/follow-ups/fu-1', { data: { id: 'fu-1' } });
      const step: AgendaItem = {
        ...booking(15),
        kind: 'step',
        id: 'fu-1',
        title: 'Follow-up: Call',
        status: 'awaiting_user',
        origin: 'automation',
        calendar_id: 'cal-fu',
        timezone: 'UTC',
        action: 'call',
        executor: 'user',
      };
      const { user, onClose } = renderDrawer({ appointment: step });

      expect(screen.getByText('Edit follow-up')).toBeInTheDocument();
      expect(screen.getByText('A person (task)')).toBeInTheDocument();
      fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: '2026-03-21T10:00' } });
      await user.type(within(field('Message (optional)')).getByRole('textbox'), 'Ask about the quote');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(updated[0].body).toEqual({ message_content: 'Ask about the quote', due_at: '2026-03-21T10:00:00.000Z' });
    });
  });

  describe('unavailable times', () => {
    const slotTaken = {
      status: 409,
      message: 'That time overlaps another booking on this calendar',
      errors: { code: 'SLOT_NOT_AVAILABLE', violations: ['conflict', 'too_soon'] },
    };

    it('tells staff why the time is not available and offers no override', async () => {
      serveAgendaData();
      mockApi('post', '/appointments', slotTaken);
      const { user, onClose } = renderDrawer({ calendarId: 'cal-appt' });

      await fillBooking(user);
      await user.click(screen.getByRole('button', { name: 'Create appointment' }));

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith({
          title: 'That time is not available: overlaps another booking, too soon (minimum notice)',
          variant: 'error',
        }),
      );
      expect(screen.queryByText('Reason to book anyway *')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('lets an admin book anyway with a reason', async () => {
      currentUser.role = 'admin';
      serveAgendaData();
      const attempts = mockApi('post', '/appointments', slotTaken);
      const { user, onClose } = renderDrawer({ calendarId: 'cal-appt' });

      await fillBooking(user);
      await user.click(screen.getByRole('button', { name: 'Create appointment' }));
      await screen.findByText('Reason to book anyway *');
      expect(screen.getByRole('button', { name: 'Book anyway' })).toBeDisabled();

      const accepted = mockApi('post', '/appointments', { data: { id: 'apt-2' } });
      await user.type(within(field('Reason to book anyway *')).getByRole('textbox'), 'VIP patient');
      await user.click(screen.getByRole('button', { name: 'Book anyway' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(attempts).toHaveLength(1);
      expect(accepted[0].body).toMatchObject({ calendar_id: 'cal-appt', override: { reason: 'VIP patient' } });
    });
  });

  describe('calendars that charge', () => {
    it('sends a payment link that holds the slot by default', async () => {
      serveAgendaData();
      const links = mockApi('post', '/payments', { data: { url: 'https://pay.test/abc', payment_id: 'p-1' } });
      const created = mockApi('post', '/appointments', { data: { id: 'apt-1' } });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-paid' });

      await fillBooking(user);
      await user.click(screen.getByRole('button', { name: 'Send payment link' }));

      await waitFor(() => expect(screen.getByDisplayValue('https://pay.test/abc')).toBeInTheDocument());
      expect(links[0].body).toEqual({
        contact_id: 'c-1',
        service_id: 'svc-1',
        booking: { calendar_id: 'cal-paid', title: 'Initial consultation', starts_at: '2026-03-20T15:00:00.000Z', duration_minutes: 30 },
      });
      expect(created).toHaveLength(0);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('can book without charge, which is recorded', async () => {
      serveAgendaData();
      const created = mockApi('post', '/appointments', { data: { id: 'apt-1' } });
      const { user, onClose } = renderDrawer({ calendarId: 'cal-paid' });

      await fillBooking(user);
      await user.click(screen.getByLabelText('Book without charge'));
      await user.click(screen.getByRole('button', { name: 'Create appointment' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(created[0].body).toMatchObject({ calendar_id: 'cal-paid', waive_payment: true });
    });
  });
});
