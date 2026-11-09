import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { APP_PORT, APP_URL, API_URL, SUPABASE_PORT, SUPABASE_URL } from './visual/support/env';

/**
 * Visual regression tests (`pnpm test:visual`). The app is built in production
 * mode into .next-visual with a local copy of Inter, so screenshots do not
 * depend on the network. CHROMIUM_PATH can point to a preinstalled browser.
 */
export default defineConfig({
  testDir: './visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: APP_URL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--font-render-hinting=none', '--disable-gpu'] }
      : { args: ['--font-render-hinting=none'] },
  },
  webServer: [
    {
      command: 'node visual/support/mock-supabase.mjs',
      url: `${SUPABASE_URL}/health`,
      env: { MOCK_SUPABASE_PORT: String(SUPABASE_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `next build && next start --port ${APP_PORT}`,
      url: `${APP_URL}/login`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_DIST_DIR: '.next-visual',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(__dirname, 'visual/google-fonts.mock.cjs'),
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'visual-test-anon-key',
      },
    },
  ],
});
