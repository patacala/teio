/**
 * End to end: the real schedule page against the real scheduling API and
 * PostgreSQL (apps/api/test/e2e/scheduling-e2e-server.cjs). Every API call the
 * page makes is forwarded to that server. Skipped unless E2E_API_URL and
 * E2E_STATE_FILE are set.
 */
import { readFileSync } from 'fs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bypass, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { createQueryWrapper } from '@/test/query';
import { zonedTimeToUtc } from '@/lib/timezone';
import SchedulePage from './page';

// Whole user flows (search, pick, save, refetch) through Radix in jsdom: slower than one assertion under a parallel run.
vi.setConfig({ testTimeout: 45_000 });

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ toast }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: { role: 'admin' } }), useTeamMembers: () => ({ data: [] }) }));

const API = process.env.E2E_API_URL;
const STATE_FILE = process.env.E2E_STATE_FILE;
const describeE2E = API && STATE_FILE ? describe : describe.skip;

interface E2EState {
  apiUrl: string;
  day: string;
  timezone: string;
  appointments: { ana: string; luis: string };
}

/** Talks to the real API directly (outside the page), e.g. to check what was stored. */
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(bypass(`${API}${path}`, { ...init, headers: { authorization: 'Bearer e2e', 'content-type': 'application/json', ...(init.headers ?? {}) } }));
  const json = (await res.json()) as { data: T };
  return json.data ?? (json as T);
}

async function row(title: string) {
  return (await screen.findByText(title, { selector: 'td' }, { timeout: 10_000 })).closest('tr')!;
}

const label = (date: string, time: string) => {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y} ${time}`;
};

describeE2E('Schedule page against the real API (e2e)', () => {
  const state = (STATE_FILE ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}) as E2EState;

  beforeEach(() => {
    toast.mockReset();
    server.use(
      http.all(`${API_BASE}/*`, async ({ request }) => {
        const target = request.url.replace(API_BASE, `${API}/api/v1`);
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
        const res = await fetch(bypass(target, { method: request.method, headers: request.headers, body }));
        return new HttpResponse(await res.arrayBuffer(), { status: res.status, headers: res.headers });
      }),
    );
  });

  function renderPage() {
    const { wrapper } = createQueryWrapper();
    render(<SchedulePage />, { wrapper });
    return userEvent.setup();
  }

  it('staff reschedules to a free time; the contact has to confirm the new time', async () => {
    const user = renderPage();
    const before = await row('Consulta Ana (e2e)');
    expect(within(before).getByText(label(state.day, '10:00'))).toBeInTheDocument();
    expect(within(before).getByText('Confirmed')).toBeInTheDocument();

    await user.click(within(before).getByTitle('Edit'));
    const times = await screen.findByRole('radiogroup', { name: 'Free times' }, { timeout: 10_000 });
    // Luis has 12:00 on the same calendar: the API does not offer it.
    await waitFor(() => expect(within(times).getByRole('radio', { name: '11:30' })).toBeInTheDocument());
    expect(within(times).queryByRole('radio', { name: '12:00' })).not.toBeInTheDocument();
    await user.click(within(times).getByRole('radio', { name: '11:30' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Appointment rescheduled' }), { timeout: 10_000 });
    const after = await row('Consulta Ana (e2e)');
    await waitFor(() => expect(within(after).getByText(label(state.day, '11:30'))).toBeInTheDocument());
    expect(within(after).getByText('Awaiting confirmation')).toBeInTheDocument();

    const stored = await api<{ status: string; confirmation_version: number; starts_at: string }>(
      `/api/v1/appointments/${state.appointments.ana}`,
    );
    expect(stored).toMatchObject({ status: 'scheduled', confirmation_version: 2 });
  });

  it('the API refuses a typed time that overlaps another booking and nothing changes', async () => {
    const user = renderPage();
    await user.click(within(await row('Consulta Ana (e2e)')).getByTitle('Edit'));
    await user.click(await screen.findByRole('button', { name: 'Enter a time manually' }));
    const input = screen.getByText('Date & time *').closest('div')!.querySelector('input')!;
    await user.clear(input);
    await user.type(input, `${state.day}T12:00`);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(
      () => expect(toast).toHaveBeenCalledWith({ title: 'That time is not available: overlaps another booking', variant: 'error' }),
      { timeout: 10_000 },
    );
    // Admins are offered to book anyway with a reason; not used here.
    expect(await screen.findByText('Reason to book anyway *')).toBeInTheDocument();
    const stored = await api<{ starts_at: string }>(`/api/v1/appointments/${state.appointments.ana}`);
    expect(new Date(stored.starts_at).toISOString()).toBe(zonedTimeToUtc(state.day, 11 * 60 + 30, state.timezone)!.toISOString());
  });

  it('the contact confirms the new time from their link and the agenda shows it confirmed', async () => {
    const { url } = await api<{ url: string }>(`/__e2e/contact-link?appointment_id=${state.appointments.ana}`);
    const token = new URL(url).searchParams.get('token')!;
    const page = await (await fetch(bypass(`${API}/api/v1/public/appointments/confirm?token=${encodeURIComponent(token)}`))).text();
    expect(page).toContain('Confirm appointment');
    const confirmed = await (
      await fetch(
        bypass(`${API}/api/v1/public/appointments/confirm`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token, c: '' }).toString(),
        }),
      )
    ).text();
    expect(confirmed).toContain('Appointment confirmed!');

    renderPage();
    const after = await row('Consulta Ana (e2e)');
    expect(within(after).getByText(label(state.day, '11:30'))).toBeInTheDocument();
    expect(within(after).getByText('Confirmed')).toBeInTheDocument();
  });
});
