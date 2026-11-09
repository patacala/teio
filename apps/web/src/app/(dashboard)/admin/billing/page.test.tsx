import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingAccessLevel, BillingRestrictionReason } from '@crm/shared';
import type { BillingOverview } from '@crm/shared';
import {
  DEMO_PLAN as FREE,
  PRO_PLAN as PRO,
  billingOverview as overview,
  billingAccess,
  blockedAccess,
  paidAccess as access,
} from '@/test/fixtures/billing';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import AdminBillingPage from './page';

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  push: vi.fn(),
}));
const external = vi.hoisted(() => ({ navigateToExternal: vi.fn() }));
const toasts = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => nav.params,
  usePathname: () => '/admin/billing',
}));
vi.mock('@/lib/navigation', () => external);
vi.mock('@/hooks/useToast', () => toasts);

function renderPage(data: BillingOverview = overview()) {
  mockApi('get', '/billing/subscription', { data });
  mockApi('get', '/billing/plans', { data: [FREE, PRO] });
  mockApi('get', '/billing/invoices', { data: { items: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0, has_next: false, has_prev: false } } });
  const { wrapper } = createQueryWrapper();
  return render(<AdminBillingPage />, { wrapper });
}

beforeEach(() => {
  nav.params = new URLSearchParams();
});

describe('AdminBillingPage', () => {
  it('shows a demo account, DB prices, a payment method empty state and no invoices', async () => {
    renderPage();

    expect(await screen.findByText('Demo account')).toBeInTheDocument();
    expect(screen.getByText(/Every feature unlocked while you evaluate/)).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-free')).getByText('Demo')).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-free')).getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(screen.getByText('No payment method connected')).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-professional')).getByText('$149.00')).toBeInTheDocument();
    expect(await screen.findByText('No invoices yet.')).toBeInTheDocument();
  });

  it('sends the admin to Stripe to connect a payment method', async () => {
    const user = userEvent.setup();
    const calls = mockApi('post', '/billing/payment-method', { data: { url: 'https://checkout.stripe.test/setup' } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Connect payment method' }));

    await waitFor(() => expect(external.navigateToExternal).toHaveBeenCalledWith('https://checkout.stripe.test/setup'));
    expect(calls).toHaveLength(1);
  });

  it('starts a checkout for the selected plan and billing period', async () => {
    const user = userEvent.setup();
    const calls = mockApi('post', '/billing/checkout', { data: { url: 'https://checkout.stripe.test/sub' } });
    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Yearly' }));
    expect(within(screen.getByTestId('plan-professional')).getByText('$1,490.00')).toBeInTheDocument();
    await user.click(within(screen.getByTestId('plan-professional')).getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => expect(external.navigateToExternal).toHaveBeenCalledWith('https://checkout.stripe.test/sub'));
    expect(calls[0].body).toEqual({ plan_id: 'plan-pro', period: 'yearly' });
  });

  it('explains a past-due subscription and offers to update the payment method', async () => {
    renderPage(overview({
      plan: PRO,
      live: true,
      sub: { status: 'past_due' },
      access: access({
        status: 'past_due', requires_action: true,
        reasons: [BillingRestrictionReason.PAYMENT_PAST_DUE],
        grace_period_ends_at: '2026-06-22T12:00:00Z',
      }),
    }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/latest payment failed/i)).toBeInTheDocument();
    expect(within(alert).getByText(/Access will be blocked on June 22/)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Update payment method' })).toBeInTheDocument();
    expect(screen.getByText('Past due')).toBeInTheDocument();
  });

  it('cancels a live subscription at period end after confirmation', async () => {
    const user = userEvent.setup();
    const live = overview({ plan: PRO, live: true });
    const canceled = { ...live, subscription: { ...live.subscription, cancel_at_period_end: true } };
    const calls = mockApi('post', '/billing/cancel', { data: canceled });
    renderPage(live);

    await user.click(await screen.findByRole('button', { name: 'Cancel subscription' }));
    mockApi('get', '/billing/subscription', { data: canceled });
    await user.click(await screen.findByRole('button', { name: 'Cancel at period end' }));

    expect(await screen.findByRole('button', { name: 'Keep subscription' })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(toasts.toast).toHaveBeenCalledWith({ title: 'Subscription will cancel at the end of the period' });
  });

  it('switches plans on a live subscription instead of opening a new checkout', async () => {
    const user = userEvent.setup();
    const live = overview({ plan: PRO, live: true });
    const calls = mockApi('post', '/billing/change-plan', { data: live });
    renderPage(live);

    await user.click(await screen.findByRole('tab', { name: 'Yearly' }));
    await user.click(within(screen.getByTestId('plan-professional')).getByRole('button', { name: 'Switch to this plan' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm switch' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ plan_id: 'plan-pro', period: 'yearly' });
  });

  it('explains a blocked organization and how to pay', async () => {
    renderPage(overview({
      plan: PRO,
      live: true,
      sub: { status: 'unpaid' },
      access: blockedAccess(BillingRestrictionReason.SUBSCRIPTION_UNPAID),
    }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Access is blocked until the balance is paid/)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Pay outstanding invoice' })).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('Access to the CRM is blocked until a payment is made.')).toBeInTheDocument();
  });

  it('lets a canceled organization subscribe again, but not return to the demo', async () => {
    const user = userEvent.setup();
    const calls = mockApi('post', '/billing/checkout', { data: { url: 'https://checkout.stripe.test/again' } });
    renderPage(overview({
      plan: PRO,
      sub: { status: 'canceled' },
      access: blockedAccess(BillingRestrictionReason.SUBSCRIPTION_CANCELED, { status: 'canceled' }),
    }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Subscribe to a plan to restore access/)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Choose a plan' })).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-free')).getByText('Only available before subscribing.')).toBeInTheDocument();

    await user.click(within(screen.getByTestId('plan-professional')).getByRole('button', { name: 'Subscribe' }));
    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it('tells a demo account when its demo ends', async () => {
    const endsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    renderPage(overview({ access: billingAccess({ demo_ends_at: endsAt.toISOString() }) }));
    const date = endsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    expect(await screen.findByText(`Your demo ends on ${date} (4 days left).`)).toBeInTheDocument();
  });

  it('explains an ended demo and offers the paid plans', async () => {
    renderPage(overview({
      access: billingAccess({
        level: BillingAccessLevel.BLOCKED, requires_action: true, reasons: [BillingRestrictionReason.DEMO_EXPIRED],
        effective_features: [], demo_ends_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Your demo has ended. Choose a plan to keep using the CRM.')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Choose a plan' })).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-free')).getByText('Your demo has ended.')).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-professional')).getByRole('button', { name: 'Subscribe' })).toBeEnabled();
  });

  it('shows an error state with retry when billing cannot be loaded', async () => {
    mockApi('get', '/billing/subscription', { status: 500, message: 'Internal server error' });
    mockApi('get', '/billing/plans', { data: [] });
    const { wrapper } = createQueryWrapper();
    render(<AdminBillingPage />, { wrapper });

    expect(await screen.findByText('Could not load billing information.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('confirms a successful checkout return and clears the query string', async () => {
    nav.params = new URLSearchParams('checkout=success');
    renderPage();

    await screen.findByText('Demo account');
    expect(toasts.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Payment received' }));
    expect(nav.replace).toHaveBeenCalledWith('/admin/billing');
    expect(screen.getByText('Syncing with Stripe…')).toBeInTheDocument();
  });
});
