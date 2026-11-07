import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { server } from './msw/server';
import { resetSupabaseMock } from './supabase';

vi.mock('@/lib/supabase', async () => {
  const { supabaseMock } = await import('./supabase');
  return { createClient: () => supabaseMock };
});

MotionGlobalConfig.skipAnimations = true;

// Browser APIs jsdom lacks that Radix (Select, Popover) and cmdk rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  resetSupabaseMock();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());
