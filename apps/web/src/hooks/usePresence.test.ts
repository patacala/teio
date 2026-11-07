import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeRealtime } from '@/test/realtime';
import { testSession } from '@/test/supabase';
import { usePresence } from './usePresence';

const state = vi.hoisted(() => ({
  realtime: null as ReturnType<typeof createFakeRealtime> | null,
  user: null as User | null,
}));

vi.mock('@/providers/realtime-provider', () => ({
  useRealtime: () => ({ client: state.realtime!.client, activeCalls: new Map() }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user }),
}));

function user(metadata: Record<string, unknown>, email = 'agent@acme.test'): User {
  return { ...testSession({ userId: 'user-1', email }).user, user_metadata: metadata };
}

beforeEach(() => {
  state.realtime = createFakeRealtime();
  state.user = user({ full_name: 'Ana Pérez', role: 'admin' });
});

describe('usePresence', () => {
  it('does nothing without a conversation or a signed-in user', () => {
    renderHook(() => usePresence(null));
    state.user = null;
    renderHook(() => usePresence('conv-1'));

    expect(state.realtime!.channels).toHaveLength(0);
  });

  it('announces the current agent once the channel is subscribed', async () => {
    renderHook(() => usePresence('conv-1'));
    const channel = state.realtime!.channel('conversation:conv-1');

    await waitFor(() => expect(channel.track).toHaveBeenCalledTimes(1));
    expect(channel.track).toHaveBeenCalledWith({
      userId: 'user-1',
      userName: 'Ana Pérez',
      role: 'admin',
      onlineAt: expect.any(String),
    });
  });

  it.each([
    ['the email when there is no full name', {}, 'agent@acme.test', 'agent@acme.test'],
    ['"Agent" when there is no name or email', {}, '', 'Agent'],
  ])('falls back to %s', async (_label, metadata, email, expectedName) => {
    state.user = { ...user(metadata), email: email || undefined };
    renderHook(() => usePresence('conv-1'));
    const channel = state.realtime!.channel('conversation:conv-1');

    await waitFor(() => expect(channel.track).toHaveBeenCalled());
    expect(channel.track).toHaveBeenCalledWith(expect.objectContaining({ userName: expectedName, role: 'agent' }));
  });

  it('lists everyone in the conversation on each presence sync', () => {
    const { result } = renderHook(() => usePresence('conv-1'));
    const channel = state.realtime!.channel('conversation:conv-1');
    const ana = { userId: 'user-1', userName: 'Ana', role: 'admin', onlineAt: '2026-03-15T12:00:00Z' };
    const luis = { userId: 'user-2', userName: 'Luis', role: 'agent', onlineAt: '2026-03-15T12:01:00Z' };

    channel.presence = { 'key-1': [ana], 'key-2': [luis] };
    act(() => channel.emit('presence', 'sync', undefined));
    expect(result.current.presentUsers).toEqual([ana, luis]);

    channel.presence = { 'key-1': [ana] };
    act(() => channel.emit('presence', 'sync', undefined));
    expect(result.current.presentUsers).toEqual([ana]);
  });

  it('stops announcing presence on unmount', () => {
    const { unmount } = renderHook(() => usePresence('conv-1'));
    const channel = state.realtime!.channel('conversation:conv-1');

    unmount();

    expect(channel.untrack).toHaveBeenCalledTimes(1);
  });
});
