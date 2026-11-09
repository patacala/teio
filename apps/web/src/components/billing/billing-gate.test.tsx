import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingAccessLevel, BillingRestrictionReason } from '@crm/shared';
import type { BillingAccess } from '@crm/shared';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { billingAccess, blockedAccess, paidAccess } from '@/test/fixtures/billing';
import { BillingGate } from './billing-gate';

const nav = vi.hoisted(() => ({ pathname: '/inbox', push: vi.fn() }));
const team = vi.hoisted(() => ({ user: { role: 'agent', is_platform_admin: false } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => nav.pathname,
}));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: team.user }) }));

async function renderGate(status: BillingAccess) {
  const calls = mockApi('get', '/billing/status', { data: status });
  const { wrapper } = createQueryWrapper();
  render(<BillingGate><p>Inbox content</p></BillingGate>, { wrapper });
  await vi.waitFor(() => expect(calls).toHaveLength(1));
}

beforeEach(() => {
  nav.pathname = '/inbox';
  team.user = { role: 'agent', is_platform_admin: false };
});

describe('BillingGate', () => {
  it.each([
    ['demo accounts', billingAccess()],
    ['paid orgs in good standing', paidAccess()],
    ['paid orgs inside the 48h grace period', paidAccess({ status: 'past_due', requires_action: true, reasons: [BillingRestrictionReason.PAYMENT_PAST_DUE] })],
  ])('shows the page to %s', async (_label, status) => {
    await renderGate(status);
    expect(await screen.findByText('Inbox content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks members of an org that has not paid and points them to an admin', async () => {
    await renderGate(blockedAccess(BillingRestrictionReason.GRACE_PERIOD_EXPIRED));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Payment required');
    expect(alert).toHaveTextContent(/grace period is over/);
    expect(alert).toHaveTextContent(/Ask an owner or admin/);
    expect(screen.queryByText('Inbox content')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['owner', 'admin'])('sends a blocked %s to billing', async (role) => {
    team.user = { role, is_platform_admin: false };
    const user = userEvent.setup();
    await renderGate(blockedAccess());

    await user.click(await screen.findByRole('button', { name: 'Go to billing' }));
    expect(nav.push).toHaveBeenCalledWith('/admin/billing');
  });

  it('lets owners and admins use the billing page while blocked', async () => {
    team.user = { role: 'owner', is_platform_admin: false };
    nav.pathname = '/admin/billing';
    await renderGate(blockedAccess());
    expect(await screen.findByText('Inbox content')).toBeInTheDocument();
  });

  it('does not let members through to the billing page while blocked', async () => {
    nav.pathname = '/admin/billing';
    await renderGate(blockedAccess());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Inbox content')).not.toBeInTheDocument();
  });

  it('says each thing once when the demo has ended', async () => {
    await renderGate(billingAccess({
      level: BillingAccessLevel.BLOCKED, requires_action: true, reasons: [BillingRestrictionReason.DEMO_EXPIRED], effective_features: [],
    }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent!.match(/demo has ended/gi)).toHaveLength(1);
  });

  it('tells suspended organizations to contact support', async () => {
    await renderGate(billingAccess({
      level: BillingAccessLevel.SUSPENDED, is_demo: false, reasons: [BillingRestrictionReason.ORGANIZATION_INACTIVE],
    }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Organization suspended');
    expect(alert).toHaveTextContent(/Contact support/);
  });

  it('does not show (or load) the page until it knows the organization may use it', async () => {
    mockApi('get', '/billing/status', { data: blockedAccess() });
    const { wrapper } = createQueryWrapper();
    render(<BillingGate><p>Inbox content</p></BillingGate>, { wrapper });

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Inbox content')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Payment required');
    expect(screen.queryByText('Inbox content')).not.toBeInTheDocument();
  });

  it('falls back to the page when the billing status cannot be loaded', async () => {
    mockApi('get', '/billing/status', { status: 500, message: 'Service temporarily unavailable' });
    const { wrapper } = createQueryWrapper();
    render(<BillingGate><p>Inbox content</p></BillingGate>, { wrapper });
    expect(await screen.findByText('Inbox content')).toBeInTheDocument();
  });

  it('never blocks platform admins', async () => {
    team.user = { role: 'admin', is_platform_admin: true };
    await renderGate(blockedAccess());
    expect(await screen.findByText('Inbox content')).toBeInTheDocument();
  });

  it('tells members the demo has ended and to ask an admin to choose a plan', async () => {
    await renderGate(billingAccess({
      level: BillingAccessLevel.BLOCKED, requires_action: true, reasons: [BillingRestrictionReason.DEMO_EXPIRED],
      effective_features: [], demo_ends_at: '2026-06-01T00:00:00.000Z',
    }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your demo has ended');
    expect(alert).toHaveTextContent('Ask an owner or admin of your organization to choose a plan.');
  });

  it('offers owners to choose a plan once the demo has ended', async () => {
    team.user = { role: 'owner', is_platform_admin: false };
    await renderGate(billingAccess({
      level: BillingAccessLevel.BLOCKED, requires_action: true, reasons: [BillingRestrictionReason.DEMO_EXPIRED], effective_features: [],
    }));
    expect(await screen.findByRole('button', { name: 'Choose a plan' })).toBeInTheDocument();
  });
});
