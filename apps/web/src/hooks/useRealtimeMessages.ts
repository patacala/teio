'use client';

import { useEffect, useState } from 'react';
import { useRealtime } from '@/providers/realtime-provider';
import type { StreamingPayload } from '@/types/realtime.types';

export function useRealtimeMessages(conversationId: string | null) {
  const { client } = useRealtime();
  const [streamingMessages, setStreamingMessages] = useState<Map<string, string>>(new Map());
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    const channelName = `conversation:${conversationId}`;
    const ch = client.getOrCreate(channelName);

    ch.on(
      'broadcast',
      { event: 'ai.response.streaming' },
      ({ payload }: { payload: StreamingPayload }) => {
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          if (payload.isComplete) {
            next.delete(payload.messageId);
          } else {
            next.set(payload.messageId, payload.content);
          }
          setIsStreaming(next.size > 0);
          return next;
        });
      },
    ).subscribe();

    return () => {
      client.unsubscribe(channelName);
    };
  }, [conversationId, client]);

  return { streamingMessages, isStreaming };
}
