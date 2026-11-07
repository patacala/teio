import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    env: {
      NEXT_PUBLIC_API_URL: 'http://api.test',
      NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    restoreMocks: true,
    unstubGlobals: true,
  },
});
