import { act, renderHook } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeRealtime } from '@/test/realtime';
import { testSession } from '@/test/supabase';
import type { TypingPayload } from '@/types/realtime.types';
import { useTypingIndicator } from './useTypingIndicator';

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

const me = { ...testSession({ userId: 'me' }).user, user_metadata: { full_name: 'Ana Pérez' } };

function typing(userId: string, userName = `User ${userId}`): TypingPayload {
  return { userId, userName, senderType: 'agent', conversationId: 'conv-1' };
}

function sentEvents() {
  return state.realtime!.channel('conversation:conv-1').send.mock.calls.map(([message]) => message.event);
}

beforeEach(() => {
  vi.useFakeTimers();
  state.realtime = createFakeRealtime();
  state.user = me;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTypingIndicator', () => {
  describe('receiving', () => {
    it('shows other people typing and hides them when they stop', () => {
      const { result } = renderHook(() => useTypingIndicator('conv-1'));
      const channel = state.realtime!.channel('conversation:conv-1');

      act(() => channel.broadcast('typing.started', typing('luis', 'Luis')));
      expect(result.current.typingUsers).toEqual([typing('luis', 'Luis')]);

      act(() => channel.broadcast('typing.stopped', typing('luis', 'Luis')));
      expect(result.current.typingUsers).toEqual([]);
    });

    it('ignores my own typing events', () => {
      const { result } = renderHook(() => useTypingIndicator('conv-1'));

      act(() => state.realtime!.channel('conversation:conv-1').broadcast('typing.started', typing('me')));

      expect(result.current.typingUsers).toEqual([]);
    });

    it('clears a typist after 3 seconds without a stop event', () => {
      const { result } = renderHook(() => useTypingIndicator('conv-1'));
      const channel = state.realtime!.channel('conversation:conv-1');

      act(() => channel.broadcast('typing.started', typing('luis')));
      act(() => vi.advanceTimersByTime(2_999));
      expect(result.current.typingUsers).toHaveLength(1);

      act(() => vi.advanceTimersByTime(1));
      expect(result.current.typingUsers).toEqual([]);
    });

    it('restarts the 3 second window when the same person keeps typing', () => {
      const { result } = renderHook(() => useTypingIndicator('conv-1'));
      const channel = state.realtime!.channel('conversation:conv-1');

      act(() => channel.broadcast('typing.started', typing('luis')));
      act(() => vi.advanceTimersByTime(2_000));
      act(() => channel.broadcast('typing.started', typing('luis')));
      act(() => vi.advanceTimersByTime(2_000));
      expect(result.current.typingUsers).toHaveLength(1);

      act(() => vi.advanceTimersByTime(1_000));
      expect(result.current.typingUsers).toEqual([]);
    });

    it('tracks several typists independently', () => {
      const { result } = renderHook(() => useTypingIndicator('conv-1'));
      const channel = state.realtime!.channel('conversation:conv-1');

      act(() => {
        channel.broadcast('typing.started', typing('luis'));
        channel.broadcast('typing.started', typing('ai-bot'));
      });
      act(() => channel.broadcast('typing.stopped', typing('luis')));

      expect(result.current.typingUsers.map((u) => u.userId)).toEqual(['ai-bot']);
    });
  });

  describe('sending', () => {
    it('broadcasts that I started typing and automatically stops after 3 seconds', () => {
      const { result } = renderHook(() => useTypingIndicator('conv-1'));
      const channel = state.realtime!.channel('conversation:conv-1');

      act(() => result.current.sendTyping());
      expect(channel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'typing.started',
        payload: { userId: 'me', userName: 'Ana Pérez', senderType: 'agent', conversationId: 'conv-1' },
      });

      act(() => vi.advanceTimersByTime(3_000));
      expect(sentEvents()).toEqual(['typing.started', 'typing.stopped']);
    });

    it('sends a single stop after a burst of keystrokes', () => {
      const { result } = renderHook(() => useTypingIndicator('conv-1'));

      act(() => result.current.sendTyping());
      act(() => vi.advanceTimersByTime(1_000));
      act(() => result.current.sendTyping());
      act(() => vi.advanceTimersByTime(2_999));
      expect(sentEvents()).toEqual(['typing.started', 'typing.started']);

      act(() => vi.advanceTimersByTime(1));
      expect(sentEvents()).toEqual(['typing.started', 'typing.started', 'typing.stopped']);
    });

    it('stopTyping sends the stop immediately and cancels the pending one', () => {
      const { result } = renderHook(() => useTypingIndicator('conv-1'));

      act(() => result.current.sendTyping());
      act(() => result.current.stopTyping());
      act(() => vi.advanceTimersByTime(5_000));

      expect(sentEvents()).toEqual(['typing.started', 'typing.stopped']);
    });

    it('does not broadcast when signed out', () => {
      state.user = null;
      const { result } = renderHook(() => useTypingIndicator('conv-1'));

      act(() => result.current.sendTyping());

      expect(sentEvents()).toEqual([]);
    });
  });
});
