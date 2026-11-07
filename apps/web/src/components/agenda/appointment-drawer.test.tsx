import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment, Calendar } from '@/services/scheduling.service';
import type { SequenceTemplate } from '@/services/automation.service';
import { API_BASE, mockApi } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { createQueryWrapper } from '@/test/query';
import { AppointmentDrawer } from './appointment-drawer';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ toast }));

function calendar(id: string, name: string, type: string): Calendar {
  return {
    id,
    organization_id: 'org-1',
    name,
    type,
    color: '#c8f169',
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

function serveAgendaData(templates: SequenceTemplate[] = []) {
  mockApi('get', '/calendars', {
    data: [calendar('cal-appt', 'Consultations', 'appointments'), calendar('cal-fu', 'Follow-ups', 'follow_up')],
  });
  mockApi('get', '/automation/sequences/templates', { data: templates });
  const searches: string[] = [];
  server.use(
    http.get(`${API_BASE}/contacts`, ({ request }) => {
      const search = new URL(request.url).searchParams.get('search') ?? '';
      searches.push(search);
      const items = contacts.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()));
      return HttpResponse.json({ data: { items, meta: { total: items.length, page: 1, limit: 20, total_pages: 1 } } });
    }),
  );
  return { searches };
}

function renderDrawer(props: { appointment?: Appointment | null; calendarId?: string | null } = {}) {
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

/** Searches like a user would: waits for the debounced results to settle before picking. */
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

const startTime = '2026-03-20T15:00';
const startIso = new Date(startTime).toISOString();

beforeEach(() => {
  toast.mockReset();
});

describe('AppointmentDrawer', () => {
  it('creates an appointment for a contact found by search', async () => {
    const { searches } = serveAgendaData();
    const created = mockApi('post', '/appointments', { data: { id: 'apt-1' } });
    const { user, onClose } = renderDrawer({ calendarId: 'cal-appt' });

    await pickContact(user, 'ana', 'Ana Pérez');
    expect(contactPicker()).toHaveTextContent('Ana Pérez');
    expect(searches).toContain('ana');

    await user.type(within(field('Title *')).getByRole('textbox'), 'Initial consultation');
    fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: startTime } });
    await pickOption(user, within(field('Duration')).getByRole('combobox'), '45 min');
    await user.click(screen.getByRole('button', { name: 'Create appointment' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(created[0].body).toEqual({
      contact_id: 'c-1',
      title: 'Initial consultation',
      description: '',
      starts_at: startIso,
      duration_minutes: 45,
      origin: 'human',
      calendar_id: 'cal-appt',
    });
    expect(toast).toHaveBeenCalledWith({ title: 'Appointment created' });
  });

  it('does not submit without a contact', async () => {
    serveAgendaData();
    const created = mockApi('post', '/appointments', { data: { id: 'apt-1' } });
    const { user, onClose } = renderDrawer();

    await user.type(within(field('Title *')).getByRole('textbox'), 'Initial consultation');
    fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: startTime } });
    await user.click(screen.getByRole('button', { name: 'Create appointment' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(created).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('follow-up calendars', () => {
    it('starts a sequence from a runnable template instead of a single appointment', async () => {
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
      fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: startTime } });
      await user.click(screen.getByRole('button', { name: 'Start sequence' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(started[0].body).toEqual({
        contact_id: 'c-2',
        template_id: 'tpl-1',
        sequence_type: 'no_response',
        source: 'manual',
        due_at: startIso,
      });
      expect(toast).toHaveBeenCalledWith({ title: 'Sequence started' });
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
      fireEvent.change(field('Date & time *').querySelector('input')!, { target: { value: startTime } });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Start sequence' })).toBeEnabled());
      await user.click(screen.getByRole('button', { name: 'Start sequence' }));

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith({ title: 'Contact already has an active sequence', variant: 'error' }),
      );
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('edits an existing appointment', async () => {
    serveAgendaData();
    const updated = mockApi('patch', '/appointments/apt-1', { data: { id: 'apt-1' } });
    const appointment: Appointment = {
      id: 'apt-1',
      contact_id: 'c-1',
      contact: { first_name: 'Ana', last_name: 'Pérez' },
      title: 'Initial consultation',
      description: 'Bring X-rays',
      starts_at: startIso,
      ends_at: new Date(new Date(startIso).getTime() + 60 * 60_000).toISOString(),
      status: 'scheduled',
      origin: 'ai',
      calendar_id: 'cal-appt',
      created_at: '',
      updated_at: '',
    };
    const { user, onClose } = renderDrawer({ appointment });

    expect(screen.getByText('Edit appointment')).toBeInTheDocument();
    expect(contactPicker()).toHaveTextContent('Ana Pérez');
    expect(field('Date & time *').querySelector('input')).toHaveValue(startTime);
    expect(within(field('Duration')).getByRole('combobox')).toHaveTextContent('60 min');
    expect(field('Origin')).toHaveTextContent('ai');

    const title = within(field('Title *')).getByRole('textbox');
    await user.clear(title);
    await user.type(title, 'Follow-up consultation');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updated[0].body).toEqual({
      title: 'Follow-up consultation',
      description: 'Bring X-rays',
      starts_at: startIso,
      duration_minutes: 60,
    });
    expect(toast).toHaveBeenCalledWith({ title: 'Appointment updated' });
  });
});
