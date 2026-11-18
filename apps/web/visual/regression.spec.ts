import { test, expect, type Page } from '@playwright/test';
import { billingOverview, paidAccess, PRO_PLAN } from '@/test/fixtures/billing';
import type { Scenario } from './support/api-mock';
import { fitViewportToContent, openView } from './support/view';

/**
 * Screens that existed before the billing work and must look exactly as they
 * did: their baselines were captured from the original code (commit
 * 752ff16) and are compared pixel for pixel. Only intended changes are
 * masked, and each one is asserted separately.
 */

const PAID_IN_GOOD_STANDING: Omit<Scenario, 'user'> = {
  access: paidAccess(),
  overview: billingOverview({
    plan: PRO_PLAN,
    live: true,
    sub: {
      payment_method: { type: 'card', brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030, is_expired: false },
    },
  }),
};

const PIXEL_EXACT = { maxDiffPixels: 0 };

async function open(page: Page, path: string, scenario: Scenario) {
  const view = await openView(page, path, scenario);
  await fitViewportToContent(page);
  return view;
}

test.describe('unchanged screens match the original design', () => {
  test('team page (organization admin)', async ({ page }) => {
    const view = await open(page, '/admin/team', { user: { role: 'admin' }, ...PAID_IN_GOOD_STANDING });
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
    await expect(page).toHaveScreenshot('team-page.png', PIXEL_EXACT);
    expect(view.errors).toEqual([]);
  });

  test('admin panel (organization admin)', async ({ page }) => {
    const view = await open(page, '/admin', { user: { role: 'admin' }, ...PAID_IN_GOOD_STANDING });
    const memberTotal = page.getByText(/^3 (en )?total$/);
    await expect(page).toHaveScreenshot('admin-panel.png', { ...PIXEL_EXACT, mask: [memberTotal] });
    // Intended change: the only Spanish string on this screen is now English.
    await expect(memberTotal).toHaveText('3 total');
    expect(view.errors).toEqual([]);
  });

  test('payments settings (organization agent)', async ({ page }) => {
    const view = await open(page, '/config/payments', { user: { role: 'agent', full_name: 'Andy Agent' }, ...PAID_IN_GOOD_STANDING });
    await expect(page.getByText('Stripe connected')).toBeVisible();
    await expect(page).toHaveScreenshot('payments-settings.png', PIXEL_EXACT);
    expect(view.errors).toEqual([]);
  });

  test('team page on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const view = await open(page, '/admin/team', { user: { role: 'admin' }, ...PAID_IN_GOOD_STANDING });
    await expect(page).toHaveScreenshot('team-page-mobile.png', PIXEL_EXACT);
    expect(view.errors).toEqual([]);
  });
});
