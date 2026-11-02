'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsService, type ConversationListParams } from '@/services/conversations.service';

export function useConversations(filters?: ConversationListParams) {
  return useQuery({
    queryKey: ['conversations', filters],
    queryFn: () => conversationsService.getConversations(filters),
    // Poll the list so last-message preview, ordering and unread counts stay
    // current as messages come and go. Only while the tab is focused.
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ['conversations', id],
    queryFn: () => conversationsService.getConversation(id!),
    enabled: !!id,
  });
}

export function useResolveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationsService.resolveConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useHandoff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationsService.handoff(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', id] });
    },
  });
}

export function useSetPinned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      conversationsService.setPinned(id, pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
