/**
 * End to end: the real platform overview page against the real platform API
 * and PostgreSQL (apps/api/test/e2e/platform-e2e-server.cjs, started by
 * scripts/e2e-platform.sh on a throwaway database). Every API call the page
 * makes is forwarded to that server. Skipped unless E2E_API_URL and
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
import PlatformOverviewPage from './page';

vi.setConfig({ testTimeout: 45_000 });

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
const impersonation = vi.hoisted(() => ({ startImpersonating: vi.fn() }));
vi.mock('@/contexts/impersonation-context', () => ({ useImpersonation: () => impersonation }));
vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }));

const API = process.env.E2E_API_URL;
const STATE_FILE = process.env.E2E_STATE_FILE;
const describeE2E = API && STATE_FILE ? describe : describe.skip;

interface E2EState {
  apiUrl: string;
  organizations: Record<'acme' | 'beacon' | 'cedar' | 'echo' | 'gale', string>;
  snapshotted: number;
}

/** Talks to the real API directly (outside the page). */
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(bypass(`${API}/api/v1${path}`, { ...init, headers: { authorization: 'Bearer e2e', 'content-type': 'application/json', ...(init.headers ?? {}) } }));
  return { status: res.status, body: (await res.json()) as { data: unknown } };
}

const kpi = (label: string) => screen.getByRole('group', { name: label });
const table = (name: string) => screen.getByRole('region', { name });
const rowOf = (scope: HTMLElement, text: string) => within(scope).getByText(text).closest('tr')!;

describeE2E('Platform overview against the real API (e2e)', () => {
  const state = (STATE_FILE ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}) as E2EState;

  beforeEach(() => {
    nav.push.mockClear();
    impersonation.startImpersonating.mockClear();
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
    render(<PlatformOverviewPage />, { wrapper });
    return userEvent.setup();
  }

  it('is for platform admins only', async () => {
    expect((await api('/platform/analytics/overview')).status).toBe(200);
    for (const role of ['owner', 'admin', 'agent']) {
      expect((await api('/platform/analytics/overview', { headers: { 'x-e2e-role': role } })).status).toBe(403);
    }
    expect((await api('/platform/analytics/overview?range=1y')).status).toBe(400);
  });

  it('shows what the platform earns, may lose and where the next customers come from', async () => {
    renderPage();
    // Acme $149 + Beacon $490/yr ($40.83) = $189.83 MRR; last month only Acme ($149).
    await within(kpi('MRR')).findByText('$190', {}, { timeout: 10_000 });
    expect(within(kpi('MRR')).getByText('27% vs last month')).toBeInTheDocument();
    expect(within(kpi('MRR')).getByText(/2 paying orgs/)).toBeInTheDocument();
    expect(within(kpi('Cash collected')).getByText('$149')).toBeInTheDocument();
    expect(within(kpi('Cash collected')).getByText('$149 outstanding · 1 open invoice')).toBeInTheDocument();
    // Beacon (past due) + Cedar (blocked) are at risk
    expect(within(kpi('Revenue at risk')).getByText('$190/mo')).toBeInTheDocument();
    expect(within(kpi('Revenue at risk')).getByText('2 orgs · 1 past due · 1 blocked')).toBeInTheDocument();
    expect(within(kpi('Paying organizations')).getByText('+1 new')).toBeInTheDocument();
    expect(within(kpi('Paying organizations')).getByText('1 churned')).toBeInTheDocument();
    expect(within(kpi('New leads')).getByText('7')).toBeInTheDocument();
    expect(within(kpi('New leads')).getByText('4 demo requests · 3 signups')).toBeInTheDocument();
    expect(within(kpi('Demo → paid')).getByText('50%')).toBeInTheDocument();
    expect(within(kpi('Active demos')).getByText('1 ending in 7 days')).toBeInTheDocument();
    expect(within(kpi('Signup activation')).getByText('33%')).toBeInTheDocument();
    expect(state.snapshotted).toBe(2);
  });

  it('lists what needs action, most urgent first', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Items that need attention' }, { timeout: 10_000 });
    const rows = within(list).getAllByRole('listitem').map((item) => item.textContent);
    expect(rows[0]).toContain('Cedar Clinic');
    expect(rows[0]).toContain('Blocked: unpaid');
    expect(rows[1]).toContain('Beacon Law');
    expect(rows[1]).toContain('Grace ends in 1 day');
    expect(rows.some((row) => row?.includes('Nora') && row.includes('Demo generation failed'))).toBe(true);
    expect(rows.some((row) => row?.includes('Omar') && row.includes('Stuck for 2h'))).toBe(true);
    expect(rows.some((row) => row?.includes('Echo Studio') && row.includes('Demo ends in 2 days'))).toBe(true);
    expect(rows.some((row) => row?.includes('Gale Realty') && row.includes('No channel after 4 days'))).toBe(true);
    expect(screen.getByText('4 critical')).toBeInTheDocument();
  });

  it('follows demo leads into the accounts they opened', async () => {
    renderPage();
    await screen.findByText('Lina Park', {}, { timeout: 10_000 });
    const leads = table('Latest leads');
    expect(within(rowOf(leads, 'Lina Park')).getByText('Opened 2×')).toBeInTheDocument();
    expect(within(rowOf(leads, 'Mark')).getByText('Paying')).toBeInTheDocument();
    expect(within(leads).getByText('1–8 of 12 leads')).toBeInTheDocument(); // 4 demo requests + 8 signups
  });

  it('filters organizations with the real counts', async () => {
    const user = renderPage();
    const orgs = await screen.findByRole('region', { name: 'Organizations' }, { timeout: 10_000 });
    const filters = await within(orgs).findByRole('group', { name: 'Organization state' });
    await within(filters).findByRole('button', { name: 'All 8' }, { timeout: 10_000 });
    await user.click(within(filters).getByRole('button', { name: 'Demo ending soon 1' }));
    await waitFor(() => expect(within(orgs).getAllByRole('row')).toHaveLength(2)); // header + Echo
    expect(within(orgs).getByText('Echo Studio')).toBeInTheDocument();
    expect(within(rowOf(orgs, 'Echo Studio')).getByLabelText('92% of messages used: 920 of 1000')).toBeInTheDocument();
  });

  it('marking an organization internal takes it out of every figure', async () => {
    const user = renderPage();
    await within(kpi('MRR')).findByText('$190', {}, { timeout: 10_000 });
    await user.click(await screen.findByRole('button', { name: 'More actions for Acme Dental' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark as internal' }));

    // Only Beacon's $40.83 is left
    await within(kpi('MRR')).findByText('$41', {}, { timeout: 10_000 });
    expect(within(kpi('Cash collected')).getByText('$0')).toBeInTheDocument();
    const internal = (await api('/platform/analytics/organizations?filter=internal')).body.data as { items: Array<{ id: string }> };
    expect(internal.items.map((org) => org.id)).toContain(state.organizations.acme);

    // Leave the platform as it was for the other tests of this run
    expect((await api(`/organizations/${state.organizations.acme}`, { method: 'PATCH', body: JSON.stringify({ is_internal: false }) })).status).toBe(200);
  });
});
