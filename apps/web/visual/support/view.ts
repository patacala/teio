import { expect, type Page } from '@playwright/test';
import { mockApi, type Scenario } from './api-mock';
import { FIXED_NOW } from './env';
import { signIn } from './session';

export interface OpenedView {
  unexpectedRequests: string[];
  /** Uncaught errors thrown in the page (live list). */
  errors: string[];
}

/** Signs in, freezes time, serves `scenario` as the API and opens `path`. */
export async function openView(page: Page, path: string, scenario: Scenario, options: { settle?: boolean } = {}): Promise<OpenedView> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await signIn(page.context());
  const { unexpected } = await mockApi(page, scenario);
  await page.goto(path);
  // Rules and screenshots must see final states, never a color mid-transition.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  await page.evaluate(() => document.fonts.ready);
  if (options.settle !== false) await settle(page);
  return { unexpectedRequests: unexpected, errors };
}

/** Waits until no request is in flight and no skeleton is left on screen. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.animate-pulse, .animate-spin')).toHaveCount(0);
}

/**
 * The app scrolls inside <main>, so a "full page" screenshot would stop at the
 * viewport. Grow the viewport until the whole view fits.
 */
export async function fitViewportToContent(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 1440;
  const height = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return document.documentElement.scrollHeight;
    return Math.ceil(main.getBoundingClientRect().top + main.scrollHeight + 28);
  });
  await page.setViewportSize({ width, height: Math.max(height, 700) });
}

/** Regions that make up a view (the shell around it is covered by regression tests). */
export const VIEW_SCOPE = ['main', '[role="dialog"]', '[role="alert"]'];
