'use client';

import { useEffect, useState } from 'react';
import { useRealtime } from '@/providers/realtime-provider';
import { useAuth } from '@/hooks/useAuth';
import type { PresenceUser } from '@/types/realtime.types';

export function usePresence(conversationId: string | null) {
  const { client } = useRealtime();
  const { user } = useAuth();
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!conversationId || !user) return;

    const ch = client.getOrCreate(`conversation:${conversationId}`);
    const myState: PresenceUser = {
      userId: user.id,
      userName: user.user_metadata?.full_name ?? user.email ?? 'Agent',
      role: user.user_metadata?.role ?? 'agent',
      onlineAt: new Date().toISOString(),
    };

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceUser>();
      setPresentUsers(Object.values(state).flat());
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track(myState);
    });

    return () => {
      ch.untrack();
    };
  }, [conversationId, client, user]);

  return { presentUsers };
}
