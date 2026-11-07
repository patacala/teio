import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { vi, type Mock } from 'vitest';

export const TEST_ACCESS_TOKEN = 'test-access-token';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

interface SupabaseMock {
  auth: {
    getSession: Mock;
    refreshSession: Mock;
    onAuthStateChange: Mock;
    signOut: Mock;
  };
}

export const supabaseMock: SupabaseMock = {
  auth: {
    getSession: vi.fn(),
    refreshSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
  },
};

const authListeners = new Set<AuthListener>();

export function testSession(overrides: { userId?: string; email?: string; token?: string } = {}): Session {
  const { userId = 'user-1', email = 'agent@acme.test', token = TEST_ACCESS_TOKEN } = overrides;
  return {
    access_token: token,
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: userId,
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

/** Fires an auth event to every component currently subscribed via onAuthStateChange. */
export function emitAuthStateChange(event: AuthChangeEvent, session: Session | null) {
  authListeners.forEach((listener) => listener(event, session));
}

export function authListenerCount() {
  return authListeners.size;
}

export function resetSupabaseMock() {
  authListeners.clear();
  const { auth } = supabaseMock;
  auth.getSession.mockReset().mockResolvedValue({ data: { session: testSession() }, error: null });
  auth.refreshSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.onAuthStateChange.mockReset().mockImplementation((listener: AuthListener) => {
    authListeners.add(listener);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
  });
}
