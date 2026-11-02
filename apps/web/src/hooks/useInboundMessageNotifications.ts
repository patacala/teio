'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useTeam';
import { useNotifications } from '@/hooks/useNotifications';
import { conversationsService, type Conversation } from '@/services/conversations.service';
import { notifyFromRealtime } from '@/lib/notify';

function contactName(conv: Conversation): string | undefined {
  const c = conv.contact;
  if (!c) return undefined;
  const name = `${c.first_name} ${c.last_name ?? ''}`.trim();
  return name || undefined;
}

export function useInboundMessageNotifications() {
  const { user } = useAuth();
  const { data: currentUser } = useCurrentUser();
  const { add } = useNotifications();
  const router = useRouter();
  const primed = useRef(false);
  const lastSeen = useRef(new Map<string, string>());

  const { data } = useQuery({
    queryKey: ['conversations', { forNotifications: true }],
    queryFn: () => conversationsService.getConversations({ limit: 30 }),
    enabled: !!user,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const items = data?.items;
    if (!items) return;

    if (!primed.current) {
      for (const conv of [...items].reverse()) {
        if (conv.last_message?.created_at) {
          lastSeen.current.set(conv.id, conv.last_message.created_at);
        }
        if (conv.unread_count > 0) {
          const name = contactName(conv);
          const last = conv.last_message;
          add({
            id: `unread:${conv.id}`,
            type: 'message',
            title: name ? `Mensajes de ${name}` : 'Mensajes sin leer',
            description: last?.content
              ? conv.unread_count > 1
                ? `${conv.unread_count} sin leer · ${last.content.slice(0, 80)}`
                : last.content.slice(0, 100)
              : `${conv.unread_count} sin leer`,
            href: `/inbox?conversationId=${conv.id}`,
            conversationId: conv.id,
            createdAt: last?.created_at ? new Date(last.created_at) : undefined,
          });
        }
      }
      primed.current = true;
      return;
    }

    for (const conv of items) {
      const last = conv.last_message;
      if (!last?.created_at) continue;
      const prev = lastSeen.current.get(conv.id);
      lastSeen.current.set(conv.id, last.created_at);
      if (prev && Date.parse(last.created_at) <= Date.parse(prev)) continue;
      if (last.direction !== 'inbound') continue;

      const name = contactName(conv);
      notifyFromRealtime(
        {
          id: `${conv.id}:${last.created_at}`,
          type: 'message',
          title: name ? `Nuevo mensaje de ${name}` : 'Nuevo mensaje',
          description: last.content?.slice(0, 100),
          href: `/inbox?conversationId=${conv.id}`,
          conversationId: conv.id,
          createdAt: last.created_at,
        },
        {
          currentUserId: currentUser?.id,
          add,
          navigate: (href) => router.push(href),
        },
      );
    }
  }, [data, add, router, currentUser?.id]);
}
