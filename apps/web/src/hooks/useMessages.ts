'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsService } from '@/services/conversations.service';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { toast } from '@/hooks/useToast';
import type { Message, PaginatedResponse } from '@/services/conversations.service';

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => conversationsService.getMessages(conversationId!),
    enabled: !!conversationId,
    // No WebSocket backend — poll the open thread so inbound (customer / n8n)
    // messages appear on their own. Only while the tab is focused.
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useSendMessage(conversationId: string | null, contactId?: string | null) {
  const queryClient = useQueryClient();
  const { stopTyping } = useTypingIndicator(conversationId);

  return useMutation({
    mutationFn: (body: { content: string; type?: string }) =>
      conversationsService.sendMessage(conversationId!, body),

    onMutate: async (body) => {
      stopTyping();
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
      const prev = queryClient.getQueryData(['messages', conversationId]);
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId!,
        content: body.content,
        type: (body.type ?? 'text') as Message['type'],
        direction: 'outbound',
        sender_type: 'agent',
        channel: '',
        created_at: new Date().toISOString(),
        metadata: { optimistic: true },
      };
      queryClient.setQueryData(
        ['messages', conversationId],
        (old: PaginatedResponse<Message> | undefined) => ({
          ...(old ?? { meta: { total: 0, page: 1, limit: 100, total_pages: 1 } }),
          items: [...(old?.items ?? []), optimistic],
        }),
      );
      return { prev, optimisticId: optimistic.id };
    },

    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['messages', conversationId], ctx?.prev);
      toast({ title: 'Failed to send', variant: 'error' });
    },

    onSuccess: () => {
      // Refetch the thread so the persisted message replaces the optimistic one
      // (the server assigns a real id) instead of dropping it from the view.
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // The open thread actually renders from contact-activity, not messages —
      // without this, a sent message only appears after the 4s poll catches up.
      if (contactId) {
        queryClient.invalidateQueries({ queryKey: ['contact-activity', contactId] });
      }
    },
  });
}
