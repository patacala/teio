import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeRealtime } from '@/test/realtime';
import type { StreamingPayload } from '@/types/realtime.types';
import { useRealtimeMessages } from './useRealtimeMessages';

const realtime = vi.hoisted(() => ({ current: null as ReturnType<typeof createFakeRealtime> | null }));

vi.mock('@/providers/realtime-provider', () => ({
  useRealtime: () => ({ client: realtime.current!.client, activeCalls: new Map() }),
}));

function chunk(messageId: string, content: string, isComplete = false): StreamingPayload {
  return { messageId, conversationId: 'conv-1', delta: '', content, isComplete };
}

beforeEach(() => {
  realtime.current = createFakeRealtime();
});

describe('useRealtimeMessages', () => {
  it('does not subscribe without a conversation', () => {
    const { result } = renderHook(() => useRealtimeMessages(null));

    expect(realtime.current!.channels).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
  });

  it('accumulates streamed AI content until the message completes', () => {
    const { result } = renderHook(() => useRealtimeMessages('conv-1'));
    const channel = realtime.current!.channel('conversation:conv-1');
    expect(channel.subscribe).toHaveBeenCalled();

    act(() => channel.broadcast('ai.response.streaming', chunk('m-1', 'Hola')));
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.streamingMessages.get('m-1')).toBe('Hola');

    act(() => channel.broadcast('ai.response.streaming', chunk('m-1', 'Hola, ¿en qué te ayudo?')));
    expect(result.current.streamingMessages.get('m-1')).toBe('Hola, ¿en qué te ayudo?');

    act(() => channel.broadcast('ai.response.streaming', chunk('m-1', 'Hola, ¿en qué te ayudo?', true)));
    expect(result.current.streamingMessages.has('m-1')).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it('keeps streaming while another message is still in progress', () => {
    const { result } = renderHook(() => useRealtimeMessages('conv-1'));
    const channel = realtime.current!.channel('conversation:conv-1');

    act(() => {
      channel.broadcast('ai.response.streaming', chunk('m-1', 'First'));
      channel.broadcast('ai.response.streaming', chunk('m-2', 'Second'));
    });
    act(() => channel.broadcast('ai.response.streaming', chunk('m-1', 'First', true)));

    expect(result.current.isStreaming).toBe(true);
    expect([...result.current.streamingMessages.keys()]).toEqual(['m-2']);
  });

  it('moves the subscription when the conversation changes and cleans up on unmount', () => {
    const { rerender, unmount } = renderHook(({ id }) => useRealtimeMessages(id), {
      initialProps: { id: 'conv-1' },
    });
    const first = realtime.current!.channel('conversation:conv-1');

    rerender({ id: 'conv-2' });
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    const second = realtime.current!.channel('conversation:conv-2');
    expect(second.subscribe).toHaveBeenCalled();

    unmount();
    expect(second.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
