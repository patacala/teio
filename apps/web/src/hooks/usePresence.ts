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
    if (!conversationId) return;

    const ch = client.getOrCreate(`conversation:${conversationId}`);
    const myState: PresenceUser | null = user
      ? {
          userId: user.id,
          userName: user.user_metadata?.full_name ?? user.email ?? 'Agent',
          role: user.user_metadata?.role ?? 'agent',
          onlineAt: new Date().toISOString(),
        }
      : null;

    const syncPresence = () => {
      setPresentUsers(Object.values(ch.presenceState<PresenceUser>()).flat());
    };
    const channelState = ch.state;
    const alreadySubscribed =
      channelState === 'joined' || channelState === 'joining' || channelState === 'leaving';

    if (alreadySubscribed) {
      if (myState) void ch.track(myState);
    } else {
      ch.on('presence', { event: 'sync' }, syncPresence).subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && myState) await ch.track(myState);
      });
    }

    return () => {
      void ch.untrack();
    };
  }, [conversationId, client, user]);

  return { presentUsers };
}
