import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingAccess } from '@crm/shared';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { billingAccess, paidAccess } from '@/test/fixtures/billing';
import { DemoAccountBadge } from './demo-account-badge';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
const team = vi.hoisted(() => ({ user: { role: 'agent', is_platform_admin: false } as { role: string; is_platform_admin: boolean } }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
const impersonation = vi.hoisted(() => ({ isImpersonating: false }));
vi.mock('@/contexts/impersonation-context', () => ({ useImpersonation: () => impersonation }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: team.user }) }));

async function renderBadge(status: BillingAccess) {
  const calls = mockApi('get', '/billing/status', { data: status });
  const { wrapper } = createQueryWrapper();
  const view = render(<DemoAccountBadge />, { wrapper });
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  return view;
}

beforeEach(() => {
  impersonation.isImpersonating = false;
  team.user = { role: 'agent', is_platform_admin: false };
});

describe('DemoAccountBadge', () => {
  it('labels demo organizations for every member', async () => {
    await renderBadge(billingAccess());
    expect(await screen.findByText('Demo account')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('links owners and admins to the plans', async () => {
    team.user = { role: 'owner', is_platform_admin: false };
    const user = userEvent.setup();
    await renderBadge(billingAccess());

    await user.click(await screen.findByRole('button', { name: 'Demo account: choose a plan' }));
    expect(nav.push).toHaveBeenCalledWith('/admin/billing');
  });

  it('is hidden for paid organizations', async () => {
    const { container } = await renderBadge(paidAccess());
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden for a platform admin operating the platform', async () => {
    team.user = { role: 'admin', is_platform_admin: true };
    const { container } = await renderBadge(billingAccess());
    expect(container).toBeEmptyDOMElement();
  });

  it('is shown to a platform admin impersonating the organization', async () => {
    team.user = { role: 'admin', is_platform_admin: true };
    impersonation.isImpersonating = true;
    await renderBadge(billingAccess());
    expect(await screen.findByText(/Demo account/)).toBeInTheDocument();
  });

  it('shows how long the demo has left', async () => {
    await renderBadge(billingAccess({ demo_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }));
    expect(await screen.findByText('Demo account · 5 days left')).toBeInTheDocument();
  });

  it('has no countdown for a demo without an end date', async () => {
    await renderBadge(billingAccess({ demo_ends_at: null }));
    expect(await screen.findByText('Demo account')).toBeInTheDocument();
  });
});
