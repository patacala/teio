import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { authListenerCount, emitAuthStateChange, supabaseMock, testSession } from '@/test/supabase';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  it('starts loading and then exposes the stored session and user', async () => {
    const session = testSession({ userId: 'user-42', email: 'ana@acme.test' });
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session }, error: null });

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBe(session);
    expect(result.current.user).toMatchObject({ id: 'user-42', email: 'ana@acme.test' });
  });

  it('finishes loading with no user when there is no session', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('follows sign-in and sign-out events', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => emitAuthStateChange('SIGNED_IN', testSession({ userId: 'user-7' })));
    expect(result.current.user?.id).toBe('user-7');

    act(() => emitAuthStateChange('SIGNED_OUT', null));
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('unsubscribes from auth events on unmount', async () => {
    const { result, unmount } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(authListenerCount()).toBe(1);

    unmount();

    expect(authListenerCount()).toBe(0);
  });

  it('signs out through Supabase', async () => {
    const { result } = renderHook(() => useAuth());

    await act(() => result.current.signOut());

    expect(supabaseMock.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
