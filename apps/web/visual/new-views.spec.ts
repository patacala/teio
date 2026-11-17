import { test, expect, type Page } from '@playwright/test';
import { BillingAccessLevel, BillingRestrictionReason } from '@crm/shared';
import { billingOverview, blockedAccess, paidAccess } from '@/test/fixtures/billing';
import { LEADS, platformAttention, platformOrganizations, platformOverview } from '@/test/fixtures/platform';
import type { Scenario } from './support/api-mock';
import {
  BLOCKED, CANCELED, DEMO_5_DAYS_LEFT, DEMO_DEFAULTS, DEMO_ENDED, DEMO_ENDING_SOON, DEMO_ORGS, INVOICES, PAID, PAST_DUE,
} from './support/data';
import { auditDesign, loadTemplatePalette, type AuditResult } from './support/design-audit';
import { fitViewportToContent, openView, settle, VIEW_SCOPE, type OpenedView } from './support/view';

/**
 * Views added or redesigned by the billing work. Each state must follow the
 * design system of the original template (colors, components, icons, fonts,
 * language, accessible names, no overflow) and matches its screenshot.
 */

const palette = loadTemplatePalette();
const CLEAN: AuditResult = {
  offPaletteColors: [],
  nativeControls: [],
  titleAttributes: [],
  nonLucideIcons: [],
  unlabeledControls: [],
  foreignFonts: [],
  spanishText: [],
  horizontalOverflow: [],
};

const OWNER = { role: 'owner' } as const;
const AGENT = { role: 'agent', full_name: 'Andy Agent' } as const;
const PLATFORM = { role: 'admin', is_platform_admin: true, full_name: 'Pat Platform' } as const;

/** Design rules + no runtime errors + no unmocked requests + screenshot. */
async function expectView(page: Page, view: OpenedView, screenshot: string, options: { fit?: boolean } = {}) {
  if (options.fit !== false) await fitViewportToContent(page);
  expect(await auditDesign(page, { palette, scope: VIEW_SCOPE }), 'design system rules').toEqual(CLEAN);
  expect(view.errors, 'runtime errors').toEqual([]);
  expect(view.unexpectedRequests, 'unmocked API calls').toEqual([]);
  await expect(page).toHaveScreenshot(screenshot);
}

function billing(user: Scenario['user'], overview: Scenario['overview'], extra: Partial<Scenario> = {}): Scenario {
  const access = overview && typeof overview === 'object' ? overview.access : undefined;
  return { user, overview, access, invoices: [], ...extra };
}

test.describe('Billing page', () => {
  test('demo account', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, billingOverview({ access: DEMO_5_DAYS_LEFT })));
    await expect(page.getByRole('heading', { name: 'Demo account' })).toBeVisible();
    await expect(page.getByText('Your demo ends on June 20, 2026 (5 days left).')).toBeVisible();
    await expect(page.getByText('No payment method connected')).toBeVisible();
    await expect(page.getByText('No invoices yet.')).toBeVisible();
    await expectView(page, view, 'billing-demo.png');
  });

  test('demo ending soon', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, billingOverview({ access: DEMO_ENDING_SOON })));
    const alert = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alert).toContainText('Your demo ends soon');
    await expect(alert.getByRole('button', { name: 'Choose a plan' })).toBeVisible();
    await expectView(page, view, 'billing-demo-ending.png');
  });

  test('demo ended', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, billingOverview({ access: DEMO_ENDED })));
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('Your demo has ended');
    await expect(page.getByTestId('plan-free')).toContainText('Your demo has ended.');
    await expectView(page, view, 'billing-demo-ended.png');
  });

  test('paid plan with a card and invoices', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, PAID, { invoices: INVOICES }));
    await expect(page.getByText('Visa •••• 4242')).toBeVisible();
    await expect(page.getByText('Renews on July 1, 2026.')).toBeVisible();
    await expectView(page, view, 'billing-paid.png');
  });

  test('failed payment inside the 48 hour grace period', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, PAST_DUE));
    const alert = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alert).toContainText('latest payment failed');
    await expect(alert).toContainText('Access will be blocked on June 16');
    await expect(page.getByText('Expired', { exact: true })).toBeVisible();
    await expectView(page, view, 'billing-past-due.png');
  });

  test('blocked until payment (owner can still pay)', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, BLOCKED));
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('Access is blocked until the balance is paid');
    await expect(page.getByRole('button', { name: 'Pay outstanding invoice' })).toBeVisible();
    await expectView(page, view, 'billing-blocked.png');
  });

  test('canceled subscription', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, CANCELED));
    await expect(page.getByRole('button', { name: 'Choose a plan' })).toBeVisible();
    await expect(page.getByTestId('plan-free')).toContainText('Only available before subscribing.');
    await expectView(page, view, 'billing-canceled.png');
  });

  test('loading', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, 'pending', { plans: 'pending' }), { settle: false });
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await expectView(page, view, 'billing-loading.png', { fit: false });
  });

  test('error with retry', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, 'error'));
    await expect(page.getByText('Could not load billing information.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expectView(page, view, 'billing-error.png', { fit: false });
  });

  test('cancel confirmation', async ({ page }) => {
    const view = await openView(page, '/admin/billing', billing(OWNER, PAID));
    await page.getByRole('button', { name: 'Cancel subscription' }).click();
    await expect(page.getByRole('dialog')).toContainText('access to the CRM is blocked until you subscribe again');
    await expectView(page, view, 'billing-cancel-dialog.png', { fit: false });
  });

  test('phone layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const view = await openView(page, '/admin/billing', billing(OWNER, billingOverview()));
    await expectView(page, view, 'billing-mobile.png');
  });
});

test.describe('Billing access in the app shell', () => {
  test('demo label in the header', async ({ page }) => {
    const view = await openView(page, '/admin/team', { user: OWNER, access: DEMO_5_DAYS_LEFT });
    await expect(page.getByRole('button', { name: 'Demo account · 5 days left: choose a plan' })).toBeVisible();
    await expectView(page, view, 'shell-demo-badge.png');
  });

  test('warning banner during the grace period', async ({ page }) => {
    const view = await openView(page, '/admin/team', { user: OWNER, access: PAST_DUE.access });
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('Access will be blocked on Jun 16');
    await expect(page.getByRole('button', { name: 'Review billing' })).toBeVisible();
    await expectView(page, view, 'shell-grace-banner.png');
  });

  test('demo ending soon banner', async ({ page }) => {
    const view = await openView(page, '/admin/team', { user: OWNER, access: DEMO_ENDING_SOON });
    const banner = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(banner).toContainText('It ends on June 17, 2026.');
    await expect(banner.getByRole('button', { name: 'Choose a plan' })).toBeVisible();
    await expectView(page, view, 'shell-demo-ending-banner.png');
  });

  test('demo ended: members are told to ask an admin', async ({ page }) => {
    const view = await openView(page, '/contacts', { user: AGENT, access: DEMO_ENDED });
    const gate = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(gate).toContainText('Your demo has ended');
    await expect(gate).toContainText('Ask an owner or admin of your organization to choose a plan.');
    await expectView(page, view, 'gate-demo-ended-member.png', { fit: false });
  });

  test('blocked: members are told to ask an admin', async ({ page }) => {
    const view = await openView(page, '/contacts', { user: AGENT, access: blockedAccess(BillingRestrictionReason.GRACE_PERIOD_EXPIRED) });
    const gate = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(gate).toContainText('Payment required');
    await expect(gate).toContainText('Ask an owner or admin');
    await expectView(page, view, 'gate-blocked-member.png', { fit: false });
  });

  test('blocked: owners are sent to billing', async ({ page }) => {
    const view = await openView(page, '/contacts', { user: OWNER, access: blockedAccess() });
    await expect(page.getByRole('button', { name: 'Go to billing' })).toBeVisible();
    await expectView(page, view, 'gate-blocked-owner.png', { fit: false });
  });

  test('suspended organization', async ({ page }) => {
    const view = await openView(page, '/contacts', {
      user: AGENT,
      access: paidAccess({ level: BillingAccessLevel.SUSPENDED, reasons: [BillingRestrictionReason.ORGANIZATION_INACTIVE] }),
    });
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('Organization suspended');
    await expectView(page, view, 'gate-suspended.png', { fit: false });
  });
});

test.describe('Platform: demo accounts', () => {
  const platform = (extra: Partial<Scenario> = {}): Scenario => ({
    user: PLATFORM,
    demoDefaults: DEMO_DEFAULTS,
    demoOrganizations: DEMO_ORGS,
    ...extra,
  });

  test('defaults and organizations', async ({ page }) => {
    const view = await openView(page, '/platform/demo-accounts', platform());
    await expect(page.getByLabel('AI calls: 10 of 10')).toBeVisible();
    const rowOf = (name: string) => page.getByRole('row').filter({ hasText: name });
    await expect(rowOf('Acme Dental')).toContainText('5 days left');
    await expect(rowOf('Brightside Legal')).toContainText('No end date');
    await expect(rowOf('Cedar Clinic')).toContainText('ended');
    await expect(page.getByRole('spinbutton', { name: 'Demo length' })).toHaveValue('7');
    const brightside = page.getByRole('row').filter({ hasText: 'Brightside Legal' });
    await expect(brightside.getByText('Custom', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Demo accounts' })).toBeVisible();
    await expectView(page, view, 'platform-demo-accounts.png');
  });

  test('loading', async ({ page }) => {
    const view = await openView(page, '/platform/demo-accounts', platform({ demoDefaults: 'pending', demoOrganizations: 'pending' }), { settle: false });
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(2);
    await expectView(page, view, 'platform-loading.png', { fit: false });
  });

  test('no demo organizations', async ({ page }) => {
    const view = await openView(page, '/platform/demo-accounts', platform({ demoOrganizations: [] }));
    await expect(page.getByText('No demo organizations', { exact: true })).toBeVisible();
    await expectView(page, view, 'platform-empty.png');
  });

  test('errors with retry', async ({ page }) => {
    const view = await openView(page, '/platform/demo-accounts', platform({ demoDefaults: 'error', demoOrganizations: 'error' }));
    await expect(page.getByText('Could not load the demo defaults.')).toBeVisible();
    await expect(page.getByText('Could not load demo organizations.')).toBeVisible();
    await expectView(page, view, 'platform-error.png');
  });

  test('editing one organization', async ({ page }) => {
    const view = await openView(page, '/platform/demo-accounts', platform());
    await page.getByRole('button', { name: 'Edit demo settings for Brightside Legal' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('spinbutton', { name: 'AI calls / month' })).toHaveValue('500');
    await expect(dialog.getByText('No end date, no payment required')).toBeVisible();
    await expectView(page, view, 'platform-edit-dialog.png', { fit: false });
  });

  test('choosing a demo end date', async ({ page }) => {
    const view = await openView(page, '/platform/demo-accounts', platform());
    await page.getByRole('button', { name: 'Edit demo settings for Acme Dental' }).click();
    await page.getByRole('button', { name: 'Choose the demo end date' }).click();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();
    await expectView(page, view, 'platform-demo-end-calendar.png', { fit: false });
  });

  test('validation error', async ({ page }) => {
    const view = await openView(page, '/platform/demo-accounts', platform());
    await page.getByRole('spinbutton', { name: 'AI calls / month' }).fill('');
    await page.getByRole('button', { name: 'Save defaults' }).click();
    await expect(page.getByText('Enter a whole number (0 or more).')).toBeVisible();
    await expectView(page, view, 'platform-validation.png');
  });

  test('phone layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const view = await openView(page, '/platform/demo-accounts', platform());
    await settle(page);
    await expectView(page, view, 'platform-mobile.png');
  });
});

test.describe('Platform: overview (super admin dashboard)', () => {
  const overview = (extra: Partial<Scenario> = {}): Scenario => ({
    user: PLATFORM,
    platformOverview: platformOverview(),
    platformAttention: platformAttention(),
    platformLeads: LEADS,
    platformOrganizations: platformOrganizations(),
    ...extra,
  });

  test('money, leads and organizations', async ({ page }) => {
    const view = await openView(page, '/platform', overview());
    await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'MRR' })).toContainText('$18,983');
    await expect(page.getByRole('group', { name: 'MRR' })).toContainText('27% vs last month');
    await expect(page.getByRole('group', { name: 'Revenue at risk' })).toContainText('$4,083/mo');
    await expect(page.getByRole('button', { name: 'Open billing for Cedar Clinic' })).toBeVisible();
    await expect(page.getByText('45% of previous step')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Lina Park' })).toContainText('Opened 2×');
    await expect(page.getByRole('row').filter({ hasText: 'Echo Studio' }).last()).toContainText('2 days left');
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    await expectView(page, view, 'platform-overview.png');
  });

  test('loading', async ({ page }) => {
    const pending = overview({
      platformOverview: 'pending', platformAttention: 'pending', platformLeads: 'pending', platformOrganizations: 'pending',
    });
    const view = await openView(page, '/platform', pending, { settle: false });
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(3);
    await expectView(page, view, 'platform-overview-loading.png', { fit: false });
  });

  test('a new platform with nothing to show yet', async ({ page }) => {
    const quiet = platformOverview();
    quiet.money = { ...quiet.money, mrr: 0, mrr_last_month: null, arr: 0, paying_organizations: 0, average_revenue_per_organization: 0,
      cash_collected: 0, cash_collected_previous: 0, outstanding: 0, outstanding_invoices: 0, new_paying: 0, churned: 0,
      at_risk: { amount: 0, organizations: 0, past_due: 0, cancel_scheduled: 0, payment_method_issue: 0, payment_failed: 0 } };
    quiet.growth = { leads: { total: 0, previous: 0, demo_requests: 0, signups: 0 }, demos: { active: 0, ending_7d: 0, no_end_date: 0 },
      conversion: { rate: null, converted: 0, expired_unpaid: 0 } };
    quiet.lead_funnel = quiet.lead_funnel.map((step) => ({ ...step, count: 0 }));
    quiet.signups = { signups: 0, activated: 0, paid: 0 };
    quiet.revenue_by_month = quiet.revenue_by_month.map((month) => ({ ...month, collected: 0, mrr: null }));
    const view = await openView(page, '/platform', overview({
      platformOverview: quiet, platformAttention: platformAttention([]), platformLeads: [],
      platformOrganizations: platformOrganizations([], {
        all: 0, paying: 0, payment_failed: 0, churned: 0, demo: 0, demo_expired: 0, suspended: 0, ending_soon: 0, internal: 0,
      }),
    }));
    await expect(page.getByText('Nothing needs attention right now')).toBeVisible();
    await expect(page.getByText('No demo requests in this period')).toBeVisible();
    await expect(page.getByText('No revenue yet')).toBeVisible();
    await expect(page.getByText('No leads yet')).toBeVisible();
    await expectView(page, view, 'platform-overview-empty.png');
  });

  test('errors with retry', async ({ page }) => {
    const view = await openView(page, '/platform', overview({
      platformOverview: 'error', platformAttention: 'error', platformLeads: 'error', platformOrganizations: 'error',
    }));
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load the platform figures.' })).toBeVisible();
    await expect(page.getByText('Could not load what needs attention.')).toBeVisible();
    await expect(page.getByText('Could not load leads.')).toBeVisible();
    await expect(page.getByText('Could not load organizations.')).toBeVisible();
    await expect(page.getByText('Revenue is unavailable right now')).toBeVisible();
    await expectView(page, view, 'platform-overview-error.png');
  });

  test('organization actions', async ({ page }) => {
    const view = await openView(page, '/platform', overview());
    await page.getByRole('button', { name: 'More actions for Echo Studio' }).click();
    await expect(page.getByRole('menuitem', { name: 'Manage demo' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Mark as internal' })).toBeVisible();
    await expectView(page, view, 'platform-overview-org-menu.png', { fit: false });
  });

  test('phone layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const view = await openView(page, '/platform', overview());
    await settle(page);
    await expectView(page, view, 'platform-overview-mobile.png');
  });

  test('a platform admin landing on / is taken to the overview', async ({ page }) => {
    const view = await openView(page, '/', overview());
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
    expect(view.unexpectedRequests.filter((r) => r.includes('/analytics/dashboard'))).toEqual([]);
  });
});
