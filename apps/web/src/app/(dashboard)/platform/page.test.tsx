import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import {
  ACME_ID,
  CEDAR_ID,
  LEADS,
  ORGANIZATIONS,
  paginated,
  platformAttention,
  platformOrganizations,
  platformOverview,
} from '@/test/fixtures/platform';
import PlatformOverviewPage from './page';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));

const impersonation = vi.hoisted(() => ({ startImpersonating: vi.fn() }));
vi.mock('@/contexts/impersonation-context', () => ({ useImpersonation: () => impersonation }));

const toasts = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => toasts);

interface Overrides {
  overview?: Parameters<typeof mockApi>[2];
  attention?: Parameters<typeof mockApi>[2];
  leads?: Parameters<typeof mockApi>[2];
  organizations?: Parameters<typeof mockApi>[2];
}

function renderPage(overrides: Overrides = {}) {
  const calls = {
    overview: mockApi('get', '/platform/analytics/overview', overrides.overview ?? { data: platformOverview() }),
    attention: mockApi('get', '/platform/analytics/attention', overrides.attention ?? { data: platformAttention() }),
    leads: mockApi('get', '/platform/analytics/leads', overrides.leads ?? { data: paginated(LEADS, 23, 1, 8) }),
    organizations: mockApi('get', '/platform/analytics/organizations', overrides.organizations ?? { data: platformOrganizations() }),
  };
  const { wrapper } = createQueryWrapper();
  render(<PlatformOverviewPage />, { wrapper });
  return { calls, user: userEvent.setup() };
}

const kpi = (label: string) => screen.getByRole('group', { name: label });
const table = (name: string) => screen.getByRole('region', { name });
const rowOf = (scope: HTMLElement, text: string) => within(scope).getByText(text).closest('tr')!;
const attentionItem = (text: string) => within(screen.getByRole('list', { name: 'Items that need attention' })).getByText(text).closest('li')!;

beforeEach(() => {
  nav.push.mockClear();
  impersonation.startImpersonating.mockClear();
  toasts.toast.mockClear();
});

describe('Platform overview', () => {
  describe('key figures', () => {
    it('shows money and growth for the last 30 days by default', async () => {
      const { calls } = renderPage();
      await screen.findByText('$18,983');

      expect(within(kpi('MRR')).getByText('27% vs last month')).toBeInTheDocument();
      expect(within(kpi('MRR')).getByText(/ARR \$227,796 · 42 paying orgs/)).toBeInTheDocument();
      expect(within(kpi('Cash collected')).getByText('$17,240')).toBeInTheDocument();
      expect(within(kpi('Cash collected')).getByText('12% vs prev period')).toBeInTheDocument();
      expect(within(kpi('Cash collected')).getByText('$1,490 outstanding · 3 open invoices')).toBeInTheDocument();
      expect(within(kpi('Revenue at risk')).getByText('$4,083/mo')).toHaveClass('text-danger');
      expect(within(kpi('Revenue at risk')).getByText('4 orgs · 1 past due · 1 blocked')).toBeInTheDocument();
      expect(within(kpi('Paying organizations')).getByText('$452 average per org')).toBeInTheDocument();
      expect(within(kpi('Paying organizations')).getByText('+5 new')).toHaveClass('text-success');
      expect(within(kpi('New leads')).getByText('38')).toBeInTheDocument();
      expect(within(kpi('New leads')).getByText('29 demo requests · 9 signups')).toBeInTheDocument();
      expect(within(kpi('Demo → paid')).getByText('33%')).toBeInTheDocument();
      expect(within(kpi('Active demos')).getByText('4 ending in 7 days')).toHaveClass('text-warning');
      expect(within(kpi('Signup activation')).getByText('67%')).toBeInTheDocument();

      expect(Object.fromEntries(calls.overview[0].url.searchParams)).toEqual({ range: '30d' });
    });

    it('reloads the figures for another period', async () => {
      const { calls, user } = renderPage();
      await screen.findByText('$18,983');
      await user.click(screen.getByRole('button', { name: '7d' }));
      await waitFor(() => expect(calls.overview.at(-1)?.url.searchParams.get('range')).toBe('7d'));
      expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows "—" when nothing can be compared yet', async () => {
      const overview = platformOverview();
      overview.money.mrr_last_month = null;
      overview.growth.conversion.rate = null;
      overview.signups = { signups: 0, activated: 0, paid: 0 };
      renderPage({ overview: { data: overview } });
      await screen.findByText('$18,983');
      expect(within(kpi('MRR')).queryByText(/vs last month/)).not.toBeInTheDocument();
      expect(within(kpi('Demo → paid')).getByText('—')).toBeInTheDocument();
      expect(within(kpi('Signup activation')).getByText('—')).toBeInTheDocument();
    });

    it('reports a failure and retries', async () => {
      const { calls, user } = renderPage({ overview: { status: 500, message: 'down' } });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Could not load the platform figures.');
      // unknown is not zero: no figure and no card claims the platform is empty
      for (const label of ['MRR', 'Revenue at risk', 'New leads', 'Demo → paid']) {
        expect(within(kpi(label)).getByText('—')).toBeInTheDocument();
      }
      expect(screen.getByText('The funnel is unavailable right now')).toBeInTheDocument();
      expect(screen.getByText('Revenue is unavailable right now')).toBeInTheDocument();
      expect(screen.queryByText('No revenue yet')).not.toBeInTheDocument();
      mockApi('get', '/platform/analytics/overview', { data: platformOverview() });
      await user.click(within(alert).getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('$18,983')).toBeInTheDocument();
      expect(calls.overview).toHaveLength(1);
    });
  });

  describe('needs attention', () => {
    it('lists the items with their reason, money at stake and counts', async () => {
      renderPage();
      expect(await screen.findByText('3 critical')).toBeInTheDocument();
      expect(screen.getByText('2 warning')).toBeInTheDocument();
      const cedar = attentionItem('Cedar Clinic');
      expect(within(cedar).getByText('Blocked: unpaid')).toBeInTheDocument();
      expect(within(cedar).getByText('$149/mo')).toBeInTheDocument();
      expect(within(cedar).getByText('Professional · $149/mo · owner@cedar.test')).toBeInTheDocument();
    });

    it('opens a blocked organization on its billing page, as the platform admin', async () => {
      const { user } = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Open billing for Cedar Clinic' }));
      expect(impersonation.startImpersonating).toHaveBeenCalledWith(CEDAR_ID, 'Cedar Clinic');
      expect(nav.push).toHaveBeenCalledWith('/admin/billing');
    });

    it('links demos to the demo accounts page and leads/owners to email', async () => {
      renderPage();
      const manage = await screen.findByRole('link', { name: 'Manage the demo of Echo Studio' });
      expect(manage).toHaveAttribute('href', '/platform/demo-accounts?search=echo-studio');
      expect(screen.getByRole('link', { name: 'Email Nora Quinn' })).toHaveAttribute('href', 'mailto:nora@north.test');
      expect(screen.getByRole('link', { name: 'Email Cedar Clinic' })).toHaveAttribute('href', 'mailto:owner@cedar.test');
      expect(within(attentionItem('Beacon Law')).queryByRole('link', { name: /Email/ })).not.toBeInTheDocument();
    });

    it('says when there is nothing to do', async () => {
      renderPage({ attention: { data: platformAttention([]) } });
      expect(await screen.findByText('Nothing needs attention right now')).toBeInTheDocument();
    });

    it('tells when only the most urgent items are shown', async () => {
      const attention = platformAttention();
      attention.counts = { critical: 30, warning: 40 };
      renderPage({ attention: { data: attention } });
      expect(await screen.findByText('Showing the 5 most urgent of 70')).toBeInTheDocument();
    });
  });

  describe('lead funnel', () => {
    it('shows each step with its conversion from the previous one, and direct signups', async () => {
      renderPage();
      const funnel = await screen.findByRole('list', { name: 'Funnel steps' });
      const steps = within(funnel).getAllByRole('listitem');
      expect(steps.map((step) => step.querySelector('p')?.textContent)).toEqual([
        'Form started', 'Submitted', 'Demo ready', 'Demo opened', 'Signed up', 'Paid',
      ]);
      expect(steps[1]).toHaveTextContent('29 leads45% of previous step'); // 29 of 64 submitted
      expect(steps[5]).toHaveTextContent('2 leads29% of previous step'); // 2 of 7 signed up paid
      expect(steps[0]).not.toHaveTextContent('previous step');
      expect(screen.getByText('9 direct signups')).toBeInTheDocument();
    });

    it('says when no demo was requested in the period', async () => {
      const overview = platformOverview();
      overview.lead_funnel = overview.lead_funnel.map((step) => ({ ...step, count: 0 }));
      renderPage({ overview: { data: overview } });
      expect(await screen.findByText('No demo requests in this period')).toBeInTheDocument();
    });
  });

  describe('latest leads', () => {
    it('shows how far each lead got and which account it opened', async () => {
      renderPage();
      await screen.findByText('Omar Diaz');
      const leads = table('Latest leads');
      expect(within(rowOf(leads, 'Lina Park')).getByText('Opened 2×')).toBeInTheDocument();
      const account = (row: HTMLElement) => within(row).getAllByRole('cell')[4];
      expect(within(account(rowOf(leads, 'Lina Park'))).getByText('Echo Studio')).toBeInTheDocument();
      expect(within(account(rowOf(leads, 'Lina Park'))).getByText('Demo')).toBeInTheDocument();
      expect(within(rowOf(leads, 'Mark Ruiz')).getByText('Paying')).toBeInTheDocument();
      expect(within(rowOf(leads, 'Mark Ruiz')).getByText('Not opened')).toBeInTheDocument();
      expect(within(rowOf(leads, 'Nora Quinn')).getByText('Failed')).toBeInTheDocument();
      expect(within(rowOf(leads, 'Omar Diaz')).getByText('No account yet')).toBeInTheDocument();
      expect(within(rowOf(leads, 'Gale Realty')).getByText('Signed up directly')).toBeInTheDocument();
      expect(within(leads).getByText('1–8 of 23 leads')).toBeInTheDocument();
    });

    it('filters by source and searches after the user stops typing', async () => {
      const { calls, user } = renderPage();
      await screen.findByText('Omar Diaz');
      const leads = table('Latest leads');
      await user.click(within(leads).getByRole('button', { name: 'Demo requests' }));
      await waitFor(() => expect(calls.leads.at(-1)?.url.searchParams.get('source')).toBe('demo_request'));

      await user.type(within(leads).getByRole('textbox', { name: 'Search leads' }), 'nora');
      await waitFor(() => expect(calls.leads.at(-1)?.url.searchParams.get('search')).toBe('nora'));
      expect(Object.fromEntries(calls.leads.at(-1)!.url.searchParams)).toEqual({ page: '1', limit: '8', search: 'nora', source: 'demo_request' });
    });
  });

  describe('organizations', () => {
    it('shows state, plan, renewal or demo end, usage and activity', async () => {
      renderPage();
      await screen.findByText('Acme Dental', { selector: 'td p' });
      const orgs = table('Organizations');
      const acme = rowOf(orgs, 'Acme Dental');
      expect(within(acme).getByText('Paying')).toBeInTheDocument();
      expect(within(acme).getByText('$149/mo')).toBeInTheDocument();
      expect(within(acme).getByText('Renews Jul 5, 2026')).toBeInTheDocument();
      expect(within(acme).getByLabelText('95% of AI calls used: 950 of 1000')).toHaveClass('text-warning');
      expect(within(acme).getByText('$1,788')).toBeInTheDocument();

      const beacon = rowOf(orgs, 'Beacon Law');
      expect(within(beacon).getByText('Past due')).toBeInTheDocument();
      expect(within(beacon).getByText('$41/mo · yearly')).toBeInTheDocument();
      expect(within(beacon).getByText('No channel')).toHaveClass('text-warning');
      expect(within(beacon).getByText('Never')).toBeInTheDocument();

      expect(within(rowOf(orgs, 'Fjord Fitness')).getByText('Ended Jun 12, 2026')).toBeInTheDocument();
      expect(within(rowOf(orgs, 'Cedar Clinic')).getByText('Payment failed', { selector: 'span' })).toBeInTheDocument();
    });

    it('filters by state with the count of each, and sorts', async () => {
      const { calls, user } = renderPage();
      await screen.findByText('Acme Dental', { selector: 'td p' });
      const orgs = table('Organizations');
      const filters = within(orgs).getByRole('group', { name: 'Organization state' });
      expect(within(filters).getByRole('button', { name: 'All 57' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(within(filters).getByRole('button', { name: 'Demo ending soon 4' }));
      await waitFor(() => expect(calls.organizations.at(-1)?.url.searchParams.get('filter')).toBe('ending_soon'));

      await user.click(within(orgs).getByRole('combobox', { name: 'Sort organizations' }));
      await user.click(await screen.findByRole('option', { name: 'Last activity' }));
      await waitFor(() => expect(calls.organizations.at(-1)?.url.searchParams.get('sort')).toBe('activity'));
    });

    it('opens an organization as the platform admin', async () => {
      const { user } = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Open Acme Dental' }));
      expect(impersonation.startImpersonating).toHaveBeenCalledWith(ACME_ID, 'Acme Dental');
      expect(nav.push).toHaveBeenCalledWith('/');
    });

    it('marks an organization internal, so it leaves every platform figure', async () => {
      const patch = mockApi('patch', `/organizations/${ACME_ID}`, { data: { id: ACME_ID, is_internal: true } });
      const { calls, user } = renderPage();
      await user.click(await screen.findByRole('button', { name: 'More actions for Acme Dental' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Mark as internal' }));

      await waitFor(() => expect(patch).toHaveLength(1));
      expect(patch[0].body).toEqual({ is_internal: true });
      expect(toasts.toast).toHaveBeenCalledWith({ title: 'Acme Dental marked as internal' });
      // every platform figure is refetched without it
      await waitFor(() => expect(calls.overview.length).toBeGreaterThan(1));
      expect(calls.organizations.length).toBeGreaterThan(1);
    });

    it('offers to count an internal organization again', async () => {
      const internal = { ...ORGANIZATIONS[0], is_internal: true };
      const { user } = renderPage({ organizations: { data: platformOrganizations([internal]) } });
      await screen.findByText('Internal', { selector: 'span' });
      await user.click(screen.getByRole('button', { name: 'More actions for Acme Dental' }));
      expect(await screen.findByRole('menuitem', { name: 'Count in platform metrics' })).toBeInTheDocument();
    });

    it('shows an empty filter and an error with retry', async () => {
      const { user } = renderPage({ organizations: { status: 500 } });
      const orgs = table('Organizations');
      expect(await within(orgs).findByText('Could not load organizations.')).toBeInTheDocument();
      mockApi('get', '/platform/analytics/organizations', { data: platformOrganizations([]) });
      await user.click(within(orgs).getByRole('button', { name: 'Try again' }));
      expect(await within(orgs).findByText('No organizations in “All”')).toBeInTheDocument();
    });
  });
});
