'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { RealtimeClient } from '@/lib/realtime-client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useTeam';
import { useNotifications } from '@/hooks/useNotifications';
import { useInboundMessageNotifications } from '@/hooks/useInboundMessageNotifications';
import { notifyFromRealtime } from '@/lib/notify';
import { unlockNotificationSound } from '@/lib/notification-sound';
import type { ActiveCall, RealtimeNotification } from '@/types/realtime.types';
import type { Message, PaginatedResponse, Conversation } from '@/services/conversations.service';

interface RealtimeContextValue {
  client: RealtimeClient;
  activeCalls: Map<string, ActiveCall>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider');
  return ctx;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Supabase's own user.user_metadata.organization_id is never populated by
  // this app's auto-provisioning flow (confirmed: raw_user_meta_data only ever
  // holds { email_verified }) — it is NOT a reliable source for the tenant id.
  // The authoritative org id is core.users.organization_id, fetched here via
  // the app's own /users/me-equivalent endpoint.
  const { data: currentUser } = useCurrentUser();
  const { add: addNotification } = useNotifications();
  const router = useRouter();
  useInboundMessageNotifications();
  const [activeCalls, setActiveCalls] = useState<Map<string, ActiveCall>>(new Map());

  useEffect(() => {
    const unlock = () => unlockNotificationSound();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const supabaseRef = useRef(createClient());
  const realtimeClientRef = useRef(new RealtimeClient(supabaseRef.current));
  const seenMessages = useRef(new Set<string>());

  // Org-level Postgres Changes subscription
  useEffect(() => {
    // Wait for the authoritative org id. Previously this fell back to an
    // unfiltered 'org:global' channel whenever it was missing, which — since
    // Supabase's own user_metadata.organization_id is never populated by this
    // app's provisioning flow — meant EVERY session subscribed to raw
    // postgres_changes events (messages, conversations, calls) for ALL
    // organizations, not just the current tenant's. Cross-org content then
    // leaked into this client's React Query cache. Never subscribe unscoped —
    // just wait until we have a real orgId.
    if (!user || !currentUser?.organization_id) return;
    const orgId = currentUser.organization_id;

    const channelName = `org:${orgId}`;
    const rtClient = realtimeClientRef.current;
    const ch = rtClient.getOrCreate(channelName);
    const filter = `organization_id=eq.${orgId}`;

    // Messages INSERT
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'conversations', table: 'messages', ...(filter ? { filter } : {}) },
      (payload) => {
        const msg = payload.new as Message;
        if (!msg.id || seenMessages.current.has(msg.id)) return;
        seenMessages.current.add(msg.id);

        if (msg.direction === 'inbound' && msg.type !== 'system' && msg.type !== 'voice') {
          const name = contactNameFromCache(queryClient, msg.conversation_id);
          notifyFromRealtime(
            {
              id: msg.id,
              type: 'message',
              title: name ? `New message from ${name}` : 'New message',
              description: msg.content?.slice(0, 100),
              href: `/inbox?conversationId=${msg.conversation_id}`,
              conversationId: msg.conversation_id,
              createdAt: new Date().toISOString(),
            },
            {
              currentUserId: currentUser?.id,
              add: addNotification,
              navigate: (href) => router.push(href),
            },
          );
        }

        queueMicrotask(() => {
          queryClient.setQueryData(
            ['messages', msg.conversation_id],
            (old: PaginatedResponse<Message> | undefined) => {
              if (!old) return old;
              const alreadyExists = old.items.some((m) => m.id === msg.id);
              if (alreadyExists) return old;
              return { ...old, items: [...old.items, msg] };
            },
          );
          // The open thread renders from contact-activity (keyed by contactId,
          // which this payload doesn't carry), not messages — invalidate broadly
          // so an inbound message shows up immediately instead of waiting for
          // useContactActivity's own poll interval.
          queryClient.invalidateQueries({ queryKey: ['contact-activity'] });
        });
      },
    );

    // Conversations UPDATE
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'conversations', table: 'conversations', ...(filter ? { filter } : {}) },
      (payload) => {
        const conv = payload.new as Conversation;
        queueMicrotask(() => {
          queryClient.setQueryData(['conversation', conv.id], (old: Conversation | undefined) => {
            if (!old) return old;
            return { ...old, ...conv };
          });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        });
      },
    );

    // Voice calls INSERT (active call started)
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'voice', table: 'calls', ...(filter ? { filter } : {}) },
      (payload) => {
        const row = payload.new as {
          id: string;
          conversation_id: string;
          status: string;
          started_at: string;
          metadata?: { caller_name?: string; channel?: string };
        };
        if (row.status === 'active') {
          const call: ActiveCall = {
            callId: row.id,
            conversationId: row.conversation_id,
            startedAt: row.started_at,
            callerName: row.metadata?.caller_name,
            channel: row.metadata?.channel ?? 'voice',
          };
          setActiveCalls((prev) => new Map(prev).set(row.conversation_id, call));
        }
      },
    );

    // Voice calls UPDATE (call completed)
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'voice', table: 'calls', ...(filter ? { filter } : {}) },
      (payload) => {
        const row = payload.new as { id: string; conversation_id: string; status: string };
        if (row.status === 'completed') {
          setActiveCalls((prev) => {
            const next = new Map(prev);
            next.delete(row.conversation_id);
            return next;
          });
        }
      },
    );

    // Notifications broadcast
    ch.on(
      'broadcast',
      { event: 'notification.created' },
      ({ payload }: { payload: RealtimeNotification }) => {
        notifyFromRealtime(payload, {
          currentUserId: currentUser?.id,
          add: addNotification,
          navigate: (href) => router.push(href),
        });
      },
    );

    ch.subscribe();

    return () => {
      rtClient.unsubscribe(channelName);
    };
  }, [user, currentUser?.organization_id, currentUser?.id, queryClient, addNotification, router]);

  // Cleanup all channels on unmount
  useEffect(() => {
    const rtClient = realtimeClientRef.current;
    return () => {
      rtClient.unsubscribeAll();
    };
  }, []);

  return (
    <RealtimeContext.Provider
      value={{ client: realtimeClientRef.current, activeCalls }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

function contactNameFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
): string | undefined {
  const single = queryClient.getQueryData<Conversation>(['conversation', conversationId]);
  const fromSingle = formatContactName(single?.contact);
  if (fromSingle) return fromSingle;

  const lists = queryClient.getQueriesData<PaginatedResponse<Conversation>>({
    queryKey: ['conversations'],
  });
  for (const [, data] of lists) {
    const found = data?.items?.find((c) => c.id === conversationId);
    const name = formatContactName(found?.contact);
    if (name) return name;
  }
  return undefined;
}

function formatContactName(contact?: Conversation['contact']): string | undefined {
  if (!contact) return undefined;
  const name = `${contact.first_name} ${contact.last_name ?? ''}`.trim();
  return name || undefined;
}
