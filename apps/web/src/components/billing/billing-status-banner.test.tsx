import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingRestrictionReason } from '@crm/shared';
import type { BillingAccess } from '@crm/shared';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { billingAccess, blockedAccess, paidAccess } from '@/test/fixtures/billing';
import { BillingStatusBanner } from './billing-status-banner';

const nav = vi.hoisted(() => ({ pathname: '/inbox', push: vi.fn() }));
const team = vi.hoisted(() => ({ user: { role: 'agent', is_platform_admin: false } as { role: string; is_platform_admin: boolean } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => nav.pathname,
}));
const impersonation = vi.hoisted(() => ({ isImpersonating: false }));
vi.mock('@/contexts/impersonation-context', () => ({ useImpersonation: () => impersonation }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: team.user }) }));

const PAST_DUE = paidAccess({
  status: 'past_due', requires_action: true, reasons: [BillingRestrictionReason.PAYMENT_PAST_DUE],
  grace_period_ends_at: '2026-06-17T12:00:00Z',
});

async function renderBanner(status: BillingAccess) {
  const calls = mockApi('get', '/billing/status', { data: status });
  const { wrapper } = createQueryWrapper();
  const view = render(<BillingStatusBanner />, { wrapper });
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  return view;
}

beforeEach(() => {
  impersonation.isImpersonating = false;
  nav.pathname = '/inbox';
  team.user = { role: 'agent', is_platform_admin: false };
});

describe('BillingStatusBanner', () => {
  it('warns members during the 48h grace period and tells them to contact an admin', async () => {
    await renderBanner(PAST_DUE);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/latest payment failed/i);
    expect(alert).toHaveTextContent(/Access will be blocked on Jun 17/);
    expect(screen.getByText(/Ask an organization admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review billing' })).not.toBeInTheDocument();
  });

  it.each(['owner', 'admin'])('lets an %s jump to billing', async (role) => {
    team.user = { role, is_platform_admin: false };
    const user = userEvent.setup();
    await renderBanner(PAST_DUE);

    await user.click(await screen.findByRole('button', { name: 'Review billing' }));
    expect(nav.push).toHaveBeenCalledWith('/admin/billing');
  });

  it('warns about a missing payment method on a paid plan', async () => {
    await renderBanner(paidAccess({ requires_action: true, reasons: [BillingRestrictionReason.PAYMENT_METHOD_MISSING] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No payment method is connected/);
  });

  it.each([
    ['a demo account', billingAccess()],
    ['a paid org in good standing', paidAccess()],
    ['a scheduled cancellation (no action needed)', paidAccess({ reasons: [BillingRestrictionReason.CANCELLATION_SCHEDULED] })],
    ['a blocked org (the gate handles it)', blockedAccess()],
  ])('renders nothing for %s', async (_label, status) => {
    const { container } = await renderBanner(status);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays out of the way on the billing page itself', async () => {
    nav.pathname = '/admin/billing';
    const { container } = await renderBanner(PAST_DUE);
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden for a platform admin operating the platform', async () => {
    team.user = { role: 'admin', is_platform_admin: true };
    const { container } = await renderBanner(PAST_DUE);
    expect(container).toBeEmptyDOMElement();
  });

  it('is shown to a platform admin impersonating the organization', async () => {
    team.user = { role: 'admin', is_platform_admin: true };
    impersonation.isImpersonating = true;
    await renderBanner(PAST_DUE);
    expect(await screen.findByText(/latest payment failed/)).toBeInTheDocument();
  });

  it('tells owners the demo is ending and lets them choose a plan', async () => {
    team.user = { role: 'owner', is_platform_admin: false };
    const user = userEvent.setup();
    const endsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await renderBanner(billingAccess({
      requires_action: true,
      reasons: [BillingRestrictionReason.DEMO_ENDING_SOON],
      demo_ends_at: endsAt.toISOString(),
    }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your demo ends soon');
    expect(alert).toHaveTextContent(endsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    await user.click(screen.getByRole('button', { name: 'Choose a plan' }));
    expect(nav.push).toHaveBeenCalledWith('/admin/billing');
  });
});
