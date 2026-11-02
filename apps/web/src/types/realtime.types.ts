import type { NotificationType } from '@/hooks/useNotifications';

export type RealtimeEventType =
  | 'message.received'
  | 'message.sent'
  | 'conversation.updated'
  | 'typing.started'
  | 'typing.stopped'
  | 'call.started'
  | 'call.completed'
  | 'ai.response.streaming'
  | 'notification.created';

export interface TypingPayload {
  userId: string;
  userName: string;
  senderType: 'agent' | 'ai';
  conversationId: string;
}

export interface StreamingPayload {
  messageId: string;
  conversationId: string;
  delta: string;
  content: string;
  isComplete: boolean;
}

export interface PresenceUser {
  userId: string;
  userName: string;
  role: string;
  onlineAt: string;
}

export interface ActiveCall {
  callId: string;
  conversationId: string;
  startedAt: string;
  callerName?: string;
  channel: string;
}

export interface RealtimeNotification {
  id: string;
  type: NotificationType | 'call';
  title: string;
  description?: string;
  href?: string;
  conversationId?: string;
  contactId?: string;
  appointmentId?: string;
  actorUserId?: string;
  createdAt: string;
}
