import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryWrapper } from '@/test/query';
import { booking, fakeSchedulingBackend, localDay, type FakeBackend } from '@/test/fixtures/fake-scheduling-backend';
import { addDays, weekdayOf } from '@/lib/timezone';
import SchedulePage from './page';

// Whole user flows (search, pick, save, refetch) through Radix in jsdom: slower than one assertion under a parallel run.
vi.setConfig({ testTimeout: 45_000 });

const { toast, currentUser } = vi.hoisted(() => ({ toast: vi.fn(), currentUser: { role: 'admin' } }));
vi.mock('@/hooks/useToast', () => ({ toast }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: currentUser }), useTeamMembers: () => ({ data: [] }) }));

const TZ = 'America/Mexico_City';

function renderPage() {
  const { wrapper } = createQueryWrapper();
  render(<SchedulePage />, { wrapper });
  return userEvent.setup();
}

/** The table row of an appointment, found by its title. */
async function row(title: string) {
  return (await screen.findByText(title, { selector: 'td' })).closest('tr')!;
}

function dateLabel(date: string, time: string) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y} ${time}`;
}

let backend: FakeBackend;

beforeEach(() => {
  toast.mockReset();
  backend = fakeSchedulingBackend(TZ);
});

describe('Schedule page flows', () => {
  it('reschedules an appointment from the list by picking a free time', async () => {
    const day = localDay(2);
    booking(backend, 'apt-ana', backend.at(day, '10:00'), 30, { title: 'Consulta Ana' });
    booking(backend, 'apt-luis', backend.at(day, '12:00'), 30, { title: 'Consulta Luis' });
    const user = renderPage();

    const before = await row('Consulta Ana');
    expect(within(before).getByText(dateLabel(day, '10:00'))).toBeInTheDocument();
    expect(within(before).getByText('Confirmed')).toBeInTheDocument();
    await user.click(within(before).getByTitle('Edit'));

    const times = await screen.findByRole('radiogroup', { name: 'Free times' });
    // Luis holds 12:00; Ana's own 10:00 is free to move around.
    expect(within(times).queryByRole('radio', { name: '12:00' })).not.toBeInTheDocument();
    await user.click(within(times).getByRole('radio', { name: '11:30' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Appointment rescheduled' }));
    expect(backend.requests).toContainEqual({
      method: 'POST',
      path: '/appointments/apt-ana/reschedule',
      body: { starts_at: backend.at(day, '11:30'), duration_minutes: 30 },
    });
    const after = await row('Consulta Ana');
    await waitFor(() => expect(within(after).getByText(dateLabel(day, '11:30'))).toBeInTheDocument());
    // A staff reschedule asks the contact to confirm the new time.
    expect(within(after).getByText('Awaiting confirmation')).toBeInTheDocument();
    expect(within(after).getByTitle('Resend confirmation link')).toBeInTheDocument();
  });

  it('reschedules from the week view and the booking moves on the grid', async () => {
    const today = localDay(0);
    const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
    const day = addDays(monday, 2);
    booking(backend, 'Revisión', backend.at(day, '10:00'), 60);
    const user = renderPage();

    await screen.findByText('Revisión', { selector: 'td' });
    await user.click(screen.getByRole('button', { name: 'Week' }));
    const block = await within(await screen.findByTestId(`day-${day}`)).findByTitle('Revisión');
    expect(block.style.top).toBe(`${10 * 48 + 40}px`);

    await user.click(block);
    const times = await screen.findByRole('radiogroup', { name: 'Free times' });
    await user.click(within(times).getByRole('radio', { name: '14:00' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Appointment rescheduled' }));
    await waitFor(async () =>
      expect((await within(screen.getByTestId(`day-${day}`)).findByTitle('Revisión')).style.top).toBe(`${14 * 48 + 40}px`),
    );
  });

  it('shows the API refusal when a typed time overlaps another booking', async () => {
    const day = localDay(2);
    booking(backend, 'Consulta Ana', backend.at(day, '10:00'), 30);
    booking(backend, 'Consulta Luis', backend.at(day, '12:00'), 30);
    currentUser.role = 'agent';
    const user = renderPage();

    await user.click(within(await row('Consulta Ana')).getByTitle('Edit'));
    await user.click(await screen.findByRole('button', { name: 'Enter a time manually' }));
    const input = screen.getByText('Date & time *').closest('div')!.querySelector('input')!;
    await user.clear(input);
    await user.type(input, `${day}T12:00`);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'That time is not available: overlaps another booking', variant: 'error' }),
    );
    expect(backend.appointments.find((a) => a.id === 'Consulta Ana')?.starts_at).toBe(backend.at(day, '10:00'));
    currentUser.role = 'admin';
  });

  it('cancels after confirming, and the row keeps only the actions that still apply', async () => {
    booking(backend, 'Consulta Ana', backend.at(localDay(3), '10:00'), 30);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = renderPage();

    await user.click(within(await row('Consulta Ana')).getByTitle('Cancel'));
    expect(window.confirm).toHaveBeenCalledWith('Cancel this appointment? The contact will be notified.');
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Appointment cancelled' }));
    await waitFor(async () => expect(within(await row('Consulta Ana')).getByText('Cancelled')).toBeInTheDocument());
    const buttons = within(await row('Consulta Ana')).getAllByRole('button').map((b) => b.getAttribute('title'));
    expect(buttons).toEqual(['Edit', 'Delete']);
  });

  it('filters bookings that need an outcome and closes one', async () => {
    booking(backend, 'Ayer', backend.at(localDay(-1), '10:00'), 30);
    booking(backend, 'Mañana', backend.at(localDay(1), '10:00'), 30);
    const user = renderPage();

    const chip = await screen.findByRole('button', { name: /Needs outcome \(1\)/ });
    await user.click(chip);
    await waitFor(() => expect(screen.queryByText('Mañana', { selector: 'td' })).not.toBeInTheDocument());
    const ayer = await row('Ayer');
    expect(within(ayer).getByText('Needs outcome')).toBeInTheDocument();

    await user.click(within(ayer).getByTitle('Complete'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Appointment marked as completed' }));
    await screen.findByRole('button', { name: /Needs outcome \(0\)/ });
    await screen.findByText('No appointments scheduled');
  });
});
