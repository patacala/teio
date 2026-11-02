'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRealtime } from '@/providers/realtime-provider';
import { useAuth } from '@/hooks/useAuth';
import type { TypingPayload } from '@/types/realtime.types';

export interface TypingUser {
  userId: string;
  userName: string;
  senderType: 'agent' | 'ai';
}

export function useTypingIndicator(conversationId: string | null) {
  const { client } = useRealtime();
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sendDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const ch = client.getOrCreate(`conversation:${conversationId}`);

    const clearUser = (userId: string) => {
      setTypingUsers((prev) => {
        const n = new Map(prev);
        n.delete(userId);
        return n;
      });
      const t = timers.current.get(userId);
      if (t !== undefined) clearTimeout(t);
      timers.current.delete(userId);
    };

    ch.on('broadcast', { event: 'typing.started' }, ({ payload }: { payload: TypingPayload }) => {
      if (payload.userId === user?.id) return;
      setTypingUsers((prev) => new Map(prev).set(payload.userId, payload));
      const existing = timers.current.get(payload.userId);
      if (existing !== undefined) clearTimeout(existing);
      timers.current.set(payload.userId, setTimeout(() => clearUser(payload.userId), 3000));
    });

    ch.on('broadcast', { event: 'typing.stopped' }, ({ payload }: { payload: TypingPayload }) => {
      clearUser(payload.userId);
    });

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, [conversationId, client, user?.id]);

  const stopTyping = useCallback(() => {
    if (!conversationId || !user) return;
    if (sendDebounce.current) clearTimeout(sendDebounce.current);
    client.broadcast(`conversation:${conversationId}`, 'typing.stopped', {
      userId: user.id,
      userName: user.user_metadata?.full_name ?? user.email ?? '',
      senderType: 'agent',
      conversationId,
    } satisfies TypingPayload);
  }, [conversationId, client, user]);

  const sendTyping = useCallback(() => {
    if (!conversationId || !user) return;
    if (sendDebounce.current) clearTimeout(sendDebounce.current);
    client.broadcast(`conversation:${conversationId}`, 'typing.started', {
      userId: user.id,
      userName: user.user_metadata?.full_name ?? user.email ?? '',
      senderType: 'agent',
      conversationId,
    } satisfies TypingPayload);
    sendDebounce.current = setTimeout(() => stopTyping(), 3000);
  }, [conversationId, client, user, stopTyping]);

  return { typingUsers: Array.from(typingUsers.values()), sendTyping, stopTyping };
}
