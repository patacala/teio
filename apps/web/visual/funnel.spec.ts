import { test, expect, type Page } from '@playwright/test';
import { auditDesign, loadTemplatePalette, type AuditResult } from './support/design-audit';
import { NO_FUNNELS, SALES_FUNNEL } from './support/funnel';
import { fitViewportToContent, openView, VIEW_SCOPE, type OpenedView } from './support/view';

/**
 * Funnel page (Board / Table / Configure). Every state must follow the design
 * system (palette, components, icons, fonts, language, accessible names, no
 * overflow) and match its screenshot. Stage colors in the fixture are the
 * legacy hex values real funnels still store, so this also covers their
 * on-palette rendering.
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

async function expectView(page: Page, view: OpenedView, screenshot: string, options: { fit?: boolean } = {}) {
  if (options.fit !== false) await fitViewportToContent(page);
  expect(await auditDesign(page, { palette, scope: VIEW_SCOPE }), 'design system rules').toEqual(CLEAN);
  expect(view.errors, 'runtime errors').toEqual([]);
  expect(view.unexpectedRequests, 'unmocked API calls').toEqual([]);
  await expect(page).toHaveScreenshot(screenshot);
}

test.describe('Funnel page', () => {
  test('board', async ({ page }) => {
    const view = await openView(page, '/config/funnel', { user: OWNER, funnel: SALES_FUNNEL });
    await expect(page.getByRole('tab', { name: 'Board', selected: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'New Lead' })).toContainText('Maria Gomez');
    await expect(page.getByRole('region', { name: 'Qualified' })).toContainText('HOT');
    await expect(page.getByRole('region', { name: 'Qualified' })).toContainText('Active 5m ago');
    await expectView(page, view, 'funnel-board.png');
  });

  test('table: contacts under stage columns', async ({ page }) => {
    const view = await openView(page, '/config/funnel', { user: OWNER, funnel: SALES_FUNNEL });
    await page.getByRole('tab', { name: 'Table' }).click();
    await expect(page.getByRole('columnheader', { name: /New Lead/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Appointment Confirmed/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Daniel Smith' })).toBeVisible();
    await expectView(page, view, 'funnel-list.png');
  });

  test('configure drawer', async ({ page }) => {
    const view = await openView(page, '/config/funnel', { user: OWNER, funnel: SALES_FUNNEL });
    await page.getByRole('button', { name: 'Configure' }).click();
    const drawer = page.getByRole('dialog', { name: 'Configure funnel' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Edit Appointment Scheduled' })).toBeVisible();
    await expectView(page, view, 'funnel-configure.png', { fit: false });
  });

  test('contact quick view (hot lead)', async ({ page }) => {
    const view = await openView(page, '/config/funnel', { user: OWNER, funnel: SALES_FUNNEL });
    await page.getByRole('button', { name: 'Open Daniel Smith' }).click();
    const dialog = page.getByRole('dialog', { name: 'Daniel Smith' });
    await expect(dialog).toContainText('Wants to book an implant consultation this week.');
    await expect(dialog).toContainText('Recommended next action');
    await expectView(page, view, 'funnel-quick-view.png', { fit: false });
  });

  test('no funnel yet: template picker', async ({ page }) => {
    const view = await openView(page, '/config/funnel', { user: OWNER, funnel: NO_FUNNELS });
    await expect(page.getByRole('heading', { name: 'Choose a template to get started' })).toBeVisible();
    await expect(page.getByText('New Lead → Contacted → Qualified → Appointment Scheduled')).toBeVisible();
    await expectView(page, view, 'funnel-templates.png');
  });
});
