import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AgendaItem } from '@/services/scheduling.service';
import { AppointmentsTable } from './appointments-table';

const HOUR = 3_600_000;

function appt(id: string, overrides: Partial<AgendaItem>): AgendaItem {
  const start = Date.now() + 24 * HOUR;
  return {
    kind: 'booking',
    id,
    contact_id: 'c-1',
    contact: { first_name: 'Ana', last_name: 'Pérez' },
    title: id,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + HOUR / 2).toISOString(),
    status: 'scheduled',
    origin: 'human',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function renderTable(appointments: AgendaItem[], canDelete = false) {
  const handlers = {
    onEdit: vi.fn(),
    onComplete: vi.fn(),
    onDelete: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onNoShow: vi.fn(),
    onResend: vi.fn(),
  };
  render(
    <AppointmentsTable
      appointments={appointments}
      timeZone="America/Mexico_City"
      isLoading={false}
      page={1}
      pageSize={25}
      total={appointments.length}
      onPageChange={vi.fn()}
      canDelete={canDelete}
      {...handlers}
    />,
  );
  return handlers;
}

const row = (title: string) => screen.getByText(title, { selector: 'td' }).closest('tr')!;
const buttons = (title: string) => within(row(title)).getAllByRole('button').map((b) => b.getAttribute('title'));

describe('AppointmentsTable actions', () => {
  it('offers only the actions the booking status allows', () => {
    const past = { starts_at: new Date(Date.now() - 2 * HOUR).toISOString(), ends_at: new Date(Date.now() - HOUR).toISOString() };
    renderTable([
      appt('upcoming-unconfirmed', {}),
      appt('upcoming-confirmed', { status: 'confirmed' }),
      appt('awaiting-payment', { status: 'held' }),
      appt('ended-open', { status: 'confirmed', ...past }),
      appt('cancelled', { status: 'cancelled' }),
    ]);

    expect(buttons('upcoming-unconfirmed')).toEqual(['Edit', 'Confirm for the contact', 'Resend confirmation link', 'Cancel']);
    expect(buttons('upcoming-confirmed')).toEqual(['Edit', 'Cancel']);
    expect(buttons('awaiting-payment')).toEqual(['Edit', 'Cancel']);
    expect(buttons('ended-open')).toEqual(['Edit', 'Complete', 'No-show', 'Cancel']);
    expect(buttons('cancelled')).toEqual(['Edit']);
    expect(within(row('ended-open')).getByText('Needs outcome')).toBeInTheDocument();
    expect(within(row('upcoming-unconfirmed')).getByText('Awaiting confirmation')).toBeInTheDocument();
    expect(within(row('awaiting-payment')).getByText('Awaiting payment')).toBeInTheDocument();
  });

  it('lets only admins delete, and never an upcoming booking', () => {
    renderTable([appt('upcoming', {}), appt('cancelled', { status: 'cancelled' })], true);
    expect(buttons('upcoming')).not.toContain('Delete');
    expect(buttons('cancelled')).toContain('Delete');
  });

  it('cancels after asking, since the contact is notified', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onCancel } = renderTable([appt('upcoming', {})]);
    await userEvent.setup().click(within(row('upcoming')).getByTitle('Cancel'));
    expect(window.confirm).toHaveBeenCalledWith('Cancel this appointment? The contact will be notified.');
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'upcoming' }));
  });

  it('treats follow-up steps as skippable tasks', () => {
    renderTable([
      appt('step', { kind: 'step', status: 'awaiting_user', action: 'call', origin: 'automation' }),
      appt('done-step', { kind: 'step', status: 'completed', action: 'send_message', origin: 'automation' }),
    ]);
    expect(buttons('step')).toEqual(['Edit', 'Mark done', 'Skip step', 'Delete']);
    expect(within(row('step')).getByText('Your turn')).toBeInTheDocument();
    expect(buttons('done-step')).toEqual(['Edit', 'Delete']);
  });

  it('shows times on the calendar wall clock', () => {
    renderTable([appt('mx', { starts_at: '2026-03-23T15:00:00.000Z', ends_at: '2026-03-23T15:30:00.000Z' })]);
    expect(within(row('mx')).getByText('23/03/2026 09:00')).toBeInTheDocument();
  });
});
