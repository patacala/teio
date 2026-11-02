import { authClient } from '@/lib/auth-client';

export interface Conversation {
  id: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  channel: string;
  contact_id: string;
  contact?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
  };
  last_message?: {
    content: string;
    created_at: string;
    direction: 'inbound' | 'outbound';
  };
  unread_count: number;
  bot_active?: boolean;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'customer' | 'agent' | 'ai' | 'system';
  type: 'text' | 'voice' | 'system' | 'image' | 'file';
  channel: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ConversationListParams {
  status?: string;
  channel?: string;
  page?: number;
  limit?: number;
  search?: string;
  assigned_to?: 'ai' | 'human';
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export const conversationsService = {
  getConversations: (params?: ConversationListParams) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.channel) qs.set('channel', params.channel);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.assigned_to) qs.set('assigned_to', params.assigned_to);
    return authClient.get<PaginatedResponse<Conversation>>(
      `/conversations?${qs.toString()}`,
    );
  },

  getConversation: (id: string) =>
    authClient.get<Conversation>(`/conversations/${id}`),

  getMessages: (conversationId: string) =>
    authClient.get<PaginatedResponse<Message>>(
      `/conversations/${conversationId}/messages?limit=100`,
    ),

  sendMessage: (conversationId: string, body: { content: string; type?: string }) =>
    authClient.post<Message>(`/conversations/${conversationId}/messages`, body),

  resolveConversation: (id: string) =>
    authClient.patch<Conversation>(`/conversations/${id}/resolve`, {}),

  handoff: (id: string) =>
    authClient.post<Conversation>(`/conversations/${id}/handoff`, {}),

  setPinned: (id: string, pinned: boolean) =>
    authClient.patch<Conversation>(`/conversations/${id}/pin`, { pinned }),
};
