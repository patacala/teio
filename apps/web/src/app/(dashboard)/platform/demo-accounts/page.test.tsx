import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoOrganization, PaginatedResponse } from '@crm/shared';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { DEMO_LIMITS } from '@/test/fixtures/billing';
import DemoAccountsPage from './page';

const toasts = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => toasts);

const url = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(url.search) }));

const ACME_ID = '0e6f2f3c-1c58-4c4f-9b2a-3d7c2b8f9a10';
const DAY = 24 * 60 * 60 * 1000;

function org(overrides: Partial<DemoOrganization> = {}): DemoOrganization {
  return {
    organization_id: ACME_ID,
    name: 'Acme Dental',
    slug: 'acme-dental',
    is_active: true,
    created_at: '2026-05-02T10:00:00Z',
    usage: { conversations: 12, messages: 850, ai_calls: 10, voice_minutes: 0, agents: 1 },
    limit_overrides: {},
    effective_limits: DEMO_LIMITS,
    limits_updated_at: null,
    demo_ends_at: null,
    demo_period_updated_at: null,
    ...overrides,
  };
}

function page(items: DemoOrganization[]): PaginatedResponse<DemoOrganization> {
  return { items, meta: { total: items.length, page: 1, limit: 20, total_pages: 1, has_next: false, has_prev: false } };
}

function renderPage(items: DemoOrganization[] = [org()]) {
  mockApi('get', '/platform/billing/demo/defaults', {
    data: { plan_id: 'plan-free', limits: DEMO_LIMITS, demo_duration_days: 7, updated_at: '2026-06-01T00:00:00Z' },
  });
  const list = mockApi('get', '/platform/billing/demo/organizations', { data: page(items) });
  const { wrapper } = createQueryWrapper();
  render(<DemoAccountsPage />, { wrapper });
  return { list };
}

async function chooseMode(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
  metric: string,
  option: string,
  trigger = `${metric} limit type`,
) {
  await user.click(within(scope).getByRole('combobox', { name: trigger }));
  await user.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => {
  toasts.toast.mockClear();
  url.search = '';
});

describe('Demo accounts page', () => {
  describe('default demo limits', () => {
    it('shows the current defaults from the API', async () => {
      renderPage();
      expect(await screen.findByDisplayValue('1000')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: 'Messages / month' })).toHaveValue(1000);
      expect(screen.getByRole('button', { name: 'Save defaults' })).toBeDisabled();
    });

    it('saves the changed limits, including unlimited', async () => {
      const user = userEvent.setup();
      const patch = mockApi('patch', '/platform/billing/demo/defaults', {
        data: { plan_id: 'plan-free', limits: DEMO_LIMITS, demo_duration_days: 7, updated_at: '2026-06-01T00:00:00Z' },
      });
      renderPage();

      const aiCalls = await screen.findByRole('spinbutton', { name: 'AI calls / month' });
      await user.clear(aiCalls);
      await user.type(aiCalls, '250');
      await chooseMode(user, document.body, 'Messages', 'Unlimited');
      await user.click(screen.getByRole('button', { name: 'Save defaults' }));

      await waitFor(() => expect(patch).toHaveLength(1));
      expect(patch[0].body).toEqual({ ...DEMO_LIMITS, ai_calls: 250, messages: -1, demo_duration_days: 7 });
      expect(toasts.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Demo defaults saved' }));
    });

    it('changes how long new demos last, or removes their end date', async () => {
      const user = userEvent.setup();
      const patch = mockApi('patch', '/platform/billing/demo/defaults', {
        data: { plan_id: 'plan-free', limits: DEMO_LIMITS, demo_duration_days: 7, updated_at: '2026-06-01T00:00:00Z' },
      });
      renderPage();

      const days = await screen.findByRole('spinbutton', { name: 'Demo length' });
      expect(days).toHaveValue(7);
      await user.clear(days);
      await user.type(days, '14');
      await user.click(screen.getByRole('button', { name: 'Save defaults' }));
      await waitFor(() => expect(patch).toHaveLength(1));
      expect(patch[0].body).toMatchObject({ demo_duration_days: 14 });

      await chooseMode(user, document.body, 'Demo length', 'No end date', 'Demo length type');
      expect(screen.getByText('Free forever')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save defaults' }));
      await waitFor(() => expect(patch).toHaveLength(2));
      expect(patch[1].body).toMatchObject({ demo_duration_days: null });
    });

    it.each(['0', '400'])('rejects a demo length of %s days', async (value) => {
      const user = userEvent.setup();
      const patch = mockApi('patch', '/platform/billing/demo/defaults', { data: {} });
      renderPage();
      const days = await screen.findByRole('spinbutton', { name: 'Demo length' });
      await user.clear(days);
      await user.type(days, value);
      await user.click(screen.getByRole('button', { name: 'Save defaults' }));
      expect(await screen.findByText('Enter a number of days between 1 and 365.')).toBeInTheDocument();
      expect(patch).toHaveLength(0);
    });

    it('rejects values that are not whole numbers and does not save', async () => {
      const user = userEvent.setup();
      const patch = mockApi('patch', '/platform/billing/demo/defaults', { data: {} });
      renderPage();

      const aiCalls = await screen.findByRole('spinbutton', { name: 'AI calls / month' });
      await user.clear(aiCalls);
      await user.click(screen.getByRole('button', { name: 'Save defaults' }));

      expect(await screen.findByText('Enter a whole number (0 or more).')).toBeInTheDocument();
      expect(aiCalls).toHaveAttribute('aria-invalid', 'true');
      expect(patch).toHaveLength(0);
    });

    it('shows an error state with retry', async () => {
      mockApi('get', '/platform/billing/demo/defaults', { status: 500, message: 'Database unavailable' });
      mockApi('get', '/platform/billing/demo/organizations', { data: page([]) });
      const { wrapper } = createQueryWrapper();
      render(<DemoAccountsPage />, { wrapper });

      expect(await screen.findByText('Could not load the demo defaults.')).toBeInTheDocument();
      expect(screen.getByText('Database unavailable')).toBeInTheDocument();
    });
  });

  describe('demo organizations', () => {
    it('lists usage against each limit and flags what is close to or at the limit', async () => {
      renderPage();
      const row = (await screen.findByText('Acme Dental')).closest('tr')!;
      expect(within(row).getByText('acme-dental', { exact: false })).toBeInTheDocument();
      expect(within(row).getByText('Default')).toBeInTheDocument();
      expect(within(row).getByLabelText('Conversations: 12 of 100')).toHaveClass('text-secondary');
      expect(within(row).getByLabelText('Messages: 850 of 1,000')).toHaveClass('text-warning');
      expect(within(row).getByLabelText('AI calls: 10 of 10')).toHaveClass('text-danger');
    });

    it('marks organizations with custom limits and inactive ones', async () => {
      renderPage([org({ limit_overrides: { ai_calls: 500 }, effective_limits: { ...DEMO_LIMITS, ai_calls: 500 }, is_active: false })]);
      const row = (await screen.findByText('Acme Dental')).closest('tr')!;
      expect(within(row).getByText('Custom')).toBeInTheDocument();
      expect(within(row).getByText('Inactive')).toBeInTheDocument();
    });

    it('shows an empty state', async () => {
      renderPage([]);
      expect(await screen.findByText('No demo organizations')).toBeInTheDocument();
    });

    it('searches by name after the user stops typing', async () => {
      const user = userEvent.setup();
      const { list } = renderPage();
      await screen.findByText('Acme Dental');
      const filtered = mockApi('get', '/platform/billing/demo/organizations', { data: page([]) });

      await user.type(screen.getByLabelText('Search organizations'), 'zeta');

      expect(await screen.findByText('No demo organizations match “zeta”')).toBeInTheDocument();
      expect(filtered.at(-1)!.url.searchParams.get('search')).toBe('zeta');
      expect(list.length + filtered.length).toBeLessThanOrEqual(3);
    });

    it('starts searched when linked with ?search= (e.g. from the platform overview)', async () => {
      url.search = 'search=acme-dental';
      const { list } = renderPage();
      expect(await screen.findByText('Acme Dental')).toBeInTheDocument();
      expect(screen.getByLabelText('Search organizations')).toHaveValue('acme-dental');
      expect(list.every((call) => call.url.searchParams.get('search') === 'acme-dental')).toBe(true);
    });

    it('sets custom limits for one organization', async () => {
      const user = userEvent.setup();
      const put = mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/limits`, { status: 204 });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Edit demo settings for Acme Dental' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Used: 10', { exact: false })).toBeInTheDocument();

      await chooseMode(user, dialog, 'AI calls', 'Limited');
      const input = within(dialog).getByRole('spinbutton', { name: 'AI calls / month' });
      await user.clear(input);
      await user.type(input, '500');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(put).toHaveLength(1));
      expect(put[0].body).toEqual({ ai_calls: 500 });
      expect(toasts.toast).toHaveBeenCalledWith({ title: 'Demo settings updated for Acme Dental' });
    });

    it('shows when each demo ends', async () => {
      renderPage([
        org({ demo_ends_at: new Date(Date.now() + 5 * DAY).toISOString() }),
        org({ organization_id: 'org-2', name: 'Forever Co', demo_ends_at: null }),
        org({ organization_id: 'org-3', name: 'Ended Co', demo_ends_at: new Date(Date.now() - DAY).toISOString() }),
      ]);
      const row = (name: string) => screen.getByText(name).closest('tr')!;
      expect(await screen.findByText('Acme Dental')).toBeInTheDocument();
      expect(within(row('Acme Dental')).getByText('5 days left')).toBeInTheDocument();
      expect(within(row('Forever Co')).getByText('No end date')).toBeInTheDocument();
      expect(within(row('Ended Co')).getByText('ended')).toHaveClass('text-danger');
    });

    it('extends a demo by 7 days from its current end', async () => {
      const user = userEvent.setup();
      const currentEnd = new Date(Date.now() + 2 * DAY);
      const period = mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/period`, { status: 204 });
      mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/limits`, { status: 204 });
      renderPage([org({ demo_ends_at: currentEnd.toISOString() })]);

      await user.click(await screen.findByRole('button', { name: 'Edit demo settings for Acme Dental' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Extend 7 days' }));
      expect(within(dialog).getByText(/9 days left/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(period).toHaveLength(1));
      const sent = new Date((period[0].body as { ends_at: string }).ends_at).getTime();
      expect(Math.abs(sent - (currentEnd.getTime() + 7 * DAY))).toBeLessThan(1000);
    });

    it('sets the demo end to a day picked in the calendar (end of that day)', async () => {
      const user = userEvent.setup();
      const end = new Date(Date.now() + 3 * DAY);
      const period = mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/period`, { status: 204 });
      mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/limits`, { status: 204 });
      renderPage([org({ demo_ends_at: end.toISOString() })]);

      await user.click(await screen.findByRole('button', { name: 'Edit demo settings for Acme Dental' }));
      await user.click(await screen.findByRole('button', { name: 'Choose the demo end date' }));
      await user.click(screen.getByRole('button', { name: 'Next month' }));
      await user.click(screen.getByRole('button', { name: '15' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(period).toHaveLength(1));
      const sent = new Date((period[0].body as { ends_at: string }).ends_at);
      const expected = new Date(end.getFullYear(), end.getMonth() + 1, 15, 23, 59, 59, 999);
      expect(sent.getTime()).toBe(expected.getTime());
    });

    it('makes a demo free forever (no end date, no payment required)', async () => {
      const user = userEvent.setup();
      const period = mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/period`, { status: 204 });
      mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/limits`, { status: 204 });
      renderPage([org({ demo_ends_at: new Date(Date.now() + DAY).toISOString() })]);

      await user.click(await screen.findByRole('button', { name: 'Edit demo settings for Acme Dental' }));
      const dialog = await screen.findByRole('dialog');
      await chooseMode(user, dialog, 'Demo ends', 'Free forever', 'Demo end type');
      expect(within(dialog).getByText('No end date, no payment required')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(period).toHaveLength(1));
      expect(period[0].body).toEqual({ ends_at: null });
    });

    it('does not touch the demo period when only the limits change', async () => {
      const user = userEvent.setup();
      const period = mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/period`, { status: 204 });
      const limits = mockApi('put', `/platform/billing/demo/organizations/${ACME_ID}/limits`, { status: 204 });
      renderPage([org({ demo_ends_at: new Date(Date.now() + DAY).toISOString() })]);

      await user.click(await screen.findByRole('button', { name: 'Edit demo settings for Acme Dental' }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(limits).toHaveLength(1));
      expect(period).toHaveLength(0);
    });

    it('resets an organization with custom limits back to the defaults', async () => {
      const user = userEvent.setup();
      const del = mockApi('delete', `/platform/billing/demo/organizations/${ACME_ID}/limits`, { status: 204 });
      renderPage([org({ limit_overrides: { ai_calls: 500 }, effective_limits: { ...DEMO_LIMITS, ai_calls: 500 } })]);

      await user.click(await screen.findByRole('button', { name: 'Edit demo settings for Acme Dental' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('spinbutton', { name: 'AI calls / month' })).toHaveValue(500);
      await user.click(within(dialog).getByRole('button', { name: 'Reset limits to defaults' }));

      await waitFor(() => expect(del).toHaveLength(1));
    });

    it('cannot reset an organization that already uses the defaults', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: 'Edit demo settings for Acme Dental' }));
      expect(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reset limits to defaults' })).toBeDisabled();
    });
  });
});
